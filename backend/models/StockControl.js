const { pool } = require("../database/config");

// Fuente de verdad de los umbrales de compliance → stock_status.
// 3 estados: < order% genera pedido, [order, overstock] óptimo, > overstock% sobrestock.
const STOCK_STATUS = {
  NEED_ORDER: 1, // "Generar Pedido"
  OPTIMAL:    2, // "Stock Optimo"
  OVERSTOCK:  3, // "Sobrestock"
};

// Defaults históricos de los umbrales. Si app_settings no tiene valores (o son
// inválidos), se usan estos, conservando el comportamiento previo (70/120).
const DEFAULT_ORDER_PCT = 70;
const DEFAULT_OVERSTOCK_PCT = 120;

class StockControl {

  /**
   * Calcula compliance (%) entre stock actual y requerido.
   */
  static calculateCompliance(stockCurrent, stockRequire) {
    if (!stockRequire || stockRequire === 0) return 100;
    return Math.round((stockCurrent / stockRequire) * 100);
  }

  /**
   * Lee los umbrales configurables (app_settings) con fallback a los defaults.
   * Devuelve { orderPct, overstockPct }. Se valida que overstock > order; si no,
   * se cae a los defaults para no invertir los rangos.
   */
  static async getThresholds() {
    try {
      const result = await pool.query(
        "SELECT key, value FROM app_settings WHERE key IN ('stock_threshold_order_pct', 'stock_threshold_overstock_pct')"
      );
      const map = {};
      for (const r of result.rows) map[r.key] = Number(r.value);
      let orderPct = map.stock_threshold_order_pct;
      let overstockPct = map.stock_threshold_overstock_pct;
      if (!Number.isFinite(orderPct)) orderPct = DEFAULT_ORDER_PCT;
      if (!Number.isFinite(overstockPct)) overstockPct = DEFAULT_OVERSTOCK_PCT;
      // Coherencia: el de sobrestock debe ser mayor que el de pedido.
      if (overstockPct <= orderPct) {
        return { orderPct: DEFAULT_ORDER_PCT, overstockPct: DEFAULT_OVERSTOCK_PCT };
      }
      return { orderPct, overstockPct };
    } catch {
      return { orderPct: DEFAULT_ORDER_PCT, overstockPct: DEFAULT_OVERSTOCK_PCT };
    }
  }

  /**
   * Determina el stock_status_id según compliance y los umbrales dados.
   * Los umbrales son parámetros (con defaults históricos 70/120) para que la
   * firma siga funcionando sin cambios; el caller que quiera los valores
   * configurables debe pasarlos vía getThresholds().
   */
  static determineStockStatus(compliance, orderPct = DEFAULT_ORDER_PCT, overstockPct = DEFAULT_OVERSTOCK_PCT) {
    if (compliance < orderPct)     return STOCK_STATUS.NEED_ORDER;
    if (compliance <= overstockPct) return STOCK_STATUS.OPTIMAL;
    return STOCK_STATUS.OVERSTOCK;
  }

  /**
   * Resuelve el product_stock_id a usar para un ítem.
   * Si llega product_stock_id, lo valida. Si en cambio llega product_id o
   * group_id (producto/grupo del catálogo global que aún no existe en esta
   * sucursal), crea/recupera su fila en product_stock_by_branch con stock=0
   * y devuelve su id. La fila en 0 se reconcilia sola en la próxima sync
   * (UNIQUE(branch_id, product_id/group_id) + ON CONFLICT DO UPDATE del sync).
   * @returns {Promise<number>} product_stock_id resuelto.
   */
  static async resolveProductStockId(client, branch_id, { product_stock_id, product_id, group_id }) {
    if (product_stock_id) {
      const existing = await client.query(
        "SELECT id FROM product_stock_by_branch WHERE id = $1 AND branch_id = $2",
        [product_stock_id, branch_id]
      );
      if (!existing.rows[0]) {
        throw new Error("product_stock_id no encontrado en esta sucursal");
      }
      return product_stock_id;
    }

    // Catálogo global: crear o recuperar la fila en 0 para esta sucursal.
    // chk_product_or_group: exactamente uno de product_id/group_id.
    if (product_id && group_id) {
      throw new Error("Indique product_id O group_id, no ambos");
    }
    if (!product_id && !group_id) {
      throw new Error("Falta product_stock_id, product_id o group_id");
    }

    const column = product_id ? "product_id" : "group_id";
    const refId  = product_id || group_id;

    // display_name desde la fuente (products o product_groups) para la fila nueva.
    const nameResult = await client.query(
      product_id
        ? "SELECT display_name FROM products WHERE id = $1"
        : "SELECT display_name FROM product_groups WHERE id = $1",
      [refId]
    );
    if (!nameResult.rows[0]) {
      throw new Error(`${column} no existe en el catálogo`);
    }
    const display_name = nameResult.rows[0].display_name;

    const psbResult = await client.query(
      `INSERT INTO product_stock_by_branch
         (branch_id, ${column}, stock, display_name, avg_cost, cost_item_count, last_sync_at)
       VALUES ($1, $2, 0, $3, 0, 0, NOW())
       ON CONFLICT (branch_id, ${column}) DO UPDATE
         SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [branch_id, refId, display_name]
    );
    return psbResult.rows[0].id;
  }

  /**
   * Upsert de un ítem del control.
   * Acepta product_stock_id (producto ya presente en la sucursal) o, para el
   * catálogo global, product_id/group_id (se crea la fila en 0 si no existe).
   * Si ya existe ese product_stock en el control → actualiza stock_require.
   * stock_current se toma en el momento desde product_stock_by_branch.
   */
  static async upsert(monthly_control_id, branch_id, ref, stock_require, condition_id = null) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const product_stock_id = await StockControl.resolveProductStockId(client, branch_id, ref);

      // Tomar stock actual desde la tabla sincronizada
      const stockResult = await client.query(
        "SELECT stock FROM product_stock_by_branch WHERE id = $1",
        [product_stock_id]
      );
      const stock_current   = stockResult.rows[0].stock;
      const compliance      = StockControl.calculateCompliance(stock_current, stock_require);
      const { orderPct, overstockPct } = await StockControl.getThresholds();
      const stock_status_id = StockControl.determineStockStatus(compliance, orderPct, overstockPct);

      const result = await client.query(
        `INSERT INTO stock_controls
           (monthly_control_id, branch_id, product_stock_id, stock_require, stock_current, stock_status_id, condition_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (monthly_control_id, product_stock_id) DO UPDATE
           SET stock_require   = EXCLUDED.stock_require,
               stock_current   = EXCLUDED.stock_current,
               stock_status_id = EXCLUDED.stock_status_id,
               condition_id    = EXCLUDED.condition_id,
               updated_at      = NOW()
         RETURNING id`,
        [monthly_control_id, branch_id, product_stock_id, stock_require, stock_current, stock_status_id, condition_id]
      );

      await client.query("COMMIT");
      return result.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Lista todos los ítems de un control con display_name y estado.
   */
  static async findByControlId(control_id) {
    const result = await pool.query(
      `SELECT
         sc.id,
         sc.product_stock_id,
         psb.display_name,
         COALESCE(c.category_name, pg.category_type)            AS category_name,
         sc.stock_require,
         sc.stock_current,
         (sc.stock_current - sc.stock_require)                  AS stock_difference,
         CASE
           WHEN sc.stock_require = 0 THEN 100
           ELSE ROUND((sc.stock_current::numeric / sc.stock_require::numeric) * 100)
         END                                                     AS compliance,
         sc.stock_status_id,
         ss.stock_status_name,
         sc.condition_id,
         co.condition_name,
         sc.notes,
         sc.updated_at,
         sc.ordered_at,
         sc.order_detail_id,
         psb.last_sync_at,
         -- Destino del pedido: 'hub' / 'external' / 'both' segun los tipos de
         -- orden ligados a este control (un control puede partirse en 2 lineas).
         (
           SELECT CASE
                    WHEN bool_or(oc.order_type = 'internal')
                     AND bool_or(oc.order_type = 'external') THEN 'both'
                    WHEN bool_or(oc.order_type = 'internal')  THEN 'hub'
                    WHEN bool_or(oc.order_type = 'external')  THEN 'external'
                    ELSE NULL
                  END
           FROM order_details od
           JOIN orders_controls oc ON od.order_control_id = oc.id
           WHERE od.stock_control_id = sc.id
             AND oc.status <> 'cancelado'
         )                                                       AS order_dest,
         -- Comprometido (solo relevante en el control del Hub): unidades de este
         -- mismo psb reservadas por ordenes internas abiertas de otras sucursales.
         COALESCE((
           SELECT SUM(od.quantity_ordered)
           FROM order_details od
           JOIN orders_controls oc ON od.order_control_id = oc.id
           WHERE oc.order_type = 'internal'
             AND oc.status <> 'cancelado'
             AND od.product_stock_id = sc.product_stock_id
         ), 0)                                                   AS committed
       FROM stock_controls sc
       JOIN product_stock_by_branch psb ON sc.product_stock_id = psb.id
       LEFT JOIN products p      ON psb.product_id = p.id
       LEFT JOIN categories c    ON p.category_id = c.id
       LEFT JOIN product_groups pg ON psb.group_id = pg.id
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       LEFT JOIN conditions co   ON sc.condition_id = co.id
       WHERE sc.monthly_control_id = $1
       ORDER BY psb.display_name`,
      [control_id]
    );
    return result.rows;
  }

  static async delete(id) {
    await pool.query("DELETE FROM stock_controls WHERE id = $1", [id]);
  }

  static async findWithControlInfo(id) {
    const result = await pool.query(
      `SELECT sc.*, mc.status AS control_status, mc.branch_id
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       WHERE sc.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async exists(monthly_control_id, product_stock_id) {
    const result = await pool.query(
      "SELECT id FROM stock_controls WHERE monthly_control_id = $1 AND product_stock_id = $2",
      [monthly_control_id, product_stock_id]
    );
    return result.rows.length > 0;
  }

  /**
   * Productos DISCONTINUOS de un control: los que tienen stock en la sucursal,
   * pertenecen al MISMO rubro del control, pero NO fueron incluidos en él.
   * Sirve para detectar sobrante / stock a discontinuar. Solo lectura.
   *
   * Reglas (alineadas con getAvailableProducts del catálogo del control):
   *   - psb de la sucursal del control, con stock > 0.
   *   - mismo rubro: producto suelto (products.category_id = rubro) o grupo
   *     (product_groups.category_type = categories.category_name del rubro).
   *   - NOT EXISTS un stock_control de ESTE control para ese psb.
   * @param {number} branchId    sucursal del control
   * @param {number} categoryId  rubro del control
   * @param {number} monthlyControlId  el control en sí (para excluir sus ítems)
   */
  static async findDiscontinued(branchId, categoryId, monthlyControlId) {
    const result = await pool.query(
      `SELECT
         psb.id                                       AS product_stock_id,
         psb.display_name,
         psb.stock,
         COALESCE(psb.avg_cost, 0)                    AS avg_cost,
         COALESCE(c.category_name, pg.category_type)  AS category_name
       FROM product_stock_by_branch psb
       LEFT JOIN products       p  ON psb.product_id = p.id
       LEFT JOIN categories     c  ON p.category_id  = c.id
       LEFT JOIN product_groups pg ON psb.group_id   = pg.id
       LEFT JOIN categories     cg ON pg.category_type = cg.category_name
       WHERE psb.branch_id = $1
         AND psb.display_name IS NOT NULL
         AND psb.stock > 0
         AND ( p.category_id = $2 OR cg.id = $2 )
         AND NOT EXISTS (
           SELECT 1 FROM stock_controls sc
           WHERE sc.monthly_control_id = $3
             AND sc.product_stock_id = psb.id
         )
         -- Excluir marcas con una prueba EN PRUEBA en esta sucursal/rubro: se
         -- gestionan aparte (Marcas a prueba), no son discontinuo todavia.
         AND NOT EXISTS (
           SELECT 1 FROM brand_trials bt
           WHERE bt.status = 'en_prueba'
             AND bt.branch_id = psb.branch_id
             AND bt.brand_id = COALESCE(pg.brand_id, p.brand_id)
             AND (bt.category_id IS NULL OR bt.category_id = $2)
         )
       ORDER BY psb.display_name`,
      [branchId, categoryId, monthlyControlId]
    );
    return result.rows;
  }
}

module.exports = StockControl;

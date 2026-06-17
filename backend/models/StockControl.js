const { pool } = require("../database/config");

// Fuente de verdad de los umbrales de compliance → stock_status.
// 3 estados: <70% genera pedido, 70-120% óptimo, >120% sobrestock.
const STOCK_STATUS = {
  NEED_ORDER: 1, // < 70%   "Generar Pedido"
  OPTIMAL:    2, // 70–120% "Stock Optimo"
  OVERSTOCK:  3, // > 120%  "Sobrestock"
};

class StockControl {

  /**
   * Calcula compliance (%) entre stock actual y requerido.
   */
  static calculateCompliance(stockCurrent, stockRequire) {
    if (!stockRequire || stockRequire === 0) return 100;
    return Math.round((stockCurrent / stockRequire) * 100);
  }

  /**
   * Determina el stock_status_id según compliance.
   */
  static determineStockStatus(compliance) {
    if (compliance < 70)   return STOCK_STATUS.NEED_ORDER;
    if (compliance <= 120) return STOCK_STATUS.OPTIMAL;
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
      const stock_status_id = StockControl.determineStockStatus(compliance);

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
         psb.last_sync_at
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
}

module.exports = StockControl;

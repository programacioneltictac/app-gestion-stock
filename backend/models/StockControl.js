const { pool } = require("../database/config");

const STOCK_STATUS = {
  NEED_ORDER:  1,  // < 70%
  OPTIMAL:     2,  // 70–100%
  EXCESS:      3,  // 101–150%
  HIGH_EXCESS: 4,  // > 150%
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
    if (compliance < 70)  return STOCK_STATUS.NEED_ORDER;
    if (compliance <= 100) return STOCK_STATUS.OPTIMAL;
    if (compliance <= 150) return STOCK_STATUS.EXCESS;
    return STOCK_STATUS.HIGH_EXCESS;
  }

  /**
   * Upsert de un ítem del control.
   * Si ya existe el product_stock_id en el control → actualiza stock_require.
   * Si no existe → inserta.
   * stock_current se toma en el momento desde product_stock_by_branch.
   */
  static async upsert(monthly_control_id, branch_id, product_stock_id, stock_require, condition_id = null) {
    // Tomar stock actual desde la tabla sincronizada
    const stockResult = await pool.query(
      "SELECT stock FROM product_stock_by_branch WHERE id = $1",
      [product_stock_id]
    );
    if (!stockResult.rows[0]) {
      throw new Error("product_stock_id no encontrado en product_stock_by_branch");
    }
    const stock_current = stockResult.rows[0].stock;
    const compliance    = StockControl.calculateCompliance(stock_current, stock_require);
    const stock_status_id = StockControl.determineStockStatus(compliance);

    const result = await pool.query(
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
    return result.rows[0];
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
           ELSE ROUND((sc.stock_current::numeric / sc.stock_require::numeric) * 100, 1)
         END                                                     AS compliance,
         sc.stock_status_id,
         ss.stock_status_name,
         sc.condition_id,
         co.condition_name,
         sc.notes,
         sc.updated_at
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

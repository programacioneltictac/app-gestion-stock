const { pool } = require("../database/config");

class MonthlyControl {
  static async create(branch_id, year, month, created_by) {
    const result = await pool.query(
      `INSERT INTO monthly_controls (branch_id, control_year, control_month, created_by, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING id, branch_id, control_year, control_month, control_date, status`,
      [branch_id, year, month, created_by]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT mc.*, b.name as branch_name, b.code as branch_code,
              u.username as created_by_username
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN users u ON mc.created_by = u.id
       WHERE mc.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByBranchAndPeriod(branch_id, year, month) {
    const result = await pool.query(
      `SELECT mc.*, b.name as branch_name, b.code as branch_code,
              u.username as created_by_username
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN users u ON mc.created_by = u.id
       WHERE mc.branch_id = $1 AND mc.control_year = $2 AND mc.control_month = $3`,
      [branch_id, year, month]
    );
    return result.rows[0] || null;
  }

  static async exists(branch_id, year, month) {
    const result = await pool.query(
      "SELECT id FROM monthly_controls WHERE branch_id = $1 AND control_year = $2 AND control_month = $3",
      [branch_id, year, month]
    );
    return result.rows.length > 0;
  }

  static async update(id, notes) {
    await pool.query(
      "UPDATE monthly_controls SET notes = $1, updated_at = NOW() WHERE id = $2",
      [notes, id]
    );
  }

  static async complete(id) {
    const result = await pool.query(
      `UPDATE monthly_controls
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  static async getHistory(branch_id, limit = 12) {
    const result = await pool.query(
      `SELECT mc.*, b.name as branch_name, b.code as branch_code,
              u.username as created_by_username,
              COUNT(sc.id) as total_items,
              COUNT(CASE WHEN sc.stock_status_id = 1 THEN 1 END) as need_order_items,
              COUNT(CASE WHEN sc.stock_status_id = 2 THEN 1 END) as optimal_items,
              COUNT(CASE WHEN sc.stock_status_id = 3 THEN 1 END) as excess_items,
              0 as high_excess_items,
              ROUND(AVG(
                CASE
                  WHEN sc.stock_require = 0 THEN 100
                  ELSE (sc.stock_current::numeric / sc.stock_require::numeric) * 100
                END
              ), 2) as avg_compliance
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN users u ON mc.created_by = u.id
       LEFT JOIN stock_controls sc ON mc.id = sc.monthly_control_id
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       WHERE mc.branch_id = $1
       GROUP BY mc.id, b.name, b.code, u.username
       ORDER BY mc.control_year DESC, mc.control_month DESC
       LIMIT $2`,
      [branch_id, parseInt(limit)]
    );
    return result.rows;
  }

  static async getStats(control_id) {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_items,
         COUNT(CASE WHEN sc.stock_status_id = 1 THEN 1 END) as need_order,
         COUNT(CASE WHEN sc.stock_status_id = 2 THEN 1 END) as optimal,
         COUNT(CASE WHEN sc.stock_status_id = 3 THEN 1 END) as excess,
         0 as high_excess,
         ROUND(AVG(
           CASE
             WHEN sc.stock_require = 0 THEN 100
             ELSE (sc.stock_current::numeric / sc.stock_require::numeric) * 100
           END
         ), 2) as avg_compliance
       FROM stock_controls sc
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       WHERE sc.monthly_control_id = $1`,
      [control_id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    // Verificar si hay ordenes de reposicion asociadas
    const ordersResult = await pool.query(
      "SELECT id FROM orders_controls WHERE monthly_control_id = $1 LIMIT 1",
      [id]
    );
    if (ordersResult.rows.length > 0) {
      const err = new Error("No se puede eliminar un control que tiene órdenes de reposición asociadas. Elimine las órdenes primero.");
      err.code = "HAS_ORDERS";
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM stock_controls WHERE monthly_control_id = $1",
        [id]
      );
      await client.query("DELETE FROM monthly_controls WHERE id = $1", [id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async getSummaryByBranch(branch_code, limit = 12) {
    const result = await pool.query(
      `SELECT
         control_id,
         control_year,
         control_month,
         control_date,
         branch_name,
         branch_code,
         status,
         total_products as total_items,
         products_need_order as need_order,
         products_optimal as optimal_stock,
         products_excess as excess_stock,
         products_high_excess as high_excess_stock,
         avg_compliance,
         'N/A' as created_by_username
       FROM v_monthly_control_summary
       WHERE branch_code = $1
       ORDER BY control_year DESC, control_month DESC
       LIMIT $2`,
      [branch_code, parseInt(limit)]
    );
    return result.rows;
  }

  static async getBranchStats(branch_code) {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_controls,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_controls,
         COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_controls
       FROM v_monthly_control_summary
       WHERE branch_code = $1`,
      [branch_code]
    );
    return result.rows[0];
  }

  static async getItemCount(control_id) {
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM stock_controls WHERE monthly_control_id = $1",
      [control_id]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = MonthlyControl;

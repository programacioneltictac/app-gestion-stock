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
              COUNT(sc.id) as total_items
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN users u ON mc.created_by = u.id
       LEFT JOIN stock_controls sc ON mc.id = sc.monthly_control_id
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
         COUNT(CASE WHEN ss.stock_status_name = 'generar_pedido' THEN 1 END) as need_order,
         COUNT(CASE WHEN ss.stock_status_name = 'stock_optimo' THEN 1 END) as optimal,
         COUNT(CASE WHEN ss.stock_status_name = 'excedido' THEN 1 END) as excess,
         COUNT(CASE WHEN ss.stock_status_name = 'muy_excedido' THEN 1 END) as high_excess,
         ROUND(AVG(sc.stock_compliance), 2) as avg_compliance
       FROM stock_controls sc
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       WHERE sc.monthly_control_id = $1`,
      [control_id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query("BEGIN");
    try {
      await pool.query(
        "DELETE FROM stock_controls WHERE monthly_control_id = $1",
        [id]
      );
      await pool.query("DELETE FROM monthly_controls WHERE id = $1", [id]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
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

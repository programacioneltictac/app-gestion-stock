const { pool } = require("../database/config");

class Branch {
  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM branches WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  static async findAll(filterByBranchId = null) {
    let query = "SELECT * FROM branches WHERE is_active = true";
    let params = [];

    if (filterByBranchId) {
      query += " AND id = $1";
      params.push(filterByBranchId);
    }

    query += " ORDER BY name";
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async exists(id) {
    const result = await pool.query(
      "SELECT id FROM branches WHERE id = $1 AND is_active = true",
      [id]
    );
    return result.rows.length > 0;
  }

  static async findByCode(code) {
    const result = await pool.query(
      "SELECT * FROM branches WHERE code = $1",
      [code]
    );
    return result.rows[0] || null;
  }
}

module.exports = Branch;

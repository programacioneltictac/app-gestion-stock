const { pool } = require("../database/config");

class Condition {
  static async findAll() {
    const result = await pool.query(
      "SELECT * FROM conditions ORDER BY condition_name"
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM conditions WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = Condition;

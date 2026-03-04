const { pool } = require("../database/config");

class Category {
  static async findAll() {
    const result = await pool.query(
      "SELECT * FROM categories WHERE is_active = true ORDER BY category_name"
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM categories WHERE id = $1 AND is_active = true",
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = Category;

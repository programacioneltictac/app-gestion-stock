const { pool } = require("../database/config");

class ProductStatus {
  static async findAll() {
    const result = await pool.query(
      "SELECT * FROM products_status ORDER BY product_status_name"
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM products_status WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = ProductStatus;

const { pool } = require("../database/config");

class Product {
  static async create(name, code, description) {
    const query = `
      INSERT INTO products (product_name, product_code, description) VALUES
      ($1, $2, $3) RETURNING *;
    `;
    const values = [name, code, description];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("Error creating product:", error);
      throw error;
    }
  }

  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM products WHERE id = $1 AND is_active = true",
      [id]
    );
    return result.rows[0] || null;
  }

  static async search(searchTerm = null, limit = 100) {
    let query = `
      SELECT p.id, p.product_name, p.product_code, p.description, p.is_active
      FROM products p
      WHERE p.is_active = true
    `;

    const queryParams = [];
    let paramCount = 0;

    if (searchTerm) {
      paramCount++;
      query += ` AND (p.product_name ILIKE $${paramCount} OR p.product_code ILIKE $${paramCount})`;
      queryParams.push(`%${searchTerm}%`);
    }

    query += ` ORDER BY p.product_name LIMIT $${paramCount + 1}`;
    queryParams.push(parseInt(limit));

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async findAll(limit = 100) {
    const result = await pool.query(
      "SELECT * FROM products WHERE is_active = true ORDER BY product_name LIMIT $1",
      [limit]
    );
    return result.rows;
  }
}

module.exports = Product;

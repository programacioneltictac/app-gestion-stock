const { pool } = require("../database/config");
const bcrypt = require("bcrypt");

class User {
  static async findByUsername(username) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.password_hash, u.role, u.branch_id, u.is_active,
              b.name AS branch_name, b.code AS branch_code
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.username = $1 AND u.is_active = true`,
      [username]
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.branch_id, u.is_active,
              b.name AS branch_name, b.code AS branch_code
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async create(username, password, role = "employee", branch_id = null) {
    const password_hash = await bcrypt.hash(
      password,
      Number(process.env.SALT_ROUNDS) || 12
    );
    const result = await pool.query(
      "INSERT INTO users (username, password_hash, role, branch_id) VALUES ($1, $2, $3, $4) RETURNING id",
      [username, password_hash, role, branch_id]
    );
    return result.rows[0];
  }

  static async exists(username) {
    const result = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    return result.rows.length > 0;
  }

  static async getAll() {
    const result = await pool.query(`
      SELECT u.id, u.username, u.role, u.branch_id, u.is_active, u.created_at,
             b.name as branch_name, b.code as branch_code
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      ORDER BY u.created_at DESC
    `);
    return result.rows;
  }

  static async verifyPassword(password, password_hash) {
    return await bcrypt.compare(password, password_hash);
  }
}

module.exports = User;

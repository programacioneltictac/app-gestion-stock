const { pool } = require("../database/config");

class StockControl {
  static async create(data) {
    const {
      monthly_control_id,
      product_id,
      branch_id,
      category_id = 1,
      condition_id = 1,
      product_status_id = 1,
      stock_require,
      stock_current,
      stock_status_id,
      notes,
    } = data;

    const result = await pool.query(
      `INSERT INTO stock_controls
       (monthly_control_id, product_id, branch_id, category_id, condition_id, product_status_id,
        stock_require, stock_current, stock_status_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        monthly_control_id,
        product_id,
        branch_id,
        category_id,
        condition_id,
        product_status_id,
        stock_require,
        stock_current,
        stock_status_id,
        notes,
      ]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT sc.*, p.product_name, p.product_code,
              c.category_name, cond.condition_name,
              ps.product_status_name, ss.stock_status_name, ss.color_indicator,
              (sc.stock_current - sc.stock_require) as stock_difference,
              CASE
                WHEN sc.stock_require = 0 THEN 100
                ELSE ROUND((sc.stock_current::numeric / sc.stock_require::numeric) * 100, 2)
              END as stock_compliance
       FROM stock_controls sc
       JOIN products p ON sc.product_id = p.id
       LEFT JOIN categories c ON sc.category_id = c.id
       LEFT JOIN conditions cond ON sc.condition_id = cond.id
       LEFT JOIN products_status ps ON sc.product_status_id = ps.id
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       WHERE sc.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByControlId(control_id, filters = {}) {
    const { category_id, condition_id, product_status_id, stock_status_id, search, page = 1, limit = 50 } = filters;

    let query = `
      SELECT sc.*, p.product_name, p.product_code, p.description,
            c.category_name, cond.condition_name,
            ps.product_status_name, ss.stock_status_name, ss.color_indicator
      FROM stock_controls sc
      JOIN products p ON sc.product_id = p.id
      LEFT JOIN categories c ON sc.category_id = c.id
      LEFT JOIN conditions cond ON sc.condition_id = cond.id
      LEFT JOIN products_status ps ON sc.product_status_id = ps.id
      LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
      WHERE sc.monthly_control_id = $1
    `;

    const queryParams = [control_id];
    let paramCount = 1;

    if (category_id) {
      paramCount++;
      query += ` AND sc.category_id = $${paramCount}`;
      queryParams.push(category_id);
    }

    if (condition_id) {
      paramCount++;
      query += ` AND sc.condition_id = $${paramCount}`;
      queryParams.push(condition_id);
    }

    if (product_status_id) {
      paramCount++;
      query += ` AND sc.product_status_id = $${paramCount}`;
      queryParams.push(product_status_id);
    }

    if (stock_status_id) {
      paramCount++;
      query += ` AND sc.stock_status_id = $${paramCount}`;
      queryParams.push(stock_status_id);
    }

    if (search) {
      paramCount++;
      query += ` AND (p.product_name ILIKE $${paramCount} OR p.product_code ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    query += ` ORDER BY p.product_name`;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(parseInt(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async count(control_id, filters = {}) {
    const { category_id, condition_id, product_status_id, stock_status_id, search } = filters;

    let query = `
      SELECT COUNT(*) as total
      FROM stock_controls sc
      JOIN products p ON sc.product_id = p.id
      WHERE sc.monthly_control_id = $1
    `;

    const queryParams = [control_id];
    let paramCount = 1;

    if (category_id) {
      paramCount++;
      query += ` AND sc.category_id = $${paramCount}`;
      queryParams.push(category_id);
    }

    if (condition_id) {
      paramCount++;
      query += ` AND sc.condition_id = $${paramCount}`;
      queryParams.push(condition_id);
    }

    if (product_status_id) {
      paramCount++;
      query += ` AND sc.product_status_id = $${paramCount}`;
      queryParams.push(product_status_id);
    }

    if (stock_status_id) {
      paramCount++;
      query += ` AND sc.stock_status_id = $${paramCount}`;
      queryParams.push(stock_status_id);
    }

    if (search) {
      paramCount++;
      query += ` AND (p.product_name ILIKE $${paramCount} OR p.product_code ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    const result = await pool.query(query, queryParams);
    return parseInt(result.rows[0].total);
  }

  static async exists(monthly_control_id, product_id) {
    const result = await pool.query(
      "SELECT id FROM stock_controls WHERE monthly_control_id = $1 AND product_id = $2",
      [monthly_control_id, product_id]
    );
    return result.rows.length > 0;
  }

  static async update(id, data) {
    const { stock_require, stock_current, stock_status_id, notes } = data;

    const result = await pool.query(
      `UPDATE stock_controls
       SET stock_require = $1, stock_current = $2, stock_status_id = $3, notes = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [stock_require, stock_current, stock_status_id, notes, id]
    );
    return result.rows[0];
  }

  static async updateStatus(id, product_status_id) {
    await pool.query(
      "UPDATE stock_controls SET product_status_id = $1, updated_at = NOW() WHERE id = $2",
      [product_status_id, id]
    );
  }

  static async delete(id) {
    await pool.query("DELETE FROM stock_controls WHERE id = $1", [id]);
  }

  static async findWithControlInfo(id) {
    const result = await pool.query(
      `SELECT sc.*, mc.status as control_status, mc.branch_id, p.product_name
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       JOIN products p ON sc.product_id = p.id
       WHERE sc.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static calculateStockDifference(stockCurrent, stockRequire) {
    return stockCurrent - stockRequire;
  }

  static calculateStockCompliance(stockCurrent, stockRequire) {
    if (stockRequire === 0) return 100;
    return Math.round((stockCurrent / stockRequire) * 100);
  }
}

module.exports = StockControl;

const { pool } = require("../database/config");

class Product {
  static async create(name, code, description, brandId, categoryId) {
    const query = `
      INSERT INTO products (product_name, product_code, description, brand_id, category_id) VALUES
      ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const values = [name, code, description, brandId || null, categoryId || null];

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
      `SELECT p.*, b.brand_name, c.category_name
       FROM products p
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1 AND p.is_active = true`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByCode(code) {
    const result = await pool.query(
      "SELECT * FROM products WHERE product_code = $1 AND is_active = true",
      [code]
    );
    return result.rows[0] || null;
  }

  static async search(searchTerm = null, limit = 10000) {
    let query = `
      SELECT p.id, p.product_name, p.product_code, p.description, p.is_active,
             p.brand_id, p.category_id, b.brand_name, c.category_name
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.category_id = c.id
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

  static async findAll(limit = 10000) {
    const result = await pool.query(
      `SELECT p.*, b.brand_name, c.category_name
       FROM products p
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = true
       ORDER BY p.product_name LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  static async findAllPaginated({ page = 1, pageSize = 100, sortField = 'product_name', sortOrder = 'asc', searchTerm = null, brandId = null, categoryId = null }) {
    const offset = (page - 1) * pageSize;

    let whereConditions = ['p.is_active = true'];
    const queryParams = [];
    let paramCount = 0;

    // Búsqueda por texto
    if (searchTerm) {
      paramCount++;
      whereConditions.push(`(p.product_name ILIKE $${paramCount} OR p.display_name ILIKE $${paramCount} OR p.product_code ILIKE $${paramCount})`);
      queryParams.push(`%${searchTerm}%`);
    }

    // Filtro por marca
    if (brandId) {
      paramCount++;
      whereConditions.push(`p.brand_id = $${paramCount}`);
      queryParams.push(brandId);
    }

    // Filtro por categoría
    if (categoryId) {
      paramCount++;
      whereConditions.push(`p.category_id = $${paramCount}`);
      queryParams.push(categoryId);
    }

    const whereClause = whereConditions.join(' AND ');

    // Validar campo de ordenamiento para prevenir SQL injection
    const validSortFields = ['product_name', 'display_name', 'product_code', 'category_name', 'id'];
    const validatedSortField = validSortFields.includes(sortField) ? sortField : 'display_name';
    const validatedSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';

    // Query de datos
    const dataQuery = `
      SELECT p.id, p.product_name, p.display_name, p.product_code, p.is_active,
             p.is_grouped, p.group_id, p.external_id, p.last_sync_at,
             p.category_id, c.category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${whereClause}
      ORDER BY ${validatedSortField === 'category_name' ? 'c.category_name' : 'p.' + validatedSortField} ${validatedSortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    // Query de conteo
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE ${whereClause}
    `;

    queryParams.push(pageSize, offset);

    // Ejecutar ambas queries en paralelo
    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, queryParams),
      pool.query(countQuery, queryParams.slice(0, paramCount))
    ]);

    const total = parseInt(countResult.rows[0].total);

    return {
      products: dataResult.rows,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  }

  static async update(id, { name, code, description, brandId, categoryId }) {
    const query = `
      UPDATE products
      SET product_name = $1, product_code = $2, description = $3, brand_id = $4, category_id = $5
      WHERE id = $6 AND is_active = true
      RETURNING *
    `;
    const values = [name, code, description, brandId, categoryId, id];

    try {
      const result = await pool.query(query, values);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error updating product:", error);
      throw error;
    }
  }

  static async delete(id) {
    const query = `
      UPDATE products
      SET is_active = false
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error deleting product:", error);
      throw error;
    }
  }
}

module.exports = Product;

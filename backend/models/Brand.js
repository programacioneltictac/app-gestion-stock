const { pool } = require("../database/config");

class Brand {
  static async findAll() {
    const result = await pool.query(
      "SELECT * FROM brands WHERE is_active = true ORDER BY brand_name"
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM brands WHERE id = $1 AND is_active = true",
      [id]
    );
    return result.rows[0] || null;
  }

  static async findAllPaginated({ page = 1, pageSize = 100, searchTerm = null }) {
    const offset = (page - 1) * pageSize;
    const params = [];
    let where = "is_active = true";

    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      where += ` AND brand_name ILIKE $${params.length}`;
    }

    // Nota: el WHERE filtra sobre brands; al hacer JOIN usamos alias b.
    const whereB = where.replace(/\bis_active\b/g, "b.is_active").replace(/\bbrand_name\b/g, "b.brand_name");

    params.push(pageSize, offset);
    const data = await pool.query(
      `SELECT b.id, b.brand_name, b.is_groupable, b.supplier_id, s.supplier_name
       FROM brands b
       LEFT JOIN suppliers s ON b.supplier_id = s.id
       WHERE ${whereB}
       ORDER BY b.brand_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await pool.query(
      `SELECT COUNT(*) as total FROM brands b WHERE ${whereB}`,
      params.slice(0, -2)
    );

    return {
      brands: data.rows,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: parseInt(count.rows[0].total),
      },
    };
  }

  // Crea una marca. Lanza error con code 'DUP' si ya existe (UNIQUE brand_name).
  static async create({ brandName, isGroupable = false }) {
    try {
      const result = await pool.query(
        `INSERT INTO brands (brand_name, is_groupable, is_active)
         VALUES ($1, $2, true)
         RETURNING id, brand_name, is_groupable, supplier_id`,
        [brandName, isGroupable]
      );
      return result.rows[0];
    } catch (err) {
      if (err.code === "23505") {
        const dup = new Error("Ya existe una marca con ese nombre");
        dup.code = "DUP";
        throw dup;
      }
      throw err;
    }
  }

  static async updateIsGroupable(id, isGroupable) {
    const result = await pool.query(
      "UPDATE brands SET is_groupable = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING id, brand_name, is_groupable",
      [isGroupable, id]
    );
    return result.rows[0] || null;
  }

  // Asigna (o quita, con supplierId = null) el proveedor de una marca.
  static async updateSupplier(id, supplierId) {
    const result = await pool.query(
      `UPDATE brands b SET supplier_id = $1, updated_at = NOW()
       WHERE b.id = $2 AND b.is_active = true
       RETURNING b.id, b.brand_name, b.supplier_id,
                 (SELECT supplier_name FROM suppliers WHERE id = $1) AS supplier_name`,
      [supplierId, id]
    );
    return result.rows[0] || null;
  }
}

module.exports = Brand;

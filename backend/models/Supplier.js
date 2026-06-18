const { pool } = require("../database/config");

class Supplier {
  // Lista proveedores activos con la cantidad de marcas asociadas.
  static async findAll() {
    const result = await pool.query(
      `SELECT s.id, s.supplier_name, s.contact_info, s.is_active,
              s.created_at, s.updated_at,
              COUNT(b.id) FILTER (WHERE b.is_active = true) AS brand_count
       FROM suppliers s
       LEFT JOIN brands b ON b.supplier_id = s.id
       WHERE s.is_active = true
       GROUP BY s.id
       ORDER BY s.supplier_name`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM suppliers WHERE id = $1 AND is_active = true",
      [id]
    );
    return result.rows[0] || null;
  }

  static async create({ supplier_name, contact_info = null }) {
    const result = await pool.query(
      `INSERT INTO suppliers (supplier_name, contact_info)
       VALUES ($1, $2)
       RETURNING id, supplier_name, contact_info, is_active, created_at, updated_at`,
      [supplier_name, contact_info]
    );
    return result.rows[0];
  }

  static async update(id, { supplier_name, contact_info }) {
    const result = await pool.query(
      `UPDATE suppliers
       SET supplier_name = COALESCE($2, supplier_name),
           contact_info  = $3,
           updated_at    = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id, supplier_name, contact_info, is_active, created_at, updated_at`,
      [id, supplier_name, contact_info]
    );
    return result.rows[0] || null;
  }

  // Soft-delete. Al desactivar, desvincula sus marcas (supplier_id = NULL) para
  // no dejar referencias colgando a un proveedor inactivo.
  static async deactivate(id) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "UPDATE suppliers SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true RETURNING id",
        [id]
      );
      if (result.rows[0]) {
        await client.query(
          "UPDATE brands SET supplier_id = NULL, updated_at = NOW() WHERE supplier_id = $1",
          [id]
        );
      }
      await client.query("COMMIT");
      return result.rows[0] || null;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = Supplier;

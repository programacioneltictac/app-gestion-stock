const { pool } = require("../database/config");

class ProductGroup {
  // Obtener todos los grupos activos
  static async findAll() {
    const result = await pool.query(
      `SELECT pg.*, b.brand_name
       FROM product_groups pg
       LEFT JOIN brands b ON pg.brand_id = b.id
       WHERE pg.is_active = true
       ORDER BY pg.display_name`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT pg.*, b.brand_name
       FROM product_groups pg
       LEFT JOIN brands b ON pg.brand_id = b.id
       WHERE pg.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByKey(groupKey) {
    const result = await pool.query(
      "SELECT * FROM product_groups WHERE group_key = $1",
      [groupKey]
    );
    return result.rows[0] || null;
  }

  // Crear o actualizar un grupo (usado por el sync)
  static async upsert({ brandId, brandKeyword, categoryType, displayName, groupKey }) {
    const result = await pool.query(
      `INSERT INTO product_groups (brand_id, brand_keyword, category_type, display_name, group_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (group_key) DO UPDATE
         SET brand_id      = EXCLUDED.brand_id,
             brand_keyword = EXCLUDED.brand_keyword,
             display_name  = EXCLUDED.display_name,
             updated_at    = NOW()
       RETURNING *`,
      [brandId, brandKeyword, categoryType, displayName, groupKey]
    );
    return result.rows[0];
  }

  // Actualizar stock mínimo de un grupo
  static async updateMinStock(id, minStock) {
    const result = await pool.query(
      `UPDATE product_groups
       SET min_stock = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [minStock, id]
    );
    return result.rows[0] || null;
  }

  // Obtener grupos con su stock actual por sucursal
  static async findAllWithStock(branchId) {
    const result = await pool.query(
      `SELECT pg.*, b.brand_name,
              COALESCE(psb.stock, 0) AS stock_current,
              psb.last_sync_at
       FROM product_groups pg
       LEFT JOIN brands b ON pg.brand_id = b.id
       LEFT JOIN product_stock_by_branch psb
         ON psb.group_id = pg.id AND psb.branch_id = $1
       WHERE pg.is_active = true
       ORDER BY pg.display_name`,
      [branchId]
    );
    return result.rows;
  }
}

module.exports = ProductGroup;

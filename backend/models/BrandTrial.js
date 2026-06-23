const { pool } = require("../database/config");

// Estados persistidos de una prueba de marca. "A evaluar" NO se persiste:
// es derivado (en_prueba AND end_date < hoy) y se expone como `is_due`.
const TRIAL_STATUSES = ["en_prueba", "incorporada", "descartada"];
const SAMPLE_TYPES = ["consignacion", "compra"];

// Stock y costo REALES de la marca de la prueba en su sucursal/rubro, tomados
// del sync (product_stock_by_branch). El cruce es por marca + sucursal + rubro:
//   - psb de la sucursal de la prueba, con stock.
//   - marca = product_groups.brand_id (grupos) o products.brand_id (sueltos)
//     coincide con bt.brand_id.
//   - rubro (si la prueba tiene category_id): products.category_id o el rubro del
//     grupo (product_groups.category_type -> categories.id) coincide con bt.category_id.
//   synced_stock = SUMA de stock; synced_cost = promedio PONDERADO por stock.
// Subquery correlacionada sobre la fila bt de brand_trials.
const SYNC_STOCK_SUBQUERY = `(
  SELECT json_build_object(
    'stock', COALESCE(SUM(psb.stock), 0),
    'cost',  CASE WHEN SUM(psb.stock) > 0
                  THEN SUM(psb.stock * COALESCE(psb.avg_cost, 0)) / SUM(psb.stock)
                  ELSE NULL END
  )
  FROM product_stock_by_branch psb
  LEFT JOIN products       p  ON psb.product_id = p.id
  LEFT JOIN product_groups pg ON psb.group_id   = pg.id
  LEFT JOIN categories     cg ON pg.category_type = cg.category_name
  WHERE psb.branch_id = bt.branch_id
    AND psb.stock > 0
    AND COALESCE(pg.brand_id, p.brand_id) = bt.brand_id
    AND (
      bt.category_id IS NULL
      OR p.category_id = bt.category_id
      OR cg.id = bt.category_id
    )
)`;

class BrandTrial {
  // Lista de pruebas con nombres de marca/sucursal/rubro y el flag derivado
  // is_due (período vencido sin decidir). branchId opcional para acotar.
  static async findAll(branchId = null) {
    const params = branchId ? [branchId] : [];
    const branchClause = branchId ? "WHERE bt.branch_id = $1" : "";
    const result = await pool.query(
      `SELECT bt.*,
              br.brand_name,
              b.name        AS branch_name,
              c.category_name,
              (bt.status = 'en_prueba' AND bt.end_date < CURRENT_DATE) AS is_due,
              ${SYNC_STOCK_SUBQUERY} AS sync_stock
       FROM brand_trials bt
       JOIN brands     br ON bt.brand_id = br.id
       JOIN branches   b  ON bt.branch_id = b.id
       LEFT JOIN categories c ON bt.category_id = c.id
       ${branchClause}
       ORDER BY
         (bt.status = 'en_prueba' AND bt.end_date < CURRENT_DATE) DESC,
         bt.status = 'en_prueba' DESC,
         bt.end_date ASC`,
      params
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT bt.*, br.brand_name, b.name AS branch_name, c.category_name,
              (bt.status = 'en_prueba' AND bt.end_date < CURRENT_DATE) AS is_due,
              ${SYNC_STOCK_SUBQUERY} AS sync_stock
       FROM brand_trials bt
       JOIN brands br ON bt.brand_id = br.id
       JOIN branches b ON bt.branch_id = b.id
       LEFT JOIN categories c ON bt.category_id = c.id
       WHERE bt.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async create(data) {
    const {
      brand_id, branch_id, category_id = null,
      start_date = null, end_date,
      sample_qty = null, sample_type = null, sample_unit_cost = null,
      created_by = null,
    } = data;
    const result = await pool.query(
      `INSERT INTO brand_trials
         (brand_id, branch_id, category_id, start_date, end_date,
          sample_qty, sample_type, sample_unit_cost, created_by)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9)
       RETURNING *`,
      [brand_id, branch_id, category_id, start_date, end_date,
       sample_qty, sample_type, sample_unit_cost, created_by]
    );
    return result.rows[0];
  }

  // Editar datos de la prueba. Solo tiene sentido mientras está en_prueba
  // (el controller valida que no sea terminal).
  static async update(id, data) {
    const {
      category_id = null, start_date = null, end_date = null,
      sample_qty = null, sample_type = null, sample_unit_cost = null,
    } = data;
    const result = await pool.query(
      `UPDATE brand_trials
       SET category_id      = $2,
           start_date       = COALESCE($3, start_date),
           end_date         = COALESCE($4, end_date),
           sample_qty       = $5,
           sample_type      = $6,
           sample_unit_cost = $7,
           updated_at       = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, category_id, start_date, end_date, sample_qty, sample_type, sample_unit_cost]
    );
    return result.rows[0] || null;
  }

  // Decisión final: 'incorporada' | 'descartada'. Setea decided_at y la nota.
  static async decide(id, decision, notes = null) {
    const result = await pool.query(
      `UPDATE brand_trials
       SET status = $2, decision_notes = $3, decided_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'en_prueba'
       RETURNING *`,
      [id, decision, notes]
    );
    return result.rows[0] || null;
  }

  static async remove(id) {
    const result = await pool.query(
      "DELETE FROM brand_trials WHERE id = $1 RETURNING id",
      [id]
    );
    return result.rows[0] || null;
  }

  // Conteo de pruebas vencidas sin decidir (para la alerta del dashboard).
  static async countDue(branchId = null) {
    const params = branchId ? [branchId] : [];
    const branchClause = branchId ? "AND branch_id = $1" : "";
    const result = await pool.query(
      `SELECT COUNT(*) AS total
       FROM brand_trials
       WHERE status = 'en_prueba' AND end_date < CURRENT_DATE ${branchClause}`,
      params
    );
    return Number(result.rows[0]?.total || 0);
  }
}

BrandTrial.TRIAL_STATUSES = TRIAL_STATUSES;
BrandTrial.SAMPLE_TYPES = SAMPLE_TYPES;

module.exports = BrandTrial;

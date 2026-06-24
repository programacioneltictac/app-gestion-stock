const { pool } = require("../database/config");

class MonthlyControl {
  // Control abierto por rubro (no atado al mes). category_id es obligatorio.
  // control_year/control_month se conservan (los llena el controlador desde la
  // fecha de apertura) para no romper Order.createFromControl, getHistory y la
  // vista v_monthly_control_summary.
  static async create(branch_id, category_id, year, month, created_by) {
    const result = await pool.query(
      `INSERT INTO monthly_controls (branch_id, category_id, control_year, control_month, created_by, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING id, branch_id, category_id, control_year, control_month, control_date, status`,
      [branch_id, category_id, year, month, created_by]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT mc.*, b.name as branch_name, b.code as branch_code, b.is_hub,
              c.category_name,
              u.username as created_by_username
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       LEFT JOIN users u ON mc.created_by = u.id
       WHERE mc.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ¿Hay un control ACTIVO (draft o completed) de este rubro en esta sucursal?
  // Unicidad por rubro: no pueden coexistir un draft y un completed del mismo
  // rubro/sucursal. Un 'discontinued' NO cuenta (es archivo), así que para
  // "renovar" un rubro se discontinúa el actual y recién ahí se abre uno nuevo.
  static async existsOpenForCategory(branch_id, category_id) {
    const result = await pool.query(
      "SELECT id FROM monthly_controls WHERE branch_id = $1 AND category_id = $2 AND status IN ('draft', 'completed')",
      [branch_id, category_id]
    );
    return result.rows[0] || null;
  }

  // Lista los controles abiertos (draft) de una sucursal — reemplaza al
  // "control actual" único. Incluye conteo de ítems para la pantalla de entrada.
  static async findOpenByBranch(branch_id) {
    const result = await pool.query(
      `SELECT mc.*, b.name as branch_name, b.code as branch_code,
              c.category_name,
              u.username as created_by_username,
              COUNT(sc.id) AS total_items
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       LEFT JOIN users u ON mc.created_by = u.id
       LEFT JOIN stock_controls sc ON mc.id = sc.monthly_control_id
       WHERE mc.branch_id = $1 AND mc.status = 'draft'
       GROUP BY mc.id, b.name, b.code, c.category_name, u.username
       ORDER BY mc.control_date DESC, mc.id DESC`,
      [branch_id]
    );
    return result.rows;
  }

  static async update(id, notes) {
    await pool.query(
      "UPDATE monthly_controls SET notes = $1, updated_at = NOW() WHERE id = $2",
      [notes, id]
    );
  }

  static async complete(id) {
    const result = await pool.query(
      `UPDATE monthly_controls
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  // Discontinúa un control completado: queda de archivo. El sync deja de
  // actualizar su stock y no se pueden generar órdenes desde él. Es terminal.
  static async discontinue(id) {
    const result = await pool.query(
      `UPDATE monthly_controls
       SET status = 'discontinued', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  // Cuenta las órdenes de reposición ABIERTAS vinculadas a este control (las que
  // todavía requieren gestión: cualquier estado salvo 'finalizado'/'cancelado').
  // El vínculo control→orden es por order_details.stock_control_id. Sirve para
  // avisar al usuario antes de discontinuar (las órdenes siguen vivas en /orders).
  static async countOpenOrders(control_id) {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT oc.id) AS count
       FROM orders_controls oc
       JOIN order_details od ON od.order_control_id = oc.id
       JOIN stock_controls sc ON sc.id = od.stock_control_id
       WHERE sc.monthly_control_id = $1
         AND oc.status NOT IN ('finalizado', 'cancelado')`,
      [control_id]
    );
    return parseInt(result.rows[0].count, 10) || 0;
  }

  static async getHistory(branch_id, limit = 12) {
    const result = await pool.query(
      `SELECT mc.*, b.name as branch_name, b.code as branch_code,
              c.category_name,
              u.username as created_by_username,
              COUNT(sc.id) as total_items,
              COUNT(CASE WHEN sc.stock_status_id = 1 THEN 1 END) as need_order_items,
              COUNT(CASE WHEN sc.stock_status_id = 2 THEN 1 END) as optimal_items,
              COUNT(CASE WHEN sc.stock_status_id = 3 THEN 1 END) as excess_items,
              0 as high_excess_items,
              ROUND(AVG(
                CASE
                  WHEN sc.stock_require = 0 THEN 100
                  ELSE (sc.stock_current::numeric / sc.stock_require::numeric) * 100
                END
              ), 2) as avg_compliance,
              -- Stock valorizado total del rubro en la sucursal: SUM(stock * costo)
              -- de TODOS los productos del rubro con stock > 0 (en control +
              -- discontinuos). Costo con fallback (avg_cost local -> cost_price ->
              -- promedio del grupo en otras sucursales), como en las órdenes.
              -- Subconsulta correlacionada por mc.branch_id + mc.category_id; no
              -- depende de qué se cargó en el control.
              COALESCE((
                SELECT SUM(
                  psb.stock * COALESCE(
                    NULLIF(psb.avg_cost, 0),
                    p2.cost_price,
                    CASE WHEN psb.group_id IS NOT NULL THEN (
                      SELECT AVG(o.avg_cost)
                      FROM product_stock_by_branch o
                      WHERE o.group_id = psb.group_id AND o.avg_cost > 0
                    ) END,
                    0
                  )
                )
                FROM product_stock_by_branch psb
                LEFT JOIN products p2 ON psb.product_id = p2.id
                LEFT JOIN product_groups pg2 ON psb.group_id = pg2.id
                LEFT JOIN categories cg2 ON pg2.category_type = cg2.category_name
                WHERE psb.branch_id = mc.branch_id
                  AND psb.stock > 0
                  AND ( p2.category_id = mc.category_id OR cg2.id = mc.category_id )
              ), 0) as stock_value
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       LEFT JOIN users u ON mc.created_by = u.id
       LEFT JOIN stock_controls sc ON mc.id = sc.monthly_control_id
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       WHERE mc.branch_id = $1
       GROUP BY mc.id, b.name, b.code, c.category_name, u.username
       ORDER BY mc.control_date DESC, mc.id DESC
       LIMIT $2`,
      [branch_id, parseInt(limit)]
    );
    return result.rows;
  }

  static async getStats(control_id) {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_items,
         COUNT(CASE WHEN sc.stock_status_id = 1 THEN 1 END) as need_order,
         COUNT(CASE WHEN sc.stock_status_id = 2 THEN 1 END) as optimal,
         COUNT(CASE WHEN sc.stock_status_id = 3 THEN 1 END) as excess,
         0 as high_excess,
         ROUND(AVG(
           CASE
             WHEN sc.stock_require = 0 THEN 100
             ELSE (sc.stock_current::numeric / sc.stock_require::numeric) * 100
           END
         ), 2) as avg_compliance
       FROM stock_controls sc
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       WHERE sc.monthly_control_id = $1`,
      [control_id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    // Verificar si hay ordenes de reposicion asociadas
    const ordersResult = await pool.query(
      "SELECT id FROM orders_controls WHERE monthly_control_id = $1 LIMIT 1",
      [id]
    );
    if (ordersResult.rows.length > 0) {
      const err = new Error("No se puede eliminar un control que tiene órdenes de reposición asociadas. Elimine las órdenes primero.");
      err.code = "HAS_ORDERS";
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM stock_controls WHERE monthly_control_id = $1",
        [id]
      );
      await client.query("DELETE FROM monthly_controls WHERE id = $1", [id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async getSummaryByBranch(branch_code, limit = 12) {
    const result = await pool.query(
      `SELECT
         control_id,
         control_year,
         control_month,
         control_date,
         branch_name,
         branch_code,
         status,
         total_products as total_items,
         products_need_order as need_order,
         products_optimal as optimal_stock,
         products_excess as excess_stock,
         products_high_excess as high_excess_stock,
         avg_compliance,
         'N/A' as created_by_username
       FROM v_monthly_control_summary
       WHERE branch_code = $1
       ORDER BY control_year DESC, control_month DESC
       LIMIT $2`,
      [branch_code, parseInt(limit)]
    );
    return result.rows;
  }

  static async getBranchStats(branch_code) {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_controls,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_controls,
         COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_controls
       FROM v_monthly_control_summary
       WHERE branch_code = $1`,
      [branch_code]
    );
    return result.rows[0];
  }

  static async getItemCount(control_id) {
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM stock_controls WHERE monthly_control_id = $1",
      [control_id]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = MonthlyControl;

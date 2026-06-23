const { pool } = require("../database/config");
const BrandTrial = require("./BrandTrial");

// Condición 'MUY PRIORITARIO' (conditions id 3): faltantes de máxima urgencia.
const MUY_PRIORITARIO_CONDITION_ID = 3;
// Condición 'NUEVA MARCA' (id 4): no reponible, se excluye de los faltantes.
const NON_REPLENISHABLE_CONDITION_ID = 4;

// Expresión de costo con fallback (avg_cost local -> cost_price -> promedio del
// grupo en otras sucursales), idéntica a la usada en órdenes y valorizado.
const COST_EXPR = `COALESCE(
  NULLIF(psb.avg_cost, 0),
  p.cost_price,
  CASE WHEN psb.group_id IS NOT NULL THEN (
    SELECT AVG(o.avg_cost) FROM product_stock_by_branch o
    WHERE o.group_id = psb.group_id AND o.avg_cost > 0
  ) END,
  0
)`;

class Alert {
  /**
   * Métricas de alertas tempranas. `branchId` opcional: si viene (employee),
   * limita todo a esa sucursal; si es null (admin/manager), abarca todas.
   * Solo considera controles ABIERTOS (draft) e ítems no pedidos.
   * @returns {Promise<object>} { muyPrioritarios, criticalBranches,
   *   pendingOrders, authorizedOrders, avgOrderAgeDays, openOrdersTotal,
   *   avgCompliance, brandTrialsDue, discontinuedValue }
   */
  static async getSummary(branchId = null) {
    const branchClause = branchId ? "AND mc.branch_id = $1" : "";
    const params = branchId ? [branchId] : [];

    // 1) Faltantes MUY PRIORITARIOS por sucursal+rubro (estado generar_pedido,
    //    no pedidos, en controles draft). Navega al control puntual.
    const muyPrioritarios = await pool.query(
      `SELECT mc.id          AS control_id,
              mc.branch_id,
              b.name          AS branch_name,
              c.category_name,
              COUNT(*)        AS faltantes
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       JOIN branches b   ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       WHERE sc.stock_status_id = 1
         AND sc.condition_id = ${MUY_PRIORITARIO_CONDITION_ID}
         AND sc.ordered_at IS NULL
         AND mc.status = 'draft'
         ${branchClause}
       GROUP BY mc.id, mc.branch_id, b.name, c.category_name
       ORDER BY faltantes DESC, b.name`,
      params
    );

    // 2) Sucursales críticas: ranking por ítems en generar_pedido (no pedidos,
    //    reponibles) en controles draft. Navega a los controles de la sucursal.
    const criticalBranches = await pool.query(
      `SELECT mc.branch_id,
              b.name      AS branch_name,
              b.is_hub,
              COUNT(*)    AS need_order_items
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       JOIN branches b ON mc.branch_id = b.id
       WHERE sc.stock_status_id = 1
         AND sc.ordered_at IS NULL
         AND sc.condition_id IS DISTINCT FROM ${NON_REPLENISHABLE_CONDITION_ID}
         AND mc.status = 'draft'
         ${branchClause}
       GROUP BY mc.branch_id, b.name, b.is_hub
       ORDER BY need_order_items DESC, b.name`,
      params
    );

    // 3) Órdenes pendientes (status = 'pending'). Para employee, de su sucursal.
    const ordersBranchClause = branchId ? "AND oc.branch_id = $1" : "";
    const pendingOrders = await pool.query(
      `SELECT COUNT(*) AS total
       FROM orders_controls oc
       WHERE oc.status = 'pending' ${ordersBranchClause}`,
      params
    );

    // 3b) Órdenes autorizadas (status = 'autorizado'): listas para enviar al
    //     proveedor. Mismo criterio de sucursal que las pendientes.
    const authorizedOrders = await pool.query(
      `SELECT COUNT(*) AS total
       FROM orders_controls oc
       WHERE oc.status = 'autorizado' ${ordersBranchClause}`,
      params
    );

    // 3c) Antigüedad promedio (en días) de las órdenes EN GESTIÓN (no finalizadas
    //     ni canceladas). Al cerrarse/cancelarse una orden deja de contar. Se
    //     mide hoy - created_at sobre las abiertas.
    const avgOrderAge = await pool.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - oc.created_at)) / 86400))::int AS avg_days,
              COUNT(*) AS open_total
       FROM orders_controls oc
       WHERE oc.status NOT IN ('finalizado', 'cancelado') ${ordersBranchClause}`,
      params
    );

    // 4) Discontinuos valorizados por sucursal+rubro: stock*costo de productos
    //    del rubro CON stock que NO están en el control draft (sobrante a
    //    liquidar). Navega al control (tab Discontinuos).
    const discontinuedValue = await pool.query(
      `SELECT mc.id        AS control_id,
              mc.branch_id,
              b.name        AS branch_name,
              c.category_name,
              SUM(psb.stock * ${COST_EXPR}) AS value
       FROM monthly_controls mc
       JOIN branches b   ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       JOIN product_stock_by_branch psb
            ON psb.branch_id = mc.branch_id AND psb.stock > 0
       LEFT JOIN products p        ON psb.product_id = p.id
       LEFT JOIN product_groups pg ON psb.group_id = pg.id
       LEFT JOIN categories cg     ON pg.category_type = cg.category_name
       WHERE mc.status = 'draft'
         AND ( p.category_id = mc.category_id OR cg.id = mc.category_id )
         AND NOT EXISTS (
           SELECT 1 FROM stock_controls sc
           WHERE sc.monthly_control_id = mc.id AND sc.product_stock_id = psb.id
         )
         ${branchClause}
       GROUP BY mc.id, mc.branch_id, b.name, c.category_name
       HAVING SUM(psb.stock * ${COST_EXPR}) > 0
       ORDER BY value DESC`,
      params
    );

    // 5) Compliance promedio general: AVG del compliance de TODOS los items de
    //    controles draft (todas las sucursales y rubros). Misma fórmula que
    //    MonthlyControl.avg_compliance (require=0 => 100). Foto del estado actual.
    const avgCompliance = await pool.query(
      `SELECT ROUND(AVG(
                CASE
                  WHEN sc.stock_require = 0 THEN 100
                  ELSE (sc.stock_current::numeric / sc.stock_require::numeric) * 100
                END
              ))::int AS avg_compliance
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       WHERE mc.status = 'draft' ${branchClause}`,
      params
    );

    // 6) Marcas a prueba vencidas sin decidir (pendientes de evaluación).
    const brandTrialsDue = await BrandTrial.countDue(branchId);

    return {
      muyPrioritarios: muyPrioritarios.rows,
      criticalBranches: criticalBranches.rows,
      pendingOrders: Number(pendingOrders.rows[0]?.total || 0),
      authorizedOrders: Number(authorizedOrders.rows[0]?.total || 0),
      avgOrderAgeDays: avgOrderAge.rows[0]?.avg_days != null ? Number(avgOrderAge.rows[0].avg_days) : null,
      openOrdersTotal: Number(avgOrderAge.rows[0]?.open_total || 0),
      avgCompliance: avgCompliance.rows[0]?.avg_compliance != null ? Number(avgCompliance.rows[0].avg_compliance) : null,
      brandTrialsDue,
      discontinuedValue: discontinuedValue.rows,
    };
  }
}

module.exports = Alert;

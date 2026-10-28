const { pool } = require("../database/config");
const BrandTrial = require("./BrandTrial");
// Costo con fallback (avg_cost local -> cost_price -> promedio del grupo en
// otras sucursales), compartido con el informe de situación y las órdenes.
const { COST_EXPR } = require("../utils/costExpr");
// Ids de condiciones (MUY PRIORITARIO / NUEVA MARCA) y de estados de stock.
const { STOCK_STATUS } = require("../utils/domainConstants");
// Criterios compartidos con el informe de situación (Report.js).
const {
  ACTIVE_CONTROL_SQL,
  COMPLIANCE_EXPR,
  MUY_PRIORITARIO_PENDING_SQL,
  REPLENISHABLE_PENDING_SQL,
  DISCONTINUED_JOINS_SQL,
  DISCONTINUED_WHERE_SQL,
  CYCLE_DAYS_EXPR,
  CLOSED_IN_WINDOW_SQL,
} = require("./queries/dashboardCriteria");

class Alert {
  /**
   * Métricas de alertas tempranas. `branchIds` opcional: si viene (employee =
   * su sucursal, o el filtro de chips del dashboard), limita todo a esas
   * sucursales; si es null, abarca todas.
   * Considera controles ACTIVOS (draft + completed) e ítems no pedidos; los
   * 'discontinued' quedan fuera (están apagados a propósito).
   * @returns {Promise<object>} { muyPrioritarios, criticalBranches, overstockBranches,
   *   pendingOrders, authorizedOrders, cycleTime*Days, closedOrders*,
   *   avgCompliance, brandTrialsDue, discontinuedValue }
   */
  static async getSummary(branchIds = null) {
    const branchClause = branchIds ? "AND mc.branch_id = ANY($1::int[])" : "";
    const params = branchIds ? [branchIds] : [];

    // 1) Faltantes MUY PRIORITARIOS por sucursal+rubro (estado generar_pedido,
    //    no pedidos, en controles activos draft+completed). Navega al control puntual.
    const muyPrioritariosQuery = pool.query(
      `SELECT mc.id          AS control_id,
              mc.branch_id,
              b.name          AS branch_name,
              c.category_name,
              COUNT(*)        AS faltantes,
              -- Faltante valorizado: unidades que faltan para llegar al requerido,
              -- al costo estimado (mismo fallback que órdenes/valorizado). Los
              -- LEFT JOIN son 1:1 por product_stock_id, no alteran el COUNT.
              COALESCE(SUM((sc.stock_require - sc.stock_current) * ${COST_EXPR}), 0) AS faltante_valor
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       JOIN branches b   ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       LEFT JOIN product_stock_by_branch psb ON psb.id = sc.product_stock_id
       LEFT JOIN products p ON psb.product_id = p.id
       WHERE ${MUY_PRIORITARIO_PENDING_SQL}
         AND ${ACTIVE_CONTROL_SQL}
         ${branchClause}
       GROUP BY mc.id, mc.branch_id, b.name, c.category_name
       ORDER BY faltante_valor DESC, b.name`,
      params
    );

    // 2) Sucursales críticas: ranking por ítems en generar_pedido (no pedidos,
    //    reponibles) en controles activos draft+completed. Navega a los controles de la sucursal.
    const criticalBranchesQuery = pool.query(
      `SELECT mc.branch_id,
              b.name      AS branch_name,
              b.is_hub,
              COUNT(*)    AS need_order_items
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       JOIN branches b ON mc.branch_id = b.id
       WHERE ${REPLENISHABLE_PENDING_SQL}
         AND ${ACTIVE_CONTROL_SQL}
         ${branchClause}
       GROUP BY mc.branch_id, b.name, b.is_hub
       ORDER BY need_order_items DESC, b.name`,
      params
    );

    // 2bis) Sucursales con SOBRESTOCK por sucursal+rubro: ítems del control
    //    activo cuyo compliance supera el umbral de sobrestock (stock_status 3,
    //    fuente única StockControl.determineStockStatus). Es el extremo opuesto
    //    de (1): producto GESTIONADO que sobra, distinto del discontinuo (4),
    //    que es producto fuera del control. Navega al control puntual.
    const overstockBranchesQuery = pool.query(
      `SELECT mc.id          AS control_id,
              mc.branch_id,
              b.name          AS branch_name,
              c.category_name,
              COUNT(*)        AS excedentes,
              -- Excedente valorizado: unidades por encima del requerido, al
              -- costo estimado (mismo fallback que faltantes/órdenes). Los
              -- LEFT JOIN son 1:1 por product_stock_id, no alteran el COUNT.
              COALESCE(SUM((sc.stock_current - sc.stock_require) * ${COST_EXPR}), 0) AS sobrante_valor
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       JOIN branches b   ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       LEFT JOIN product_stock_by_branch psb ON psb.id = sc.product_stock_id
       LEFT JOIN products p ON psb.product_id = p.id
       WHERE sc.stock_status_id = ${STOCK_STATUS.OVERSTOCK}
         AND ${ACTIVE_CONTROL_SQL}
         ${branchClause}
       GROUP BY mc.id, mc.branch_id, b.name, c.category_name
       HAVING SUM((sc.stock_current - sc.stock_require) * ${COST_EXPR}) > 0
       ORDER BY sobrante_valor DESC, b.name`,
      params
    );

    // 3) Órdenes pendientes (status = 'pending'), separadas por tipo:
    //    external = a proveedor, internal = a Nodo Hub. Para employee, de su sucursal.
    const ordersBranchClause = branchIds ? "AND oc.branch_id = ANY($1::int[])" : "";
    const pendingOrdersQuery = pool.query(
      `SELECT
         COUNT(*)                                              AS total,
         COUNT(*) FILTER (WHERE oc.order_type = 'external')    AS supplier,
         COUNT(*) FILTER (WHERE oc.order_type = 'internal')    AS hub
       FROM orders_controls oc
       WHERE oc.status = 'pending' ${ordersBranchClause}`,
      params
    );

    // 3b) Órdenes autorizadas (status = 'autorizado'): listas para enviar al
    //     proveedor. Mismo criterio de sucursal que las pendientes.
    const authorizedOrdersQuery = pool.query(
      `SELECT COUNT(*) AS total
       FROM orders_controls oc
       WHERE oc.status = 'autorizado' ${ordersBranchClause}`,
      params
    );

    // 3c) TIEMPO DE CICLO promedio (en días) de las órdenes CERRADAS, separado
    //     por tipo (proveedor/Hub). Mide finalized_at - created_at: cuánto
    //     tardamos en cerrar una orden. Es una métrica de OPERATIVIDAD, no del
    //     backlog: reemplaza a la antigüedad de órdenes abiertas que había antes
    //     (esa era una foto del pendiente y se "reiniciaba" al cerrar todo, así
    //     que no servía para hacer seguimiento en el tiempo).
    //
    //     Ventana MÓVIL de 30 días sobre la fecha de CIERRE, para poder evaluar
    //     el mes en curso y compararlo con el anterior. El volumen mensual varía
    //     mucho según la demanda, pero al ser un promedio POR ORDEN el volumen
    //     no distorsiona (verificado en prod: jul 50 internas/6.3d vs ago 40/1.1d).
    //
    //     Solo 'finalizado' (ver CLOSED_IN_WINDOW_SQL).
    const cycleTimeQuery = pool.query(
      `SELECT
         ROUND(AVG(${CYCLE_DAYS_EXPR}) FILTER (WHERE oc.order_type = 'external'))::int AS cycle_days_supplier,
         ROUND(AVG(${CYCLE_DAYS_EXPR}) FILTER (WHERE oc.order_type = 'internal'))::int AS cycle_days_hub,
         COUNT(*) FILTER (WHERE oc.order_type = 'external')                      AS closed_supplier,
         COUNT(*) FILTER (WHERE oc.order_type = 'internal')                      AS closed_hub
       FROM orders_controls oc
       WHERE ${CLOSED_IN_WINDOW_SQL} ${ordersBranchClause}`,
      params
    );

    // 4) Discontinuos valorizados por sucursal+rubro: stock*costo de productos
    //    del rubro CON stock que NO están en el control activo (draft+completed,
    //    sobrante a liquidar). Navega al control (tab Discontinuos).
    const discontinuedValueQuery = pool.query(
      `SELECT mc.id        AS control_id,
              mc.branch_id,
              b.name        AS branch_name,
              c.category_name,
              SUM(psb.stock)                AS units,
              SUM(psb.stock * ${COST_EXPR}) AS value
       FROM monthly_controls mc
       JOIN branches b   ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       ${DISCONTINUED_JOINS_SQL}
       WHERE ${DISCONTINUED_WHERE_SQL}
         ${branchClause}
       GROUP BY mc.id, mc.branch_id, b.name, c.category_name
       HAVING SUM(psb.stock * ${COST_EXPR}) > 0
       ORDER BY value DESC`,
      params
    );

    // 5) Compliance promedio general: AVG del compliance de TODOS los items de
    //    controles activos draft+completed (todas las sucursales y rubros). Misma
    //    fórmula que MonthlyControl.avg_compliance (require=0 => 100). Foto del estado actual.
    const avgComplianceQuery = pool.query(
      `SELECT ROUND(AVG(${COMPLIANCE_EXPR}))::int AS avg_compliance
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       WHERE ${ACTIVE_CONTROL_SQL} ${branchClause}`,
      params
    );

    // 6) Marcas a prueba vencidas sin decidir (pendientes de evaluación).
    const brandTrialsDueQuery = BrandTrial.countDue(branchIds);

    // Las consultas son independientes: corren en paralelo y la latencia total
    // es la de la más lenta, no la suma (mismo patrón que Report.getSituation).
    const [
      muyPrioritarios,
      criticalBranches,
      overstockBranches,
      pendingOrders,
      authorizedOrders,
      cycleTime,
      discontinuedValue,
      avgCompliance,
      brandTrialsDue,
    ] = await Promise.all([
      muyPrioritariosQuery,
      criticalBranchesQuery,
      overstockBranchesQuery,
      pendingOrdersQuery,
      authorizedOrdersQuery,
      cycleTimeQuery,
      discontinuedValueQuery,
      avgComplianceQuery,
      brandTrialsDueQuery,
    ]);

    const cycle = cycleTime.rows[0] || {};
    return {
      muyPrioritarios: muyPrioritarios.rows,
      criticalBranches: criticalBranches.rows,
      overstockBranches: overstockBranches.rows,
      // Órdenes pendientes: total (compat) + desglose por tipo.
      pendingOrders: Number(pendingOrders.rows[0]?.total || 0),
      pendingOrdersSupplier: Number(pendingOrders.rows[0]?.supplier || 0),
      pendingOrdersHub: Number(pendingOrders.rows[0]?.hub || 0),
      authorizedOrders: Number(authorizedOrders.rows[0]?.total || 0),
      // Tiempo de ciclo promedio por tipo, últimos 30 días (null si no hubo
      // cierres de ese tipo en la ventana: null y 0 no significan lo mismo).
      cycleTimeSupplierDays: cycle.cycle_days_supplier != null ? Number(cycle.cycle_days_supplier) : null,
      cycleTimeHubDays: cycle.cycle_days_hub != null ? Number(cycle.cycle_days_hub) : null,
      closedOrdersSupplier: Number(cycle.closed_supplier || 0),
      closedOrdersHub: Number(cycle.closed_hub || 0),
      avgCompliance: avgCompliance.rows[0]?.avg_compliance != null ? Number(avgCompliance.rows[0].avg_compliance) : null,
      brandTrialsDue,
      discontinuedValue: discontinuedValue.rows,
    };
  }
}

module.exports = Alert;

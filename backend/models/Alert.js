const { pool } = require("../database/config");
const BrandTrial = require("./BrandTrial");
// Costo con fallback (avg_cost local -> cost_price -> promedio del grupo en
// otras sucursales), compartido con el informe de situación y las órdenes.
const { COST_EXPR } = require("../utils/costExpr");

// Condición 'MUY PRIORITARIO' (conditions id 3): faltantes de máxima urgencia.
const MUY_PRIORITARIO_CONDITION_ID = 3;
// Condición 'NUEVA MARCA' (id 4): no reponible, se excluye de los faltantes.
const NON_REPLENISHABLE_CONDITION_ID = 4;
// stock_status 'Sobrestock' (id 3), fuente única StockControl.determineStockStatus (>120%).
const OVERSTOCK_STATUS_ID = 3;

class Alert {
  /**
   * Métricas de alertas tempranas. `branchId` opcional: si viene (employee),
   * limita todo a esa sucursal; si es null (admin/manager), abarca todas.
   * Considera controles ACTIVOS (draft + completed) e ítems no pedidos; los
   * 'discontinued' quedan fuera (están apagados a propósito).
   * @returns {Promise<object>} { muyPrioritarios, criticalBranches, overstockBranches,
   *   pendingOrders, authorizedOrders, cycleTime*Days, closedOrders*,
   *   avgCompliance, brandTrialsDue, discontinuedValue }
   */
  static async getSummary(branchId = null) {
    const branchClause = branchId ? "AND mc.branch_id = $1" : "";
    const params = branchId ? [branchId] : [];

    // 1) Faltantes MUY PRIORITARIOS por sucursal+rubro (estado generar_pedido,
    //    no pedidos, en controles activos draft+completed). Navega al control puntual.
    const muyPrioritarios = await pool.query(
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
       WHERE sc.stock_status_id = 1
         AND sc.condition_id = ${MUY_PRIORITARIO_CONDITION_ID}
         AND sc.ordered_at IS NULL
         AND mc.status IN ('draft', 'completed')
         ${branchClause}
       GROUP BY mc.id, mc.branch_id, b.name, c.category_name
       ORDER BY faltante_valor DESC, b.name`,
      params
    );

    // 2) Sucursales críticas: ranking por ítems en generar_pedido (no pedidos,
    //    reponibles) en controles activos draft+completed. Navega a los controles de la sucursal.
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
         AND mc.status IN ('draft', 'completed')
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
    const overstockBranches = await pool.query(
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
       WHERE sc.stock_status_id = ${OVERSTOCK_STATUS_ID}
         AND mc.status IN ('draft', 'completed')
         ${branchClause}
       GROUP BY mc.id, mc.branch_id, b.name, c.category_name
       HAVING SUM((sc.stock_current - sc.stock_require) * ${COST_EXPR}) > 0
       ORDER BY sobrante_valor DESC, b.name`,
      params
    );

    // 3) Órdenes pendientes (status = 'pending'), separadas por tipo:
    //    external = a proveedor, internal = a Nodo Hub. Para employee, de su sucursal.
    const ordersBranchClause = branchId ? "AND oc.branch_id = $1" : "";
    const pendingOrders = await pool.query(
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
    const authorizedOrders = await pool.query(
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
    //     Solo 'finalizado': una orden 'cancelado' no completó el ciclo y su
    //     demora no dice nada sobre la operatividad.
    const cycleExpr = "EXTRACT(EPOCH FROM (oc.finalized_at - oc.created_at)) / 86400";
    const cycleTime = await pool.query(
      `SELECT
         ROUND(AVG(${cycleExpr}) FILTER (WHERE oc.order_type = 'external'))::int AS cycle_days_supplier,
         ROUND(AVG(${cycleExpr}) FILTER (WHERE oc.order_type = 'internal'))::int AS cycle_days_hub,
         COUNT(*) FILTER (WHERE oc.order_type = 'external')                      AS closed_supplier,
         COUNT(*) FILTER (WHERE oc.order_type = 'internal')                      AS closed_hub
       FROM orders_controls oc
       WHERE oc.status = 'finalizado'
         AND oc.finalized_at >= NOW() - INTERVAL '30 days' ${ordersBranchClause}`,
      params
    );

    // 4) Discontinuos valorizados por sucursal+rubro: stock*costo de productos
    //    del rubro CON stock que NO están en el control activo (draft+completed,
    //    sobrante a liquidar). Navega al control (tab Discontinuos).
    const discontinuedValue = await pool.query(
      `SELECT mc.id        AS control_id,
              mc.branch_id,
              b.name        AS branch_name,
              c.category_name,
              SUM(psb.stock)                AS units,
              SUM(psb.stock * ${COST_EXPR}) AS value
       FROM monthly_controls mc
       JOIN branches b   ON mc.branch_id = b.id
       LEFT JOIN categories c ON mc.category_id = c.id
       JOIN product_stock_by_branch psb
            ON psb.branch_id = mc.branch_id AND psb.stock > 0
       LEFT JOIN products p        ON psb.product_id = p.id
       LEFT JOIN product_groups pg ON psb.group_id = pg.id
       LEFT JOIN categories cg     ON pg.category_type = cg.category_name
       WHERE mc.status IN ('draft', 'completed')
         AND ( p.category_id = mc.category_id OR cg.id = mc.category_id )
         AND NOT EXISTS (
           SELECT 1 FROM stock_controls sc
           WHERE sc.monthly_control_id = mc.id AND sc.product_stock_id = psb.id
         )
         -- Excluir marcas con una prueba EN PRUEBA en esta sucursal/rubro: se
         -- gestionan aparte (Marcas a prueba), NO son discontinuo todavía. Mismo
         -- criterio que StockControl.findDiscontinued, para que el valor del
         -- dashboard coincida con el del listado del control.
         AND NOT EXISTS (
           SELECT 1 FROM brand_trials bt
           WHERE bt.status = 'en_prueba'
             AND bt.branch_id = psb.branch_id
             AND bt.brand_id = COALESCE(pg.brand_id, p.brand_id)
             AND (bt.category_id IS NULL OR bt.category_id = mc.category_id)
         )
         ${branchClause}
       GROUP BY mc.id, mc.branch_id, b.name, c.category_name
       HAVING SUM(psb.stock * ${COST_EXPR}) > 0
       ORDER BY value DESC`,
      params
    );

    // 5) Compliance promedio general: AVG del compliance de TODOS los items de
    //    controles activos draft+completed (todas las sucursales y rubros). Misma
    //    fórmula que MonthlyControl.avg_compliance (require=0 => 100). Foto del estado actual.
    const avgCompliance = await pool.query(
      `SELECT ROUND(AVG(
                CASE
                  WHEN sc.stock_require = 0 THEN 100
                  ELSE (sc.stock_current::numeric / sc.stock_require::numeric) * 100
                END
              ))::int AS avg_compliance
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       WHERE mc.status IN ('draft', 'completed') ${branchClause}`,
      params
    );

    // 6) Marcas a prueba vencidas sin decidir (pendientes de evaluación).
    const brandTrialsDue = await BrandTrial.countDue(branchId);

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

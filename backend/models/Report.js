const { pool } = require("../database/config");
const { COST_EXPR } = require("../utils/costExpr");
const {
  ORDER_STATUSES,
  ORDER_STATUSES_TERMINAL,
} = require("../utils/orderStatus");

// Condición 'MUY PRIORITARIO' (conditions id 3): faltantes de máxima urgencia.
const MUY_PRIORITARIO_CONDITION_ID = 3;
// Condición 'NUEVA MARCA' (id 4): no reponible, se excluye de los faltantes.
const NON_REPLENISHABLE_CONDITION_ID = 4;

// No hay umbral de "orden trabada": los plazos de entrega varían mucho según el
// proveedor y ese criterio se maneja internamente. El informe lista las órdenes
// externas abiertas con su antigüedad y deja la lectura a quien lo interpreta.

// Reserva viva del Hub: unidades de órdenes internas que todavía comprometen
// stock. Excluye AMBOS terminales, no solo 'cancelado' — mismo criterio que
// Order.js (fix 55ef5d7): al finalizar una orden la mercadería ya salió y el
// sync bajó el stock real, así que seguir restándola la descontaría dos veces.
const LIVE_RESERVATION_SQL = `oc.status NOT IN (${ORDER_STATUSES_TERMINAL.map(
  (s) => `'${s}'`
).join(", ")})`;

// Compliance de un ítem de control (require = 0 => 100). Misma fórmula que
// MonthlyControl.getStats, para que el informe coincida con la pantalla.
const COMPLIANCE_EXPR = `CASE
  WHEN sc.stock_require = 0 THEN 100
  ELSE (sc.stock_current::numeric / sc.stock_require::numeric) * 100
END`;

/**
 * Informe de SITUACIÓN ACTUAL: foto agregada del estado del negocio.
 *
 * Es una vista de solo lectura; no persiste nada. Reusa las mismas expresiones
 * de costo y compliance que el dashboard y las órdenes, de modo que los
 * importes del PDF sean idénticos a los de la app. Si algún número no cuadra,
 * la causa está en las constantes compartidas, no en una copia divergente.
 */
class Report {
  /**
   * @param {number|null} branchId Si viene (employee), acota TODO a esa
   *   sucursal. Si es null (admin/manager), abarca las nueve.
   * @returns {Promise<object>} Secciones del informe, ya agregadas.
   */
  static async getSituation(branchId = null) {
    // Los controles se filtran por mc.branch_id y las órdenes por oc.branch_id;
    // ambos usan $1 cuando hay sucursal.
    const mcBranch = branchId ? "AND mc.branch_id = $1" : "";
    const ocBranch = branchId ? "AND oc.branch_id = $1" : "";
    const params = branchId ? [branchId] : [];

    // Las consultas son independientes entre sí: se lanzan en paralelo para no
    // pagar la latencia sumada de doce viajes a la base.
    const [
      byBranch,
      muyPrioritarios,
      discontinued,
      brandTrials,
      supplierOrders,
      hubOrders,
      orderAge,
      openOrderCounts,
      openSupplierOrders,
      hubCommitted,
      lastSync,
      topCategories,
    ] = await Promise.all([
      // 1) ESTADO POR SUCURSAL: compliance + faltantes + ítems, sobre controles
      //    activos (draft+completed). Los 'discontinued' quedan fuera: están
      //    apagados a propósito y ensuciarían el promedio.
      pool.query(
        `SELECT mc.branch_id,
                b.name    AS branch_name,
                b.is_hub,
                COUNT(sc.id)                                          AS total_items,
                COUNT(*) FILTER (WHERE sc.stock_status_id = 1)        AS need_order_items,
                COUNT(*) FILTER (WHERE sc.stock_status_id = 2)        AS optimal_items,
                COUNT(*) FILTER (WHERE sc.stock_status_id = 3)        AS excess_items,
                ROUND(AVG(${COMPLIANCE_EXPR}))::int                   AS avg_compliance
         FROM monthly_controls mc
         JOIN branches b        ON mc.branch_id = b.id
         JOIN stock_controls sc ON sc.monthly_control_id = mc.id
         WHERE mc.status IN ('draft', 'completed') ${mcBranch}
         GROUP BY mc.branch_id, b.name, b.is_hub
         ORDER BY avg_compliance ASC, b.name`,
        params
      ),

      // 2) MUY PRIORITARIOS faltantes por sucursal: unidades que faltan para
      //    llegar al requerido, valorizadas. Solo ítems no pedidos todavía
      //    (ordered_at IS NULL); los ya pedidos no son un faltante accionable.
      pool.query(
        `SELECT mc.branch_id,
                b.name   AS branch_name,
                COUNT(*) AS items,
                COALESCE(SUM(sc.stock_require - sc.stock_current), 0)               AS units,
                COALESCE(SUM((sc.stock_require - sc.stock_current) * ${COST_EXPR}), 0) AS value
         FROM stock_controls sc
         JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
         JOIN branches b          ON mc.branch_id = b.id
         LEFT JOIN product_stock_by_branch psb ON psb.id = sc.product_stock_id
         LEFT JOIN products p                  ON psb.product_id = p.id
         WHERE sc.stock_status_id = 1
           AND sc.condition_id = ${MUY_PRIORITARIO_CONDITION_ID}
           AND sc.ordered_at IS NULL
           AND mc.status IN ('draft', 'completed')
           ${mcBranch}
         GROUP BY mc.branch_id, b.name
         ORDER BY value DESC, b.name`,
        params
      ),

      // 3) DISCONTINUOS por sucursal: productos del rubro CON stock que NO están
      //    en el control activo (sobrante a liquidar). Excluye marcas en prueba:
      //    se gestionan aparte y todavía no son discontinuo. Mismo criterio que
      //    StockControl.findDiscontinued y que la tarjeta del dashboard.
      pool.query(
        `SELECT mc.branch_id,
                b.name AS branch_name,
                COUNT(DISTINCT psb.id)        AS items,
                SUM(psb.stock)                AS units,
                SUM(psb.stock * ${COST_EXPR}) AS value
         FROM monthly_controls mc
         JOIN branches b ON mc.branch_id = b.id
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
           AND NOT EXISTS (
             SELECT 1 FROM brand_trials bt
             WHERE bt.status = 'en_prueba'
               AND bt.branch_id = psb.branch_id
               AND bt.brand_id = COALESCE(pg.brand_id, p.brand_id)
               AND (bt.category_id IS NULL OR bt.category_id = mc.category_id)
           )
           ${mcBranch}
         GROUP BY mc.branch_id, b.name
         HAVING SUM(psb.stock * ${COST_EXPR}) > 0
         ORDER BY value DESC`,
        params
      ),

      // 4) MARCAS A PRUEBA (en_prueba) valorizadas. El stock/costo real sale del
      //    sync cruzando marca + sucursal + rubro; `is_due` marca las vencidas
      //    sin decidir. El costo es promedio PONDERADO por stock, por eso el
      //    valor se calcula dentro de la subconsulta y no como stock * costo.
      pool.query(
        `SELECT bt.branch_id,
                b.name AS branch_name,
                COUNT(*)                                        AS trials,
                COUNT(*) FILTER (WHERE bt.end_date < CURRENT_DATE) AS due_trials,
                COALESCE(SUM(t.stock), 0) AS units,
                COALESCE(SUM(t.value), 0) AS value
         FROM brand_trials bt
         JOIN branches b ON bt.branch_id = b.id
         CROSS JOIN LATERAL (
           SELECT COALESCE(SUM(psb.stock), 0) AS stock,
                  COALESCE(SUM(psb.stock * COALESCE(psb.avg_cost, 0)), 0) AS value
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
         ) t
         WHERE bt.status = 'en_prueba'
           ${branchId ? "AND bt.branch_id = $1" : ""}
         GROUP BY bt.branch_id, b.name
         ORDER BY value DESC, b.name`,
        params
      ),

      // 5) ÓRDENES EXTERNAS (proveedor) por estado, con importe. El importe se
      //    toma de oc.cost_estimate, que Order.recalc mantiene sumando detalles.
      pool.query(
        `SELECT oc.status,
                COUNT(*)                            AS orders,
                COALESCE(SUM(oc.cost_estimate), 0)  AS value
         FROM orders_controls oc
         WHERE oc.order_type = 'external' ${ocBranch}
         GROUP BY oc.status`,
        params
      ),

      // 6) ÓRDENES INTERNAS (Nodo Hub) por estado. Sin importe: son movimientos
      //    entre sucursales propias, no una compra.
      pool.query(
        `SELECT oc.status, COUNT(*) AS orders
         FROM orders_controls oc
         WHERE oc.order_type = 'internal' ${ocBranch}
         GROUP BY oc.status`,
        params
      ),

      // 7) TIEMPO DE CICLO promedio (días) de las órdenes CERRADAS, por tipo:
      //    finalized_at - created_at sobre las finalizadas en los últimos 30
      //    días. Misma definición y misma ventana que el dashboard (Alert.js),
      //    a propósito: una sola métrica, un solo número. Reemplaza a la
      //    antigüedad del backlog abierto que había antes.
      //    Se informa también el MÁXIMO (la orden que más tardó en cerrarse) y
      //    la cantidad de cierres, que es el tamaño de muestra del promedio.
      //    'cancelado' queda afuera: no completó el ciclo.
      pool.query(
        `SELECT
           ROUND(AVG(EXTRACT(EPOCH FROM (oc.finalized_at - oc.created_at)) / 86400)
                 FILTER (WHERE oc.order_type = 'external'))::int AS avg_days_supplier,
           ROUND(AVG(EXTRACT(EPOCH FROM (oc.finalized_at - oc.created_at)) / 86400)
                 FILTER (WHERE oc.order_type = 'internal'))::int AS avg_days_hub,
           MAX(EXTRACT(EPOCH FROM (oc.finalized_at - oc.created_at)) / 86400)
                 FILTER (WHERE oc.order_type = 'external')::int  AS max_days_supplier,
           MAX(EXTRACT(EPOCH FROM (oc.finalized_at - oc.created_at)) / 86400)
                 FILTER (WHERE oc.order_type = 'internal')::int  AS max_days_hub,
           COUNT(*) FILTER (WHERE oc.order_type = 'external')    AS closed_supplier,
           COUNT(*) FILTER (WHERE oc.order_type = 'internal')    AS closed_hub
         FROM orders_controls oc
         WHERE oc.status = 'finalizado'
           AND oc.finalized_at >= NOW() - INTERVAL '30 days' ${ocBranch}`,
        params
      ),

      // 7bis) Cantidad de órdenes ABIERTAS por tipo. Antes salía de la consulta
      //    7, que ahora mide cierres; el summary sigue necesitando el pendiente.
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE oc.order_type = 'external') AS open_supplier,
           COUNT(*) FILTER (WHERE oc.order_type = 'internal') AS open_hub
         FROM orders_controls oc
         WHERE oc.status NOT IN ('finalizado', 'cancelado') ${ocBranch}`,
        params
      ),

      // 8) ÓRDENES EXTERNAS ABIERTAS, de la más antigua a la más nueva. Sin
      //    umbral: cada proveedor tiene su plazo y esa lectura es del negocio.
      //    Se listan todas las que están en gestión (no terminales).
      pool.query(
        `SELECT oc.id,
                oc.status,
                oc.created_at,
                COALESCE(sup.supplier_name, '—') AS supplier_name,
                b.name                  AS branch_name,
                COALESCE(oc.cost_estimate, 0) AS value,
                EXTRACT(EPOCH FROM (NOW() - oc.created_at))::int / 86400 AS days_open
         FROM orders_controls oc
         LEFT JOIN suppliers sup ON oc.supplier_id = sup.id
         LEFT JOIN branches  b   ON oc.branch_id   = b.id
         WHERE oc.order_type = 'external'
           AND oc.status NOT IN (${ORDER_STATUSES_TERMINAL.map(
             (s) => `'${s}'`
           ).join(", ")})
           ${ocBranch}
         ORDER BY days_open DESC`,
        params
      ),

      // 9) COMPROMETIDO DEL HUB: unidades que el Hub tiene reservadas a otras
      //    sucursales por órdenes internas vivas (fix 55ef5d7). No se acota por
      //    sucursal: es una métrica global del Hub.
      pool.query(
        `SELECT COALESCE(SUM(od.quantity_ordered), 0)     AS units,
                COUNT(DISTINCT od.product_stock_id)        AS items,
                COUNT(DISTINCT oc.id)                      AS orders
         FROM order_details od
         JOIN orders_controls oc ON od.order_control_id = oc.id
         WHERE oc.order_type = 'internal'
           AND ${LIVE_RESERVATION_SQL}`,
        []
      ),

      // 10) ÚLTIMO SYNC: a qué momento corresponde la foto. Sin esto, un informe
      //     con importes puede leerse como actual cuando el sync falló hace días.
      pool.query(
        `SELECT MAX(last_sync_at) AS last_sync_at FROM product_stock_by_branch`,
        []
      ),

      // 11) RANKING DE RUBROS más críticos por faltante valorizado (todas las
      //     sucursales del alcance). Complementa el ranking por sucursal. Sin
      //     tope: hoy son pocos rubros y recortarlos escondería faltantes.
      pool.query(
        `SELECT COALESCE(c.category_name, 'Sin rubro') AS category_name,
                COUNT(*) AS items,
                COALESCE(SUM((sc.stock_require - sc.stock_current) * ${COST_EXPR}), 0) AS value
         FROM stock_controls sc
         JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
         LEFT JOIN categories c   ON mc.category_id = c.id
         LEFT JOIN product_stock_by_branch psb ON psb.id = sc.product_stock_id
         LEFT JOIN products p                  ON psb.product_id = p.id
         WHERE sc.stock_status_id = 1
           AND sc.ordered_at IS NULL
           AND sc.condition_id IS DISTINCT FROM ${NON_REPLENISHABLE_CONDITION_ID}
           AND mc.status IN ('draft', 'completed')
           ${mcBranch}
         GROUP BY c.category_name
         ORDER BY value DESC`,
        params
      ),
    ]);

    // Los estados llegan solo si tienen filas; se completan los seis para que el
    // PDF muestre siempre la tabla entera (incluidos los que están en cero).
    const byStatus = (rows, withValue) => {
      const map = new Map(rows.map((r) => [r.status, r]));
      return ORDER_STATUSES.map((status) => ({
        status,
        orders: Number(map.get(status)?.orders || 0),
        ...(withValue ? { value: Number(map.get(status)?.value || 0) } : {}),
      }));
    };

    const num = (v) => Number(v || 0);
    const age = orderAge.rows[0] || {};
    const openCounts = openOrderCounts.rows[0] || {};
    const committed = hubCommitted.rows[0] || {};

    const supplierByStatus = byStatus(supplierOrders.rows, true);
    const hubByStatus = byStatus(hubOrders.rows, false);

    // El resumen ejecutivo se arma sumando las secciones ya calculadas: no se
    // vuelve a consultar la base, así los totales de la portada no pueden
    // contradecir al detalle de las páginas siguientes.
    const sum = (rows, field) => rows.reduce((s, r) => s + num(r[field]), 0);

    return {
      generatedAt: new Date().toISOString(),
      lastSyncAt: lastSync.rows[0]?.last_sync_at || null,
      scope: branchId ? "branch" : "global",

      summary: {
        branches: byBranch.rows.length,
        criticalBranches: byBranch.rows.filter(
          (r) => num(r.avg_compliance) < 70
        ).length,
        avgCompliance: byBranch.rows.length
          ? Math.round(
              byBranch.rows.reduce((s, r) => s + num(r.avg_compliance), 0) /
                byBranch.rows.length
            )
          : null,
        muyPrioritariosUnits: sum(muyPrioritarios.rows, "units"),
        muyPrioritariosValue: sum(muyPrioritarios.rows, "value"),
        discontinuedUnits: sum(discontinued.rows, "units"),
        discontinuedValue: sum(discontinued.rows, "value"),
        brandTrialsValue: sum(brandTrials.rows, "value"),
        openOrdersSupplier: num(openCounts.open_supplier),
        openOrdersHub: num(openCounts.open_hub),
        supplierOrdersValue: supplierByStatus
          .filter((s) => !ORDER_STATUSES_TERMINAL.includes(s.status))
          .reduce((s, r) => s + r.value, 0),
      },

      byBranch: byBranch.rows.map((r) => ({
        branchId: r.branch_id,
        branchName: r.branch_name,
        isHub: r.is_hub === true,
        totalItems: num(r.total_items),
        needOrderItems: num(r.need_order_items),
        optimalItems: num(r.optimal_items),
        excessItems: num(r.excess_items),
        avgCompliance: r.avg_compliance != null ? num(r.avg_compliance) : null,
      })),

      muyPrioritarios: muyPrioritarios.rows.map((r) => ({
        branchId: r.branch_id,
        branchName: r.branch_name,
        items: num(r.items),
        units: num(r.units),
        value: num(r.value),
      })),

      discontinued: discontinued.rows.map((r) => ({
        branchId: r.branch_id,
        branchName: r.branch_name,
        items: num(r.items),
        units: num(r.units),
        value: num(r.value),
      })),

      brandTrials: brandTrials.rows.map((r) => ({
        branchId: r.branch_id,
        branchName: r.branch_name,
        trials: num(r.trials),
        dueTrials: num(r.due_trials),
        units: num(r.units),
        value: num(r.value),
      })),

      supplierOrders: supplierByStatus,
      hubOrders: hubByStatus,

      // Tiempo de ciclo (últimos 30 días). closedSupplier/closedHub son el
      // tamaño de muestra: en 0, el promedio viene null y el PDF muestra "—".
      orderCycleTime: {
        avgDaysSupplier:
          age.avg_days_supplier != null ? num(age.avg_days_supplier) : null,
        avgDaysHub: age.avg_days_hub != null ? num(age.avg_days_hub) : null,
        maxDaysSupplier:
          age.max_days_supplier != null ? num(age.max_days_supplier) : null,
        maxDaysHub: age.max_days_hub != null ? num(age.max_days_hub) : null,
        closedSupplier: num(age.closed_supplier),
        closedHub: num(age.closed_hub),
      },

      openSupplierOrders: openSupplierOrders.rows.map((r) => ({
        id: r.id,
        status: r.status,
        supplierName: r.supplier_name,
        branchName: r.branch_name,
        daysOpen: num(r.days_open),
        value: num(r.value),
      })),

      hubCommitted: {
        units: num(committed.units),
        items: num(committed.items),
        orders: num(committed.orders),
      },

      topCategories: topCategories.rows.map((r) => ({
        categoryName: r.category_name,
        items: num(r.items),
        value: num(r.value),
      })),
    };
  }
}

module.exports = Report;

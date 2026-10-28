// Criterios SQL compartidos por el dashboard (Alert.getSummary) y el informe de
// situación (Report.getSituation). Las consultas de cada uno agrupan distinto
// (por control vs. por sucursal), pero el CRITERIO de qué cuenta como faltante,
// discontinuo o ciclo cerrado tiene que ser uno solo: si el dashboard y el PDF
// lo copian, un cambio en un lado hace que los números dejen de coincidir.
//
// Todos son fragmentos con alias fijos: sc = stock_controls,
// mc = monthly_controls, oc = orders_controls. Solo constantes internas, nunca
// input de usuario.
const { CONDITION, STOCK_STATUS } = require("../../utils/domainConstants");

// Controles ACTIVOS: draft + completed. Los 'discontinued' están apagados a
// propósito y ensuciarían cualquier métrica.
const ACTIVE_CONTROL_SQL = "mc.status IN ('draft', 'completed')";

// Compliance de un ítem de control (require = 0 => 100). Misma fórmula que
// MonthlyControl.avg_compliance.
const COMPLIANCE_EXPR = `CASE
  WHEN sc.stock_require = 0 THEN 100
  ELSE (sc.stock_current::numeric / sc.stock_require::numeric) * 100
END`;

// Faltante MUY PRIORITARIO todavía sin pedir.
const MUY_PRIORITARIO_PENDING_SQL = `sc.stock_status_id = ${STOCK_STATUS.NEED_ORDER}
  AND sc.condition_id = ${CONDITION.MUY_PRIORITARIO}
  AND sc.ordered_at IS NULL`;

// Faltante REPONIBLE todavía sin pedir: excluye 'NUEVA MARCA' (no reponible).
const REPLENISHABLE_PENDING_SQL = `sc.stock_status_id = ${STOCK_STATUS.NEED_ORDER}
  AND sc.ordered_at IS NULL
  AND sc.condition_id IS DISTINCT FROM ${CONDITION.NON_REPLENISHABLE}`;

// DISCONTINUOS de un control activo: productos del rubro CON stock en la
// sucursal que NO están en el control (sobrante a liquidar). Mismo criterio que
// StockControl.findDiscontinued, para que el valor del dashboard y del PDF
// coincida con el del listado del control. Va después de FROM monthly_controls mc.
const DISCONTINUED_JOINS_SQL = `JOIN product_stock_by_branch psb
       ON psb.branch_id = mc.branch_id AND psb.stock > 0
  LEFT JOIN products p        ON psb.product_id = p.id
  LEFT JOIN product_groups pg ON psb.group_id = pg.id
  LEFT JOIN categories cg     ON pg.category_type = cg.category_name`;

const DISCONTINUED_WHERE_SQL = `${ACTIVE_CONTROL_SQL}
  AND ( p.category_id = mc.category_id OR cg.id = mc.category_id )
  AND NOT EXISTS (
    SELECT 1 FROM stock_controls sc
    WHERE sc.monthly_control_id = mc.id AND sc.product_stock_id = psb.id
  )
  -- Excluir marcas con una prueba EN PRUEBA en esta sucursal/rubro: se
  -- gestionan aparte (Marcas a prueba), NO son discontinuo todavía.
  AND NOT EXISTS (
    SELECT 1 FROM brand_trials bt
    WHERE bt.status = 'en_prueba'
      AND bt.branch_id = psb.branch_id
      AND bt.brand_id = COALESCE(pg.brand_id, p.brand_id)
      AND (bt.category_id IS NULL OR bt.category_id = mc.category_id)
  )
  -- Excluir productos PROMO (se ven aparte), igual que findDiscontinued.
  AND NOT COALESCE(p.is_promo, false)`;

// TIEMPO DE CICLO de una orden cerrada, en días: finalized_at - created_at.
const CYCLE_DAYS_EXPR = "EXTRACT(EPOCH FROM (oc.finalized_at - oc.created_at)) / 86400";

// Órdenes CERRADAS en la ventana móvil de 30 días sobre la fecha de cierre.
// Solo 'finalizado': una 'cancelado' no completó el ciclo y su demora no dice
// nada sobre la operatividad.
const CLOSED_IN_WINDOW_SQL = `oc.status = 'finalizado'
  AND oc.finalized_at >= NOW() - INTERVAL '30 days'`;

module.exports = {
  ACTIVE_CONTROL_SQL,
  COMPLIANCE_EXPR,
  MUY_PRIORITARIO_PENDING_SQL,
  REPLENISHABLE_PENDING_SQL,
  DISCONTINUED_JOINS_SQL,
  DISCONTINUED_WHERE_SQL,
  CYCLE_DAYS_EXPR,
  CLOSED_IN_WINDOW_SQL,
};

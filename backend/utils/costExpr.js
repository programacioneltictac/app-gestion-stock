// Expresión SQL de COSTO UNITARIO con fallback en cascada. Fuente ÚNICA para
// todo lo que valoriza stock (alertas, informe de situación, órdenes).
//
// El fallback existe porque una sucursal puede no tener costo propio de un
// producto (stock 0 => avg_cost 0/NULL). Sin la cascada, esos ítems valorizarían
// $0 y los totales quedarían cortos. Orden de preferencia:
//   1) avg_cost de la sucursal (costo real local), si es > 0
//   2) cost_price del producto (costo de lista)
//   3) promedio del avg_cost del MISMO grupo en otras sucursales
//   4) 0
//
// Requiere que la consulta tenga en scope los alias `psb`
// (product_stock_by_branch) y `p` (products).
//
// ⚠️ Si cambia esta fórmula cambian los importes de TODAS las pantallas que la
// usan. Es a propósito: que el informe y la app muestren siempre lo mismo.
const COST_EXPR = `COALESCE(
  NULLIF(psb.avg_cost, 0),
  p.cost_price,
  CASE WHEN psb.group_id IS NOT NULL THEN (
    SELECT AVG(o.avg_cost) FROM product_stock_by_branch o
    WHERE o.group_id = psb.group_id AND o.avg_cost > 0
  ) END,
  0
)`;

module.exports = { COST_EXPR };

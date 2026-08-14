// Estados validos para orders_controls (gestion de compras — Variante B).
// Flujo manual de gestion de la orden de proveedor:
//   pending -> en_evaluacion -> autorizado -> pedido_realizado -> finalizado
//   (cancelado corta en cualquier punto previo a un estado terminal)
// Transiciones LIBRES via dropdown; solo finalizado/cancelado son terminales.
const ORDER_STATUSES = [
  "pending",
  "en_evaluacion",
  "autorizado",
  "pedido_realizado",
  "finalizado",
  "cancelado",
];

// Estados ABIERTOS: la orden externa de un proveedor sigue acumulando items
// nuevos mientras este en uno de estos estados. Al pasar a 'autorizado' se
// cierra (un faltante nuevo del mismo proveedor abre una orden nueva).
const ORDER_STATUSES_OPEN = ["pending", "en_evaluacion"];

// Estados TERMINALES: la orden no se puede modificar (read-only).
const ORDER_STATUSES_TERMINAL = ["finalizado", "cancelado"];

// Estados editables = no terminales (se puede cambiar estado, recibir, borrar items).
const ORDER_STATUSES_EDITABLE = [
  "pending",
  "en_evaluacion",
  "autorizado",
  "pedido_realizado",
];

// Estados en los que se habilita la recepcion de mercaderia.
const ORDER_STATUSES_RECEIVING = ["pedido_realizado"];

// Clausula SQL (sin WHERE) para "orden VIVA": la orden sigue en gestion, o sea
// que todavia puede recibir mercaderia. Una orden terminal ya no: 'cancelado'
// nunca va a traer nada y 'finalizado' ya se despacho.
//
// USO: al BORRAR una orden (o un item), para decidir si el stock_control queda
// sin ninguna linea que lo retenga y hay que liberarlo (ordered_at = NULL).
// Antes ese chequeo no miraba el estado: bastaba con que existiera una linea,
// aunque fuera de una orden finalizada hace meses -> al borrar una orden nueva
// el ordered_at no se liberaba y el chip "Pedido a..." quedaba pegado para
// siempre. Mismo razonamiento que LIVE_RESERVATION_SQL del Nodo Hub.
//
// ⚠️ NO usarla para decidir si un item "sigue pedido" tras FINALIZAR una orden.
// Finalizar no libera: entre el despacho y el sync el stock de la app todavia
// esta viejo, asi que el item quedaria en 'generar_pedido' y sin chip -> otro
// usuario podria pedirlo de nuevo. Esas las libera syncService contra el stock
// REAL. Por eso Order.updateStatus solo libera en 'cancelado' y el order_dest
// de StockControl.js excluye solo 'cancelado'.
const liveOrderSql = (alias = "oc") =>
  `${alias}.status NOT IN (${ORDER_STATUSES_TERMINAL.map((s) => `'${s}'`).join(", ")})`;

module.exports = {
  ORDER_STATUSES,
  ORDER_STATUSES_OPEN,
  ORDER_STATUSES_TERMINAL,
  ORDER_STATUSES_EDITABLE,
  ORDER_STATUSES_RECEIVING,
  liveOrderSql,
};

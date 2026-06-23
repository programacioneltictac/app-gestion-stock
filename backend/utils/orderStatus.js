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

module.exports = {
  ORDER_STATUSES,
  ORDER_STATUSES_OPEN,
  ORDER_STATUSES_TERMINAL,
  ORDER_STATUSES_EDITABLE,
  ORDER_STATUSES_RECEIVING,
};

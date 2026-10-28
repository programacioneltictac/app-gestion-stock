import { CONDITION, STOCK_STATUS } from "../../constants";

export const STOCK_STATUS_COLOR = { 1: "error", 2: "success", 3: "warning", 4: "warning" };

// ¿Este ítem se puede pedir? Debe estar en "Generar Pedido", no haber sido
// ya pedido, y no ser 'NUEVA MARCA' (CONDITION.NON_REPLENISHABLE).
export const isOrderable = (item) =>
  item.stockStatusId === STOCK_STATUS.NEED_ORDER &&
  !item.orderedAt &&
  item.conditionId !== CONDITION.NON_REPLENISHABLE;

// Faltante reponible todavía sin pedir (sin chip "Pedido a..."): el criterio
// del chip "Sin gestionar". Excluye 'NUEVA MARCA', óptimos y sobrestock.
export const isUnmanaged = (item) =>
  item.stockStatusId === STOCK_STATUS.NEED_ORDER &&
  item.conditionId !== CONDITION.NON_REPLENISHABLE &&
  !item.orderedAt;

// Etiqueta de la píldora "ya pedido" según el destino de la orden.
// 'awaiting_sync': la mercadería ya se recibió (orden finalizada) pero el sync
// todavía no actualizó el stock, así que el ítem sigue figurando en "Generar
// Pedido". Se avisa explícitamente para que nadie lo vuelva a pedir; el chip
// desaparece solo cuando el sync confirme el stock real.
export const ORDER_DEST_LABELS = {
  hub:           { label: "Pedido a Hub",           color: "info",      tooltip: "Pedido al Nodo Hub (orden interna)" },
  external:      { label: "Pedido a proveedor",     color: "secondary", tooltip: "Pedido a proveedor (orden externa)" },
  both:          { label: "Pedido (Hub+proveedor)", color: "primary",   tooltip: "Pedido parcial al Hub y el resto a proveedor" },
  awaiting_sync: { label: "Recibido, esperando sync", color: "success", tooltip: "La mercadería ya se recibió. El stock se actualiza en la próxima sincronización: NO hace falta volver a pedirlo" },
  default:       { label: "Pedido",                 color: "info",      tooltip: "Ya enviado a una orden de reposición" },
};

// Chips de estado del panel superior. El id es stock_status_id (1 generar
// pedido, 2 optimo, 3 sobrestock) y statKey el campo del resumen que muestran.
export const STATUS_CHIPS = [
  { id: 1, label: "En falta", color: "error", statKey: "needOrder" },
  { id: 2, label: "Óptimo", color: "success", statKey: "optimal" },
  { id: 3, label: "Sobrestock", color: "warning", statKey: "excess" },
];

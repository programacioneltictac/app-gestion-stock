import orderService from '../services/orderService';

// Flujo de gestion de compras (Variante B). Transiciones libres via dropdown;
// finalizado/cancelado son terminales (read-only).
export const ORDER_STATUSES = [
  'pending', 'en_evaluacion', 'autorizado', 'pedido_realizado', 'finalizado', 'cancelado',
];
export const ORDER_STATUSES_TERMINAL = ['finalizado', 'cancelado'];
// Editables = no terminales.
export const ORDER_STATUSES_EDITABLE = ['pending', 'en_evaluacion', 'autorizado', 'pedido_realizado'];
// Estados en los que se habilita la recepcion de mercaderia.
export const ORDER_STATUSES_RECEIVING = ['pedido_realizado'];

const ORDER_STATUS_LABELS = {
  pending:          'Pendiente',
  en_evaluacion:    'En evaluación',
  autorizado:       'Autorizado',
  pedido_realizado: 'Pedido realizado',
  finalizado:       'Finalizado',
  cancelado:        'Cancelado',
};

export const ORDER_STATUS_OPTIONS = ORDER_STATUSES.map((value) => ({
  value,
  label: ORDER_STATUS_LABELS[value],
}));

export function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status;
}

// Días transcurridos de una orden desde su creación. Para órdenes ABIERTAS cuenta
// hasta hoy; para terminales (finalizado/cancelado) el conteo se CONGELA en la
// fecha en que pasó a ese estado (updatedAt) — al cerrarse deja de sumar días.
export function getOrderElapsedDays(order) {
  if (!order?.createdAt) return null;
  const start = new Date(order.createdAt);
  const end = ORDER_STATUSES_TERMINAL.includes(order.status) && order.updatedAt
    ? new Date(order.updatedAt)
    : new Date();
  const diffMs = end - start;
  if (Number.isNaN(diffMs)) return null;
  return Math.max(0, Math.floor(diffMs / 86400000));
}

// Texto corto para mostrar junto a la fecha (ej: "hoy", "1 día", "5 días").
export function formatElapsedDays(days) {
  if (days == null) return '';
  if (days === 0) return 'hoy';
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

export function getOrderStatusColor(status) {
  switch (status) {
    case 'pending':          return 'warning';
    case 'en_evaluacion':    return 'info';
    case 'autorizado':       return 'primary';
    case 'pedido_realizado': return 'secondary';
    case 'finalizado':       return 'success';
    case 'cancelado':        return 'error';
    default:                 return 'default';
  }
}

function transformOrderFromBackend(order) {
  return {
    id:               order.order_id ?? order.id,
    monthlyControlId: order.monthly_control_id,
    branchId:         order.branch_id,
    branchName:       order.branch_name || '',
    branchCode:       order.branch_code || '',
    categoryId:       order.category_id || null,
    categoryName:     order.category_name || '',
    controlYear:      order.control_year,
    controlMonth:     order.control_month,
    period:           order.control_year && order.control_month
                        ? `${String(order.control_month).padStart(2, '0')}/${order.control_year}`
                        : '',
    orderDate:        order.order_date || order.control_date,
    status:           order.status,
    statusLabel:      getOrderStatusLabel(order.status),
    orderType:        order.order_type || 'external',
    isInternal:       order.order_type === 'internal',
    sourceBranchId:   order.source_branch_id || null,
    sourceBranchName: order.source_branch_name || '',
    supplierId:       order.supplier_id || null,
    supplierName:     order.supplier_name || '',
    totalItems:       Number(order.total_items || 0),
    totalUnitsOrdered:  Number(order.total_units_ordered || 0),
    totalUnitsReceived: Number(order.total_units_received || 0),
    totalCostEstimate:  Number(order.total_cost_estimate || order.cost_estimate || 0),
    notes:            order.notes || '',
    createdByUsername: order.created_by_username || '',
    createdAt:        order.created_at,
    updatedAt:        order.updated_at,
    sourceControlStatus: order.source_control_status || null,
  };
}

function transformOrderItemFromBackend(item) {
  return {
    id:               item.id,
    stockControlId:   item.stock_control_id,
    productStockId:   item.product_stock_id,
    displayName:      item.display_name || '',
    categoryName:     item.category_name || '',
    conditionId:      item.condition_id || null,
    conditionName:    item.condition_name || '',
    quantityOrdered:  Number(item.quantity_ordered || 0),
    quantityReceived: Number(item.quantity_received || 0),
    supplierName:     item.supplier_name || '',
    branchName:       item.item_branch_name || '',
    branchId:         item.item_branch_id || null,
    unitCost:         Number(item.unit_cost || 0),
    costEstimate:     Number(item.cost_estimate || 0),
    stockCurrent:     Number(item.stock_current || 0),
    currentAvgCost:   item.current_avg_cost != null ? Number(item.current_avg_cost) : null,
    notes:            item.notes || '',
    // Finalización de gestión (solo órdenes Hub): cuándo y quién lo finalizó.
    completedAt:        item.completed_at || null,
    completedByUsername: item.completed_by_username || '',
    updatedAt:        item.updated_at,
  };
}

export async function getOrders(branchId = null, limit = 50) {
  const data = await orderService.getOrders(branchId, limit);
  return (data.orders || []).map(transformOrderFromBackend);
}

export async function getOrderDetail(orderId) {
  const data = await orderService.getOrderDetail(orderId);
  return {
    order: transformOrderFromBackend(data.order),
    items: (data.items || []).map(transformOrderItemFromBackend),
  };
}

// Genera la(s) orden(es) de un control. Con Nodo Hub pueden volver 2 órdenes:
// una interna (al Hub) y una externa (al proveedor). Devuelve el array.
export async function createOrderFromControl(monthlyControlId, stockControlIds) {
  const data = await orderService.createFromControl(monthlyControlId, stockControlIds);
  return (data.orders || []).map(transformOrderFromBackend);
}

export async function updateOrderStatus(orderId, status, notes = null) {
  const data = await orderService.updateStatus(orderId, status, notes);
  return transformOrderFromBackend(data.order);
}

export async function updateOrderItemReceived(detailId, quantityReceived, notes = null) {
  const data = await orderService.updateItemReceived(detailId, quantityReceived, notes);
  return {
    order: transformOrderFromBackend(data.order),
    items: (data.items || []).map(transformOrderItemFromBackend),
  };
}

export async function receiveAllOrderItems(orderId) {
  const data = await orderService.receiveAll(orderId);
  return {
    order: transformOrderFromBackend(data.order),
    items: (data.items || []).map(transformOrderItemFromBackend),
  };
}

// Finaliza (completed=true) o reabre (false) los items indicados de una orden Hub.
// Devuelve la orden y los items frescos.
export async function completeOrderItems(orderId, detailIds, completed) {
  const data = await orderService.completeItems(orderId, detailIds, completed);
  return {
    order: transformOrderFromBackend(data.order),
    items: (data.items || []).map(transformOrderItemFromBackend),
  };
}

export async function deleteOrder(orderId) {
  await orderService.deleteOrder(orderId);
}

// Borra un item individual de una orden. Devuelve { orderDeleted } para que la
// vista sepa si la orden completa fue eliminada (quedo vacia).
export async function deleteOrderItem(detailId) {
  const data = await orderService.deleteOrderItem(detailId);
  return { orderDeleted: !!data.orderDeleted };
}

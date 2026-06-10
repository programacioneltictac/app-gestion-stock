import orderService from '../services/orderService';

export const ORDER_STATUSES = ['pending', 'sent', 'partial', 'completed', 'cancelled'];
export const ORDER_STATUSES_EDITABLE = ['pending', 'sent', 'partial'];

const ORDER_STATUS_LABELS = {
  pending:   'Pendiente',
  sent:      'Enviado',
  partial:   'Recibido parcial',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export const ORDER_STATUS_OPTIONS = ORDER_STATUSES.map((value) => ({
  value,
  label: ORDER_STATUS_LABELS[value],
}));

export function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status;
}

export function getOrderStatusColor(status) {
  switch (status) {
    case 'pending':   return 'warning';
    case 'sent':      return 'info';
    case 'partial':   return 'secondary';
    case 'completed': return 'success';
    case 'cancelled': return 'error';
    default:          return 'default';
  }
}

function transformOrderFromBackend(order) {
  return {
    id:               order.order_id ?? order.id,
    monthlyControlId: order.monthly_control_id,
    branchId:         order.branch_id,
    branchName:       order.branch_name || '',
    branchCode:       order.branch_code || '',
    controlYear:      order.control_year,
    controlMonth:     order.control_month,
    period:           order.control_year && order.control_month
                        ? `${String(order.control_month).padStart(2, '0')}/${order.control_year}`
                        : '',
    orderDate:        order.order_date || order.control_date,
    status:           order.status,
    statusLabel:      getOrderStatusLabel(order.status),
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
    quantityOrdered:  Number(item.quantity_ordered || 0),
    quantityReceived: Number(item.quantity_received || 0),
    unitCost:         Number(item.unit_cost || 0),
    costEstimate:     Number(item.cost_estimate || 0),
    stockCurrent:     Number(item.stock_current || 0),
    currentAvgCost:   item.current_avg_cost != null ? Number(item.current_avg_cost) : null,
    notes:            item.notes || '',
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

export async function createOrderFromControl(monthlyControlId, stockControlIds) {
  const data = await orderService.createFromControl(monthlyControlId, stockControlIds);
  return transformOrderFromBackend(data.order);
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

export async function deleteOrder(orderId) {
  await orderService.deleteOrder(orderId);
}

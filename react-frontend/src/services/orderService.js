import apiClient from './apiClient';

class OrderService {
  async createFromControl(monthlyControlId, stockControlIds) {
    return apiClient.post('/orders/from-control', {
      monthly_control_id: monthlyControlId,
      stock_control_ids: stockControlIds,
    });
  }

  async getOrders(branchId = null, limit = 50) {
    const params = new URLSearchParams();
    if (branchId) params.set('branch_id', branchId);
    if (limit) params.set('limit', limit);
    const qs = params.toString();
    return apiClient.get(`/orders${qs ? `?${qs}` : ''}`);
  }

  async getOrderDetail(orderId) {
    return apiClient.get(`/orders/${orderId}`);
  }

  async updateStatus(orderId, status, notes = null) {
    return apiClient.patch(`/orders/${orderId}/status`, { status, notes });
  }

  async updateItemReceived(detailId, quantityReceived, notes = null) {
    return apiClient.patch(`/orders/items/${detailId}/received`, { quantity_received: quantityReceived, notes });
  }

  async receiveAll(orderId) {
    return apiClient.patch(`/orders/${orderId}/receive-all`);
  }

  async deleteOrder(orderId) {
    return apiClient.delete(`/orders/${orderId}`);
  }

  async deleteOrderItem(detailId) {
    return apiClient.delete(`/orders/items/${detailId}`);
  }
}

const orderService = new OrderService();
export default orderService;

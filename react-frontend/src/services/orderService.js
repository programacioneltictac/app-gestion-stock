import apiClient from './apiClient';

class OrderService {
  async createFromControl(monthlyControlId) {
    return apiClient.post('/orders/from-control', { monthly_control_id: monthlyControlId });
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

  async deleteOrder(orderId) {
    return apiClient.delete(`/orders/${orderId}`);
  }
}

const orderService = new OrderService();
export default orderService;

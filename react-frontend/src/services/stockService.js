import apiClient from './apiClient';

class StockService {
  // Monthly Control operations
  async createMonthlyControl(data) {
    return apiClient.post('/stock/monthly-control/create', data);
  }

  async getCurrentControl(branchId) {
    const params = branchId ? `?branch_id=${branchId}` : '';
    return apiClient.get(`/stock/monthly-control/current${params}`);
  }

  async completeControl(controlId) {
    return apiClient.put('/stock/monthly-control/complete', { control_id: controlId });
  }

  async getControlHistory(branchId) {
    const params = branchId ? `?branch_id=${branchId}` : '';
    return apiClient.get(`/stock/monthly-control/history${params}`);
  }

  async deleteControl(controlId) {
    return apiClient.delete(`/stock/monthly-control/${controlId}`);
  }

  // Stock Items operations
  async getItems(controlId) {
    return apiClient.get(`/stock/items/${controlId}`);
  }

  async upsertItem(data) {
    return apiClient.post('/stock/items/upsert', data);
  }

  async deleteItem(itemId) {
    return apiClient.delete(`/stock/items/${itemId}`);
  }

  // Available products for a branch
  async getAvailableProducts(branchId) {
    return apiClient.get(`/stock/available-products/${branchId}`);
  }

  async getConditions() {
    return apiClient.get('/stock/conditions');
  }

  // Summary operations
  async getBranchSummary(branchId) {
    return apiClient.get(`/stock/branches-summary/${branchId}`);
  }

  async getBranchesList() {
    return apiClient.get('/stock/branches-list');
  }
}

const stockService = new StockService();
export default stockService;

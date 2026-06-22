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

  async getControlById(controlId) {
    return apiClient.get(`/stock/monthly-control/${controlId}`);
  }

  async getDiscontinued(controlId) {
    return apiClient.get(`/stock/monthly-control/${controlId}/discontinued`);
  }

  async completeControl(controlId) {
    return apiClient.put('/stock/monthly-control/complete', { control_id: controlId });
  }

  async getControlHistory(branchId) {
    // Límite amplio: la grilla muestra abiertos (draft) + historial en una sola lista.
    const params = branchId ? `?branch_id=${branchId}&limit=200` : '?limit=200';
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

  // Available products for a branch, filtered by the control's category (rubro)
  async getAvailableProducts(branchId, categoryId) {
    return apiClient.get(`/stock/available-products/${branchId}?category_id=${categoryId}`);
  }

  // Productos/grupos del sistema que aún no existen en esta sucursal (stock 0),
  // filtrados por el rubro del control.
  async getGlobalCatalog(branchId, categoryId) {
    return apiClient.get(`/stock/global-catalog/${branchId}?category_id=${categoryId}`);
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

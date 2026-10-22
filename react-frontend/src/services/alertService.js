import apiClient from './apiClient';

class AlertService {
  // branchIds: array de sucursales a mostrar, o null = todas.
  async getAlerts(branchIds = null) {
    const query = branchIds ? `?branches=${branchIds.join(',')}` : '';
    return apiClient.get(`/alerts${query}`);
  }
}

export default new AlertService();

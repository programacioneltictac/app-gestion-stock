import apiClient from './apiClient';

class AlertService {
  async getAlerts() {
    return apiClient.get('/alerts');
  }
}

export default new AlertService();

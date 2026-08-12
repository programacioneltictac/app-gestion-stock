import apiClient from './apiClient';

class ReportService {
  // Informe de situación actual. El backend acota por rol: employee recibe solo
  // su sucursal, admin/manager las nueve.
  async getSituation() {
    return apiClient.get('/reports/situacion');
  }
}

export default new ReportService();

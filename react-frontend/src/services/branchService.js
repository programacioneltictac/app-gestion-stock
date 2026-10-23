import apiClient from './apiClient';

class BranchService {
  async getAll() {
    return apiClient.get('/branches');
  }

  async getMyBranch() {
    return apiClient.get('/branches/my-branch');
  }

  async getBranchesList() {
    return apiClient.get('/stock/branches-list');
  }

  // Administración: todas las sucursales (activas e inactivas) con sus bloqueos
  async getAdminList() {
    return apiClient.get('/branches/admin');
  }

  async setActive(branchId, isActive) {
    return apiClient.put(`/branches/${branchId}/active`, { is_active: isActive });
  }

  async getOne(branchId) {
    return apiClient.get(`/branches/${branchId}`);
  }

  async create(branchData) {
    return apiClient.post('/branches', branchData);
  }

  async update(branchId, branchData) {
    return apiClient.put(`/branches/${branchId}`, branchData);
  }

  async delete(branchId) {
    return apiClient.delete(`/branches/${branchId}`);
  }
}

const branchService = new BranchService();
export default branchService;

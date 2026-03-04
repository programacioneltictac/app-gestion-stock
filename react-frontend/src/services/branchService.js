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

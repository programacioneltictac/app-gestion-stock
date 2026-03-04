import apiClient from './apiClient';

class UserService {
  async getAll() {
    return apiClient.get('/users');
  }

  async getOne(userId) {
    return apiClient.get(`/users/${userId}`);
  }

  async create(userData) {
    return apiClient.post('/users', userData);
  }

  async update(userId, userData) {
    return apiClient.put(`/users/${userId}`, userData);
  }

  async delete(userId) {
    return apiClient.delete(`/users/${userId}`);
  }
}

const userService = new UserService();
export default userService;

import apiClient from './apiClient';

class AuthService {
  async login(username, password) {
    const response = await apiClient.post('/login', { username, password });

    if (response.token) {
      apiClient.setAuthToken(response.token);
      // Store user info
      if (response.user) {
        localStorage.setItem('user', JSON.stringify(response.user));
      }
    }

    return response;
  }

  async logout() {
    try {
      await apiClient.post('/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      apiClient.removeAuthToken();
      localStorage.removeItem('user');
    }
  }

  async register(userData) {
    return apiClient.post('/register', userData);
  }

  async getProfile() {
    return apiClient.get('/profile');
  }

  async verifyAuth() {
    return apiClient.get('/verify-auth');
  }

  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  isAuthenticated() {
    return !!apiClient.getAuthToken();
  }

  hasRole(role) {
    const user = this.getCurrentUser();
    return user && user.role === role;
  }

  hasAnyRole(roles) {
    const user = this.getCurrentUser();
    return user && roles.includes(user.role);
  }
}

const authService = new AuthService();
export default authService;

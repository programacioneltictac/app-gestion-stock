// API client configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  getAuthToken() {
    return localStorage.getItem('token');
  }

  setAuthToken(token) {
    localStorage.setItem('token', token);
  }

  removeAuthToken() {
    localStorage.removeItem('token');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const token = this.getAuthToken();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // errorMessage es opcion propia (mensaje por defecto ante error), no de fetch.
    const fetchOptions = { ...options };
    delete fetchOptions.errorMessage;
    const config = {
      ...fetchOptions,
      headers,
    };

    try {
      const response = await fetch(url, config);

      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        this.removeAuthToken();
        window.location.href = '/#/login';
        throw new Error('Session expired. Please login again.');
      }

      // 204 o cuerpo no-JSON (ej. HTML de un proxy ante un 413/502): sin esto
      // response.json() tiraba un SyntaxError que tapaba el error real.
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }

      if (!response.ok) {
        const error = new Error(
          data?.message || data?.error || options.errorMessage || 'Request failed'
        );
        // code/details del backend (ej. 409 de sync en curso, errores del import).
        if (data?.code) error.code = data.code;
        if (data?.details) error.details = data.details;
        throw error;
      }

      return data;
    } catch (error) {
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      throw error;
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'GET',
    });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async patch(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // POST con cuerpo crudo (sin JSON.stringify), ej. un CSV como ArrayBuffer.
  async postRaw(endpoint, body, contentType, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': contentType, ...options.headers },
      body,
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'DELETE',
    });
  }
}

const apiClient = new ApiClient();
export default apiClient;

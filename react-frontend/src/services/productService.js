import apiClient from './apiClient';

class ProductService {
  async getAll(params = {}) {
    const { page = 1, pageSize = 100, sortField, sortOrder, search, brandId, categoryId } = params;

    const queryParams = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });

    if (sortField) queryParams.append('sortField', sortField);
    if (sortOrder) queryParams.append('sortOrder', sortOrder);
    if (search) queryParams.append('search', search);
    if (brandId) queryParams.append('brandId', brandId.toString());
    if (categoryId) queryParams.append('categoryId', categoryId.toString());

    const response = await apiClient.get(`/stock/products?${queryParams.toString()}`);
    // El backend devuelve { status: "success", data: [...], pagination: {...} }
    return {
      products: response.data || [],
      pagination: response.pagination || { page: 1, pageSize: 100, total: 0, totalPages: 0 }
    };
  }

  async getOne(productId) {
    const response = await apiClient.get(`/stock/products/${productId}`);
    // El backend devuelve { status: "success", data: {...} }
    return response.data;
  }

  async create(productData) {
    // El backend usa /register para crear productos
    const response = await apiClient.post('/stock/products/register', productData);
    // El backend devuelve { status: "success", message: "...", data: {...} }
    return response.data;
  }

  async update(productId, productData) {
    const response = await apiClient.put(`/stock/products/${productId}`, productData);
    // El backend devuelve { status: "success", data: {...} }
    return response.data;
  }

  async delete(productId) {
    return apiClient.delete(`/stock/products/${productId}`);
  }

  async syncAll() {
    return apiClient.post('/sync/all', {});
  }
}

const productService = new ProductService();
export default productService;

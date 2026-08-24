import apiClient from './apiClient';

class SearchService {
  // Filas producto x sucursal. Los filtros se combinan con AND.
  async searchStock({ supplierId, productStockId, q } = {}) {
    const params = new URLSearchParams();
    if (supplierId) params.set('supplier_id', supplierId);
    if (productStockId) params.set('product_stock_id', productStockId);
    if (q) params.set('q', q);
    return apiClient.get(`/search/stock?${params.toString()}`);
  }

  // Opciones del desplegable de productos (incluye grupos marca+rubro).
  async getProductOptions(q) {
    return apiClient.get(`/search/products?q=${encodeURIComponent(q || '')}`);
  }

  // Opciones del desplegable de proveedores (visible para todos los roles).
  async getSupplierOptions() {
    return apiClient.get('/search/suppliers');
  }
}

export default new SearchService();

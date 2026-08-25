import apiClient from './apiClient';

class SearchService {
  // Filas producto x sucursal. Los filtros se combinan con AND.
  // `names` son nombres exactos elegidos de la lista (seleccion multiple); se
  // mandan separados por "|" porque los nombres de producto pueden tener comas.
  async searchStock({ supplierId, productStockId, q, names } = {}) {
    const params = new URLSearchParams();
    if (supplierId) params.set('supplier_id', supplierId);
    if (productStockId) params.set('product_stock_id', productStockId);
    if (q) params.set('q', q);
    if (names && names.length) params.set('names', names.join('|'));
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

import apiClient from '../services/apiClient';

// Get all products for catalog/dropdown
export async function getProducts() {
  try {
    const data = await apiClient.get('/stock/catalogs/products');
    return data.products || [];
  } catch (error) {
    console.error('Error fetching products catalog:', error);
    throw error;
  }
}

// Get all categories
export async function getCategories() {
  try {
    const data = await apiClient.get('/stock/catalogs/categories');
    const categories = data.categories || [];
    // Transform category_name to name for consistency
    return categories.map(cat => ({
      id: cat.id,
      name: cat.category_name || cat.name,
      is_active: cat.is_active,
    }));
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
}

// Get all conditions
export async function getConditions() {
  try {
    const data = await apiClient.get('/stock/catalogs/conditions');
    const conditions = data.conditions || [];
    // Transform condition_name to name for consistency
    return conditions.map(cond => ({
      id: cond.id,
      name: cond.condition_name || cond.name,
    }));
  } catch (error) {
    console.error('Error fetching conditions:', error);
    throw error;
  }
}

// Get all brands
export async function getBrands() {
  try {
    const data = await apiClient.get('/stock/catalogs/brands');
    const brands = data.brands || [];
    // Transform brand_name to name for consistency
    return brands.map(brand => ({
      id: brand.id,
      name: brand.brand_name || brand.name,
      is_active: brand.is_active,
    }));
  } catch (error) {
    console.error('Error fetching brands:', error);
    throw error;
  }
}

// Product statuses (hard-coded as they are in the frontend)
export function getProductStatuses() {
  return [
    { id: 1, name: 'Activo' },
    { id: 2, name: 'Inactivo' },
    { id: 3, name: 'Prueba' },
  ];
}

// Stock statuses (hard-coded as they are in the frontend)
export function getStockStatuses() {
  return [
    { id: 1, name: 'Generar Pedido', color: '#dc3545' },
    { id: 2, name: 'Stock Óptimo', color: '#28a745' },
    { id: 3, name: 'Excedido', color: '#ffc107' },
    { id: 4, name: 'Muy Excedido', color: '#fd7e14' },
  ];
}

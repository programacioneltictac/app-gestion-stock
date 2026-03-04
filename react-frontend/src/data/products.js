import productService from '../services/productService';

// Adapter functions to transform data between frontend and backend
function transformProductFromBackend(product) {
  return {
    id: product.id,
    name: product.display_name || product.product_name,
    code: product.product_code || '',
    category_name: product.category_name || '',
    is_grouped: product.is_grouped ?? false,
  };
}

function transformProductToBackend(product) {
  return {
    name: product.name,
    code: product.code,
    description: product.description || '',
    brandId: product.brandId,
    categoryId: product.categoryId,
  };
}

export async function getMany({ paginationModel, filterModel, sortModel }) {
  try {
    // Mapear campo de ordenamiento de frontend a backend
    const sortFieldMap = {
      'name': 'product_name',
      'code': 'product_code',
      'brand_name': 'brand_name',
      'category_name': 'category_name',
      'id': 'id'
    };

    // Preparar parámetros para el backend
    const { page = 0, pageSize = 100 } = paginationModel || {};

    let sortField = 'product_name';
    let sortOrder = 'asc';

    if (sortModel?.length) {
      const backendField = sortFieldMap[sortModel[0].field] || sortModel[0].field;
      sortField = backendField;
      sortOrder = sortModel[0].sort || 'asc';
    }

    // Extraer filtros (QuickFilter de DataGrid)
    let searchTerm = null;
    let brandId = null;
    let categoryId = null;

    if (filterModel?.quickFilterValues?.length) {
      searchTerm = filterModel.quickFilterValues.join(' ');
    }

    // Extraer filtros de columna
    if (filterModel?.items?.length) {
      filterModel.items.forEach(({ field, value }) => {
        if (field === 'brand_name' && value) {
          // En este caso necesitaríamos el ID, no el nombre
          // Por ahora solo soportamos búsqueda por texto
        }
        if (field === 'category_name' && value) {
          // Similar al caso anterior
        }
        // Para búsquedas de texto en nombre/código, usamos el searchTerm general
        if ((field === 'name' || field === 'code') && value) {
          searchTerm = value;
        }
      });
    }

    // Llamar al backend con paginación del servidor
    const result = await productService.getAll({
      page: page + 1, // DataGrid usa page basado en 0, backend usa basado en 1
      pageSize,
      sortField,
      sortOrder,
      search: searchTerm,
      brandId,
      categoryId
    });

    // Transform to frontend format
    const transformedProducts = result.products.map(transformProductFromBackend);

    return {
      products: transformedProducts,
      total: result.pagination.total,
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
}

export async function getOne(productId) {
  try {
    const product = await productService.getOne(productId);
    return transformProductFromBackend(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    throw error;
  }
}

export async function createOne(data) {
  try {
    const backendData = transformProductToBackend(data);
    const product = await productService.create(backendData);
    return transformProductFromBackend(product);
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
}

export async function updateOne(productId, data) {
  try {
    const backendData = transformProductToBackend(data);
    const product = await productService.update(productId, backendData);
    return transformProductFromBackend(product);
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
}

export async function deleteOne(productId) {
  try {
    await productService.delete(productId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
}

export async function syncAll() {
  try {
    return await productService.syncAll();
  } catch (error) {
    console.error('Error en sincronización:', error);
    throw error;
  }
}

export function validate(product) {
  const errors = {};

  if (!product.name || product.name.trim() === '') {
    errors.name = 'El nombre es requerido';
  }

  if (!product.code || product.code.trim() === '') {
    errors.code = 'El código es requerido';
  }

  if (!product.brandId) {
    errors.brandId = 'La marca es requerida';
  }

  if (!product.categoryId) {
    errors.categoryId = 'La categoría es requerida';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

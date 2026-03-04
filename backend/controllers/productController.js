const Product = require("../models/Product");
const { handleControllerError } = require("../utils/errorHelper");

// POST /api/stock/products/register
const register = async (req, res) => {
  const { name, code, description, brandId, categoryId } = req.body;

  try {
    // Verificar si el producto ya existe
    const existingProduct = await Product.findByCode(code);
    if (existingProduct) {
      return res
        .status(400)
        .json({ status: "error", message: "El producto ya existe" });
    }

    const result = await Product.create(name, code, description, brandId, categoryId);

    console.log(
      `Producto creado - ID: ${result.id}, Product: ${name}, Code: ${code}`
    );

    res.json({
      status: "success",
      message: "Producto creado exitosamente",
      data: result
    });
  } catch (error) {
    handleControllerError(res, error, "Error en registro:");
  }
};

// GET /api/stock/products - Listar todos los productos con paginación
const getAll = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 100,
      sortField = 'product_name',
      sortOrder = 'asc',
      search,
      brandId,
      categoryId
    } = req.query;

    const result = await Product.findAllPaginated({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      sortField,
      sortOrder,
      searchTerm: search,
      brandId: brandId ? parseInt(brandId) : null,
      categoryId: categoryId ? parseInt(categoryId) : null
    });

    res.json({
      status: "success",
      data: result.products,
      pagination: result.pagination,
      message: `Página ${result.pagination.page} de ${result.pagination.totalPages} (${result.pagination.total} productos totales)`,
    });
  } catch (error) {
    handleControllerError(res, error, "Error al obtener productos:");
  }
};

// GET /api/stock/products/search - Buscar productos
const search = async (req, res) => {
  try {
    const { q: searchTerm, limit = 50 } = req.query;

    if (!searchTerm) {
      return res.status(400).json({
        status: "error",
        message: "Parámetro de búsqueda requerido",
      });
    }

    const products = await Product.search(searchTerm, limit);

    res.json({
      status: "success",
      data: products,
      message: `Se encontraron ${products.length} productos`,
    });
  } catch (error) {
    handleControllerError(res, error, "Error en búsqueda:");
  }
};

// GET /api/stock/products/:id - Obtener un producto por ID
const getOne = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: "error",
        message: "Producto no encontrado",
      });
    }

    res.json({
      status: "success",
      data: product,
    });
  } catch (error) {
    handleControllerError(res, error, "Error al obtener producto:");
  }
};

// PUT /api/stock/products/:id - Actualizar un producto
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, brandId, categoryId } = req.body;

    // Verificar que el producto existe
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({
        status: "error",
        message: "Producto no encontrado",
      });
    }

    // Verificar si el código ya está en uso por otro producto
    if (code && code !== existingProduct.product_code) {
      const productWithCode = await Product.findByCode(code);
      if (productWithCode && productWithCode.id !== parseInt(id)) {
        return res.status(400).json({
          status: "error",
          message: "El código del producto ya está en uso",
        });
      }
    }

    // Actualizar producto usando el modelo
    const updatedProduct = await Product.update(id, {
      name: name || existingProduct.product_name,
      code: code || existingProduct.product_code,
      description: description !== undefined ? description : existingProduct.description,
      brandId: brandId !== undefined ? brandId : existingProduct.brand_id,
      categoryId: categoryId !== undefined ? categoryId : existingProduct.category_id,
    });

    console.log(`Producto actualizado - ID: ${id}, Name: ${name}, Code: ${code}`);

    res.json({
      status: "success",
      data: updatedProduct,
      message: "Producto actualizado exitosamente",
    });
  } catch (error) {
    handleControllerError(res, error, "Error al actualizar producto:");
  }
};

// DELETE /api/stock/products/:id - Eliminar (soft delete) un producto
const deleteOne = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el producto existe
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({
        status: "error",
        message: "Producto no encontrado",
      });
    }

    // Soft delete - marcar como inactivo usando el modelo
    await Product.delete(id);

    console.log(`Producto eliminado (soft delete) - ID: ${id}`);

    res.json({
      status: "success",
      message: "Producto eliminado exitosamente",
    });
  } catch (error) {
    handleControllerError(res, error, "Error al eliminar producto:");
  }
};

module.exports = {
  register,
  getAll,
  search,
  getOne,
  update,
  deleteOne,
};

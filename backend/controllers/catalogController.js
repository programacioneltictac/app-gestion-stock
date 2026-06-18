const Product = require("../models/Product");
const Category = require("../models/Category");
const Condition = require("../models/Condition");
const Brand = require("../models/Brand");
const { handleControllerError } = require("../utils/errorHelper");

// GET /api/stock/catalogs/products
const getProducts = async (req, res) => {
  try {
    const { search, limit = 10000 } = req.query;
    const products = await Product.search(search, limit);
    res.json({
      status: "success",
      products: products,
    });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo productos:");
  }
};

// GET /api/stock/catalogs/categories
const getCategories = async (req, res) => {
  try {
    const categories = await Category.findAll();
    res.json({
      status: "success",
      categories: categories,
    });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo categorías:");
  }
};

// GET /api/stock/catalogs/conditions
const getConditions = async (req, res) => {
  try {
    const conditions = await Condition.findAll();
    res.json({
      status: "success",
      conditions: conditions,
    });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo condiciones:");
  }
};

// GET /api/stock/catalogs/brands
const getBrands = async (req, res) => {
  try {
    const brands = await Brand.findAll();
    res.json({ status: "success", brands });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo marcas:");
  }
};

// GET /api/stock/catalogs/brands/list - listado paginado para UI
const getBrandsList = async (req, res) => {
  try {
    const { page = 1, pageSize = 100, search } = req.query;
    const result = await Brand.findAllPaginated({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      searchTerm: search || null,
    });
    res.json({ status: "success", ...result });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo marcas:");
  }
};

// PATCH /api/stock/catalogs/brands/:id/is-groupable
const updateBrandIsGroupable = async (req, res) => {
  try {
    const { id } = req.params;
    const { isGroupable } = req.body;

    if (typeof isGroupable !== "boolean") {
      return res.status(400).json({ status: "error", message: "isGroupable debe ser booleano" });
    }

    const updated = await Brand.updateIsGroupable(id, isGroupable);
    if (!updated) {
      return res.status(404).json({ status: "error", message: "Marca no encontrada" });
    }

    res.json({ status: "success", data: updated });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando marca:");
  }
};

// PATCH /api/stock/catalogs/brands/:id/supplier
const updateBrandSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierId } = req.body;

    if (supplierId !== null && !Number.isInteger(supplierId)) {
      return res.status(400).json({ status: "error", message: "supplierId debe ser un entero o null" });
    }

    const updated = await Brand.updateSupplier(id, supplierId);
    if (!updated) {
      return res.status(404).json({ status: "error", message: "Marca no encontrada" });
    }

    res.json({ status: "success", data: updated });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando proveedor de la marca:");
  }
};

module.exports = {
  getProducts,
  getCategories,
  getConditions,
  getBrands,
  getBrandsList,
  updateBrandIsGroupable,
  updateBrandSupplier,
};

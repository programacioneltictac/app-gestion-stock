const express = require("express");
const router = express.Router();
const catalogController = require("../controllers/catalogController");

// GET /api/stock/catalogs/products
router.get("/products", catalogController.getProducts);

// GET /api/stock/catalogs/categories
router.get("/categories", catalogController.getCategories);

// GET /api/stock/catalogs/conditions
router.get("/conditions", catalogController.getConditions);

// GET /api/stock/catalogs/brands
router.get("/brands", catalogController.getBrands);

// GET /api/stock/catalogs/brands/list - listado paginado para UI
router.get("/brands/list", catalogController.getBrandsList);

// PATCH /api/stock/catalogs/brands/:id/is-groupable
router.patch("/brands/:id/is-groupable", catalogController.updateBrandIsGroupable);

module.exports = router;

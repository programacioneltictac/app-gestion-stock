const express = require("express");
const router = express.Router();
const catalogController = require("../controllers/catalogController");
const { requireRole } = require("../middlewares/auth");

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

// POST /api/stock/catalogs/brands - alta de marca (solo admin)
router.post("/brands", requireRole("admin"), catalogController.createBrand);

// PATCH /api/stock/catalogs/brands/:id/is-groupable (solo admin)
router.patch("/brands/:id/is-groupable", requireRole("admin"), catalogController.updateBrandIsGroupable);

// PATCH /api/stock/catalogs/brands/:id/supplier (solo admin)
router.patch("/brands/:id/supplier", requireRole("admin"), catalogController.updateBrandSupplier);

module.exports = router;

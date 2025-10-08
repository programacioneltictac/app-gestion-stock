const express = require("express");
const router = express.Router();
const catalogController = require("../controllers/catalogController");

// GET /api/stock/catalogs/products
router.get("/products", catalogController.getProducts);

// GET /api/stock/catalogs/categories
router.get("/categories", catalogController.getCategories);

// GET /api/stock/catalogs/conditions
router.get("/conditions", catalogController.getConditions);

module.exports = router;

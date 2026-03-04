const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const { authenticateToken, requireRole } = require("../middlewares/auth");

// POST /api/stock/products/register - Crear nuevo producto
router.post("/register", productController.register);

// GET /api/stock/products/search - Buscar productos (debe ir antes de /:id)
router.get("/search", productController.search);

// GET /api/stock/products - Listar todos los productos
router.get("/", productController.getAll);

// GET /api/stock/products/:id - Obtener un producto por ID
router.get("/:id", productController.getOne);

// PUT /api/stock/products/:id - Actualizar un producto
router.put("/:id", productController.update);

// DELETE /api/stock/products/:id - Eliminar un producto
router.delete("/:id", productController.deleteOne);

module.exports = router;

const express = require("express");
const router = express.Router();
const productGroupController = require("../controllers/productGroupController");
const { requireRole } = require("../middlewares/auth");

// GET  /api/product-groups            — listar grupos (todos los roles)
router.get("/", productGroupController.getAll);

// GET  /api/product-groups/:id        — obtener un grupo (todos los roles)
router.get("/:id", productGroupController.getOne);

// PUT  /api/product-groups/:id/min-stock  — configurar stock mínimo (admin y manager)
router.put("/:id/min-stock", requireRole("admin", "manager"), productGroupController.updateMinStock);

module.exports = router;

const express = require("express");
const router = express.Router();
const supplierController = require("../controllers/supplierController");
const { authenticateToken, requireRole } = require("../middlewares/auth");

// Todas requieren admin/manager (gestión de catálogo de proveedores).
// POST /api/suppliers/sync-compras — antes de "/:id" para no colisionar.
router.post("/sync-compras", authenticateToken, requireRole("admin", "manager"), supplierController.syncCompras);
router.get("/", authenticateToken, requireRole("admin", "manager"), supplierController.getAllSuppliers);
router.get("/:id", authenticateToken, requireRole("admin", "manager"), supplierController.getSupplierById);
router.post("/", authenticateToken, requireRole("admin", "manager"), supplierController.createSupplier);
router.put("/:id", authenticateToken, requireRole("admin", "manager"), supplierController.updateSupplier);
router.delete("/:id", authenticateToken, requireRole("admin", "manager"), supplierController.deleteSupplier);

module.exports = router;

const express = require("express");
const router = express.Router();
const brandTrialController = require("../controllers/brandTrialController");
const { authenticateToken, requireRole } = require("../middlewares/auth");

// Gestión de marcas a prueba: solo admin/manager (decisión de gestión/compras).
router.get("/", authenticateToken, requireRole("admin", "manager"), brandTrialController.getAll);
router.get("/:id", authenticateToken, requireRole("admin", "manager"), brandTrialController.getById);
router.post("/", authenticateToken, requireRole("admin", "manager"), brandTrialController.create);
router.put("/:id", authenticateToken, requireRole("admin", "manager"), brandTrialController.update);
router.patch("/:id/decide", authenticateToken, requireRole("admin", "manager"), brandTrialController.decide);
router.delete("/:id", authenticateToken, requireRole("admin", "manager"), brandTrialController.remove);

module.exports = router;

const express = require("express");
const router = express.Router();
const syncController = require("../controllers/syncController");
const { requireRole } = require("../middlewares/auth");

// GET  /api/sync/status   — estado de la última sync por sucursal (admin y manager)
router.get("/status", requireRole("admin", "manager"), syncController.getSyncStatus);

// POST /api/sync/all      — sincronizar todas las sucursales (solo admin)
router.post("/all", requireRole("admin"), syncController.syncAll);

// POST /api/sync/branch/:branch_id  — sincronizar una sucursal específica (admin y manager)
router.post("/branch/:branch_id", requireRole("admin", "manager"), syncController.syncOneBranch);

module.exports = router;

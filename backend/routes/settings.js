const express = require("express");
const router = express.Router();
const settingController = require("../controllers/settingController");
const { authenticateToken, requireRole } = require("../middlewares/auth");

// Lectura: cualquier usuario autenticado (la UI muestra el valor actual).
router.get("/", authenticateToken, settingController.getAll);

// Escritura: solo admin (decisiones gerenciales de configuracion).
router.put("/:key", authenticateToken, requireRole("admin"), settingController.update);

module.exports = router;

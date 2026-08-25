const express = require("express");
const router = express.Router();
const brandTrialController = require("../controllers/brandTrialController");
const { authenticateToken, requireRole } = require("../middlewares/auth");

// Marcas a prueba. El manager CONSULTA el estado de las pruebas, pero el alta
// y la decision final (incorporar/descartar) son de admin: definen que marcas
// entran al catalogo.
//
// `update` y `remove` tambien quedan en admin aunque no sean la decision en si:
// borrar una prueba es otra via para descartarla, y editarla permite cambiar su
// estado por afuera de `decide`. Dejarlas abiertas haria que la restriccion de
// arriba se pueda esquivar.
const readRoles = requireRole("admin", "manager");
const adminOnly = requireRole("admin");

router.get("/", authenticateToken, readRoles, brandTrialController.getAll);
router.get("/:id", authenticateToken, readRoles, brandTrialController.getById);
router.post("/", authenticateToken, adminOnly, brandTrialController.create);
router.put("/:id", authenticateToken, adminOnly, brandTrialController.update);
router.patch("/:id/decide", authenticateToken, adminOnly, brandTrialController.decide);
router.delete("/:id", authenticateToken, adminOnly, brandTrialController.remove);

module.exports = router;

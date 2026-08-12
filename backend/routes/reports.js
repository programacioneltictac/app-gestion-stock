const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

// GET /api/reports/situacion — informe de situación actual (filtrado por rol).
router.get("/situacion", reportController.getSituation);

module.exports = router;

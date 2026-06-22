const express = require("express");
const router = express.Router();
const alertController = require("../controllers/alertController");

// GET /api/alerts — métricas de alertas tempranas (filtradas por rol).
router.get("/", alertController.getAlerts);

module.exports = router;

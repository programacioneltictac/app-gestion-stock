const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const { authenticateToken, requireRole } = require("../middlewares/auth");

// POST /api/register (solo admin)
router.post(
  "/products/create",
  authenticateToken,
  requireRole("admin"),
  productController.register
);

module.exports = router;

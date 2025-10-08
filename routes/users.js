const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateToken, requireRole } = require("../middlewares/auth");

// GET /api/users (solo admin)
router.get("/", authenticateToken, requireRole("admin"), userController.getAllUsers);

module.exports = router;

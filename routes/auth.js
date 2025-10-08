const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateToken, requireRole } = require("../middlewares/auth");
const {
  validateLoginInput,
  validateRegisterInput,
} = require("../middlewares/validation");
const { loginLimiter } = require("../middlewares/security");

// POST /api/login
router.post("/login", loginLimiter, validateLoginInput, authController.login);

// POST /api/logout
router.post("/logout", authenticateToken, authController.logout);

// POST /api/register (solo admin)
router.post(
  "/register",
  authenticateToken,
  requireRole("admin"),
  validateRegisterInput,
  authController.register
);

// GET /api/profile
router.get("/profile", authenticateToken, authController.getProfile);

// GET /api/verify-auth
router.get("/verify-auth", authenticateToken, authController.verifyAuth);

module.exports = router;

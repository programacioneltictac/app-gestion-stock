const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateToken, requireRole } = require("../middlewares/auth");

// GET /api/users (solo admin)
router.get("/", authenticateToken, requireRole("admin"), userController.getAllUsers);

// GET /api/users/:id (solo admin)
router.get("/:id", authenticateToken, requireRole("admin"), userController.getUserById);

// POST /api/users (solo admin)
router.post("/", authenticateToken, requireRole("admin"), userController.createUser);

// PUT /api/users/:id (solo admin)
router.put("/:id", authenticateToken, requireRole("admin"), userController.updateUser);

// DELETE /api/users/:id (solo admin)
router.delete("/:id", authenticateToken, requireRole("admin"), userController.deleteUser);

module.exports = router;

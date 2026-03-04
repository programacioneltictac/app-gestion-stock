const express = require("express");
const router = express.Router();
const branchController = require("../controllers/branchController");
const {
  authenticateToken,
  requireRole,
  checkBranchAccess,
} = require("../middlewares/auth");

// GET /api/branches (admin y manager)
router.get(
  "/",
  authenticateToken,
  requireRole("admin", "manager"),
  checkBranchAccess,
  branchController.getAllBranches
);

// GET /api/branches/my-branch
router.get("/my-branch", authenticateToken, branchController.getMyBranch);

// PUT /api/branches/:id/api-codes  — configurar códigos de API (solo admin)
router.put(
  "/:id/api-codes",
  authenticateToken,
  requireRole("admin"),
  branchController.updateApiCodes
);

module.exports = router;

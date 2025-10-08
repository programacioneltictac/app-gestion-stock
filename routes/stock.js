const express = require("express");
const router = express.Router();
const stockController = require("../controllers/stockController");
const branchController = require("../controllers/branchController");
const {
  validateStockItemInput,
  validateStockItemUpdate,
} = require("../middlewares/validation");

// ==================== MONTHLY CONTROLS ====================

// POST /api/stock/monthly-control/create
router.post("/monthly-control/create", stockController.createMonthlyControl);

// GET /api/stock/monthly-control/current
router.get("/monthly-control/current", stockController.getCurrentMonthlyControl);

// PUT /api/stock/monthly-control/save
router.put("/monthly-control/save", stockController.saveMonthlyControl);

// PUT /api/stock/monthly-control/complete
router.put("/monthly-control/complete", stockController.completeMonthlyControl);

// GET /api/stock/monthly-control/history
router.get("/monthly-control/history", stockController.getMonthlyControlHistory);

// DELETE /api/stock/monthly-control/:control_id
router.delete("/monthly-control/:control_id", stockController.deleteMonthlyControl);

// ==================== STOCK ITEMS ====================

// POST /api/stock/items/add
router.post("/items/add", validateStockItemInput, stockController.addStockItem);

// GET /api/stock/items/:control_id
router.get("/items/:control_id", stockController.getStockItems);

// PUT /api/stock/items/:item_id
router.put("/items/:item_id", validateStockItemUpdate, stockController.updateStockItem);

// DELETE /api/stock/items/:item_id
router.delete("/items/:item_id", stockController.deleteStockItem);

// PUT /api/stock/items/:item_id/status
router.put("/items/:item_id/status", stockController.updateStockItemStatus);

// ==================== BRANCHES SUMMARY ====================

// GET /api/stock/branches-summary/:branch_id
router.get("/branches-summary/:branch_id", stockController.getBranchesSummary);

// GET /api/stock/branches-list
router.get("/branches-list", branchController.getBranchesList);

module.exports = router;

const express = require("express");
const router = express.Router();
const stockController = require("../controllers/stockController");
const branchController = require("../controllers/branchController");
const catalogController = require("../controllers/catalogController");

// ==================== MONTHLY CONTROLS ====================

// POST /api/stock/monthly-control/create
router.post("/monthly-control/create", stockController.createMonthlyControl);

// GET /api/stock/monthly-control/current
router.get("/monthly-control/current", stockController.getCurrentMonthlyControl);

// PUT /api/stock/monthly-control/complete
router.put("/monthly-control/complete", stockController.completeMonthlyControl);

// PUT /api/stock/monthly-control/discontinue — discontinúa un control completado.
router.put("/monthly-control/discontinue", stockController.discontinueMonthlyControl);

// PUT /api/stock/monthly-control/reopen — reabre un control completado a draft (admin).
router.put("/monthly-control/reopen", stockController.reopenMonthlyControl);

// GET /api/stock/monthly-control/history
router.get("/monthly-control/history", stockController.getMonthlyControlHistory);

// GET /api/stock/monthly-control/:control_id/discontinued — productos con stock
// del mismo rubro NO incluidos en el control (solo lectura). Antes de la ruta
// genérica :control_id para que no la capture.
router.get("/monthly-control/:control_id/discontinued", stockController.getDiscontinued);

// GET /api/stock/monthly-control/:control_id/open-orders-count — cantidad de
// órdenes abiertas vinculadas (para avisar antes de discontinuar).
router.get("/monthly-control/:control_id/open-orders-count", stockController.getOpenOrdersCount);

// GET /api/stock/monthly-control/:control_id — detalle de un control por id.
// Debe ir DESPUÉS de las rutas literales (current, history) para no capturarlas.
router.get("/monthly-control/:control_id", stockController.getMonthlyControlById);

// DELETE /api/stock/monthly-control/:control_id
router.delete("/monthly-control/:control_id", stockController.deleteMonthlyControl);

// ==================== STOCK ITEMS ====================

// POST /api/stock/items/upsert
router.post("/items/upsert", stockController.upsertStockItem);

// GET /api/stock/items/:control_id
router.get("/items/:control_id", stockController.getStockItems);

// DELETE /api/stock/items/:item_id
router.delete("/items/:item_id", stockController.deleteStockItem);

// ==================== AVAILABLE PRODUCTS ====================

// GET /api/stock/available-products/:branch_id
router.get("/available-products/:branch_id", stockController.getAvailableProducts);

// GET /api/stock/global-catalog/:branch_id — productos/grupos del sistema no presentes en la sucursal
router.get("/global-catalog/:branch_id", stockController.getGlobalCatalog);

// ==================== CONDITIONS ====================

// GET /api/stock/conditions  — alias mantenido por compatibilidad con frontend
router.get("/conditions", catalogController.getConditions);

// ==================== BRANCHES ====================

// GET /api/stock/branches-summary/:branch_id
router.get("/branches-summary/:branch_id", stockController.getBranchesSummary);

// GET /api/stock/branches-list
router.get("/branches-list", branchController.getBranchesList);

module.exports = router;

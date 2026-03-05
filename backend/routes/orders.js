const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

// POST   /api/orders/from-control        — crear orden desde control completado
router.post("/from-control", orderController.createFromControl);

// GET    /api/orders                     — listar ordenes (filtrable por branch_id)
router.get("/", orderController.getOrders);

// GET    /api/orders/:id                 — detalle de orden con items
router.get("/:id", orderController.getOrderDetail);

// PATCH  /api/orders/:id/status          — actualizar estado de la orden
router.patch("/:id/status", orderController.updateStatus);

// PATCH  /api/orders/items/:detail_id/received — registrar cantidad recibida de un item
router.patch("/items/:detail_id/received", orderController.updateItemReceived);

module.exports = router;

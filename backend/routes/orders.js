const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { requireRole } = require("../middlewares/auth");

// Acciones reservadas a admin: generar ordenes y destruir (orden completa o
// item suelto). El manager sigue gestionando el ciclo de vida de una orden ya
// creada — estado, recepcion, completar items. Va en la ruta y no solo en la
// UI: ocultar el boton no impide llamar al endpoint.
const adminOnly = requireRole("admin");

// POST   /api/orders/from-control        — crear orden desde control completado
router.post("/from-control", adminOnly, orderController.createFromControl);

// GET    /api/orders                     — listar ordenes (filtrable por branch_id)
router.get("/", orderController.getOrders);

// GET    /api/orders/:id                 — detalle de orden con items
router.get("/:id", orderController.getOrderDetail);

// PATCH  /api/orders/:id/status          — actualizar estado de la orden
router.patch("/:id/status", orderController.updateStatus);

// PATCH  /api/orders/items/:detail_id/received — registrar cantidad recibida de un item
router.patch("/items/:detail_id/received", orderController.updateItemReceived);

// DELETE /api/orders/items/:detail_id    — borrar un item de la orden (admin/manager)
router.delete("/items/:detail_id", adminOnly, orderController.deleteDetail);

// PATCH  /api/orders/:id/items/complete  — finalizar/reabrir items (solo Hub)
router.patch("/:id/items/complete", orderController.completeItems);

// PATCH  /api/orders/:id/receive-all     — marcar todos los items como recibidos
router.patch("/:id/receive-all", orderController.receiveAll);

// DELETE /api/orders/:id                    — eliminar orden (admin/manager)
router.delete("/:id", adminOnly, orderController.deleteOrder);

module.exports = router;

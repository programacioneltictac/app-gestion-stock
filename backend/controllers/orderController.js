const Order = require("../models/Order");
const MonthlyControl = require("../models/MonthlyControl");
const { canAccessBranch } = require("../middlewares/auth");
const { handleControllerError } = require("../utils/errorHelper");
const { ORDER_STATUSES, ORDER_STATUSES_TERMINAL } = require("../utils/orderStatus");

// POST /api/orders/from-control
// Genera una orden de reposicion con los items seleccionados de un control.
// El control puede estar draft o completed; los items elegidos quedan marcados
// como pedidos para no volver a enviarse a otra orden.
const createFromControl = async (req, res) => {
  try {
    const { monthly_control_id, stock_control_ids } = req.body;
    if (!monthly_control_id) {
      return res.status(400).json({ status: "error", message: "monthly_control_id es requerido" });
    }
    if (!Array.isArray(stock_control_ids) || stock_control_ids.length === 0) {
      return res.status(400).json({ status: "error", message: "Debe seleccionar al menos un item" });
    }

    const control = await MonthlyControl.findById(monthly_control_id);
    if (!control) {
      return res.status(404).json({ status: "error", message: "Control no encontrado" });
    }
    if (control.status !== "draft" && control.status !== "completed") {
      return res.status(400).json({ status: "error", message: "Solo se pueden generar ordenes de controles en gestion o completados" });
    }
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }

    const ids = stock_control_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const { orders, itemCount } = await Order.createFromControl(monthly_control_id, req.user.id, ids);

    if (itemCount === 0) {
      return res.status(400).json({
        status: "error",
        message: "Ninguno de los items seleccionados es pedible (ya pedidos o sin estado generar_pedido)"
      });
    }

    // Nodo Hub: pueden generarse hasta 2 ordenes (interna al Hub + externa al proveedor).
    const internal = orders.find((o) => o.order_type === "internal");
    const external = orders.find((o) => o.order_type === "external");
    const parts = [];
    if (internal) parts.push("interna (Hub)");
    if (external) parts.push("externa (proveedor)");

    console.log(
      `Orden(es) creada(s) - IDs: ${orders.map((o) => o.id).join(", ")}, Control: ${monthly_control_id}, Items: ${itemCount}, Tipos: ${parts.join(" + ")}, Usuario: ${req.user.username}`
    );
    res.status(201).json({
      status: "success",
      message: `Se generaron ${orders.length} orden(es) [${parts.join(" + ")}] con ${itemCount} items`,
      orders,
    });
  } catch (error) {
    handleControllerError(res, error, "Error creando orden:");
  }
};

// GET /api/orders
// Lista ordenes (admin/manager: todas; employee: solo su sucursal)
const getOrders = async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    let orders;
    if (req.user.role === "employee") {
      orders = await Order.findByBranch(req.user.branch_id, limit);
    } else {
      const { branch_id } = req.query;
      if (branch_id) {
        if (!canAccessBranch(req.user, parseInt(branch_id))) {
          return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
        }
        orders = await Order.findByBranch(parseInt(branch_id), limit);
      } else {
        orders = await Order.findAll(limit);
      }
    }

    res.json({ status: "success", orders });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo ordenes:");
  }
};

// GET /api/orders/:id
// Detalle de una orden con sus items
const getOrderDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ status: "error", message: "Orden no encontrada" });
    }
    if (!canAccessBranch(req.user, order.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta orden" });
    }

    const items = await Order.findDetailsByOrderId(id);
    res.json({ status: "success", order, items });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo detalle de orden:");
  }
};

// PATCH /api/orders/:id/status
// Actualiza el estado de una orden
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status || !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        status: "error",
        message: `Estado invalido. Valores validos: ${ORDER_STATUSES.join(", ")}`
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ status: "error", message: "Orden no encontrada" });
    }
    if (!canAccessBranch(req.user, order.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta orden" });
    }
    if (ORDER_STATUSES_TERMINAL.includes(order.status)) {
      return res.status(400).json({
        status: "error",
        message: "No se puede modificar una orden completada o cancelada"
      });
    }

    const updated = await Order.updateStatus(id, status, notes);
    console.log(`Orden actualizada - ID: ${id}, Estado: ${status}, Usuario: ${req.user.username}`);
    res.json({ status: "success", order: updated });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando estado de orden:");
  }
};

// PATCH /api/orders/items/:detail_id/received
// Registra cantidad recibida de un item y recalcula estado de la orden
const updateItemReceived = async (req, res) => {
  try {
    const { detail_id } = req.params;
    const { quantity_received, notes } = req.body;

    if (quantity_received == null || quantity_received < 0) {
      return res.status(400).json({ status: "error", message: "quantity_received debe ser >= 0" });
    }

    const orderId = await Order.updateDetailReceived(detail_id, parseInt(quantity_received), notes);

    const order = await Order.findById(orderId);
    const items = await Order.findDetailsByOrderId(orderId);

    res.json({ status: "success", order, items });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando item recibido:");
  }
};

// DELETE /api/orders/:id
// Elimina una orden y sus items (solo admin/manager)
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role === "employee") {
      return res.status(403).json({ status: "error", message: "No tienes permiso para eliminar órdenes" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ status: "error", message: "Orden no encontrada" });
    }
    if (!canAccessBranch(req.user, order.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta orden" });
    }

    await Order.delete(id);
    console.log(`Orden eliminada - ID: ${id}, Usuario: ${req.user.username}`);
    res.json({ status: "success", message: "Orden eliminada exitosamente" });
  } catch (error) {
    handleControllerError(res, error, "Error eliminando orden:");
  }
};

module.exports = {
  createFromControl,
  getOrders,
  getOrderDetail,
  updateStatus,
  updateItemReceived,
  deleteOrder,
};

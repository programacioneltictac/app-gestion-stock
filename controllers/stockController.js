const MonthlyControl = require("../models/MonthlyControl");
const StockControl = require("../models/StockControl");
const Product = require("../models/Product");
const Branch = require("../models/Branch");
const StockStatus = require("../models/StockStatus");
const { canAccessBranch, getBranchId } = require("../middlewares/auth");

// Función auxiliar para obtener período actual
const getCurrentPeriod = () => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
};

// ==================== MONTHLY CONTROLS ====================

// POST /api/stock/monthly-control/create
const createMonthlyControl = async (req, res) => {
  try {
    const { branch_id: requestedBranchId, year, month } = req.body;
    const period = year && month ? { year, month } : getCurrentPeriod();
    const branchId = getBranchId(req.user, requestedBranchId);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a esta sucursal",
      });
    }

    const exists = await MonthlyControl.exists(
      branchId,
      period.year,
      period.month
    );
    if (exists) {
      return res.status(409).json({
        status: "error",
        message: `Ya existe un control para ${period.month}/${period.year} en esta sucursal`,
      });
    }

    const newControl = await MonthlyControl.create(
      branchId,
      period.year,
      period.month,
      req.user.id
    );

    console.log(
      `Control mensual creado - ID: ${newControl.id}, Branch: ${branchId}, Período: ${period.month}/${period.year}, Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      message: "Control mensual creado exitosamente",
      control: newControl,
    });
  } catch (error) {
    console.error("❌ Error creando control mensual:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/stock/monthly-control/current
const getCurrentMonthlyControl = async (req, res) => {
  try {
    const { branch_id: requestedBranchId, year, month } = req.query;
    const period =
      year && month
        ? { year: parseInt(year), month: parseInt(month) }
        : getCurrentPeriod();
    const branchId = getBranchId(
      req.user,
      requestedBranchId ? parseInt(requestedBranchId) : null
    );

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a esta sucursal",
      });
    }

    const control = await MonthlyControl.findByBranchAndPeriod(
      branchId,
      period.year,
      period.month
    );

    if (!control) {
      return res.json({
        status: "success",
        control: null,
        message: "No existe control para este período. Puedes crear uno nuevo.",
        canCreate: true,
        period: period,
      });
    }

    const stats = await MonthlyControl.getStats(control.id);

    res.json({
      status: "success",
      control: control,
      stats: stats,
      canEdit: control.status === "draft",
    });
  } catch (error) {
    console.error("❌ Error obteniendo control actual:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// PUT /api/stock/monthly-control/save
const saveMonthlyControl = async (req, res) => {
  try {
    const { control_id, notes } = req.body;

    if (!control_id) {
      return res.status(400).json({
        status: "error",
        message: "ID del control es requerido",
      });
    }

    const control = await MonthlyControl.findById(control_id);

    if (!control) {
      return res.status(404).json({
        status: "error",
        message: "Control no encontrado",
      });
    }

    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a este control",
      });
    }

    if (control.status !== "draft") {
      return res.status(400).json({
        status: "error",
        message: "Solo se pueden editar controles en estado borrador",
      });
    }

    await MonthlyControl.update(control_id, notes || control.notes);

    console.log(
      `Control guardado - ID: ${control_id}, Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      message: "Control guardado exitosamente",
    });
  } catch (error) {
    console.error("❌ Error guardando control:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// PUT /api/stock/monthly-control/complete
const completeMonthlyControl = async (req, res) => {
  try {
    const { control_id } = req.body;

    if (!control_id) {
      return res.status(400).json({
        status: "error",
        message: "ID del control es requerido",
      });
    }

    const control = await MonthlyControl.findById(control_id);

    if (!control) {
      return res.status(404).json({
        status: "error",
        message: "Control no encontrado",
      });
    }

    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a este control",
      });
    }

    if (control.status !== "draft") {
      return res.status(400).json({
        status: "error",
        message: "Solo se pueden completar controles en estado borrador",
      });
    }

    const itemCount = await MonthlyControl.getItemCount(control_id);

    if (itemCount === 0) {
      return res.status(400).json({
        status: "error",
        message: "No se puede completar un control sin productos registrados",
      });
    }

    const updatedControl = await MonthlyControl.complete(control_id);

    console.log(
      `Control completado - ID: ${control_id}, Items: ${itemCount}, Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      message: `Control completado exitosamente con ${itemCount} productos`,
      control: updatedControl,
    });
  } catch (error) {
    console.error("❌ Error completando control:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/stock/monthly-control/history
const getMonthlyControlHistory = async (req, res) => {
  try {
    const { branch_id: requestedBranchId, limit = 12 } = req.query;
    const branchId = getBranchId(
      req.user,
      requestedBranchId ? parseInt(requestedBranchId) : null
    );

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a esta sucursal",
      });
    }

    const history = await MonthlyControl.getHistory(branchId, limit);

    res.json({
      status: "success",
      history: history,
    });
  } catch (error) {
    console.error("❌ Error obteniendo historial:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// DELETE /api/stock/monthly-control/:control_id
const deleteMonthlyControl = async (req, res) => {
  try {
    const { control_id } = req.params;

    const control = await MonthlyControl.findById(control_id);

    if (!control) {
      return res.status(404).json({
        status: "error",
        message: "Control no encontrado",
      });
    }

    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a este control",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        status: "error",
        message: "Solo los administradores pueden eliminar controles",
      });
    }

    await MonthlyControl.delete(control_id);

    console.log(
      `Control eliminado - ID: ${control_id}, Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      message: "Control eliminado exitosamente",
    });
  } catch (error) {
    console.error("❌ Error eliminando control:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/stock/branches-summary/:branch_id
const getBranchesSummary = async (req, res) => {
  try {
    const { branch_id } = req.params;
    const { limit = 12 } = req.query;

    if (!canAccessBranch(req.user, parseInt(branch_id))) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a esta sucursal",
      });
    }

    const branch = await Branch.findById(branch_id);

    if (!branch) {
      return res.status(404).json({
        status: "error",
        message: "Sucursal no encontrada",
      });
    }

    const controls = await MonthlyControl.getSummaryByBranch(
      branch.code,
      limit
    );
    const stats = await MonthlyControl.getBranchStats(branch.code);

    const controlsWithBranchId = controls.map((control) => ({
      ...control,
      branch_id: parseInt(branch_id),
    }));

    res.json({
      status: "success",
      controls: controlsWithBranchId,
      stats: stats,
    });
  } catch (error) {
    console.error("❌ Error obteniendo resumen de sucursal:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// ==================== STOCK ITEMS ====================

// POST /api/stock/items/add
const addStockItem = async (req, res) => {
  try {
    const {
      monthly_control_id,
      product_id,
      category_id,
      condition_id,
      product_status_id,
      stock_require,
      stock_current,
      notes,
    } = req.body;

    if (!monthly_control_id) {
      return res.status(400).json({
        status: "error",
        message: "monthly_control_id es requerido",
      });
    }

    const control = await MonthlyControl.findById(monthly_control_id);

    if (!control) {
      return res.status(404).json({
        status: "error",
        message: "Control mensual no encontrado",
      });
    }

    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a este control",
      });
    }

    if (control.status !== "draft") {
      return res.status(400).json({
        status: "error",
        message:
          "Solo se pueden agregar productos a controles en estado borrador",
      });
    }

    const product = await Product.findById(product_id);

    if (!product) {
      return res.status(400).json({
        status: "error",
        message: "Producto no encontrado o inactivo",
      });
    }

    const exists = await StockControl.exists(monthly_control_id, product_id);

    if (exists) {
      return res.status(409).json({
        status: "error",
        message: "Este producto ya está agregado al control mensual",
      });
    }

    const stockCompliance = StockControl.calculateStockCompliance(
      stock_current,
      stock_require
    );
    const stockStatusId = StockStatus.determineStockStatus(stockCompliance);

    const newItem = await StockControl.create({
      monthly_control_id,
      product_id,
      branch_id: control.branch_id,
      category_id,
      condition_id,
      product_status_id,
      stock_require,
      stock_current,
      stock_status_id: stockStatusId,
      notes,
    });

    const itemDetail = await StockControl.findById(newItem.id);

    console.log(
      `Producto agregado al control - Control ID: ${monthly_control_id}, Producto: ${itemDetail.product_name}, Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      message: "Producto agregado exitosamente al control",
      item: itemDetail,
    });
  } catch (error) {
    console.error("❌ Error agregando producto al control:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/stock/items/:control_id
const getStockItems = async (req, res) => {
  try {
    const { control_id } = req.params;
    const filters = req.query;

    const control = await MonthlyControl.findById(control_id);

    if (!control) {
      return res.status(404).json({
        status: "error",
        message: "Control mensual no encontrado",
      });
    }

    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a este control",
      });
    }

    const items = await StockControl.findByControlId(control_id, filters);
    const totalItems = await StockControl.count(control_id, filters);

    res.json({
      status: "success",
      items: items,
      pagination: {
        page: parseInt(filters.page || 1),
        limit: parseInt(filters.limit || 50),
        total: totalItems,
        pages: Math.ceil(totalItems / parseInt(filters.limit || 50)),
      },
      control: {
        id: control.id,
        branch_id: control.branch_id,
        status: control.status,
        canEdit: control.status === "draft",
      },
    });
  } catch (error) {
    console.error("❌ Error obteniendo items del control:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// PUT /api/stock/items/:item_id
const updateStockItem = async (req, res) => {
  try {
    const { item_id } = req.params;
    const { stock_require, stock_current, notes } = req.body;

    const item = await StockControl.findWithControlInfo(item_id);

    if (!item) {
      return res.status(404).json({
        status: "error",
        message: "Item de stock no encontrado",
      });
    }

    if (!canAccessBranch(req.user, item.branch_id)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a este control",
      });
    }

    if (item.control_status !== "draft") {
      return res.status(400).json({
        status: "error",
        message:
          "Solo se pueden editar productos en controles en estado borrador",
      });
    }

    const stockCompliance = StockControl.calculateStockCompliance(
      stock_current,
      stock_require
    );
    const stockStatusId = StockStatus.determineStockStatus(stockCompliance);

    await StockControl.update(item_id, {
      stock_require,
      stock_current,
      stock_status_id: stockStatusId,
      notes,
    });

    const updatedItem = await StockControl.findById(item_id);

    console.log(
      `Producto actualizado - ID: ${item_id}, Producto: ${updatedItem.product_name}, Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      message: "Producto actualizado exitosamente",
      item: updatedItem,
    });
  } catch (error) {
    console.error("❌ Error actualizando item de stock:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// DELETE /api/stock/items/:item_id
const deleteStockItem = async (req, res) => {
  try {
    const { item_id } = req.params;

    const item = await StockControl.findWithControlInfo(item_id);

    if (!item) {
      return res.status(404).json({
        status: "error",
        message: "Item de stock no encontrado",
      });
    }

    if (!canAccessBranch(req.user, item.branch_id)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a este control",
      });
    }

    if (item.control_status !== "draft") {
      return res.status(400).json({
        status: "error",
        message:
          "Solo se pueden eliminar productos de controles en estado borrador",
      });
    }

    await StockControl.delete(item_id);

    console.log(
      `Producto eliminado del control - ID: ${item_id}, Producto: ${item.product_name}, Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      message: "Producto eliminado exitosamente del control",
    });
  } catch (error) {
    console.error("❌ Error eliminando item de stock:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// PUT /api/stock/items/:item_id/status
const updateStockItemStatus = async (req, res) => {
  try {
    const { item_id } = req.params;
    const { product_status_id } = req.body;

    const item = await StockControl.findWithControlInfo(item_id);

    if (!item) {
      return res.status(404).json({
        status: "error",
        message: "Item no encontrado",
      });
    }

    if (!canAccessBranch(req.user, item.branch_id)) {
      return res.status(403).json({
        status: "error",
        message: "No tienes acceso a este control",
      });
    }

    if (item.control_status !== "draft") {
      return res.status(400).json({
        status: "error",
        message: "Solo se pueden editar controles en borrador",
      });
    }

    await StockControl.updateStatus(item_id, product_status_id);

    const updatedItem = await StockControl.findById(item_id);

    console.log(
      `Producto actualizado - ID: ${item_id}, Producto: ${updatedItem.product_name}, Producto Estado: ${updatedItem.product_status_name}, Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      message: "Estado del producto actualizado",
    });
  } catch (error) {
    console.error("❌ Error actualizando estado:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

module.exports = {
  createMonthlyControl,
  getCurrentMonthlyControl,
  saveMonthlyControl,
  completeMonthlyControl,
  getMonthlyControlHistory,
  deleteMonthlyControl,
  getBranchesSummary,
  addStockItem,
  getStockItems,
  updateStockItem,
  deleteStockItem,
  updateStockItemStatus,
};

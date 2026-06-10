const MonthlyControl = require("../models/MonthlyControl");
const StockControl = require("../models/StockControl");
const Branch = require("../models/Branch");
const { canAccessBranch, getBranchId } = require("../middlewares/auth");
const { handleControllerError } = require("../utils/errorHelper");
const { pool } = require("../database/config");

const getCurrentPeriod = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

// ==================== MONTHLY CONTROLS ====================

// POST /api/stock/monthly-control/create
const createMonthlyControl = async (req, res) => {
  try {
    const { branch_id: requestedBranchId, year, month } = req.body;
    const period = year && month ? { year, month } : getCurrentPeriod();
    const branchId = getBranchId(req.user, requestedBranchId);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }

    const exists = await MonthlyControl.exists(branchId, period.year, period.month);
    if (exists) {
      return res.status(409).json({
        status: "error",
        message: `Ya existe un control para ${period.month}/${period.year} en esta sucursal`,
      });
    }

    const newControl = await MonthlyControl.create(branchId, period.year, period.month, req.user.id);
    console.log(`Control creado - ID: ${newControl.id}, Branch: ${branchId}, Período: ${period.month}/${period.year}, Usuario: ${req.user.username}`);

    res.json({ status: "success", message: "Control mensual creado exitosamente", control: newControl });
  } catch (error) {
    handleControllerError(res, error, "Error creando control mensual:");
  }
};

// GET /api/stock/monthly-control/current
const getCurrentMonthlyControl = async (req, res) => {
  try {
    const { branch_id: requestedBranchId, year, month } = req.query;
    const period = year && month
      ? { year: parseInt(year), month: parseInt(month) }
      : getCurrentPeriod();
    const branchId = getBranchId(req.user, requestedBranchId ? parseInt(requestedBranchId) : null);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }

    const control = await MonthlyControl.findByBranchAndPeriod(branchId, period.year, period.month);

    if (!control) {
      return res.json({ status: "success", control: null, canCreate: true, period });
    }

    const stats = await MonthlyControl.getStats(control.id);
    res.json({ status: "success", control, stats, canEdit: control.status === "draft" });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo control actual:");
  }
};

// PUT /api/stock/monthly-control/complete
const completeMonthlyControl = async (req, res) => {
  try {
    const { control_id } = req.body;
    if (!control_id) {
      return res.status(400).json({ status: "error", message: "control_id es requerido" });
    }

    const control = await MonthlyControl.findById(control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }
    if (control.status !== "draft") {
      return res.status(400).json({ status: "error", message: "Solo se pueden completar controles en borrador" });
    }

    const itemCount = await MonthlyControl.getItemCount(control_id);
    if (itemCount === 0) {
      return res.status(400).json({ status: "error", message: "No se puede completar un control sin ítems" });
    }

    const updatedControl = await MonthlyControl.complete(control_id);
    console.log(`Control completado - ID: ${control_id}, Items: ${itemCount}, Usuario: ${req.user.username}`);
    res.json({ status: "success", message: `Control completado con ${itemCount} productos`, control: updatedControl });
  } catch (error) {
    handleControllerError(res, error, "Error completando control:");
  }
};

// GET /api/stock/monthly-control/history
const getMonthlyControlHistory = async (req, res) => {
  try {
    const { branch_id: requestedBranchId, limit = 12 } = req.query;
    const branchId = getBranchId(req.user, requestedBranchId ? parseInt(requestedBranchId) : null);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }

    const history = await MonthlyControl.getHistory(branchId, limit);
    res.json({ status: "success", history });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo historial:");
  }
};

// DELETE /api/stock/monthly-control/:control_id
const deleteMonthlyControl = async (req, res) => {
  try {
    const { control_id } = req.params;
    const control = await MonthlyControl.findById(control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }
    if (req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Solo los administradores pueden eliminar controles" });
    }

    await MonthlyControl.delete(control_id);
    console.log(`Control eliminado - ID: ${control_id}, Usuario: ${req.user.username}`);
    res.json({ status: "success", message: "Control eliminado exitosamente" });
  } catch (error) {
    handleControllerError(res, error, "Error eliminando control:");
  }
};

// ==================== STOCK ITEMS ====================

// GET /api/stock/items/:control_id
const getStockItems = async (req, res) => {
  try {
    const { control_id } = req.params;
    const control = await MonthlyControl.findById(control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }

    const items = await StockControl.findByControlId(control_id);
    // Fecha de última sincronización del control: el máximo last_sync_at de sus ítems.
    // Todos los ítems de una sucursal se sincronizan juntos, así que en la práctica
    // representa cuándo se actualizó por última vez el stock de este control.
    const lastSyncAt = items.reduce((max, it) => {
      if (!it.last_sync_at) return max;
      const t = new Date(it.last_sync_at).getTime();
      return t > max ? t : max;
    }, 0);
    res.json({
      status: "success",
      items,
      last_sync_at: lastSyncAt > 0 ? new Date(lastSyncAt).toISOString() : null,
      control: { id: control.id, branch_id: control.branch_id, status: control.status },
    });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo ítems:");
  }
};

// POST /api/stock/items/upsert — agregar o actualizar un ítem inline
const upsertStockItem = async (req, res) => {
  try {
    const { monthly_control_id, product_stock_id, stock_require, condition_id } = req.body;

    if (!monthly_control_id || !product_stock_id || stock_require == null) {
      return res.status(400).json({ status: "error", message: "monthly_control_id, product_stock_id y stock_require son requeridos" });
    }

    const control = await MonthlyControl.findById(monthly_control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }
    if (control.status !== "draft") {
      return res.status(400).json({ status: "error", message: "Solo se pueden modificar controles en borrador" });
    }

    const item = await StockControl.upsert(monthly_control_id, control.branch_id, product_stock_id, parseInt(stock_require), condition_id || null);
    // Devolver el ítem completo con display_name y estado
    const items = await StockControl.findByControlId(monthly_control_id);
    const full = items.find(i => i.id === item.id);

    res.json({ status: "success", item: full });
  } catch (error) {
    handleControllerError(res, error, "Error guardando ítem:");
  }
};

// DELETE /api/stock/items/:item_id
const deleteStockItem = async (req, res) => {
  try {
    const { item_id } = req.params;
    const item = await StockControl.findWithControlInfo(item_id);
    if (!item) return res.status(404).json({ status: "error", message: "Ítem no encontrado" });
    if (!canAccessBranch(req.user, item.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }
    if (item.control_status !== "draft") {
      return res.status(400).json({ status: "error", message: "Solo se pueden eliminar ítems de controles en borrador" });
    }

    await StockControl.delete(item_id);
    console.log(`Ítem eliminado - ID: ${item_id}, Usuario: ${req.user.username}`);
    res.json({ status: "success", message: "Ítem eliminado" });
  } catch (error) {
    handleControllerError(res, error, "Error eliminando ítem:");
  }
};

// GET /api/stock/available-products/:branch_id — productos sincronizados disponibles para agregar al control
const getAvailableProducts = async (req, res) => {
  try {
    const { branch_id } = req.params;
    if (!canAccessBranch(req.user, parseInt(branch_id))) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }

    const result = await pool.query(
      `SELECT id, display_name, stock, last_sync_at
       FROM product_stock_by_branch
       WHERE branch_id = $1 AND display_name IS NOT NULL
       ORDER BY display_name`,
      [branch_id]
    );
    res.json({ status: "success", products: result.rows });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo productos disponibles:");
  }
};

// GET /api/stock/branches-summary/:branch_id
const getBranchesSummary = async (req, res) => {
  try {
    const { branch_id } = req.params;
    if (!canAccessBranch(req.user, parseInt(branch_id))) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }

    const branch = await Branch.findById(branch_id);
    if (!branch) return res.status(404).json({ status: "error", message: "Sucursal no encontrada" });

    const controls = await MonthlyControl.getSummaryByBranch(branch.code, 12);
    const stats = await MonthlyControl.getBranchStats(branch.code);
    const controlsWithBranchId = controls.map(c => ({ ...c, branch_id: parseInt(branch_id) }));

    res.json({ status: "success", controls: controlsWithBranchId, stats });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo resumen de sucursal:");
  }
};

module.exports = {
  createMonthlyControl,
  getCurrentMonthlyControl,
  completeMonthlyControl,
  getMonthlyControlHistory,
  deleteMonthlyControl,
  getStockItems,
  upsertStockItem,
  deleteStockItem,
  getAvailableProducts,
  getBranchesSummary,
};

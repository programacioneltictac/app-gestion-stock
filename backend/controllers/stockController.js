const MonthlyControl = require("../models/MonthlyControl");
const StockControl = require("../models/StockControl");
const Branch = require("../models/Branch");
const Category = require("../models/Category");
const { canAccessBranch, getBranchId } = require("../middlewares/auth");
const { handleControllerError } = require("../utils/errorHelper");
const { parsePositiveInt } = require("../utils/pagination");

// Busca el control y valida que el usuario tenga acceso a su sucursal. Si no
// existe (404) o no hay acceso (403) ya respondió y devuelve null: el handler
// solo tiene que cortar con `if (!control) return;`.
const loadAccessibleControl = async (req, res, controlId) => {
  const control = await MonthlyControl.findById(controlId);
  if (!control) {
    res.status(404).json({ status: "error", message: "Control no encontrado" });
    return null;
  }
  if (!canAccessBranch(req.user, control.branch_id)) {
    res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    return null;
  }
  return control;
};

const getCurrentPeriod = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

// ==================== MONTHLY CONTROLS ====================

// POST /api/stock/monthly-control/create
// Crea un control ABIERTO por rubro (category_id obligatorio). El control deja
// de estar atado al mes: control_year/control_month se llenan desde la fecha de
// apertura solo para conservar compatibilidad (órdenes, historial, vista).
const createMonthlyControl = async (req, res) => {
  try {
    const { branch_id: requestedBranchId, category_id } = req.body;
    const branchId = getBranchId(req.user, requestedBranchId);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }
    if (!category_id) {
      return res.status(400).json({ status: "error", message: "category_id es requerido" });
    }

    const category = await Category.findById(category_id);
    if (!category) {
      return res.status(404).json({ status: "error", message: "Rubro no encontrado" });
    }

    // Unicidad por rubro activo: solo un control 'draft' del mismo rubro por sucursal.
    const openControl = await MonthlyControl.existsOpenForCategory(branchId, category_id);
    if (openControl) {
      return res.status(409).json({
        status: "error",
        message: `Ya existe un control abierto del rubro "${category.category_name}" en esta sucursal`,
      });
    }

    const period = getCurrentPeriod();
    const newControl = await MonthlyControl.create(branchId, category_id, period.year, period.month, req.user.id);
    console.log(`Control creado - ID: ${newControl.id}, Branch: ${branchId}, Rubro: ${category.category_name}, Usuario: ${req.user.username}`);

    res.json({
      status: "success",
      message: `Control del rubro "${category.category_name}" creado exitosamente`,
      control: { ...newControl, category_name: category.category_name },
    });
  } catch (error) {
    handleControllerError(res, error, "Error creando control:");
  }
};

// GET /api/stock/monthly-control/current
// Ahora devuelve la LISTA de controles abiertos (draft) de la sucursal.
// ⚠️ Cambio de contrato: de un único control a varios (campo `controls`).
const getCurrentMonthlyControl = async (req, res) => {
  try {
    const { branch_id: requestedBranchId } = req.query;
    const branchId = getBranchId(req.user, requestedBranchId ? parseInt(requestedBranchId) : null);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }

    const controls = await MonthlyControl.findOpenByBranch(branchId);
    res.json({ status: "success", controls });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo controles abiertos:");
  }
};

// GET /api/stock/monthly-control/:control_id — un control por id + stats.
// Reemplaza el uso frágil de "current" para mostrar el detalle de un control.
const getMonthlyControlById = async (req, res) => {
  try {
    const { control_id } = req.params;
    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;

    const stats = await MonthlyControl.getStats(control.id);
    res.json({ status: "success", control, stats, canEdit: control.status === "draft" });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo control:");
  }
};

// GET /api/stock/monthly-control/:control_id/discontinued
// Productos DISCONTINUOS del control: tienen stock en la sucursal, son del
// mismo rubro, pero NO fueron incluidos en el control. Solo lectura (no se
// crea/elimina nada). Sirve para detectar sobrante a discontinuar.
const getDiscontinued = async (req, res) => {
  try {
    const { control_id } = req.params;
    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;

    const products = await StockControl.findDiscontinued(
      control.branch_id,
      control.category_id,
      control.id
    );
    res.json({ status: "success", products });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo productos discontinuos:");
  }
};

// GET /api/stock/monthly-control/:control_id/promo
// Productos PROMO (products.is_promo) con stock en la sucursal y del mismo rubro
// del control. No se reponen ni cuentan como discontinuos. Solo lectura.
const getPromo = async (req, res) => {
  try {
    const { control_id } = req.params;
    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;

    const products = await StockControl.findPromo(control.branch_id, control.category_id);
    res.json({ status: "success", products });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo productos promo:");
  }
};

// PUT /api/stock/monthly-control/complete
const completeMonthlyControl = async (req, res) => {
  try {
    const { control_id } = req.body;
    if (!control_id) {
      return res.status(400).json({ status: "error", message: "control_id es requerido" });
    }

    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;
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

// PUT /api/stock/monthly-control/discontinue
// Discontinúa un control COMPLETADO: queda de archivo (sync no lo toca, no genera
// órdenes). Las órdenes ya creadas siguen vivas en /orders; solo se avisa cuántas
// abiertas hay (no bloquea).
const discontinueMonthlyControl = async (req, res) => {
  try {
    const { control_id } = req.body;
    if (!control_id) {
      return res.status(400).json({ status: "error", message: "control_id es requerido" });
    }

    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;
    if (control.status !== "completed") {
      return res.status(400).json({ status: "error", message: "Solo se pueden discontinuar controles completados" });
    }

    const openOrders = await MonthlyControl.countOpenOrders(control_id);
    const updatedControl = await MonthlyControl.discontinue(control_id);
    console.log(`Control discontinuado - ID: ${control_id}, Órdenes abiertas: ${openOrders}, Usuario: ${req.user.username}`);
    res.json({
      status: "success",
      message: "Control discontinuado",
      open_orders: openOrders,
      control: updatedControl,
    });
  } catch (error) {
    handleControllerError(res, error, "Error discontinuando control:");
  }
};

// PUT /api/stock/monthly-control/reopen
// Reabre un control COMPLETADO devolviéndolo a 'draft' para ajustes operativos
// (excepción de admin). Habilita el form de agregar/editar/eliminar ítems. Se
// vuelve a cerrar con el flujo normal "Completar".
const reopenMonthlyControl = async (req, res) => {
  try {
    const { control_id } = req.body;
    if (!control_id) {
      return res.status(400).json({ status: "error", message: "control_id es requerido" });
    }
    if (req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Solo los administradores pueden reabrir controles" });
    }

    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;
    if (control.status !== "completed") {
      return res.status(400).json({ status: "error", message: "Solo se pueden reabrir controles completados" });
    }

    const updatedControl = await MonthlyControl.reopen(control_id);
    console.log(`Control reabierto - ID: ${control_id}, Usuario: ${req.user.username}`);
    res.json({ status: "success", message: "Control reabierto para edición", control: updatedControl });
  } catch (error) {
    handleControllerError(res, error, "Error reabriendo control:");
  }
};

// GET /api/stock/monthly-control/:control_id/open-orders-count
// Cantidad de órdenes abiertas vinculadas al control. Lo usa el front para
// avisar antes de discontinuar.
const getOpenOrdersCount = async (req, res) => {
  try {
    const { control_id } = req.params;
    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;
    const count = await MonthlyControl.countOpenOrders(control_id);
    res.json({ status: "success", count });
  } catch (error) {
    handleControllerError(res, error, "Error contando órdenes abiertas:");
  }
};

// GET /api/stock/monthly-control/history
const getMonthlyControlHistory = async (req, res) => {
  try {
    const { branch_id: requestedBranchId } = req.query;
    const limit = parsePositiveInt(req.query.limit, 12);
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
    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;
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
    const control = await loadAccessibleControl(req, res, control_id);
    if (!control) return;

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
    const { monthly_control_id, product_stock_id, product_id, group_id, stock_require, condition_id } = req.body;

    if (!monthly_control_id || stock_require == null) {
      return res.status(400).json({ status: "error", message: "monthly_control_id y stock_require son requeridos" });
    }
    if (!product_stock_id && !product_id && !group_id) {
      return res.status(400).json({ status: "error", message: "Indique product_stock_id, product_id o group_id" });
    }

    const control = await loadAccessibleControl(req, res, monthly_control_id);
    if (!control) return;
    if (control.status !== "draft") {
      return res.status(400).json({ status: "error", message: "Solo se pueden modificar controles en borrador" });
    }

    const item = await StockControl.upsert(
      monthly_control_id,
      control.branch_id,
      { product_stock_id, product_id, group_id },
      parseInt(stock_require),
      condition_id || null
    );
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
    // Protección al reabrir un control: un ítem que ya generó una orden no se
    // puede eliminar (rompería la relación control↔orden). Se debe quitar desde
    // la orden si corresponde. Si la orden ya cerró, StockControl.delete suelta
    // el vínculo y lo borra.
    if (item.ordered_at || (await StockControl.hasLiveOrder(item_id))) {
      return res.status(400).json({
        status: "error",
        message: "Este ítem ya generó una orden y no se puede eliminar. Quitalo desde la orden si corresponde.",
      });
    }

    await StockControl.delete(item_id);
    console.log(`Ítem eliminado - ID: ${item_id}, Usuario: ${req.user.username}`);
    res.json({ status: "success", message: "Ítem eliminado" });
  } catch (error) {
    handleControllerError(res, error, "Error eliminando ítem:");
  }
};

// GET /api/stock/available-products/:branch_id?category_id=X
// Productos ya sincronizados en la sucursal, FILTRADOS por el rubro del control.
// product_stock_by_branch no tiene category_id, así que el rubro se resuelve:
//   - productos sueltos: psb.product_id → products.category_id
//   - grupos:            psb.group_id   → product_groups.category_type (= categories.category_name)
const getAvailableProducts = async (req, res) => {
  try {
    const { branch_id } = req.params;
    const { category_id } = req.query;
    if (!canAccessBranch(req.user, parseInt(branch_id))) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }
    if (!category_id) {
      return res.status(400).json({ status: "error", message: "category_id es requerido" });
    }

    const products = await StockControl.findAvailableProducts(branch_id, category_id);
    res.json({ status: "success", products });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo productos disponibles:");
  }
};

// GET /api/stock/global-catalog/:branch_id — productos/grupos del sistema que
// AÚN NO existen en esta sucursal (stock 0 no sincronizado). Permiten agregarse
// al control: al elegirlos se crea su fila product_stock_by_branch en 0.
const getGlobalCatalog = async (req, res) => {
  try {
    const { branch_id } = req.params;
    const { category_id } = req.query;
    if (!canAccessBranch(req.user, parseInt(branch_id))) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a esta sucursal" });
    }
    if (!category_id) {
      return res.status(400).json({ status: "error", message: "category_id es requerido" });
    }

    const products = await StockControl.findGlobalCatalog(branch_id, category_id);
    res.json({ status: "success", products });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo catálogo global:");
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
  getMonthlyControlById,
  getDiscontinued,
  getPromo,
  completeMonthlyControl,
  discontinueMonthlyControl,
  reopenMonthlyControl,
  getOpenOrdersCount,
  getMonthlyControlHistory,
  deleteMonthlyControl,
  getStockItems,
  upsertStockItem,
  deleteStockItem,
  getAvailableProducts,
  getGlobalCatalog,
  getBranchesSummary,
};

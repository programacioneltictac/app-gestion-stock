const MonthlyControl = require("../models/MonthlyControl");
const StockControl = require("../models/StockControl");
const Branch = require("../models/Branch");
const Category = require("../models/Category");
const { canAccessBranch, getBranchId } = require("../middlewares/auth");
const { handleControllerError } = require("../utils/errorHelper");
const { pool } = require("../database/config");

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
    const control = await MonthlyControl.findById(control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }

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
    const control = await MonthlyControl.findById(control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }

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

    const control = await MonthlyControl.findById(control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }
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

// GET /api/stock/monthly-control/:control_id/open-orders-count
// Cantidad de órdenes abiertas vinculadas al control. Lo usa el front para
// avisar antes de discontinuar.
const getOpenOrdersCount = async (req, res) => {
  try {
    const { control_id } = req.params;
    const control = await MonthlyControl.findById(control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }
    const count = await MonthlyControl.countOpenOrders(control_id);
    res.json({ status: "success", count });
  } catch (error) {
    handleControllerError(res, error, "Error contando órdenes abiertas:");
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
    const { monthly_control_id, product_stock_id, product_id, group_id, stock_require, condition_id } = req.body;

    if (!monthly_control_id || stock_require == null) {
      return res.status(400).json({ status: "error", message: "monthly_control_id y stock_require son requeridos" });
    }
    if (!product_stock_id && !product_id && !group_id) {
      return res.status(400).json({ status: "error", message: "Indique product_stock_id, product_id o group_id" });
    }

    const control = await MonthlyControl.findById(monthly_control_id);
    if (!control) return res.status(404).json({ status: "error", message: "Control no encontrado" });
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({ status: "error", message: "No tienes acceso a este control" });
    }
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

    const result = await pool.query(
      `SELECT psb.id, psb.display_name, psb.stock, psb.last_sync_at
         FROM product_stock_by_branch psb
         LEFT JOIN products p       ON psb.product_id = p.id
         LEFT JOIN product_groups pg ON psb.group_id = pg.id
         LEFT JOIN categories cg    ON pg.category_type = cg.category_name
        WHERE psb.branch_id = $1
          AND psb.display_name IS NOT NULL
          AND ( p.category_id = $2 OR cg.id = $2 )
          -- Excluir marcas con prueba EN PRUEBA en esta sucursal/rubro: se
          -- gestionan en "Marcas a prueba", no se suman al control todavia.
          AND NOT EXISTS (
            SELECT 1 FROM brand_trials bt
            WHERE bt.status = 'en_prueba'
              AND bt.branch_id = psb.branch_id
              AND bt.brand_id = COALESCE(pg.brand_id, p.brand_id)
              AND (bt.category_id IS NULL OR bt.category_id = $2)
          )
        ORDER BY psb.display_name`,
      [branch_id, category_id]
    );
    res.json({ status: "success", products: result.rows });
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

    // Productos individuales activos sin fila en esta sucursal (los no agrupados;
    // los agrupados se ofrecen como grupo). category_name desde categories.
    // Grupos sin fila en esta sucursal; category_name desde product_groups.category_type.
    // Todo FILTRADO por el rubro del control:
    //   - productos sueltos: products.category_id = $2
    //   - grupos:            product_groups.category_type = categories.category_name (id = $2)
    const result = await pool.query(
      `SELECT p.id AS product_id, NULL::int AS group_id,
              p.display_name, c.category_name
         FROM products p
         JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = true
          AND p.is_grouped = false
          AND p.display_name IS NOT NULL
          AND c.id = $2
          AND NOT EXISTS (
            SELECT 1 FROM product_stock_by_branch psb
             WHERE psb.product_id = p.id AND psb.branch_id = $1
          )
       UNION ALL
       SELECT NULL::int AS product_id, pg.id AS group_id,
              pg.display_name, pg.category_type AS category_name
         FROM product_groups pg
         JOIN categories cg ON pg.category_type = cg.category_name
        WHERE pg.display_name IS NOT NULL
          AND cg.id = $2
          AND NOT EXISTS (
            SELECT 1 FROM product_stock_by_branch psb
             WHERE psb.group_id = pg.id AND psb.branch_id = $1
          )
       ORDER BY display_name`,
      [branch_id, category_id]
    );
    res.json({ status: "success", products: result.rows });
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
  completeMonthlyControl,
  discontinueMonthlyControl,
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

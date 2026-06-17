import stockService from "../services/stockService";

// Transform monthly control from backend
function transformControlFromBackend(control) {
  const period =
    control.control_year && control.control_month
      ? `${String(control.control_month).padStart(2, "0")}/${control.control_year}`
      : control.period || "";

  const statusName =
    control.status === "draft"
      ? "Borrador"
      : control.status === "completed"
      ? "Completado"
      : control.status;

  return {
    id: control.id,
    branchId: control.branch_id,
    branchName: control.branch_name,
    categoryId: control.category_id,
    categoryName: control.category_name || "",
    period,
    status: control.status,
    statusName,
    totalItems: Number(control.total_items || control.total_products || 0),
    needOrderItems: Number(control.need_order_items || control.products_need_order || 0),
    optimalItems: Number(control.optimal_items || control.products_optimal || 0),
    excessItems:
      Number(control.excess_items || control.products_excess || 0) +
      Number(control.high_excess_items || control.products_high_excess || 0),
    avgCompliance: Number(control.avg_compliance || 0),
    createdAt: control.created_at,
    completedAt: control.completed_at,
  };
}

// Transform stock item from backend
function transformStockItemFromBackend(item) {
  return {
    id: item.id,
    productStockId: item.product_stock_id,
    displayName: item.display_name,
    categoryName: item.category_name || "",
    conditionId: item.condition_id || null,
    conditionName: item.condition_name || "",
    stockRequire: Number(item.stock_require),
    stockCurrent: Number(item.stock_current),
    stockDifference: Number(item.stock_difference),
    compliance: Number(item.compliance || 0),
    stockStatusId: item.stock_status_id,
    stockStatusName: item.stock_status_name,
    notes: item.notes || "",
    updatedAt: item.updated_at,
    orderedAt: item.ordered_at || null,
    orderDetailId: item.order_detail_id || null,
  };
}

// ============= MONTHLY CONTROLS =============

// Lista de controles ABIERTOS (draft) de la sucursal — uno por rubro.
// ⚠️ Reemplaza al antiguo getCurrentControl que devolvía un único control.
export async function getOpenControls(branchId) {
  const data = await stockService.getCurrentControl(branchId);
  return (data.controls || []).map(transformControlFromBackend);
}

// Detalle de un control por su id (para la pantalla de detalle).
export async function getControlById(controlId) {
  const data = await stockService.getControlById(controlId);
  if (!data.control) return null;
  return transformControlFromBackend(data.control);
}

export async function getControlHistory(branchId) {
  const data = await stockService.getControlHistory(branchId);
  return (data.history || data.controls || []).map(transformControlFromBackend);
}

// Crea un control abierto del rubro indicado (category_id obligatorio).
export async function createMonthlyControl(branchId, categoryId) {
  const data = await stockService.createMonthlyControl({ branch_id: branchId, category_id: categoryId });
  return transformControlFromBackend(data.control);
}

export async function completeMonthlyControl(controlId) {
  const data = await stockService.completeControl(controlId);
  return transformControlFromBackend(data.control);
}

export async function deleteMonthlyControl(controlId) {
  await stockService.deleteControl(controlId);
  return { success: true };
}

// ============= STOCK ITEMS =============

export async function getStockItems(controlId) {
  const data = await stockService.getItems(controlId);
  return {
    items: (data.items || []).map(transformStockItemFromBackend),
    lastSyncAt: data.last_sync_at || null,
  };
}

// Agrega/actualiza un ítem del control. `ref` identifica el producto:
//   { productStockId } → producto ya presente en la sucursal
//   { productId } | { groupId } → catálogo global; el backend crea la fila en 0
export async function upsertStockItem(monthlyControlId, ref, stockRequire, conditionId = null) {
  const data = await stockService.upsertItem({
    monthly_control_id: monthlyControlId,
    product_stock_id: ref.productStockId || null,
    product_id: ref.productId || null,
    group_id: ref.groupId || null,
    stock_require: stockRequire,
    condition_id: conditionId,
  });
  return transformStockItemFromBackend(data.item);
}

export async function deleteStockItem(itemId) {
  await stockService.deleteItem(itemId);
  return { success: true };
}

// ============= AVAILABLE PRODUCTS =============

// Catálogo unificado para agregar ítems al control:
// - productos presentes en la sucursal (con product_stock_id / stock real)
// - productos y grupos del sistema NO presentes (isGlobal: se crean en 0 al elegirlos)
// Cada opción lleva una `ref` lista para upsertStockItem.
export async function getAvailableProducts(branchId, categoryId) {
  const [available, global] = await Promise.all([
    stockService.getAvailableProducts(branchId, categoryId),
    stockService.getGlobalCatalog(branchId, categoryId),
  ]);

  const local = (available.products || []).map((p) => ({
    key: `s-${p.id}`,
    id: p.id, // product_stock_id
    displayName: p.display_name || "",
    stock: p.stock,
    isGlobal: false,
    ref: { productStockId: p.id },
  }));

  const globalOpts = (global.products || []).map((p) => ({
    key: p.product_id ? `p-${p.product_id}` : `g-${p.group_id}`,
    id: null,
    displayName: p.display_name || "",
    categoryName: p.category_name || "",
    isGlobal: true,
    ref: p.product_id ? { productId: p.product_id } : { groupId: p.group_id },
  }));

  return [...local, ...globalOpts];
}

export async function getConditions() {
  const data = await stockService.getConditions();
  return data.conditions || [];
}

// ============= BRANCH SUMMARY =============

export async function getBranchSummary(branchId) {
  if (!branchId || isNaN(branchId)) throw new Error("ID de sucursal inválido");
  const data = await stockService.getBranchSummary(Number(branchId));
  return {
    branch: data.branch || null,
    controls: (data.controls || []).map(transformControlFromBackend),
    stats: data.stats || {},
  };
}

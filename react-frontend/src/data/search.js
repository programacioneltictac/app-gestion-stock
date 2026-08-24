import searchService from '../services/searchService';

// Una fila del buscador: un producto (o grupo marca+rubro) en UNA sucursal,
// con su situacion segun el control mas reciente de esa sucursal.
function transformResultRow(r) {
  return {
    // id unico para React: el mismo psb nunca se repite en la respuesta
    id: r.product_stock_id,
    productStockId: r.product_stock_id,
    branchId: r.branch_id,
    branchName: r.branch_name || '',
    isHub: r.is_hub === true,
    displayName: r.display_name || '',
    categoryName: r.category_name || '',
    brandName: r.brand_name || '',
    supplierId: r.supplier_id,
    supplierName: r.supplier_name || '',
    stock: Number(r.stock || 0),
    stockRequire: Number(r.stock_require || 0),
    faltante: Number(r.faltante || 0),
    stockStatusId: r.stock_status_id,
    stockStatusName: r.stock_status_name || '',
    colorIndicator: r.color_indicator || '',
    conditionName: r.condition_name || '',
    controlStatus: r.control_status || '',
    controlDate: r.control_date || null,
    lastSyncAt: r.last_sync_at || null,
  };
}

// Resultados ya agrupados por sucursal, en el orden que devuelve el backend
// (Hub primero, despues alfabetico), con totales por sucursal para el encabezado.
export async function searchStock({ supplierId, productStockId, q } = {}) {
  const data = await searchService.searchStock({ supplierId, productStockId, q });
  const rows = (data.results || []).map(transformResultRow);

  const branches = [];
  const byId = new Map();
  rows.forEach((row) => {
    let group = byId.get(row.branchId);
    if (!group) {
      group = {
        branchId: row.branchId,
        branchName: row.branchName,
        isHub: row.isHub,
        items: [],
        totalUnits: 0,
        needOrderCount: 0,
      };
      byId.set(row.branchId, group);
      branches.push(group);
    }
    group.items.push(row);
    group.totalUnits += row.stock;
    if (row.stockStatusId === 1) group.needOrderCount += 1;
  });

  return { branches, totalItems: rows.length, truncated: data.truncated === true };
}

export async function getProductOptions(q) {
  const data = await searchService.getProductOptions(q);
  return (data.products || []).map((p) => ({ id: p.id, label: p.display_name || '' }));
}

export async function getSupplierOptions() {
  const data = await searchService.getSupplierOptions();
  return (data.suppliers || []).map((s) => ({ id: s.id, label: s.supplier_name || '' }));
}

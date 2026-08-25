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

// Agrupa filas planas por sucursal, respetando el orden en que vienen del
// backend (Hub primero, despues alfabetico), y calcula los totales del
// encabezado.
//
// Es una funcion pura y se exporta a proposito: los filtros de la pantalla la
// vuelven a llamar sobre el subconjunto filtrado, y asi los totales por
// sucursal ("X items - Y u.", "N a pedir") quedan siempre referidos a lo que
// se esta viendo, sin recalcularlos por separado. Una sucursal que se queda
// sin filas simplemente no genera grupo -> desaparece del listado.
export function groupByBranch(rows) {
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
  return branches;
}

// Resultados agrupados por sucursal. Devuelve TAMBIEN las filas planas (`rows`)
// porque los filtros de la pantalla trabajan sobre ellas y reagrupan en el
// cliente: los volumenes son chicos (un proveedor grande son ~60 filas) y asi
// filtrar es instantaneo, sin volver al servidor.
export async function searchStock({ supplierId, productStockId, q, names } = {}) {
  const data = await searchService.searchStock({ supplierId, productStockId, q, names });
  const rows = (data.results || []).map(transformResultRow);

  return {
    rows,
    branches: groupByBranch(rows),
    totalItems: rows.length,
    truncated: data.truncated === true,
  };
}

export async function getProductOptions(q) {
  const data = await searchService.getProductOptions(q);
  return (data.products || []).map((p) => ({ id: p.id, label: p.display_name || '' }));
}

export async function getSupplierOptions() {
  const data = await searchService.getSupplierOptions();
  return (data.suppliers || []).map((s) => ({ id: s.id, label: s.supplier_name || '' }));
}

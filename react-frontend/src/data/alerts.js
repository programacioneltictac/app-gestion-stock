import alertService from '../services/alertService';

// Métricas de alertas tempranas, transformadas a camelCase para el dashboard.
export async function getAlerts() {
  const data = await alertService.getAlerts();
  return {
    muyPrioritarios: (data.muyPrioritarios || []).map((r) => ({
      controlId: r.control_id,
      branchId: r.branch_id,
      branchName: r.branch_name,
      categoryName: r.category_name || '',
      faltantes: Number(r.faltantes || 0),
      faltanteValor: Number(r.faltante_valor || 0),
    })),
    criticalBranches: (data.criticalBranches || []).map((r) => ({
      branchId: r.branch_id,
      branchName: r.branch_name,
      isHub: r.is_hub === true,
      needOrderItems: Number(r.need_order_items || 0),
    })),
    pendingOrders: Number(data.pendingOrders || 0),
    pendingOrdersSupplier: Number(data.pendingOrdersSupplier || 0),
    pendingOrdersHub: Number(data.pendingOrdersHub || 0),
    authorizedOrders: Number(data.authorizedOrders || 0),
    // Tiempo de ciclo de las órdenes cerradas en los últimos 30 días.
    // closedOrders* es el tamaño de muestra: en 0 el promedio viene null y la
    // tarjeta muestra "—" (no hubo cierres != cerramos en 0 días).
    cycleTimeSupplierDays: data.cycleTimeSupplierDays != null ? Number(data.cycleTimeSupplierDays) : null,
    cycleTimeHubDays: data.cycleTimeHubDays != null ? Number(data.cycleTimeHubDays) : null,
    closedOrdersSupplier: Number(data.closedOrdersSupplier || 0),
    closedOrdersHub: Number(data.closedOrdersHub || 0),
    avgCompliance: data.avgCompliance != null ? Number(data.avgCompliance) : null,
    brandTrialsDue: Number(data.brandTrialsDue || 0),
    discontinuedValue: (data.discontinuedValue || []).map((r) => ({
      controlId: r.control_id,
      branchId: r.branch_id,
      branchName: r.branch_name,
      categoryName: r.category_name || '',
      units: Number(r.units || 0),
      value: Number(r.value || 0),
    })),
  };
}

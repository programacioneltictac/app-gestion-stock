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
    })),
    criticalBranches: (data.criticalBranches || []).map((r) => ({
      branchId: r.branch_id,
      branchName: r.branch_name,
      isHub: r.is_hub === true,
      needOrderItems: Number(r.need_order_items || 0),
    })),
    pendingOrders: Number(data.pendingOrders || 0),
    discontinuedValue: (data.discontinuedValue || []).map((r) => ({
      controlId: r.control_id,
      branchId: r.branch_id,
      branchName: r.branch_name,
      categoryName: r.category_name || '',
      value: Number(r.value || 0),
    })),
  };
}

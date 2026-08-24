import reportService from '../services/reportService';

const num = (v) => Number(v || 0);
// Los promedios/máximos pueden venir null (sin órdenes abiertas): null y 0 no
// significan lo mismo en el informe, así que no se colapsan.
const numOrNull = (v) => (v != null ? Number(v) : null);

// Datos del informe de situación, normalizados para el PDF. El backend ya los
// entrega en camelCase; acá solo se fuerzan los tipos y se garantizan los
// arrays, de modo que utils/situationPdf.js nunca tenga que defenderse.
export async function getSituation() {
  const d = await reportService.getSituation();
  const s = d.summary || {};
  const cycle = d.orderCycleTime || {};
  const hub = d.hubCommitted || {};

  return {
    generatedAt: d.generatedAt ? new Date(d.generatedAt) : new Date(),
    lastSyncAt: d.lastSyncAt ? new Date(d.lastSyncAt) : null,
    scope: d.scope || 'global',

    summary: {
      branches: num(s.branches),
      criticalBranches: num(s.criticalBranches),
      avgCompliance: numOrNull(s.avgCompliance),
      muyPrioritariosUnits: num(s.muyPrioritariosUnits),
      muyPrioritariosValue: num(s.muyPrioritariosValue),
      discontinuedUnits: num(s.discontinuedUnits),
      discontinuedValue: num(s.discontinuedValue),
      brandTrialsValue: num(s.brandTrialsValue),
      openOrdersSupplier: num(s.openOrdersSupplier),
      openOrdersHub: num(s.openOrdersHub),
      supplierOrdersValue: num(s.supplierOrdersValue),
    },

    byBranch: (d.byBranch || []).map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName || '—',
      isHub: r.isHub === true,
      totalItems: num(r.totalItems),
      needOrderItems: num(r.needOrderItems),
      optimalItems: num(r.optimalItems),
      excessItems: num(r.excessItems),
      avgCompliance: numOrNull(r.avgCompliance),
    })),

    muyPrioritarios: (d.muyPrioritarios || []).map((r) => ({
      branchName: r.branchName || '—',
      items: num(r.items),
      units: num(r.units),
      value: num(r.value),
    })),

    discontinued: (d.discontinued || []).map((r) => ({
      branchName: r.branchName || '—',
      items: num(r.items),
      units: num(r.units),
      value: num(r.value),
    })),

    brandTrials: (d.brandTrials || []).map((r) => ({
      branchName: r.branchName || '—',
      trials: num(r.trials),
      dueTrials: num(r.dueTrials),
      units: num(r.units),
      value: num(r.value),
    })),

    supplierOrders: (d.supplierOrders || []).map((r) => ({
      status: r.status,
      orders: num(r.orders),
      value: num(r.value),
    })),

    hubOrders: (d.hubOrders || []).map((r) => ({
      status: r.status,
      orders: num(r.orders),
    })),

    // Tiempo de ciclo (finalized_at - created_at) de las órdenes cerradas en
    // los últimos 30 días. closedSupplier/closedHub = tamaño de muestra.
    orderCycleTime: {
      avgDaysSupplier: numOrNull(cycle.avgDaysSupplier),
      avgDaysHub: numOrNull(cycle.avgDaysHub),
      maxDaysSupplier: numOrNull(cycle.maxDaysSupplier),
      maxDaysHub: numOrNull(cycle.maxDaysHub),
      closedSupplier: num(cycle.closedSupplier),
      closedHub: num(cycle.closedHub),
    },

    openSupplierOrders: (d.openSupplierOrders || []).map((r) => ({
      id: r.id,
      status: r.status,
      supplierName: r.supplierName || '—',
      branchName: r.branchName || '—',
      daysOpen: num(r.daysOpen),
      value: num(r.value),
    })),

    hubCommitted: {
      units: num(hub.units),
      items: num(hub.items),
      orders: num(hub.orders),
    },

    topCategories: (d.topCategories || []).map((r) => ({
      categoryName: r.categoryName || 'Sin rubro',
      items: num(r.items),
      value: num(r.value),
    })),
  };
}

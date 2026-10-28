export const DRAWER_WIDTH = 240; // px
export const MINI_DRAWER_WIDTH = 90; // px

// Ids de dominio, espejo de backend/utils/domainConstants.js.
// conditions.id
export const CONDITION = {
  // 'MUY PRIORITARIO': filtro de llegada desde la tarjeta "Faltantes MUY
  // PRIORITARIOS" del dashboard (?filter=muyprioritario).
  MUY_PRIORITARIO: 3,
  // 'NUEVA MARCA': productos a prueba, NO elegibles para reposición (no se
  // pueden seleccionar para generar orden). Regla de Order.createFromControl.
  NON_REPLENISHABLE: 4,
};

// stock_status.id
export const STOCK_STATUS = {
  NEED_ORDER: 1, // "Generar Pedido"
  OPTIMAL: 2, // "Stock Optimo"
  OVERSTOCK: 3, // "Sobrestock"
};

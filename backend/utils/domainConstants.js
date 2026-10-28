// Constantes de dominio compartidas por modelos y servicios. Son ids FIJOS de
// tablas de catálogo (conditions, stock_status) y reglas de negocio: si cambia
// un id en la BD hay que cambiarlo solo aquí. Espejado en el frontend en
// react-frontend/src/constants.js.

// conditions.id
const CONDITION = {
  // 'MUY PRIORITARIO': faltantes de máxima urgencia (tarjeta del dashboard,
  // informe de situación y filtro ?filter=muyprioritario del control).
  MUY_PRIORITARIO: 3,
  // 'NUEVA MARCA': productos a prueba. Conviven en la hoja de control pero NO
  // son reponibles (no entran a ninguna orden ni cuentan como faltantes).
  NON_REPLENISHABLE: 4,
};

// stock_status.id — los asigna StockControl.determineStockStatus (y el CASE
// equivalente del sync) según los umbrales de app_settings.
const STOCK_STATUS = {
  NEED_ORDER: 1, // "Generar Pedido"
  OPTIMAL: 2, // "Stock Optimo"
  OVERSTOCK: 3, // "Sobrestock"
};

// IVA: el costo de IDUO (API y export CSV) viene con IVA; la app guarda neto.
const VAT_RATE = 1.21;

module.exports = { CONDITION, STOCK_STATUS, VAT_RATE };

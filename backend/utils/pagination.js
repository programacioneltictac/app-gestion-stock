// Tope de filas que un cliente puede pedir por request (limit/pageSize). Es el
// mismo maximo que ya usaba por defecto el catalogo de productos, asi que
// ninguna pantalla pide mas que esto.
const MAX_ROWS = 10000;

/**
 * Lee un entero positivo de la query (limit, page, pageSize) acotado a `max`.
 * Un valor ausente o invalido usa `fallback` (antes llegaba NaN a la query y
 * terminaba en un 500).
 */
function parsePositiveInt(value, fallback, max = MAX_ROWS) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

module.exports = { MAX_ROWS, parsePositiveInt };

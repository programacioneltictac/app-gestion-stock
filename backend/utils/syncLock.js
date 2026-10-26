/**
 * Lock de proceso para todo lo que resetea o re-acumula stock (o escribe
 * proveedores desde IDUO): sync automático, sync manual (todas o una sucursal),
 * sync de compras e importación de CSV. Una sola corrida a la vez.
 *
 * Antes solo el cron TOMABA el lock y los pedidos manuales solo lo consultaban:
 * dos syncs manuales (o un sync y un import) podían correr en paralelo, y como
 * los grupos acumulan (`stock = stock + $3`) el solapamiento duplicaba stock.
 *
 * Es un lock en memoria: alcanza con una sola instancia (Render, 1 proceso).
 */

// Duración típica medida de un sync completo (9 sucursales × 7 categorías) más
// el de compras. Sirve SOLO para estimar cuánto falta en el aviso al usuario.
const TYPICAL_RUN_MS = 13 * 60 * 1000;

let current = null; // { label, startedAt }

function isSyncRunning() {
  return current !== null;
}

/**
 * Estado del lock para el aviso de "ocupado". `remainingMin` es una estimación
 * optimista (mínimo 1 min mientras siga corriendo); si la corrida ya pasó la
 * duración típica devuelve 1 en vez de 0 o un negativo.
 */
function getSyncRunStatus() {
  if (!current) return { running: false };
  const elapsedMs = Date.now() - current.startedAt.getTime();
  const remainingMin = Math.max(1, Math.ceil((TYPICAL_RUN_MS - elapsedMs) / 60000));
  const elapsedMin = Math.floor(elapsedMs / 60000);
  return {
    running: true,
    label: current.label,
    startedAt: current.startedAt.toISOString(),
    elapsedMin,
    // Texto listo para el aviso: "hace 0 min" se lee mal en el primer minuto.
    elapsedText: elapsedMin < 1 ? "recién arrancó" : `hace ${elapsedMin} min`,
    remainingMin,
  };
}

/**
 * Corre `fn` con el lock tomado. Si ya hay una corrida en curso NO corre y
 * devuelve `{ busy: true, status }`; si no, `{ busy: false, result }`.
 * El lock se libera siempre (si quedara trabado, nada volvería a correr hasta
 * reiniciar el proceso).
 */
async function runExclusive(label, fn) {
  if (current) return { busy: true, status: getSyncRunStatus() };
  current = { label, startedAt: new Date() };
  try {
    return { busy: false, result: await fn(current.startedAt) };
  } finally {
    current = null;
  }
}

/**
 * Responde 409 con el estado de la corrida en curso. `logPrefix` identifica
 * quién fue rechazado en los logs (ej. "[sync]", "[import-csv]").
 */
function respondBusy(res, status, logPrefix) {
  console.warn(
    `${logPrefix} Pedido rechazado: ya hay una sincronización en curso (${status.label}, ${status.elapsedText}).`,
  );
  return res.status(409).json({
    status: "busy",
    message: `Ya hay una sincronización en curso (${status.label}, ${status.elapsedText}). Esperá ~${status.remainingMin} min y volvé a intentar.`,
    ...status,
  });
}

module.exports = { isSyncRunning, getSyncRunStatus, runExclusive, respondBusy };

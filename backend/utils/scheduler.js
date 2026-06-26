/**
 * Scheduler de sincronización automática.
 *
 * Corre, una vez al día y muy temprano, ambos syncs en SECUENCIA:
 *   1. Stock (syncAllBranches)  — primero
 *   2. Compras (syncCompras)    — después
 *
 * Diseño / decisiones:
 *  - Hora por defecto: 06:00 hora Argentina. node-cron maneja la timezone de
 *    forma nativa (incluido cualquier cambio horario), así NO hay que traducir
 *    a UTC ni calcular DST a mano. Render corre en UTC; la timezone resuelve eso.
 *  - Llama a las funciones internas directo (sin pasar por HTTP/JWT): es código
 *    del propio backend, no necesita autenticarse contra sí mismo.
 *  - Lock en memoria (isRunning): evita que dos corridas se solapen — si la
 *    corrida diaria aún no terminó, o si alguien dispara un sync manual mientras
 *    corre la automática, la segunda no arranca. (Mismo proceso: 1 instancia.)
 *  - Stock está blindado (guard EMPTY_API_RESPONSE): si el token de IDUO está
 *    vencido, las sucursales afectadas se saltan SIN vaciar su stock. Ver
 *    syncService. Compras solo hace upserts no destructivos.
 *  - Resultado a logs (revisión por logs de Render, sin email por ahora).
 *
 * Activación: el gatillo es SYNC_SCHEDULE_ENABLED=true, evaluado en server.js
 * (opt-in explícito; apagado por defecto en local). startScheduler() asume que,
 * si se la llama, se quiere programar.
 *
 * Configuración por entorno:
 *  - SYNC_SCHEDULE_CRON     (expresión cron, default '0 6 * * *' = 06:00)
 *  - SYNC_SCHEDULE_TZ       (timezone, default 'America/Argentina/Buenos_Aires')
 *  - IDUO_COMPRAS_MONTHS_BACK gobierna el rango de compras.
 */
const cron = require("node-cron");
const { syncAllBranches } = require("./syncService");
const { syncCompras } = require("./comprasService");

const DEFAULT_CRON = "0 6 * * *"; // 06:00
const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

// Lock de proceso: una sola corrida a la vez. Exportado para que el sync manual
// pueda consultarlo si en el futuro se quiere evitar solapamiento desde la API.
let isRunning = false;

function isSyncRunning() {
  return isRunning;
}

/**
 * Corre stock y luego compras en secuencia. Captura todo: el scheduler NUNCA
 * debe tumbar el proceso por un error de sync. Devuelve un resumen.
 */
async function runDailySync(trigger = "cron") {
  if (isRunning) {
    console.warn(
      `[scheduler] Sync ya en curso; se omite el disparo (${trigger}).`,
    );
    return { skipped: true };
  }
  isRunning = true;
  const startedAt = new Date();
  console.log(
    `\n##### [scheduler] Sync automático INICIADO (${trigger}) — ${startedAt.toISOString()} #####`,
  );

  const result = { startedAt: startedAt.toISOString(), stock: null, compras: null };

  // --- 1) STOCK ---
  try {
    console.log("[scheduler] (1/2) Sincronizando STOCK...");
    const stockRes = await syncAllBranches();
    result.stock = {
      ok: stockRes.ok_count,
      errors: stockRes.error_count,
      total: (stockRes.results || []).length,
    };
    console.log(
      `[scheduler] STOCK ok: ${result.stock.ok}/${result.stock.total} sucursales (errores: ${result.stock.errors}).`,
    );
  } catch (err) {
    result.stock = { failed: true, message: err.message };
    console.error(`[scheduler] STOCK FALLÓ: ${err.message}`);
  }

  // --- 2) COMPRAS --- (se corre aunque stock haya fallado: son independientes)
  try {
    console.log("[scheduler] (2/2) Sincronizando COMPRAS...");
    const compRes = await syncCompras();
    result.compras = {
      filas: compRes.filas,
      proveedoresNuevos: compRes.proveedoresNuevos,
      marcasAsignadas: (compRes.marcasAsignadas || []).length,
      conflictos: (compRes.conflictos || []).length,
      aviso: compRes.aviso || null,
    };
    if (compRes.aviso) {
      // allEmpty: típico token de compras vencido. No es destructivo, pero avisar.
      console.warn(`[scheduler] COMPRAS aviso: ${compRes.aviso}`);
    }
    console.log(
      `[scheduler] COMPRAS ok: ${result.compras.filas} filas, ${result.compras.proveedoresNuevos} prov. nuevos, ${result.compras.marcasAsignadas} marcas asignadas, ${result.compras.conflictos} conflictos.`,
    );
  } catch (err) {
    result.compras = { failed: true, message: err.message };
    console.error(`[scheduler] COMPRAS FALLÓ: ${err.message}`);
  }

  const elapsedMs = Date.now() - startedAt.getTime();
  result.elapsedMs = elapsedMs;
  console.log(
    `##### [scheduler] Sync automático FINALIZADO — duración ${Math.round(elapsedMs / 1000)}s #####\n`,
  );
  isRunning = false;
  return result;
}

/**
 * Registra el cron. Idempotente-ish: pensado para llamarse una vez al arrancar
 * el server. Devuelve la tarea programada (o null si está deshabilitado).
 */
function startScheduler() {
  const expression = process.env.SYNC_SCHEDULE_CRON || DEFAULT_CRON;
  const timezone = process.env.SYNC_SCHEDULE_TZ || DEFAULT_TZ;

  if (!cron.validate(expression)) {
    console.error(
      `[scheduler] Expresión cron inválida (${expression}); scheduler NO iniciado.`,
    );
    return null;
  }

  const task = cron.schedule(
    expression,
    () => {
      runDailySync("cron").catch((err) =>
        console.error("[scheduler] Error no capturado en runDailySync:", err),
      );
    },
    { timezone },
  );

  console.log(
    `[scheduler] Programado: "${expression}" (${timezone}). Sync diario stock + compras.`,
  );
  return task;
}

module.exports = { startScheduler, runDailySync, isSyncRunning };

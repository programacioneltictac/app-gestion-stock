/**
 * Scheduler de sincronización automática.
 *
 * Corre ambos syncs en SECUENCIA:
 *   1. Stock (syncAllBranches)  — primero
 *   2. Compras (syncCompras)    — después
 *
 * Diseño / decisiones:
 *  - Hora por defecto: 06:00 hora Argentina. node-cron maneja la timezone de
 *    forma nativa (incluido cualquier cambio horario), así NO hay que traducir
 *    a UTC ni calcular DST a mano. Render corre en UTC; la timezone resuelve eso.
 *  - Llama a las funciones internas directo (sin pasar por HTTP/JWT): es código
 *    del propio backend, no necesita autenticarse contra sí mismo.
 *  - Lock en memoria compartido (utils/syncLock): si una corrida aún no terminó,
 *    el siguiente disparo del cron no arranca, y los syncs manuales / import CSV
 *    responden 409 en vez de correr en paralelo (dos corridas a la vez harían
 *    UPDATE stock=0 + re-acumular pisándose). (1 instancia.)
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
 *  - SYNC_SCHEDULE_CRON_2   (2º cron OPCIONAL; vacío = no se programa nada.
 *                            Pensado para un refresco de media jornada L-V:
 *                            '0 14 * * 1-5' = 14:00 de lunes a viernes. Su
 *                            razón de ser principal es la liberación de ítems
 *                            pedidos por stock real: con un solo sync diario un
 *                            chip "Pedido a..." puede tardar hasta 24 h en
 *                            soltarse; con el 2º se libera el mismo día.)
 *  - SYNC_SCHEDULE_TZ       (timezone, default 'America/Argentina/Buenos_Aires';
 *                            aplica a AMBOS crons)
 *  - IDUO_COMPRAS_MONTHS_BACK gobierna el rango de compras.
 */
const cron = require("node-cron");
const { syncAllBranches } = require("./syncService");
const { syncCompras } = require("./comprasService");
const { runExclusive, isSyncRunning, getSyncRunStatus } = require("./syncLock");

const DEFAULT_CRON = "0 6 * * *"; // 06:00
const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

/**
 * Corre stock y luego compras en secuencia. Captura todo: el scheduler NUNCA
 * debe tumbar el proceso por un error de sync. Devuelve un resumen.
 */
async function runDailySync(trigger = "cron") {
  const run = await runExclusive(`automático (${trigger})`, (startedAt) =>
    executeSync(trigger, startedAt),
  );
  if (run.busy) {
    console.warn(
      `[scheduler] Sync ya en curso (${run.status.label}); se omite el disparo (${trigger}).`,
    );
    return { skipped: true, ...run.status };
  }
  return run.result;
}

async function executeSync(trigger, startedAt) {
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
  return result;
}

/**
 * Registra el cron. Idempotente-ish: pensado para llamarse una vez al arrancar
 * el server. Devuelve la tarea programada (o null si está deshabilitado).
 */
function startScheduler() {
  const timezone = process.env.SYNC_SCHEDULE_TZ || DEFAULT_TZ;

  // Cron principal (diario) + cron secundario OPCIONAL. El secundario solo se
  // programa si la env var trae una expresión: vacía o ausente = no existe.
  const schedules = [
    { label: "diario", expression: process.env.SYNC_SCHEDULE_CRON || DEFAULT_CRON },
    { label: "secundario", expression: (process.env.SYNC_SCHEDULE_CRON_2 || "").trim() },
  ].filter((s) => s.expression);

  const tasks = [];
  for (const { label, expression } of schedules) {
    if (!cron.validate(expression)) {
      // Una expresión inválida no debe impedir que la otra se programe.
      console.error(
        `[scheduler] Expresión cron inválida (${label}: "${expression}"); ese cron NO se programa.`,
      );
      continue;
    }

    const task = cron.schedule(
      expression,
      () => {
        runDailySync(`cron:${label}`).catch((err) =>
          console.error("[scheduler] Error no capturado en runDailySync:", err?.message || err),
        );
      },
      { timezone },
    );

    console.log(
      `[scheduler] Programado (${label}): "${expression}" (${timezone}). Sync stock + compras.`,
    );
    tasks.push(task);
  }

  if (tasks.length === 0) {
    console.error("[scheduler] Ningún cron válido; scheduler NO iniciado.");
    return null;
  }

  // Compat: con un solo cron devuelve la tarea (como antes); con dos, el array.
  return tasks.length === 1 ? tasks[0] : tasks;
}

module.exports = { startScheduler, runDailySync, isSyncRunning, getSyncRunStatus };

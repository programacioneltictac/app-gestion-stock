const { analyzeStockCsv, importStockCsv } = require("../utils/importService");
const { handleControllerError } = require("../utils/errorHelper");
const { getSyncRunStatus } = require("../utils/scheduler");

// Errores del parseo/validacion que son culpa del archivo, no del servidor:
// se responden 400 con el mensaje tal cual para que el usuario sepa que corregir.
const USER_ERROR_CODES = new Set([
  "CSV_NO_HEADER",
  "CSV_NO_BRANCH",
  "CSV_NO_ROWS",
  "CSV_SCIENTIFIC_NOTATION",
  "BRANCH_NOT_FOUND",
  "BRANCH_MISMATCH",
]);

const respondUserError = (res, error) => {
  if (!USER_ERROR_CODES.has(error.code)) return false;
  res.status(400).json({
    status: "error",
    code: error.code,
    message: error.message,
    details: error.details || undefined,
  });
  return true;
};

/**
 * El body llega como texto plano (Content-Type: text/csv). Se toma como Buffer
 * para que el parser lo decodifique en latin1: el CSV de IDUO trae enies y en
 * UTF-8 se leerian rotos.
 */
const getCsvBuffer = (req) => {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "latin1");
  return null;
};

/**
 * Corta el pedido con 409 si el sync automatico esta corriendo.
 * Import y sync hacen lo mismo (resetear stock y re-acumular): si corren a la
 * vez se pisan. Mismo criterio que syncController.
 */
const rejectIfSyncRunning = (res) => {
  const status = getSyncRunStatus();
  if (!status.running) return false;

  console.warn(
    `[import-csv] Pedido rechazado: sync automatico en curso (${status.elapsedText}).`,
  );
  res.status(409).json({
    status: "busy",
    message: `Sync automatico en curso (${status.elapsedText}). Esperá ~${status.remainingMin} min y volvé a intentar.`,
    ...status,
  });
  return true;
};

// POST /api/import/stock/preview — analiza el CSV SIN escribir en la BD
const previewStockCsv = async (req, res) => {
  try {
    const buf = getCsvBuffer(req);
    if (!buf || buf.length === 0) {
      return res
        .status(400)
        .json({ status: "error", message: "No se recibio el archivo CSV." });
    }

    const analysis = await analyzeStockCsv(buf);
    const { _rows, _categoryIds, ...summary } = analysis;
    res.json({ status: "success", ...summary });
  } catch (error) {
    if (respondUserError(res, error)) return;
    handleControllerError(res, error, "Error analizando el CSV de stock:");
  }
};

// POST /api/import/stock — importa el CSV a la BD (paso 2, tras confirmar)
const commitStockCsv = async (req, res) => {
  try {
    if (rejectIfSyncRunning(res)) return;

    const buf = getCsvBuffer(req);
    if (!buf || buf.length === 0) {
      return res
        .status(400)
        .json({ status: "error", message: "No se recibio el archivo CSV." });
    }

    // El front reenvia el archivo y la sucursal que se le mostro en la
    // previsualizacion: si no coinciden, se aborta (evita importar el CSV
    // equivocado despues de confirmar).
    const expectedBranchId = req.query.branch_id || req.get("X-Branch-Id");

    console.log(
      `[import-csv] Importacion iniciada por: ${req.user.username}${expectedBranchId ? ` (sucursal esperada ${expectedBranchId})` : ""}`,
    );

    const result = await importStockCsv(buf, { expectedBranchId });
    res.json({ status: "success", ...result });
  } catch (error) {
    if (respondUserError(res, error)) return;
    handleControllerError(res, error, "Error importando el CSV de stock:");
  }
};

module.exports = { previewStockCsv, commitStockCsv };

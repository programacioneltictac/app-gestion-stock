const axios = require("axios");

/**
 * Cliente HTTP de la API de IDUO, compartido por el sync de stock
 * (syncService) y el de compras (comprasService).
 *
 * Resuelve lo común a ambos: header Token, respuesta sin comprimir, error de
 * payload (`hayerror`) y reintentos ante errores transitorios. La forma de la
 * respuesta la valida cada servicio con `validate`.
 */

// Valor numérico de una env var, o `fallback` si falta o no es un número.
// Sin esto una env var ausente daba NaN: sin timeout, ningún intento de fetch,
// o 0 sucursales sincronizadas reportadas como éxito. (Respeta un "0" explícito.)
const envNumber = (name, fallback) => {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) ? n : fallback;
};

const API_TIMEOUT_MS = envNumber("EXTERNAL_API_TIMEOUT_MS", 480000);
const API_RETRY_ATTEMPTS = envNumber("EXTERNAL_API_RETRIES", 2);
const API_RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Error de forma de respuesta que conviene reintentar: la API a veces, ante un
 * hipo puntual, responde algo inesperado sin `hayerror` (objeto vacío, "",
 * HTML de error). Es intermitente, misma familia que "incorrect header check".
 */
function retryableError(message, code) {
  const err = new Error(message);
  err.code = code;
  err.retryable = true;
  return err;
}

/** ¿El error es transitorio (timeout, conexión, respuesta corrupta, 5xx)? */
function isTransient(err) {
  return (
    err.retryable === true ||
    err.code === "ECONNABORTED" || // timeout de axios
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "Z_DATA_ERROR" || // descompresión: respuesta corrupta
    err.code === "Z_BUF_ERROR" ||
    /incorrect header check/i.test(err.message || "") ||
    Boolean(err.response && err.response.status >= 500)
  );
}

/**
 * GET a la API de IDUO con reintentos.
 * Errores de payload (`hayerror`) NO se reintentan: son determinísticos.
 * @param {string} url - URL completa (query string armado a mano por cada
 *   servicio, para no encodear los corchetes de `idproducto[0]`).
 * @param {Object} opts
 * @param {string} opts.token - Valor del header Token.
 * @param {Function} opts.validate - Recibe `response.data` y devuelve el
 *   resultado; ante una forma inválida debe lanzar `retryableError`.
 * @param {string} [opts.errorPrefix] - Prefijo del mensaje ante `hayerror`.
 * @param {string} [opts.label] - Etiqueta del log de reintentos (ej. "compras").
 */
async function iduoGet(url, { token, validate, errorPrefix = "Error de API externa", label = "" }) {
  let lastError;
  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS + 1; attempt++) {
    try {
      const response = await axios.get(url, {
        // Accept-Encoding: identity + decompress:false: pedimos la respuesta SIN
        // comprimir. La API a veces declara gzip pero manda bytes inválidos,
        // lo que rompe la descompresión con "incorrect header check" (Z_DATA_ERROR).
        headers: { Token: token, "Accept-Encoding": "identity" },
        decompress: false,
        timeout: API_TIMEOUT_MS,
      });

      const data = response.data;
      if (data && data.hayerror) {
        throw new Error(`${errorPrefix}: ${data.error}`);
      }
      return validate(data);
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt > API_RETRY_ATTEMPTS) throw err;

      console.log(
        `    Reintento ${attempt}/${API_RETRY_ATTEMPTS}${label ? ` (${label})` : ""} tras error: ${err.message}`,
      );
      await sleep(API_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

module.exports = { iduoGet, retryableError, isTransient, envNumber };

const axios = require("axios");
const { pool } = require("../database/config");
const { detectBrandInName } = require("./nameParser");

/**
 * Servicio de sincronización con la API de COMPRAS a proveedores de IDUO.
 *
 * Objetivo (Nivel 1, ver plan idea-api-compras-iduo-auto-proveedores):
 *   - Poblar `suppliers` desde los comprobantes (dedup por idpersona de IDUO).
 *   - Asociar marca→proveedor SOLO para marcas conocidas y SOLO si la marca aún
 *     no tiene proveedor (rellenar vacíos, nunca pisar lo manual).
 *   - Reportar conflictos (marca con otro proveedor) y filas sin marca conocida.
 *
 * NO crea marcas nuevas. NO mueve stock. NO toca brands.supplier_id ya asignados.
 *
 * La API: host igd (mismo que el sync de stock), header Token, PAG=Listadocompras.
 * Respuesta: objeto { productos:[...], servicios, detalleslibres, sindetalles }.
 * Solo usamos `productos` (traen nombreproducto). Campos: nombrepersona, idpersona,
 * nombreproducto.
 */

const API_URL =
  process.env.IDUO_COMPRAS_API_URL ||
  "http://igd.iduo.com.ar/indexinterno.php?PAG=Listadocompras";
const API_TOKEN = process.env.IDUO_COMPRAS_API_KEY;
const API_TIMEOUT_MS = Number(process.env.EXTERNAL_API_TIMEOUT_MS) || 480000;
const API_RETRY_ATTEMPTS = Number(process.env.EXTERNAL_API_RETRIES) || 2;
const API_RETRY_DELAY_MS = 2000;
const DEFAULT_MONTHS_BACK = Number(process.env.IDUO_COMPRAS_MONTHS_BACK) || 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Trae las compras del rango [desde, hasta] (ambos Date). Devuelve el array de
 * `productos` de la respuesta. Reintenta ante errores transitorios.
 */
async function fetchComprasFromApi(desde, hasta) {
  if (!API_TOKEN) {
    throw new Error("IDUO_COMPRAS_API_KEY no está configurado en el entorno");
  }

  // Fechas de imputación (obligatorias), como params separados día/mes/año.
  let qs = `&diadesdefechaimputacion=${desde.getDate()}`;
  qs += `&mesdesdefechaimputacion=${desde.getMonth() + 1}`;
  qs += `&anodesdefechaimputacion=${desde.getFullYear()}`;
  qs += `&opcionfechaimputacionhasta=Personalizar`;
  qs += `&diahastafechaimputacion=${hasta.getDate()}`;
  qs += `&meshastafechaimputacion=${hasta.getMonth() + 1}`;
  qs += `&anohastafechaimputacion=${hasta.getFullYear()}`;

  // La URL base ya incluye "?PAG=Listadocompras", por eso se concatena con &.
  const url = `${API_URL}${qs}`;

  let lastError;
  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS + 1; attempt++) {
    try {
      const response = await axios.get(url, {
        // Mismo workaround que el sync de stock: pedir sin comprimir para evitar
        // el "incorrect header check" intermitente de la API de IDUO.
        headers: { Token: API_TOKEN, "Accept-Encoding": "identity" },
        decompress: false,
        timeout: API_TIMEOUT_MS,
      });

      const data = response.data;

      if (data && data.hayerror) {
        // Error determinístico de la API (parámetro inválido): no reintentar.
        throw new Error(`Error de API de compras: ${data.error}`);
      }

      // La respuesta válida es un objeto con `productos`. Si no llega así (hipo
      // puntual, HTML de error, vacío), lo tratamos como transitorio y reintentamos.
      if (!data || !Array.isArray(data.productos)) {
        const err = new Error("La API de compras no devolvió `productos`");
        err.code = "NON_PRODUCTOS_RESPONSE";
        throw err;
      }

      // allEmpty: la API respondió 200 con las 4 listas vacías. IDUO no devuelve
      // `hayerror` ante un token vencido/sin sesión: simplemente manda todo vacío.
      // Lo señalamos para que el reporte distinga "token inválido" de "sin compras".
      const allEmpty =
        data.productos.length === 0 &&
        (!Array.isArray(data.servicios) || data.servicios.length === 0) &&
        (!Array.isArray(data.detalleslibres) || data.detalleslibres.length === 0) &&
        (!Array.isArray(data.sindetalles) || data.sindetalles.length === 0);

      return { productos: data.productos, allEmpty };
    } catch (err) {
      lastError = err;
      const isTransient =
        err.code === "ECONNABORTED" ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "Z_DATA_ERROR" ||
        err.code === "Z_BUF_ERROR" ||
        err.code === "NON_PRODUCTOS_RESPONSE" ||
        /incorrect header check/i.test(err.message || "") ||
        (err.response && err.response.status >= 500);

      if (!isTransient || attempt > API_RETRY_ATTEMPTS) throw err;

      console.log(
        `    Reintento ${attempt}/${API_RETRY_ATTEMPTS} (compras) tras error: ${err.message}`,
      );
      await sleep(API_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

/**
 * Upsert de un proveedor por su idpersona de IDUO (external_id). Guarda el nombre
 * tal cual viene. Devuelve { id, created }.
 */
async function upsertSupplier(client, idpersona, nombrepersona) {
  // ON CONFLICT sobre el índice único parcial de external_id.
  const result = await client.query(
    `INSERT INTO suppliers (supplier_name, external_id)
     VALUES ($1, $2)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL
     DO UPDATE SET supplier_name = EXCLUDED.supplier_name, updated_at = NOW()
     RETURNING id, (xmax = 0) AS created`,
    [nombrepersona, idpersona],
  );
  return result.rows[0];
}

/**
 * Ejecuta el sync de compras. Por cada fila de `productos`:
 *   1. upsert del proveedor (por idpersona)
 *   2. detectar marca conocida en nombreproducto
 *   3. si la marca no tiene proveedor → asignar (rellenar vacío)
 *      si ya tiene OTRO proveedor → registrar conflicto (no pisar)
 *
 * @param {{ desde?: Date, hasta?: Date, monthsBack?: number }} opts
 * @returns reporte con contadores y listas para revisión.
 */
async function syncCompras(opts = {}) {
  const hasta = opts.hasta || new Date();
  const desde =
    opts.desde ||
    (() => {
      const d = new Date(hasta);
      d.setMonth(d.getMonth() - (opts.monthsBack || DEFAULT_MONTHS_BACK));
      return d;
    })();

  const startedAt = Date.now();
  const { productos: allRows, allEmpty } = await fetchComprasFromApi(desde, hasta);
  // Solo filas de dato; descartar subtotales (subtotalunidad/subtotalproducto).
  const productos = allRows.filter((r) => !r.tipo || r.tipo === "filadato");

  // Marcas conocidas (todas las activas, no solo agrupables): la asociación
  // marca→proveedor aplica a cualquier marca.
  const brandsResult = await pool.query(
    "SELECT id, brand_name, supplier_id FROM brands WHERE is_active = true",
  );
  const brands = brandsResult.rows;
  const brandSupplier = new Map(brands.map((b) => [b.id, b.supplier_id])); // estado local en memoria

  // Rubros de óptica (categories.name_keywords): un producto se considera de
  // óptica solo si su nombre TERMINA con uno de estos rubros (patrón "[MM-AA] RUBRO").
  // Esto descarta compras de otros rubros (eléctrico, etc.) y evita falsos
  // positivos de marcas cortas/numéricas (ej. "360" en "SENSOR 360º").
  const kwResult = await pool.query(
    "SELECT name_keywords FROM categories WHERE name_keywords IS NOT NULL",
  );
  const rubroKeywords = kwResult.rows
    .flatMap((r) => r.name_keywords || [])
    .map((k) => k.toUpperCase())
    .sort((a, b) => b.length - a.length); // más largos primero
  const endsWithRubro = (name) => {
    const upper = name.toUpperCase().trim();
    return rubroKeywords.some((kw) => new RegExp(`\\b${kw}\\s*$`, "i").test(upper));
  };

  const report = {
    rango: { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) },
    filas: productos.length,
    proveedoresNuevos: 0,
    proveedoresVistos: 0,
    marcasAsignadas: [], // { brand, supplier }
    conflictos: [], // { brand, actual, pretendido }
    filasFueraDeOptica: 0, // nombre no termina en rubro conocido (descartadas)
    filasSinMarca: 0,      // de óptica, pero sin marca conocida en el nombre
    filasSinProveedor: 0,
    // Aviso: la API respondió 200 pero sin NINGÚN dato (productos+servicios+
    // detalleslibres+sindetalles vacíos). Suele indicar token de compras vencido
    // o sin sesión vigente (IDUO no manda `hayerror` en ese caso).
    aviso: allEmpty
      ? "La API no devolvió datos para el rango. Verificá el token de compras (puede estar vencido o sin sesión)."
      : null,
  };

  const supplierByExternal = new Map(); // idpersona -> supplier.id (cache de esta corrida)
  const conflictKeys = new Set();
  const assignedKeys = new Set();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const row of productos) {
      const idpersona = String(row.idpersona || "").trim();
      const nombrepersona = String(row.nombrepersona || "").trim();
      const nombreproducto = String(row.nombreproducto || "").trim();

      if (!idpersona || !nombrepersona) {
        report.filasSinProveedor++;
        continue;
      }

      // Filtro de óptica: solo seguimos si el nombre TERMINA en un rubro conocido.
      // Descarta compras de otros rubros (no se dan de alta esos proveedores) y
      // evita falsos positivos de marcas cortas/numéricas.
      if (!endsWithRubro(nombreproducto)) {
        report.filasFueraDeOptica++;
        continue;
      }

      // 1. Upsert proveedor (una vez por idpersona en esta corrida).
      let supplierId = supplierByExternal.get(idpersona);
      if (supplierId === undefined) {
        const sup = await upsertSupplier(client, idpersona, nombrepersona);
        supplierId = sup.id;
        supplierByExternal.set(idpersona, supplierId);
        if (sup.created) report.proveedoresNuevos++;
        report.proveedoresVistos++;
      }

      // 2. Detectar marca conocida en el nombre del producto.
      const match = detectBrandInName(nombreproducto, brands);
      if (!match) {
        report.filasSinMarca++;
        continue;
      }

      // 3. Asignar proveedor a la marca solo si está vacía.
      const current = brandSupplier.get(match.brandId);
      if (current == null) {
        await client.query(
          "UPDATE brands SET supplier_id = $1, updated_at = NOW() WHERE id = $2 AND supplier_id IS NULL",
          [supplierId, match.brandId],
        );
        brandSupplier.set(match.brandId, supplierId);
        const key = `${match.brandId}:${supplierId}`;
        if (!assignedKeys.has(key)) {
          assignedKeys.add(key);
          report.marcasAsignadas.push({ brand: match.brandName, supplier: nombrepersona });
        }
      } else if (current !== supplierId) {
        // La marca ya tiene OTRO proveedor → conflicto, no se pisa.
        const key = `${match.brandId}:${supplierId}`;
        if (!conflictKeys.has(key)) {
          conflictKeys.add(key);
          report.conflictos.push({ brand: match.brandName, pretendido: nombrepersona });
        }
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

module.exports = { syncCompras, fetchComprasFromApi };

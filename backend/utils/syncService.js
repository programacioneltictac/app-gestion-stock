const axios = require("axios");
const { pool } = require("../database/config");
const {
  parseProductName,
  detectGroup,
  detectBrandInName,
  detectCategoryFromName,
} = require("./nameParser");
const StockControl = require("../models/StockControl");

/**
 * Servicio de sincronización con la API externa.
 * Responsabilidades:
 *   1. Consultar la API por sucursal
 *   2. Parsear y limpiar los datos recibidos
 *   3. Detectar y crear grupos automáticamente
 *   4. Hacer upsert de productos en la BD local
 *   5. Actualizar stock por sucursal en product_stock_by_branch
 */

const API_URL = "http://igd.iduo.com.ar/indexinterno.php";
const API_TOKEN = process.env.EXTERNAL_API_KEY;
// Valor numérico de una env var, o `fallback` si falta o no es un número.
// Sin esto una env var ausente daba NaN: sin timeout, ningún intento de fetch,
// o 0 sucursales sincronizadas reportadas como éxito. (Respeta un "0" explícito.)
const envNumber = (name, fallback) => {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) ? n : fallback;
};

// Defaults iguales a los de comprasService.
const API_TIMEOUT_MS = envNumber("EXTERNAL_API_TIMEOUT_MS", 480000);
const API_RETRY_ATTEMPTS = envNumber("EXTERNAL_API_RETRIES", 2);
const API_RETRY_DELAY_MS = 2000;
// Filtro de stock para la API: 'todos' trae catálogo completo;
// 'stockmayoracero' trae solo productos con stock > 0 (más rápido).
const STOCK_FILTER = process.env.SYNC_STOCK_FILTER || "stockmayoracero";
// Cantidad de sucursales a sincronizar en paralelo.
// Cada sucursal toma 1 conexión del pool y hace requests independientes a la API.
// Subir con cuidado: la API externa puede tener límites de concurrencia.
const SYNC_CONCURRENCY = Math.max(1, envNumber("SYNC_CONCURRENCY", 1));
// Pausa entre requests consecutivos a la API dentro de una misma sucursal.
// Evita ráfagas que saturen al proveedor externo.
const REQUEST_DELAY_MS = Math.max(
  0,
  Number(process.env.SYNC_REQUEST_DELAY_MS) || 0,
);

// Blindaje de rubro: el sufijo del NOMBRE decide la categoría, por encima del
// rubro por el que la API devolvió el producto. Protege contra productos que
// IDUO cuelga de un rubro padre viejo (ver detectCategoryFromName).
// Default ACTIVADO. Se apaga desde Render con SYNC_TRUST_NAME_SUFFIX=false,
// sin necesidad de redeploy.
const TRUST_NAME_SUFFIX =
  String(process.env.SYNC_TRUST_NAME_SUFFIX || "true").toLowerCase() !== "false";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Obtiene productos desde la API externa para una sucursal/categoría dados.
 * @param {string} apiBranchCode     - ID de sucursal en la API (idsucursalgrupo[0])
 * @param {string|null} apiDepositCode - ID de depósito (solo Casa Central)
 * @param {string} apiProductId      - ID de producto padre de la categoría
 * @returns {Array} Array de productos crudos de la API
 */
async function fetchProductsFromApi(
  apiBranchCode,
  apiDepositCode,
  apiProductId,
) {
  const today = new Date();
  const dia = today.getDate();
  const mes = today.getMonth() + 1;
  const ano = today.getFullYear();

  // Construir query string manualmente para evitar encoding de corchetes
  let qs = `PAG=Listadostock&opcionfechahasta=Personalizar&diahasta=${dia}&meshasta=${mes}&anohasta=${ano}`;
  qs += `&mostrarpreciocosto=1&filtrostockcero=${STOCK_FILTER}`;
  qs += `&idsucursalgrupo[0]=${apiBranchCode}`;
  qs += `&idproducto[0]=${apiProductId}`;

  if (apiDepositCode) {
    qs += `&iddeposito[0]=${apiDepositCode}`;
  }

  // Reintentar ante errores transitorios (timeout, ECONN*, 5xx).
  // Errores de payload de la API (hayerror) NO se reintentan: son determinísticos.
  let lastError;
  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS + 1; attempt++) {
    try {
      const response = await axios.get(`${API_URL}?${qs}`, {
        // Accept-Encoding: identity + decompress:false: pedimos la respuesta SIN
        // comprimir. La API a veces declara gzip pero manda bytes inválidos,
        // lo que rompe la descompresión con "incorrect header check" (Z_DATA_ERROR).
        headers: { Token: API_TOKEN, "Accept-Encoding": "identity" },
        decompress: false,
        timeout: API_TIMEOUT_MS,
      });

      if (response.data && response.data.hayerror) {
        throw new Error(`Error de API externa: ${response.data.error}`);
      }

      if (!Array.isArray(response.data)) {
        // La API a veces, ante un hipo puntual, responde algo que no es un array
        // ni trae `hayerror` (objeto vacío, "", HTML de error). Es intermitente
        // (misma familia que "incorrect header check"), así que lo marcamos como
        // transitorio para que se reintente en vez de perder la categoría.
        const err = new Error("La API no devolvió un array de productos");
        err.code = "NON_ARRAY_RESPONSE";
        throw err;
      }

      return response.data;
    } catch (err) {
      lastError = err;
      const isTransient =
        err.code === "ECONNABORTED" || // timeout de axios
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "Z_DATA_ERROR" || // descompresión: respuesta corrupta
        err.code === "Z_BUF_ERROR" ||
        err.code === "NON_ARRAY_RESPONSE" || // respuesta no-array sin hayerror
        /incorrect header check/i.test(err.message || "") ||
        (err.response && err.response.status >= 500);

      if (!isTransient || attempt > API_RETRY_ATTEMPTS) throw err;

      console.log(
        `    Reintento ${attempt}/${API_RETRY_ATTEMPTS} tras error: ${err.message}`,
      );
      await sleep(API_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

/**
 * Extrae los campos que nos interesan de un producto de la API.
 * @param {Object} apiProduct
 * @returns {{ externalId, productName, codigos, stock, costPrice }}
 */
function extractApiFields(apiProduct) {
  const unit =
    Array.isArray(apiProduct.unidades) && apiProduct.unidades.length > 0
      ? apiProduct.unidades[0]
      : {};

  return {
    externalId: String(apiProduct.idproducto || ""),
    productName: String(apiProduct.nombreproducto || "").trim(),
    codigos: String(apiProduct.codigos || "").trim(),
    // Un stock no numérico daba NaN y la fila se descartaba en silencio.
    stock: Math.max(0, parseInt(unit.stock ?? 0, 10) || 0),
    costPrice: parseFloat(
      (parseFloat(unit.preciocosto ?? 0) / 1.21).toFixed(2),
    ),
  };
}

/**
 * Obtiene marcas agrupables ordenadas por longitud descendente
 * (necesario para que matches de marcas compuestas tengan prioridad).
 */
async function getGroupableBrands() {
  const result = await pool.query(
    "SELECT id, brand_name FROM brands WHERE is_groupable = true AND is_active = true ORDER BY LENGTH(brand_name) DESC",
  );
  return result.rows;
}

/**
 * Obtiene TODAS las marcas activas (agrupables o no), ordenadas por longitud
 * descendente. Se usa para resolver products.brand_id por el nombre, incluyendo
 * marcas no agrupables (ej. METAL ECONOMICO) que detectGroup no detecta.
 */
async function getAllBrands() {
  const result = await pool.query(
    "SELECT id, brand_name FROM brands WHERE is_active = true ORDER BY LENGTH(brand_name) DESC",
  );
  return result.rows;
}

/**
 * Sincroniza los productos de UNA sucursal iterando todas las categorías con api_product_id.
 * @param {Object} branch - Objeto branch con id, api_branch_code, api_deposit_code
 * @param {Array|null} groupableBrands - Marcas agrupables [{id, brand_name}]; si null se consultan
 * @param {Array|null} allBrands - Todas las marcas activas [{id, brand_name}]; si null se consultan
 * @returns {{ synced: number, grouped: number, errors: number }}
 */
async function syncBranch(branch, groupableBrands = null, allBrands = null) {
  const stats = { synced: 0, grouped: 0, errors: 0 };

  if (!groupableBrands) {
    groupableBrands = await getGroupableBrands();
  }
  if (!allBrands) {
    allBrands = await getAllBrands();
  }

  // Obtener categorías con api_product_id configurado.
  // name_keywords: variantes del rubro al final del nombre, para limpiar el sufijo.
  const categoriesResult = await pool.query(
    "SELECT id, category_name, api_product_id, name_keywords FROM categories WHERE api_product_id IS NOT NULL AND is_active = true",
  );
  const categories = categoriesResult.rows;

  if (categories.length === 0) {
    console.log("No hay categorías con api_product_id configurado");
    return stats;
  }

  // Índice de categorías por id, para resolver la categoría efectiva sin re-consultar.
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Mapa keyword → categoría destino, para detectCategoryFromName.
  // Sale de la query de categorías que ya se hizo arriba: no hace falta consulta nueva.
  // Ordenado por longitud descendente: "LENTES DE SOL" tiene que ganarle a "LENTE DE SOL".
  const keywordToCat = categories
    .flatMap((c) =>
      (c.name_keywords || [])
        .filter(Boolean)
        .map((kw) => ({ keyword: String(kw), categoryId: c.id })),
    )
    .sort((a, b) => b.keyword.length - a.keyword.length);

  // Recopilar productos de cada categoría junto con su category_id.
  // Se aplica REQUEST_DELAY_MS entre requests para no saturar al proveedor externo.
  const rawProducts = [];
  // Dedupe por external_id (OBLIGATORIO, no es una optimización).
  // Hay productos que la API devuelve por DOS rubros a la vez (doble padre).
  // Sin blindaje cada pasada los mandaba a un grupo distinto, así que no se
  // pisaban. Al reasignar ambas al MISMO destino, la rama agrupada de más abajo
  // acumula (`stock = stock + $3`) y sumaría el mismo stock DOS VECES.
  // Nos quedamos con la primera aparición y descartamos las repetidas.
  const seenExternalIds = new Map(); // external_id → categoría de la 1ª aparición
  let reassignedCount = 0;
  let duplicateCount = 0;
  // GUARD ANTI-VACIADO POR RUBRO: rubros que FALLARON (excepcion) en esta
  // pasada. Esos CONSERVAN su stock anterior.
  // Un rubro que responde [] NO entra aca: si otro rubro de la sucursal trajo
  // datos, la API esta sana y el [] es un vacio real (el rubro se agoto o la
  // sucursal no lo maneja) -> va a 0. Tratarlo como fallo lo dejaba CONGELADO
  // con la foto vieja para siempre (caso Santa Lucia ORTOPEDIA, 2026-10-20).
  // El token de IDUO vencido (200 con [] en TODOS los rubros) lo frena el
  // guard global de mas abajo (EMPTY_API_RESPONSE), no este.
  const failedCategoryIds = new Set();

  for (let idx = 0; idx < categories.length; idx++) {
    const category = categories[idx];
    try {
      const products = await fetchProductsFromApi(
        branch.api_branch_code,
        branch.api_deposit_code,
        category.api_product_id,
      );
      console.log(
        `  [${branch.name}] Categoría ${category.category_name}: ${products.length} productos`,
      );
      for (const p of products) {
        const { externalId, productName } = extractApiFields(p);

        // Categoría efectiva: la que declara el sufijo del nombre le gana a la
        // del rubro consultado. null = el nombre no declara rubro conocido →
        // se respeta lo que dijo la API.
        let effective = category;
        if (TRUST_NAME_SUFFIX) {
          const fromName = detectCategoryFromName(productName, keywordToCat);
          if (fromName && fromName.categoryId !== category.id) {
            const target = categoryById.get(fromName.categoryId);
            if (target) {
              effective = target;
              reassignedCount++;
            }
          }
        }

        if (externalId) {
          const prev = seenExternalIds.get(externalId);
          if (prev) {
            // Ya lo trajimos por otro rubro: descartar para no inflar el stock.
            duplicateCount++;
            continue;
          }
          seenExternalIds.set(externalId, effective.category_name);
        }

        // INVARIANTE: parseProductName, detectGroup y category_id tienen que
        // recibir LA MISMA categoría. Si se desincronizan, los filtros
        // `( p.category_id = $2 OR cg.id = $2 )` muestran el producto en el
        // rubro equivocado o en los dos. Por eso se sellan las tres juntas.
        rawProducts.push({
          // Normalizado aca: persistBranchStock recibe campos ya extraidos,
          // no el crudo de la API, para que el CSV pueda alimentarlo igual.
          fields: extractApiFields(p),
          categoryId: effective.id,
          categoryName: effective.category_name,
          nameKeywords: effective.name_keywords || [],
        });
      }
    } catch (err) {
      console.error(
        `  [${branch.name}] Error en categoría ${category.category_name}:`,
        err.message,
      );
      stats.errors++;
      failedCategoryIds.add(category.id);
    }

    // Pausa entre categorías (no después de la última)
    if (REQUEST_DELAY_MS > 0 && idx < categories.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  // Con la API de IDUO sana, lo esperado es 0 reasignados y 0 duplicados.
  // Si estos contadores suben, IDUO volvió a colgar productos de un rubro viejo.
  if (TRUST_NAME_SUFFIX && (reassignedCount > 0 || duplicateCount > 0)) {
    console.log(
      `  [${branch.name}] Blindaje de rubro: ${reassignedCount} producto(s) reasignado(s) por el sufijo del nombre, ${duplicateCount} duplicado(s) por doble rubro descartado(s)`,
    );
  }

  // Rubros que fallaron: se descartan TAMBIEN las filas que el sufijo del
  // nombre reasigno HACIA ellos desde un rubro que si respondio. Ese rubro no
  // se resetea (conserva su foto anterior) y en las filas de grupo el stock se
  // ACUMULA (`stock = stock + $3`): sumarle productos encima del valor viejo
  // inflaria el stock. Mejor el rubro entero con la foto anterior, coherente.
  let preservedCategoryIds = null; // null = reset total (todos respondieron)
  if (failedCategoryIds.size > 0) {
    const before = rawProducts.length;
    for (let i = rawProducts.length - 1; i >= 0; i--) {
      if (failedCategoryIds.has(rawProducts[i].categoryId)) rawProducts.splice(i, 1);
    }
    const preservedNames = categories
      .filter((c) => failedCategoryIds.has(c.id))
      .map((c) => c.category_name);
    stats.preserved_categories = preservedNames;
    console.warn(
      `  [${branch.name}] ⚠️ Rubro(s) con error, se CONSERVA el stock anterior: ${preservedNames.join(", ")}` +
        (before > rawProducts.length
          ? ` (${before - rawProducts.length} fila(s) reasignada(s) hacia ellos descartada(s))`
          : ""),
    );
    preservedCategoryIds = categories
      .filter((c) => !failedCategoryIds.has(c.id))
      .map((c) => c.id);
  }

  // GUARD anti-vaciado: si NINGUNA categoría devolvió productos, NO tocar la BD.
  // El sync resetea el stock a 0 y lo re-acumula desde la API; si la API vino
  // vacía (token de IDUO vencido → responde 200 con [] sin `hayerror`, o API
  // caída → todas las categorías fallan), re-acumular nada dejaría TODO el stock
  // de la sucursal en 0 (y propagaría ese 0 a los controles activos) commiteando
  // "con éxito". Una sucursal real siempre trae algo de alguna categoría; que las
  // 7 den 0 a la vez no es un estado de negocio válido. Abortamos sin escribir,
  // dejando el stock previo intacto, y marcamos error para que quede en el log.
  if (rawProducts.length === 0) {
    const err = new Error(
      "La API no devolvió productos para ninguna categoría: stock NO actualizado (posible token de IDUO vencido o API caída). Se preserva el stock anterior.",
    );
    err.code = "EMPTY_API_RESPONSE";
    throw err;
  }

  return persistBranchStock(branch, rawProducts, {
    groupableBrands,
    allBrands,
    stats,
    resetCategoryIds: preservedCategoryIds,
  });
}

/**
 * Escribe en la BD el stock de UNA sucursal a partir de filas YA NORMALIZADAS.
 *
 * Es el tramo comun a las dos fuentes de datos: la API de IDUO (syncBranch) y
 * la importacion manual de CSV (importService). Todo lo que hay aca abajo —
 * upsert de grupos y productos, promedio incremental de costo, actualizacion
 * de los controles activos y liberacion de items pedidos — vale igual venga de
 * donde venga el dato, asi que vive en un solo lugar. Duplicarlo para el CSV
 * habria dejado dos pipelines divergiendo con el tiempo.
 *
 * @param {Object} branch - { id, name }
 * @param {Array} rows - Filas normalizadas. Cada una:
 *   { fields: { externalId, productName, codigos, stock, costPrice },
 *     categoryId, categoryName, nameKeywords }
 *   `externalId` puede venir null (el CSV no lo trae): en ese caso la identidad
 *   la resuelve `resolveProductId` por product_code + categoria.
 * @param {Object} opts
 *   @param {Array} opts.groupableBrands - Marcas agrupables
 *   @param {Array} opts.allBrands - Todas las marcas activas
 *   @param {Object} [opts.stats] - Acumulador { synced, grouped, errors }
 *   @param {Array<number>|null} [opts.resetCategoryIds] - GUARD ANTI-VACIADO POR
 *     RUBRO. Si viene, el reset a 0 se acota a esas categorias y los rubros
 *     ausentes CONSERVAN su stock anterior en vez de quedar en 0. null = reset
 *     total de la sucursal. El sync por API pasa null cuando respondieron todos
 *     los rubros, y la lista de los que respondieron (aunque sea con []) cuando
 *     alguno fallo. El CSV pasa los rubros presentes en el archivo.
 *   @param {Date|null} [opts.syncedAt] - Momento al que corresponde la FOTO de
 *     stock, que es lo que se guarda en `last_sync_at`. Por API es "ahora"
 *     (se consulta en vivo) y por eso el default es NOW(). Por CSV es la fecha
 *     del header del export ("Fecha: 08/09/2026 13:32:36"), que puede ser MUY
 *     anterior al momento de importarlo: guardar NOW() ahi mentiria sobre la
 *     antiguedad del dato en la pantalla de control.
 * @returns {{ synced, grouped, errors }}
 */
async function persistBranchStock(branch, rows, opts = {}) {
  const {
    groupableBrands = [],
    allBrands = [],
    resetCategoryIds = null,
    syncedAt = null,
  } = opts;
  // Se interpola como $n en cada UPDATE/INSERT: con null, COALESCE cae en NOW().
  const syncTs = syncedAt || null;
  const stats = opts.stats || { synced: 0, grouped: 0, errors: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Poner stock=0 y resetear acumuladores de costo antes de acumular.
    // Se usa UPDATE en lugar de DELETE para preservar los IDs referenciados por stock_controls.
    //
    // GUARD ANTI-VACIADO POR RUBRO: con `resetCategoryIds` el reset se limita a
    // los rubros que la fuente efectivamente trajo. Un CSV manual puede traer
    // solo los rubros con stock, y por API un rubro puede fallar:
    // sin este recorte, ese rubro quedaria en 0 en la sucursal y lo propagaria
    // a los controles activos, commiteando "con exito".
    if (resetCategoryIds && resetCategoryIds.length > 0) {
      await client.query(
        `UPDATE product_stock_by_branch psb
         SET stock = 0, avg_cost = 0, cost_item_count = 0,
             last_sync_at = COALESCE($3::timestamp, NOW())
         WHERE psb.branch_id = $1
           AND (
             -- fila de producto suelto: su categoria decide
             EXISTS (
               SELECT 1 FROM products p
               WHERE p.id = psb.product_id AND p.category_id = ANY($2::int[])
             )
             -- fila de grupo: el rubro del grupo decide
             OR EXISTS (
               SELECT 1 FROM product_groups g
               JOIN categories c ON c.category_name = g.category_type
               WHERE g.id = psb.group_id AND c.id = ANY($2::int[])
             )
           )`,
        [branch.id, resetCategoryIds, syncTs],
      );
    } else {
      await client.query(
        `UPDATE product_stock_by_branch
         SET stock = 0, avg_cost = 0, cost_item_count = 0,
             last_sync_at = COALESCE($2::timestamp, NOW())
         WHERE branch_id = $1`,
        [branch.id, syncTs],
      );
    }

    // Cache de grupos ya creados en esta sync para no re-consultar
    const groupCache = {};

    for (const {
      fields,
      categoryId: currentCategoryId,
      categoryName: currentCategoryName,
      nameKeywords: currentNameKeywords,
    } of rows) {
      // SAVEPOINT por iteracion: si un producto falla (ej: UNIQUE violation),
      // se hace ROLLBACK solo de ese producto y la transaccion sigue viva
      // para los siguientes. Sin esto, un solo error envenena toda la sync.
      await client.query("SAVEPOINT sp_product");
      try {
        const { externalId, productName, codigos, stock, costPrice } = fields;

        // Sin nombre no hay nada que hacer. `externalId` puede faltar (CSV):
        // en ese caso la identidad se resuelve mas abajo por product_code.
        if (!productName || (!externalId && !codigos)) {
          await client.query("RELEASE SAVEPOINT sp_product");
          continue;
        }

        // El rubro lo aporta la categoría del request (no se adivina del nombre).
        // Los keywords solo se usan para limpiar el sufijo "MM-AA RUBRO" del nombre.
        const { cleanName } = parseProductName(productName, currentNameKeywords);
        const groupInfo = detectGroup(
          cleanName,
          currentCategoryName,
          groupableBrands,
        );

        // Marca del producto (products.brand_id): si está agrupado, la marca del
        // grupo; si no, se busca la marca conocida en el nombre (cubre marcas no
        // agrupables como METAL ECONOMICO). Puede quedar null si no hay marca conocida.
        let brandId = groupInfo.brandId || null;
        if (!brandId) {
          const brandMatch = detectBrandInName(cleanName, allBrands);
          if (brandMatch) brandId = brandMatch.brandId;
        }

        // --- Resolver group_id si corresponde ---
        let groupId = null;
        if (groupInfo.isGrouped) {
          const cacheKey = groupInfo.groupKey;

          if (!groupCache[cacheKey]) {
            // Upsert del grupo
            const groupResult = await client.query(
              `INSERT INTO product_groups (brand_id, brand_keyword, category_type, display_name, group_key)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (group_key) DO UPDATE
                 SET brand_id      = EXCLUDED.brand_id,
                     brand_keyword = EXCLUDED.brand_keyword,
                     display_name  = EXCLUDED.display_name,
                     updated_at    = NOW()
               RETURNING id`,
              [
                groupInfo.brandId,
                groupInfo.brandKeyword,
                currentCategoryName,
                groupInfo.displayName,
                groupInfo.groupKey,
              ],
            );
            groupCache[cacheKey] = groupResult.rows[0].id;
            stats.grouped++;
          }

          groupId = groupCache[cacheKey];
        }

        // --- Upsert del producto (incluye cost_price) ---
        // Dos identidades posibles segun la fuente:
        //   API  -> external_id (idproducto de IDUO), la identidad canonica.
        //   CSV  -> product_code, porque el export de IDUO NO trae idproducto.
        // El CSV desambigua ademas por categoria: hay codigos repetidos entre
        // rubros (mismo articulo cargado dos veces en IDUO, ej. MAX POLAR
        // 281347 que existe como ARMAZON y como LENTE DE SOL).
        const upsertValues = [
          productName,
          codigos,
          externalId,
          cleanName,
          groupId,
          groupInfo.isGrouped,
          currentCategoryId,
          brandId,
          costPrice > 0 ? costPrice : null,
        ];
        const UPSERT_SET = `SET product_name  = EXCLUDED.product_name,
                 product_code  = EXCLUDED.product_code,
                 display_name  = EXCLUDED.display_name,
                 group_id      = EXCLUDED.group_id,
                 is_grouped    = EXCLUDED.is_grouped,
                 category_id   = EXCLUDED.category_id,
                 brand_id      = EXCLUDED.brand_id,
                 cost_price    = EXCLUDED.cost_price,
                 last_sync_at  = NOW(),
                 updated_at    = NOW()`;

        let productId;
        if (externalId) {
          const productResult = await client.query(
            `INSERT INTO products
               (product_name, product_code, external_id, display_name,
                group_id, is_grouped, category_id, brand_id, cost_price, last_sync_at, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), true)
             ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO UPDATE
               ${UPSERT_SET}
             RETURNING id`,
            upsertValues,
          );
          productId = productResult.rows[0]?.id;
        } else {
          // Sin external_id: buscar por product_code + categoria. No se puede
          // usar ON CONFLICT porque product_code NO tiene indice unico (y no
          // debe tenerlo: el mismo codigo existe legitimamente en dos rubros).
          //
          // OJO: `products.product_code` puede guardar VARIOS codigos separados
          // por coma ("109068, 737592" — hasta 4 en un mismo campo, 152 productos
          // activos), porque asi los devuelve la API en `codigos`. El CSV, en
          // cambio, trae UN solo codigo por fila. Comparar por igualdad exacta
          // dejaba a esos productos sin matchear: se creaba un duplicado y el
          // original quedaba en 0 (caso OPTIC 100 PASTA LEJOS, 434 unidades).
          // Por eso se compara contra CADA codigo del campo.
          //
          // Ademas se comparan los codigos NUMERICOS sin ceros a la izquierda:
          // la BD guarda "006619" y el CSV trae "6619" para el mismo producto
          // (1091 productos activos tienen ceros adelante). La comparacion
          // ltrim solo se aplica cuando AMBOS lados son numericos, para no
          // tocar codigos alfanumericos como "AC2+0.50" u "ORT00430".
          //
          // Los espacios se sacan de AMBOS lados: si solo se sacan del campo,
          // un codigo como "AO ONE DAY" nunca matchea y cada import crea una
          // copia nueva (pasaron 7 copias de ACUVUE y OPTIMA).
          const existing = await client.query(
            `SELECT id FROM products
             WHERE category_id = $2 AND is_active = true
               AND EXISTS (
                 SELECT 1
                 FROM unnest(string_to_array(replace(product_code, ' ', ''), ',')) AS pc
                 WHERE pc = replace($1, ' ', '')
                    OR (pc ~ '^[0-9]+$' AND replace($1, ' ', '') ~ '^[0-9]+$'
                        AND ltrim(pc, '0') = ltrim(replace($1, ' ', ''), '0'))
               )
             ORDER BY external_id NULLS LAST, id
             LIMIT 1`,
            [codigos, currentCategoryId],
          );

          if (existing.rows[0]) {
            const updated = await client.query(
              `UPDATE products
               SET product_name = $1,
                   display_name = $2,
                   group_id     = $3,
                   is_grouped   = $4,
                   brand_id     = $5,
                   cost_price   = $6,
                   last_sync_at = NOW(),
                   updated_at   = NOW()
               WHERE id = $7
               RETURNING id`,
              [
                productName,
                cleanName,
                groupId,
                groupInfo.isGrouped,
                brandId,
                costPrice > 0 ? costPrice : null,
                existing.rows[0].id,
              ],
            );
            productId = updated.rows[0]?.id;
          } else {
            // Producto nuevo: se crea con external_id NULL. Cuando IDUO libere
            // la API, el sync lo va a encontrar por su idproducto real y lo
            // insertara aparte; la limpieza de ese solapamiento es manual y
            // esta documentada en el flujo de contingencia.
            const inserted = await client.query(
              `INSERT INTO products
                 (product_name, product_code, external_id, display_name,
                  group_id, is_grouped, category_id, brand_id, cost_price, last_sync_at, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), true)
               RETURNING id`,
              upsertValues,
            );
            productId = inserted.rows[0]?.id;
            stats.created = (stats.created || 0) + 1;
          }
        }

        if (!productId) {
          await client.query("RELEASE SAVEPOINT sp_product");
          continue;
        }

        // --- Upsert del stock por sucursal (incluye costos) ---
        if (groupInfo.isGrouped && groupId) {
          // Para grupos: acumular stock y calcular promedio incremental de costo.
          // Formula: nuevo_avg = (avg_actual * count + costo_nuevo) / (count + 1)
          // Solo se incluye en el promedio si el producto tiene costo > 0.
          await client.query(
            `INSERT INTO product_stock_by_branch
               (branch_id, group_id, stock, display_name, avg_cost, cost_item_count, last_sync_at)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, NOW()))
             ON CONFLICT (branch_id, group_id) DO UPDATE
               SET stock            = product_stock_by_branch.stock + $3,
                   display_name     = EXCLUDED.display_name,
                   avg_cost         = CASE
                     WHEN $5 IS NOT NULL AND $5 > 0 THEN
                       ROUND(
                         (COALESCE(product_stock_by_branch.avg_cost, 0) * product_stock_by_branch.cost_item_count + $5)
                         / (product_stock_by_branch.cost_item_count + 1)
                       , 2)
                     ELSE product_stock_by_branch.avg_cost
                   END,
                   cost_item_count  = CASE
                     WHEN $5 IS NOT NULL AND $5 > 0
                     THEN product_stock_by_branch.cost_item_count + 1
                     ELSE product_stock_by_branch.cost_item_count
                   END,
                   last_sync_at     = COALESCE($7::timestamp, NOW())`,
            [
              branch.id,
              groupId,
              stock,
              groupInfo.displayName,
              costPrice > 0 ? costPrice : null,
              costPrice > 0 ? 1 : 0,
              syncTs,
            ],
          );
        } else {
          // Para productos individuales: stock y costo directo
          await client.query(
            `INSERT INTO product_stock_by_branch
               (branch_id, product_id, stock, display_name, avg_cost, cost_item_count, last_sync_at)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, NOW()))
             ON CONFLICT (branch_id, product_id) DO UPDATE
               SET stock           = $3,
                   display_name    = EXCLUDED.display_name,
                   avg_cost        = EXCLUDED.avg_cost,
                   cost_item_count = EXCLUDED.cost_item_count,
                   last_sync_at    = COALESCE($7::timestamp, NOW())`,
            [
              branch.id,
              productId,
              stock,
              cleanName,
              costPrice > 0 ? costPrice : null,
              costPrice > 0 ? 1 : 0,
              syncTs,
            ],
          );
        }

        await client.query("RELEASE SAVEPOINT sp_product");
        stats.synced++;
      } catch (err) {
        // Rollback solo de este producto; el resto del lote sigue
        await client.query("ROLLBACK TO SAVEPOINT sp_product");
        await client.query("RELEASE SAVEPOINT sp_product");
        stats.errors++;
        console.error(
          `Error procesando producto ${fields?.externalId || fields?.codigos}:`,
          err.message,
        );
      }
    }

    // Actualizar stock_current en controles ACTIVOS (draft + completed) de esta
    // sucursal. Un control 'completed' sigue recibiendo stock real del sync (ya
    // no se edita, pero sigue vivo); solo 'discontinued' queda congelado. Los
    // umbrales de estado vienen de app_settings (con fallback 70/120) — misma
    // fuente que StockControl.upsert.
    const { orderPct, overstockPct } = await StockControl.getThresholds();
    await client.query(
      `UPDATE stock_controls
       SET stock_current   = psb.stock,
           stock_status_id = CASE
             WHEN stock_controls.stock_require = 0 THEN 2
             WHEN ROUND((psb.stock::numeric / stock_controls.stock_require::numeric) * 100) < $2  THEN 1
             WHEN ROUND((psb.stock::numeric / stock_controls.stock_require::numeric) * 100) <= $3 THEN 2
             ELSE 3
           END,
           updated_at      = NOW()
       FROM product_stock_by_branch psb,
            monthly_controls mc
       WHERE stock_controls.product_stock_id = psb.id
         AND stock_controls.monthly_control_id = mc.id
         AND mc.branch_id = $1
         AND mc.status IN ('draft', 'completed')`,
      [branch.id, orderPct, overstockPct],
    );

    // Liberar items YA FINALIZADOS: con el stock recien actualizado, un item
    // cuyo pedido ya "ingreso" debe volver a estar disponible para reiniciar el
    // ciclo (desaparece el chip "Pedido a...", vuelve a ser pedible). Se libera
    // (ordered_at/order_detail_id = NULL) el stock_control de esta sucursal que:
    //   - tiene al menos una linea en una orden VIVA (no cancelada), y
    //   - TODAS sus lineas vivas estan finalizadas: completed_at IS NOT NULL
    //     (finalizacion por item, Hub) O la orden esta en estado 'finalizado'
    //     (proveedor, que no tiene finalizacion por item).
    // Correr DESPUES del update de stock garantiza que el stock_current ya es el
    // real: si el pedido efectivamente entro, el item quedara en optimo y no se
    // repedira (sin ventana de doble pedido).
    //
    // OJO: aqui "viva" es 'no cancelada' e INCLUYE a 'finalizado' a proposito —
    // NO usar liveOrderSql(), que excluye ambos terminales. Este bloque existe
    // para detectar justamente las finalizadas y liberarlas; con liveOrderSql()
    // el EXISTS daria falso siempre y no liberaria nada. Es una red de seguridad
    // para ordenes finalizadas ANTES de este fix (Order.updateStatus ya libera
    // al pasar a un terminal) y para la finalizacion por item del Hub.
    await client.query(
      `UPDATE stock_controls sc
       SET ordered_at      = NULL,
           order_detail_id = NULL,
           updated_at      = NOW()
       FROM monthly_controls mc
       WHERE sc.monthly_control_id = mc.id
         AND mc.branch_id = $1
         AND mc.status IN ('draft', 'completed')
         AND sc.ordered_at IS NOT NULL
         -- al menos una linea en orden viva
         AND EXISTS (
           SELECT 1 FROM order_details od
           JOIN orders_controls oc ON od.order_control_id = oc.id
           WHERE od.stock_control_id = sc.id AND oc.status <> 'cancelado'
         )
         -- ninguna linea viva SIN finalizar (todas finalizadas)
         AND NOT EXISTS (
           SELECT 1 FROM order_details od
           JOIN orders_controls oc ON od.order_control_id = oc.id
           WHERE od.stock_control_id = sc.id
             AND oc.status <> 'cancelado'
             AND od.completed_at IS NULL
             AND oc.status <> 'finalizado'
         )`,
      [branch.id],
    );

    // Liberar por STOCK REAL: complemento objetivo de la liberacion anterior.
    // Un item pedido cuyo stock recien sincronizado quedo en optimo (2) o
    // sobrestock (3) tiene el faltante cubierto por los numeros, aunque nadie
    // lo haya finalizado (cubre el caso "la mercaderia entro pero nadie
    // finalizo", donde el chip quedaba trabado indefinidamente). Solo se toca
    // el control: las lineas de la orden NO se marcan (completed_at queda como
    // este) para no pisar la marca humana de gestion; la orden se cierra a
    // mano como siempre. Falso positivo aceptado: si el stock subio por otra
    // causa (devolucion, ajuste en IDUO) se libera igual, pero al quedar en
    // optimo/sobrestock no invita a repedir. Parciales (<70%, status 1) NO
    // liberan.
    const releasedByStock = await client.query(
      `UPDATE stock_controls sc
       SET ordered_at      = NULL,
           order_detail_id = NULL,
           updated_at      = NOW()
       FROM monthly_controls mc
       WHERE sc.monthly_control_id = mc.id
         AND mc.branch_id = $1
         AND mc.status IN ('draft', 'completed')
         AND sc.ordered_at IS NOT NULL
         AND sc.stock_status_id IN (2, 3)
       RETURNING sc.id`,
      [branch.id],
    );
    if (releasedByStock.rowCount > 0) {
      console.log(
        `Sucursal ${branch.name}: ${releasedByStock.rowCount} item(s) pedido(s) liberado(s) por stock cubierto (ids: ${releasedByStock.rows.map((r) => r.id).join(", ")})`,
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return stats;
}

/**
 * Sincroniza todas las sucursales que tienen api_branch_code configurado.
 * @returns {Array} Resultados por sucursal
 */
async function syncAllBranches() {
  // Obtener marcas una sola vez para reutilizar entre sucursales.
  const groupableBrands = await getGroupableBrands();
  const allBrands = await getAllBrands();

  // Obtener sucursales con códigos de API configurados
  const branchesResult = await pool.query(
    "SELECT id, name, api_branch_code, api_deposit_code FROM branches WHERE api_branch_code IS NOT NULL AND is_active = true",
  );
  const branches = branchesResult.rows;

  if (branches.length === 0) {
    return {
      message: "No hay sucursales con código de API configurado",
      results: [],
    };
  }

  const results = [];

  const syncStartTs = Date.now();
  console.log(
    `\n========== Sincronización iniciada: ${new Date(syncStartTs).toISOString()} ==========`,
  );
  console.log(`Filtro de stock: ${STOCK_FILTER}`);
  console.log(`Concurrencia: ${SYNC_CONCURRENCY} sucursales en paralelo`);
  console.log(`Delay entre categorías: ${REQUEST_DELAY_MS}ms`);
  console.log(`Sucursales a sincronizar: ${branches.length}\n`);

  // Procesa una sucursal y devuelve su resultado (no lanza: captura el error).
  // Esto permite que Promise.all del lote no se aborte por un fallo aislado.
  const processBranch = async (branch) => {
    const branchStartTs = Date.now();
    try {
      console.log(`→ Iniciando: ${branch.name}`);
      const stats = await syncBranch(branch, groupableBrands, allBrands);
      const branchElapsed = Date.now() - branchStartTs;
      console.log(
        `✓ ${branch.name}: ${stats.synced} productos, ${stats.grouped} grupos, ${stats.errors} errores [${formatDuration(branchElapsed)}]`,
      );
      return {
        branch: branch.name,
        ...stats,
        status: "ok",
        elapsed_ms: branchElapsed,
      };
    } catch (err) {
      const branchElapsed = Date.now() - branchStartTs;
      console.error(
        `✗ Error sincronizando ${branch.name} [${formatDuration(branchElapsed)}]:`,
        err.message,
      );
      return {
        branch: branch.name,
        status: "error",
        message: err.message,
        elapsed_ms: branchElapsed,
      };
    }
  };

  // Procesar en lotes de SYNC_CONCURRENCY sucursales a la vez.
  // Cada lote espera a que todas sus sucursales terminen antes de iniciar el siguiente.
  for (let i = 0; i < branches.length; i += SYNC_CONCURRENCY) {
    const batch = branches.slice(i, i + SYNC_CONCURRENCY);
    const batchNum = Math.floor(i / SYNC_CONCURRENCY) + 1;
    const totalBatches = Math.ceil(branches.length / SYNC_CONCURRENCY);
    console.log(
      `\n--- Lote ${batchNum}/${totalBatches}: ${batch.map((b) => b.name).join(", ")} ---`,
    );
    const batchResults = await Promise.all(batch.map(processBranch));
    results.push(...batchResults);
  }

  // Limpiar grupos huérfanos (marcas que pasaron a is_groupable=false).
  // Primero: eliminar filas de product_stock_by_branch del grupo huérfano
  // que NO estén referenciadas por ningún control (draft o completed).
  await pool.query(
    `DELETE FROM product_stock_by_branch
     WHERE group_id IN (
       SELECT id FROM product_groups
       WHERE id NOT IN (SELECT DISTINCT group_id FROM products WHERE group_id IS NOT NULL)
     )
     AND NOT EXISTS (
       SELECT 1 FROM stock_controls sc WHERE sc.product_stock_id = product_stock_by_branch.id
     )`,
  );

  // Luego: eliminar grupos que ya no tienen ninguna referencia en product_stock_by_branch
  const deleted = await pool.query(
    `DELETE FROM product_groups
     WHERE id NOT IN (SELECT DISTINCT group_id FROM products WHERE group_id IS NOT NULL)
       AND id NOT IN (SELECT DISTINCT group_id FROM product_stock_by_branch WHERE group_id IS NOT NULL)`,
  );
  console.log(`✓ Grupos huérfanos eliminados: ${deleted.rowCount}`);

  const syncEndTs = Date.now();
  const totalElapsed = syncEndTs - syncStartTs;
  const okCount = results.filter((r) => r.status === "ok").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  console.log(
    `\n========== Sincronización finalizada: ${new Date(syncEndTs).toISOString()} ==========`,
  );
  console.log(`Sucursales OK: ${okCount} / ${results.length} (errores: ${errorCount})`);
  if (errorCount > 0) {
    // Resaltado para revisión por logs (sync automático): listar las que fallaron
    // con su motivo. Una sucursal abortada por EMPTY_API_RESPONSE NO actualizó su
    // stock (se preservó el anterior) — señal típica de token de IDUO vencido.
    for (const r of results.filter((x) => x.status === "error")) {
      console.warn(`  ⚠️  ${r.branch}: ${r.message}`);
    }
  }
  // Sucursales OK pero con rubros conservados: el stock de esos rubros es la
  // foto del sync anterior, no la de hoy.
  for (const r of results.filter((x) => x.preserved_categories?.length)) {
    console.warn(
      `  ⚠️  ${r.branch}: rubro(s) con stock anterior conservado: ${r.preserved_categories.join(", ")}`,
    );
  }
  console.log(`Duración total: ${formatDuration(totalElapsed)}\n`);

  return { results, elapsed_ms: totalElapsed, ok_count: okCount, error_count: errorCount };
}

module.exports = {
  syncAllBranches,
  syncBranch,
  persistBranchStock,
  extractApiFields,
  fetchProductsFromApi,
  getGroupableBrands,
  getAllBrands,
};

const axios = require("axios");
const { pool } = require("../database/config");
const { parseProductName, detectGroup, detectBrandInName } = require("./nameParser");
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
const API_TIMEOUT_MS = Number(process.env.EXTERNAL_API_TIMEOUT_MS);
const API_RETRY_ATTEMPTS = Number(process.env.EXTERNAL_API_RETRIES);
const API_RETRY_DELAY_MS = 2000;
// Filtro de stock para la API: 'todos' trae catálogo completo;
// 'stockmayoracero' trae solo productos con stock > 0 (más rápido).
const STOCK_FILTER = process.env.SYNC_STOCK_FILTER || "stockmayoracero";
// Cantidad de sucursales a sincronizar en paralelo.
// Cada sucursal toma 1 conexión del pool y hace requests independientes a la API.
// Subir con cuidado: la API externa puede tener límites de concurrencia.
const SYNC_CONCURRENCY = Math.max(1, Number(process.env.SYNC_CONCURRENCY));
// Pausa entre requests consecutivos a la API dentro de una misma sucursal.
// Evita ráfagas que saturen al proveedor externo.
const REQUEST_DELAY_MS = Math.max(
  0,
  Number(process.env.SYNC_REQUEST_DELAY_MS) || 0,
);

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
    stock: Math.max(0, parseInt(unit.stock ?? 0, 10)),
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

  // Recopilar productos de cada categoría junto con su category_id.
  // Se aplica REQUEST_DELAY_MS entre requests para no saturar al proveedor externo.
  const rawProducts = [];
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
      products.forEach((p) =>
        rawProducts.push({
          raw: p,
          categoryId: category.id,
          categoryName: category.category_name,
          nameKeywords: category.name_keywords || [],
        }),
      );
    } catch (err) {
      console.error(
        `  [${branch.name}] Error en categoría ${category.category_name}:`,
        err.message,
      );
      stats.errors++;
    }

    // Pausa entre categorías (no después de la última)
    if (REQUEST_DELAY_MS > 0 && idx < categories.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Poner stock=0 y resetear acumuladores de costo antes de acumular.
    // Se usa UPDATE en lugar de DELETE para preservar los IDs referenciados por stock_controls.
    await client.query(
      `UPDATE product_stock_by_branch
       SET stock = 0, avg_cost = 0, cost_item_count = 0, last_sync_at = NOW()
       WHERE branch_id = $1`,
      [branch.id],
    );

    // Cache de grupos ya creados en esta sync para no re-consultar
    const groupCache = {};

    for (const {
      raw,
      categoryId: currentCategoryId,
      categoryName: currentCategoryName,
      nameKeywords: currentNameKeywords,
    } of rawProducts) {
      // SAVEPOINT por iteracion: si un producto falla (ej: UNIQUE violation),
      // se hace ROLLBACK solo de ese producto y la transaccion sigue viva
      // para los siguientes. Sin esto, un solo error envenena toda la sync.
      await client.query("SAVEPOINT sp_product");
      try {
        const { externalId, productName, codigos, stock, costPrice } =
          extractApiFields(raw);

        if (!externalId || !productName) {
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

        // --- Upsert del producto (incluye cost_price). RETURNING evita un SELECT extra. ---
        const productResult = await client.query(
          `INSERT INTO products
             (product_name, product_code, external_id, display_name,
              group_id, is_grouped, category_id, brand_id, cost_price, last_sync_at, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), true)
           ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO UPDATE
             SET product_name  = EXCLUDED.product_name,
                 product_code  = EXCLUDED.product_code,
                 display_name  = EXCLUDED.display_name,
                 group_id      = EXCLUDED.group_id,
                 is_grouped    = EXCLUDED.is_grouped,
                 category_id   = EXCLUDED.category_id,
                 brand_id      = EXCLUDED.brand_id,
                 cost_price    = EXCLUDED.cost_price,
                 last_sync_at  = NOW(),
                 updated_at    = NOW()
           RETURNING id`,
          [
            productName,
            codigos,
            externalId,
            cleanName,
            groupId,
            groupInfo.isGrouped,
            currentCategoryId,
            brandId,
            costPrice > 0 ? costPrice : null,
          ],
        );
        const productId = productResult.rows[0]?.id;
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
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
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
                   last_sync_at     = NOW()`,
            [
              branch.id,
              groupId,
              stock,
              groupInfo.displayName,
              costPrice > 0 ? costPrice : null,
              costPrice > 0 ? 1 : 0,
            ],
          );
        } else {
          // Para productos individuales: stock y costo directo
          await client.query(
            `INSERT INTO product_stock_by_branch
               (branch_id, product_id, stock, display_name, avg_cost, cost_item_count, last_sync_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (branch_id, product_id) DO UPDATE
               SET stock           = $3,
                   display_name    = EXCLUDED.display_name,
                   avg_cost        = EXCLUDED.avg_cost,
                   cost_item_count = EXCLUDED.cost_item_count,
                   last_sync_at    = NOW()`,
            [
              branch.id,
              productId,
              stock,
              cleanName,
              costPrice > 0 ? costPrice : null,
              costPrice > 0 ? 1 : 0,
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
          `Error procesando producto ${raw?.idproducto}:`,
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
     AND id NOT IN (
       SELECT DISTINCT product_stock_id FROM stock_controls
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
  console.log(
    `\n========== Sincronización finalizada: ${new Date(syncEndTs).toISOString()} ==========`,
  );
  console.log(`Duración total: ${formatDuration(totalElapsed)}\n`);

  return { results, elapsed_ms: totalElapsed };
}

module.exports = {
  syncAllBranches,
  syncBranch,
  fetchProductsFromApi,
  getGroupableBrands,
};

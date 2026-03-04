const axios = require("axios");
const { pool } = require("../database/config");
const { parseProductName, detectGroup } = require("./nameParser");

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

/**
 * Obtiene productos desde la API externa para una sucursal/categoría dados.
 * @param {string} apiBranchCode     - ID de sucursal en la API (idsucursalgrupo[0])
 * @param {string|null} apiDepositCode - ID de depósito (solo Casa Central)
 * @param {string} apiProductId      - ID de producto padre de la categoría
 * @returns {Array} Array de productos crudos de la API
 */
async function fetchProductsFromApi(apiBranchCode, apiDepositCode, apiProductId) {
  const today = new Date();
  const dia = today.getDate();
  const mes = today.getMonth() + 1;
  const ano = today.getFullYear();

  // Construir query string manualmente para evitar encoding de corchetes
  let qs = `PAG=Listadostock&opcionfechahasta=Personalizar&diahasta=${dia}&meshasta=${mes}&anohasta=${ano}`;
  qs += `&mostrarpreciocosto=1&filtrostockcero=todos`;
  qs += `&idsucursalgrupo[0]=${apiBranchCode}`;
  qs += `&idproducto[0]=${apiProductId}`;

  if (apiDepositCode) {
    qs += `&iddeposito[0]=${apiDepositCode}`;
  }

  const response = await axios.get(`${API_URL}?${qs}`, {
    headers: { Token: API_TOKEN },
    timeout: 60000,
  });

  // La API devuelve { hayerror: true, error: "..." } si algo falla
  if (response.data && response.data.hayerror) {
    throw new Error(`Error de API externa: ${response.data.error}`);
  }

  if (!Array.isArray(response.data)) {
    throw new Error("La API no devolvió un array de productos");
  }

  return response.data;
}

/**
 * Extrae los campos que nos interesan de un producto de la API.
 * @param {Object} apiProduct
 * @returns {{ externalId, productName, codigos, stock, costPrice }}
 */
function extractApiFields(apiProduct) {
  const unit = Array.isArray(apiProduct.unidades) && apiProduct.unidades.length > 0
    ? apiProduct.unidades[0]
    : {};

  return {
    externalId:  String(apiProduct.idproducto || ""),
    productName: String(apiProduct.nombreproducto || "").trim(),
    codigos:     String(apiProduct.codigos || "").trim(),
    stock:       parseInt(unit.stock ?? 0, 10),
    costPrice:   parseFloat(unit.preciocosto ?? 0),
  };
}

/**
 * Sincroniza los productos de UNA sucursal iterando todas las categorías con api_product_id.
 * @param {Object} branch - Objeto branch con id, api_branch_code, api_deposit_code
 * @param {Array}  groupableBrands - Marcas agrupables [{id, brand_name}]
 * @returns {{ synced: number, grouped: number, errors: number }}
 */
async function syncBranch(branch, groupableBrands) {
  const stats = { synced: 0, grouped: 0, errors: 0 };

  // Obtener categorías con api_product_id configurado
  const categoriesResult = await pool.query(
    "SELECT id, category_name, api_product_id FROM categories WHERE api_product_id IS NOT NULL AND is_active = true"
  );
  const categories = categoriesResult.rows;

  if (categories.length === 0) {
    console.log("No hay categorías con api_product_id configurado");
    return stats;
  }

  // Recopilar productos de cada categoría junto con su category_id
  const rawProducts = [];
  for (const category of categories) {
    try {
      const products = await fetchProductsFromApi(
        branch.api_branch_code,
        branch.api_deposit_code,
        category.api_product_id
      );
      console.log(`  Categoría ${category.category_name}: ${products.length} productos`);
      products.forEach(p => rawProducts.push({ raw: p, categoryId: category.id }));
    } catch (err) {
      console.error(`  Error en categoría ${category.category_name}:`, err.message);
      stats.errors++;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Resetear stock de esta sucursal antes de acumular — evita duplicar en resync
    await client.query(
      "DELETE FROM product_stock_by_branch WHERE branch_id = $1",
      [branch.id]
    );

    // Cache de grupos ya creados en esta sync para no re-consultar
    const groupCache = {};

    for (const { raw, categoryId: currentCategoryId } of rawProducts) {
      try {
        const { externalId, productName, codigos, stock, costPrice } = extractApiFields(raw);

        if (!externalId || !productName) continue;

        const { cleanName, rubro } = parseProductName(productName);
        const groupInfo = detectGroup(cleanName, rubro, groupableBrands);

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
                rubro,
                groupInfo.displayName,
                groupInfo.groupKey,
              ]
            );
            groupCache[cacheKey] = groupResult.rows[0].id;
            stats.grouped++;
          }

          groupId = groupCache[cacheKey];
        }

        // --- Upsert del producto ---
        await client.query(
          `INSERT INTO products
             (product_name, product_code, external_id, display_name,
              group_id, is_grouped, category_id, last_sync_at, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), true)
           ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO UPDATE
             SET product_name  = EXCLUDED.product_name,
                 product_code  = EXCLUDED.product_code,
                 display_name  = EXCLUDED.display_name,
                 group_id      = EXCLUDED.group_id,
                 is_grouped    = EXCLUDED.is_grouped,
                 category_id   = EXCLUDED.category_id,
                 last_sync_at  = NOW(),
                 updated_at    = NOW()`,
          [
            productName,
            codigos,
            externalId,
            cleanName,
            groupId,
            groupInfo.isGrouped,
            currentCategoryId,
          ]
        );

        // Obtener el id interno del producto
        const productResult = await client.query(
          "SELECT id FROM products WHERE external_id = $1",
          [externalId]
        );
        const productId = productResult.rows[0]?.id;
        if (!productId) continue;

        // --- Upsert del stock por sucursal ---
        if (groupInfo.isGrouped && groupId) {
          // Para productos agrupados: acumular stock y guardar display_name del grupo
          await client.query(
            `INSERT INTO product_stock_by_branch (branch_id, group_id, stock, display_name, last_sync_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (branch_id, group_id) DO UPDATE
               SET stock        = product_stock_by_branch.stock + $3,
                   display_name = EXCLUDED.display_name,
                   last_sync_at = NOW()`,
            [branch.id, groupId, stock, groupInfo.displayName]
          );
        } else {
          // Para productos individuales: guardar stock y display_name del producto
          await client.query(
            `INSERT INTO product_stock_by_branch (branch_id, product_id, stock, display_name, last_sync_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (branch_id, product_id) DO UPDATE
               SET stock        = $3,
                   display_name = EXCLUDED.display_name,
                   last_sync_at = NOW()`,
            [branch.id, productId, stock, cleanName]
          );
        }

        stats.synced++;
      } catch (err) {
        stats.errors++;
        console.error(`Error procesando producto ${raw?.idproducto}:`, err.message);
      }
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
  // Obtener marcas agrupables una sola vez
  const brandsResult = await pool.query(
    "SELECT id, brand_name FROM brands WHERE is_groupable = true AND is_active = true ORDER BY LENGTH(brand_name) DESC"
  );
  const groupableBrands = brandsResult.rows;

  // Obtener sucursales con códigos de API configurados
  const branchesResult = await pool.query(
    "SELECT id, name, api_branch_code, api_deposit_code FROM branches WHERE api_branch_code IS NOT NULL AND is_active = true"
  );
  const branches = branchesResult.rows;

  if (branches.length === 0) {
    return { message: "No hay sucursales con código de API configurado", results: [] };
  }

  const results = [];

  for (const branch of branches) {
    try {
      console.log(`Sincronizando sucursal: ${branch.name}...`);
      const stats = await syncBranch(branch, groupableBrands);
      results.push({ branch: branch.name, ...stats, status: "ok" });
      console.log(`✓ ${branch.name}: ${stats.synced} productos, ${stats.grouped} grupos, ${stats.errors} errores`);
    } catch (err) {
      results.push({ branch: branch.name, status: "error", message: err.message });
      console.error(`✗ Error sincronizando ${branch.name}:`, err.message);
    }
  }

  // Limpiar grupos huérfanos (marcas que pasaron a is_groupable=false)
  const deleted = await pool.query(
    "DELETE FROM product_groups WHERE id NOT IN (SELECT DISTINCT group_id FROM products WHERE group_id IS NOT NULL)"
  );
  console.log(`✓ Grupos huérfanos eliminados: ${deleted.rowCount}`);

  return { results };
}

module.exports = { syncAllBranches, syncBranch, fetchProductsFromApi };

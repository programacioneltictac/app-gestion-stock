/**
 * Importacion manual de stock desde CSV (plan de contingencia).
 *
 * Existe porque la API de IDUO puede quedar no disponible (bloqueo por
 * incidente de seguridad, token vencido, caida): sin ella la app se queda sin
 * datos y pierde su funcionalidad. El CSV exportado a mano desde IDUO permite
 * alimentarla igual.
 *
 * Reusa `persistBranchStock` de syncService: grupos, promedio de costo,
 * actualizacion de controles activos y liberacion de items pedidos son
 * exactamente los mismos que en el sync por API. Lo unico propio de esta via es
 * de donde salen los datos y como se resuelve la identidad del producto.
 *
 * DIFERENCIAS con el sync por API, todas deliberadas:
 *   1. Identidad por `product_code` (el export NO trae idproducto), desambiguada
 *      por la categoria que declara el sufijo del nombre.
 *   2. El rubro SIEMPRE sale del nombre: no hay "rubro consultado" del que
 *      partir. Depende de detectCategoryFromName.
 *   3. Reset a 0 acotado a los rubros presentes en el archivo (guard
 *      anti-vaciado por rubro), porque el export solo trae stock > 0 y una
 *      sucursal puede no manejar ciertos rubros.
 */

const { pool } = require("../database/config");
const { parseStockCsv } = require("./csvStockParser");
const {
  persistBranchStock,
  getGroupableBrands,
  getAllBrands,
} = require("./syncService");
const { detectCategoryFromName } = require("./nameParser");

// El P. Costo del export viene con IVA incluido; la app guarda costo neto.
// Mismo criterio que extractApiFields en syncService.
const VAT_RATE = 1.21;

/**
 * Normaliza el nombre de sucursal del CSV para compararlo con branches.name.
 * El export escribe "Nodo-hub" y la BD tiene "Nodo Hub": se ignoran guiones,
 * espacios, acentos y mayusculas.
 */
function normalizeBranchName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Resuelve la sucursal del CSV contra la BD.
 *
 * Se matchea por NOMBRE, nunca por api_branch_code: Nodo Hub y Casa Central
 * comparten el codigo 74, asi que el codigo no identifica la sucursal.
 */
async function resolveBranch(branchName) {
  const result = await pool.query(
    "SELECT id, name FROM branches WHERE is_active = true",
  );
  const target = normalizeBranchName(branchName);
  const match = result.rows.find((b) => normalizeBranchName(b.name) === target);

  if (!match) {
    const err = new Error(
      `La sucursal "${branchName}" del archivo no coincide con ninguna sucursal activa. Sucursales validas: ${result.rows.map((b) => b.name).join(", ")}.`,
    );
    err.code = "BRANCH_NOT_FOUND";
    throw err;
  }
  return match;
}

/**
 * Construye el mapa keyword -> categoria, ordenado por longitud descendente
 * ("LENTES DE SOL" tiene que ganarle a "LENTE DE SOL").
 * Mismo criterio que syncBranch.
 */
async function getKeywordToCategory() {
  const result = await pool.query(
    "SELECT id, category_name, name_keywords FROM categories WHERE is_active = true",
  );
  const categoryById = new Map(result.rows.map((c) => [c.id, c]));
  const keywordToCat = result.rows
    .flatMap((c) =>
      (c.name_keywords || [])
        .filter(Boolean)
        .map((kw) => ({ keyword: String(kw), categoryId: c.id })),
    )
    .sort((a, b) => b.keyword.length - a.keyword.length);
  return { categoryById, keywordToCat };
}

/**
 * Analiza un CSV sin escribir NADA en la BD.
 *
 * Es el paso 1 del import: el usuario ve que va a pasar (cuantos productos se
 * actualizan, cuantos se crean, como queda el stock por rubro comparado con lo
 * que hay hoy) y recien despues confirma. Sin esta previsualizacion, un archivo
 * truncado o de la sucursal equivocada se detectaria despues de haber pisado
 * los datos.
 *
 * @param {Buffer|string} content - Contenido del CSV
 * @returns {Object} resumen para mostrar en pantalla
 */
async function analyzeStockCsv(content) {
  const parsed = parseStockCsv(content);
  const branch = await resolveBranch(parsed.branchName);
  const { categoryById, keywordToCat } = await getKeywordToCategory();

  const rows = [];
  const unknownCategory = [];

  for (const row of parsed.rows) {
    const detected = detectCategoryFromName(row.productName, keywordToCat);
    if (!detected) {
      // Sin rubro en el nombre no hay forma de clasificarlo ni de desambiguar
      // su codigo. Se reporta y se excluye del import.
      unknownCategory.push({ line: row.line, productName: row.productName });
      continue;
    }
    const category = categoryById.get(detected.categoryId);
    if (!category) continue;

    rows.push({
      ...row,
      categoryId: category.id,
      categoryName: category.category_name,
      nameKeywords: category.name_keywords || [],
    });
  }

  const categoryIds = [...new Set(rows.map((r) => r.categoryId))];

  // --- Cuantos existen ya en la BD (por codigo + rubro) ---
  const codes = rows.map((r) => r.code);
  const cats = rows.map((r) => r.categoryId);
  // El campo product_code puede guardar VARIOS codigos separados por coma
  // ("109068, 737592"), porque asi los devuelve la API en `codigos`. El CSV trae
  // uno solo por fila, asi que hay que comparar contra cada uno del campo o el
  // producto se reporta como "nuevo" cuando en realidad ya existe.
  // Mismo criterio que la resolucion de identidad en persistBranchStock.
  // Y se comparan los codigos numericos sin ceros a la izquierda: la BD guarda
  // "006619" donde el CSV trae "6619". Mismo criterio que persistBranchStock.
  const existing = await pool.query(
    `SELECT DISTINCT t.code, t.cat
     FROM UNNEST($1::text[], $2::int[]) AS t(code, cat)
     JOIN products p
       ON p.category_id = t.cat
      AND EXISTS (
        SELECT 1
        FROM unnest(string_to_array(replace(p.product_code, ' ', ''), ',')) AS pc
        WHERE pc = t.code
           OR (pc ~ '^[0-9]+$' AND t.code ~ '^[0-9]+$'
               AND ltrim(pc, '0') = ltrim(t.code, '0'))
      )
     WHERE p.is_active = true`,
    [codes, cats],
  );
  const existingKeys = new Set(
    existing.rows.map((r) => `${r.code}|${r.cat}`),
  );
  const toCreate = rows.filter(
    (r) => !existingKeys.has(`${r.code}|${r.categoryId}`),
  );

  // --- Resumen por rubro: archivo vs. lo que hay hoy en la BD ---
  const byCategory = new Map();
  for (const r of rows) {
    const acc = byCategory.get(r.categoryId) || {
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      items: 0,
      stock: 0,
    };
    acc.items++;
    acc.stock += r.stock;
    byCategory.set(r.categoryId, acc);
  }

  const currentStock = await pool.query(
    `SELECT c.id AS category_id,
            COUNT(*) FILTER (WHERE psb.stock > 0)::int AS items,
            COALESCE(SUM(psb.stock), 0)::int           AS stock
     FROM product_stock_by_branch psb
     LEFT JOIN products p       ON p.id = psb.product_id
     LEFT JOIN product_groups g ON g.id = psb.group_id
     LEFT JOIN categories c
            ON c.id = p.category_id
            OR c.category_name = g.category_type
     WHERE psb.branch_id = $1 AND c.id IS NOT NULL
     GROUP BY c.id`,
    [branch.id],
  );
  const currentByCat = new Map(currentStock.rows.map((r) => [r.category_id, r]));

  const categories = [...byCategory.values()]
    .map((c) => {
      const before = currentByCat.get(c.categoryId);
      return {
        ...c,
        currentItems: before ? before.items : 0,
        currentStock: before ? before.stock : 0,
      };
    })
    .sort((a, b) => b.items - a.items);

  // Rubros que hoy tienen stock en esta sucursal pero NO vienen en el archivo.
  // No se van a tocar (guard anti-vaciado por rubro), pero el usuario tiene que
  // verlos: si esperaba que vinieran, el export salio incompleto.
  const untouched = [...currentByCat.values()]
    .filter((c) => !categoryIds.includes(c.category_id) && c.stock > 0)
    .map((c) => ({
      categoryId: c.category_id,
      categoryName: categoryById.get(c.category_id)?.category_name || "?",
      currentItems: c.items,
      currentStock: c.stock,
    }));

  return {
    branch: { id: branch.id, name: branch.name },
    fileBranchName: parsed.branchName,
    exportedAt: parsed.exportedAt,
    totals: {
      rowsInFile: parsed.rows.length,
      importable: rows.length,
      toUpdate: rows.length - toCreate.length,
      toCreate: toCreate.length,
      totalStock: rows.reduce((a, r) => a + r.stock, 0),
      withoutCost: rows.filter((r) => !r.costWithVat).length,
    },
    categories,
    untouchedCategories: untouched,
    unknownCategory,
    warnings: parsed.warnings,
    // Uso interno del commit: no se exponen al cliente.
    _rows: rows,
    _categoryIds: categoryIds,
  };
}

/**
 * Importa el CSV a la BD. Re-analiza el archivo (no confia en lo que mande el
 * cliente) y escribe con el mismo pipeline que el sync por API.
 *
 * @param {Buffer|string} content
 * @param {Object} [opts]
 *   @param {number} [opts.expectedBranchId] - Si viene, se valida que el archivo
 *     sea de esa sucursal. Evita importar el CSV equivocado tras la confirmacion.
 * @returns {Object} resultado con el resumen y las stats de escritura
 */
async function importStockCsv(content, opts = {}) {
  const analysis = await analyzeStockCsv(content);

  if (
    opts.expectedBranchId &&
    Number(opts.expectedBranchId) !== analysis.branch.id
  ) {
    const err = new Error(
      `El archivo es de "${analysis.branch.name}" pero se confirmo la importacion de otra sucursal. Volve a subirlo.`,
    );
    err.code = "BRANCH_MISMATCH";
    throw err;
  }

  const [groupableBrands, allBrands] = await Promise.all([
    getGroupableBrands(),
    getAllBrands(),
  ]);

  // Normalizar al shape que espera persistBranchStock.
  const rows = analysis._rows.map((r) => ({
    fields: {
      // El CSV no trae idproducto: la identidad la resuelve product_code.
      externalId: null,
      productName: r.productName,
      codigos: r.code,
      stock: r.stock,
      costPrice: r.costWithVat
        ? Number((r.costWithVat / VAT_RATE).toFixed(2))
        : 0,
    },
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    nameKeywords: r.nameKeywords,
  }));

  const stats = await persistBranchStock(analysis.branch, rows, {
    groupableBrands,
    allBrands,
    // GUARD ANTI-VACIADO POR RUBRO: solo se resetean los rubros que trae el
    // archivo. Un rubro ausente conserva su stock anterior en vez de quedar en 0.
    resetCategoryIds: analysis._categoryIds,
  });

  console.log(
    `[import-csv] ${analysis.branch.name}: ${stats.synced} items, ${stats.created || 0} productos nuevos, ${stats.grouped} grupos, ${stats.errors} errores`,
  );

  const { _rows, _categoryIds, ...summary } = analysis;
  return { ...summary, stats };
}

module.exports = { analyzeStockCsv, importStockCsv, normalizeBranchName };

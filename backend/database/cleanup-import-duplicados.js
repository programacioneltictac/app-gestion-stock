/**
 * LIMPIEZA DE DUPLICADOS DEJADOS POR EL IMPORT CSV (contingencia sin API IDUO).
 *
 * Los imports hechos ANTES de los fixes `61aa865` (codigos con coma) y `dd774f7`
 * (ceros a la izquierda) no matchearon contra el producto existente y crearon
 * una fila NUEVA con el codigo tal cual venia del CSV. Sintoma: el producto
 * original quedo en 0 y el stock real vive en el duplicado.
 *
 * Reimportar (ya hecho, con los fixes aplicados) devuelve el stock al original
 * pero NO borra el duplicado. Esto lo borra.
 *
 * ⚠️ ORDEN OBLIGATORIO: reimportar PRIMERO, borrar DESPUES. Al reves se pierde
 * el stock, que vive en el duplicado.
 *
 * Criterio de identificacion (el MISMO que usan `persistBranchStock` en
 * syncService.js y `analyzeStockCsv` en importService.js):
 *   el duplicado tiene `external_id IS NULL`, su codigo es unico (sin coma), y
 *   ese codigo aparece dentro del campo multi-codigo de otro producto ACTIVO de
 *   la MISMA categoria, comparando exacto o sin ceros a la izquierda (esto
 *   ultimo solo si AMBOS lados son numericos: hay codigos alfanumericos como
 *   "AC2+0.50" u "ORT00430" donde recortar ceros no tiene sentido).
 *
 * La categoria desambigua: sin ella `533` (BIOMEDICS/CONTACTOLOGIA) y `000533`
 * (TERESA CALANDRA/LENTES DE SOL) se juntarian siendo productos distintos.
 *
 * USO:
 *   node cleanup-import-duplicados.js            -> DIAGNOSTICO (read-only)
 *   node cleanup-import-duplicados.js --apply    -> BORRA (transaccional)
 *
 * Sin --apply no escribe NADA. Con --apply corre todo dentro de una unica
 * transaccion: si algo no cuadra, hace ROLLBACK y no toca la base.
 *
 * SEGURIDAD: nunca borra un duplicado que
 *   - tenga stock > 0 en alguna sucursal (el stock no migro: reimportar primero),
 *   - este en un control (`stock_controls.product_stock_id`), o
 *   - este en una orden (`order_details.product_stock_id`).
 * 📌 Esas dos tablas NO referencian `products.id`: apuntan a
 * `product_stock_by_branch.id`. Por eso una fila de stock en 0 igual puede
 * estar referenciada, y el chequeo va por ahi.
 * Esos se reportan aparte y quedan para analisis manual.
 */
require("dotenv").config();
const { pool } = require("./config");

const APPLY = process.argv.includes("--apply");

// Candidatos a duplicado + todo lo que hace falta para decidir si son seguros.
// `orig` es el producto bueno (el que tiene external_id, o el mas viejo).
const SQL_DIAG = `
WITH dup AS (
  SELECT
    d.id            AS dup_id,
    d.product_name  AS dup_name,
    d.product_code  AS dup_code,
    d.category_id,
    o.id            AS orig_id,
    o.product_name  AS orig_name,
    o.product_code  AS orig_code,
    o.external_id   AS orig_external_id
  FROM products d
  JOIN LATERAL (
    SELECT p.id, p.product_name, p.product_code, p.external_id
    FROM products p
    WHERE p.is_active = true
      AND p.id <> d.id
      AND p.category_id = d.category_id
      AND EXISTS (
        SELECT 1
        FROM unnest(string_to_array(replace(p.product_code, ' ', ''), ',')) AS pc
        WHERE pc = replace(d.product_code, ' ', '')
           OR (pc ~ '^[0-9]+$'
               AND replace(d.product_code, ' ', '') ~ '^[0-9]+$'
               AND ltrim(pc, '0') = ltrim(replace(d.product_code, ' ', ''), '0'))
      )
    -- Mismo desempate que persistBranchStock: gana el que tiene external_id.
    ORDER BY p.external_id NULLS LAST, p.id
    LIMIT 1
  ) o ON true
  WHERE d.is_active = true
    AND d.external_id IS NULL
    -- El duplicado creado por el CSV siempre trae UN solo codigo.
    AND d.product_code NOT LIKE '%,%'
)
SELECT
  dup.*,
  COALESCE((SELECT SUM(psb.stock) FROM product_stock_by_branch psb
            WHERE psb.product_id = dup.dup_id), 0)               AS stock_duplicado,
  COALESCE((SELECT SUM(psb.stock) FROM product_stock_by_branch psb
            WHERE psb.product_id = dup.orig_id), 0)              AS stock_original,
  -- OJO: stock_controls y order_details NO apuntan a products.id, sino a
  -- product_stock_by_branch.id (columna product_stock_id). Una fila de stock
  -- del duplicado puede estar referenciada AUNQUE el stock sea 0.
  EXISTS (SELECT 1 FROM stock_controls sc
          JOIN product_stock_by_branch psb ON psb.id = sc.product_stock_id
          WHERE psb.product_id = dup.dup_id)                     AS en_control,
  EXISTS (SELECT 1 FROM order_details od
          JOIN product_stock_by_branch psb ON psb.id = od.product_stock_id
          WHERE psb.product_id = dup.dup_id)                     AS en_orden
FROM dup
ORDER BY dup.category_id, dup.dup_name;
`;

(async () => {
  const { rows } = await pool.query(SQL_DIAG);

  if (rows.length === 0) {
    console.log("No hay duplicados que coincidan con el criterio. Nada que hacer.");
    await pool.end();
    return;
  }

  // Un duplicado es seguro solo si el stock YA migro al original y no lo
  // referencia nada. `stock_duplicado > 0` = falta reimportar esa sucursal.
  const safe = rows.filter(
    (r) => !r.en_control && !r.en_orden && Number(r.stock_duplicado) === 0,
  );
  const unsafe = rows.filter((r) => !safe.includes(r));

  console.log(`\n=== DUPLICADOS DETECTADOS: ${rows.length} ===\n`);
  console.table(
    rows.map((r) => ({
      dup_id: r.dup_id,
      nombre: String(r.dup_name).slice(0, 38),
      cod_dup: r.dup_code,
      orig_id: r.orig_id,
      cod_orig: String(r.orig_code).slice(0, 20),
      stock_dup: Number(r.stock_duplicado),
      stock_orig: Number(r.stock_original),
      control: r.en_control ? "SI" : "",
      orden: r.en_orden ? "SI" : "",
      borrar: safe.includes(r) ? "OK" : "NO",
    })),
  );

  console.log(`\nSeguros de borrar : ${safe.length}`);
  console.log(`Requieren analisis: ${unsafe.length}`);

  if (unsafe.length > 0) {
    console.log("\n--- NO SE BORRAN (revisar a mano) ---");
    for (const r of unsafe) {
      const why = [];
      if (Number(r.stock_duplicado) > 0)
        why.push(`stock ${r.stock_duplicado} SIN MIGRAR (¿falta reimportar esa sucursal?)`);
      if (r.en_control) why.push("esta en un control");
      if (r.en_orden) why.push("esta en una orden");
      console.log(`  [${r.dup_id}] ${r.dup_name} (cod ${r.dup_code}) -> ${why.join(" + ")}`);
    }
  }

  if (!APPLY) {
    console.log(
      "\n*** DIAGNOSTICO, no se escribio nada. Para borrar: node cleanup-import-duplicados.js --apply ***",
    );
    await pool.end();
    return;
  }

  if (safe.length === 0) {
    console.log("\nNo hay nada seguro de borrar. Sin cambios.");
    await pool.end();
    return;
  }

  // --- BORRADO, todo o nada ---
  const ids = safe.map((r) => r.dup_id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const antes = await client.query(
      "SELECT COUNT(*)::int n FROM products WHERE is_active = true",
    );

    // Ya se verifico que ningun control ni orden referencia estas filas de
    // stock (via product_stock_id), asi que se pueden borrar antes del producto
    // para satisfacer la FK product_stock_by_branch.product_id -> products.id.
    const psb = await client.query(
      "DELETE FROM product_stock_by_branch WHERE product_id = ANY($1::int[])",
      [ids],
    );

    const del = await client.query(
      "DELETE FROM products WHERE id = ANY($1::int[])",
      [ids],
    );

    const despues = await client.query(
      "SELECT COUNT(*)::int n FROM products WHERE is_active = true",
    );

    // Control de seguridad: el delta debe ser EXACTAMENTE lo previsto.
    const delta = antes.rows[0].n - despues.rows[0].n;
    if (del.rowCount !== ids.length || delta !== ids.length) {
      throw new Error(
        `Conteo inesperado: previstos ${ids.length}, borrados ${del.rowCount}, delta ${delta}. ROLLBACK.`,
      );
    }

    await client.query("COMMIT");
    console.log(`\n=== BORRADO OK ===`);
    console.log(`Filas de stock borradas : ${psb.rowCount}`);
    console.log(`Productos borrados      : ${del.rowCount}`);
    console.log(`Productos activos       : ${antes.rows[0].n} -> ${despues.rows[0].n}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n*** ROLLBACK, no se cambio nada ***");
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();

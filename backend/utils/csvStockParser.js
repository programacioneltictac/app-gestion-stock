/**
 * Parser del CSV de stock exportado desde IDUO.
 *
 * Formato (una sucursal por archivo, todos los rubros juntos):
 *
 *   "Fecha: 08/09/2026 13:32:36
 *   Sucursales: Nodo-hub";;;
 *   Producto;Codigo;Fisico;P. Costo
 *   RUSTY BANRAPP C1 02-26 ARMAZON;778029;1;56684,87
 *
 * Existe como plan de contingencia: cuando la API de IDUO no esta disponible,
 * es la unica via para alimentar la app. Ver importService.
 */

// El archivo viene en latin1 (ISO-8859-1), NO en UTF-8: los nombres traen
// enies ("SEÑ...") que en UTF-8 se leen como caracteres de reemplazo y romperian
// tanto el matcheo por nombre como la deteccion de marca.
const CSV_ENCODING = "latin1";

const DELIMITER = ";";

/**
 * Convierte el precio del CSV (formato es-AR: "56684,87") a Number.
 * Devuelve null si no es un numero valido — hay filas con el costo vacio.
 */
function parseCost(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // Se quitan separadores de miles y se normaliza la coma decimal.
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Detecta si un codigo fue destruido por Excel al convertirlo a notacion
 * cientifica ("3,10119E+11"). Es un daño IRREVERSIBLE: el codigo original
 * (EAN de 13 digitos) se redondeo y multiples productos distintos colapsan en
 * el mismo valor — se vieron 10 productos de LIQUIDOS con el mismo "codigo".
 * Importar asi mezclaria el stock entre productos, en silencio.
 * Por eso se aborta el import entero y se pide re-exportar sin abrir en Excel.
 */
function isScientificNotation(code) {
  return /^\d+([.,]\d+)?[eE][+-]?\d+$/.test(String(code || "").trim());
}

/**
 * Parsea el contenido del CSV.
 * @param {Buffer|string} content - Contenido crudo del archivo
 * @returns {{ branchName, exportedAt, rows, warnings }}
 *   rows: [{ productName, code, stock, costWithVat, line }]
 * @throws {Error} con `code` seteado si el archivo no es utilizable
 */
function parseStockCsv(content) {
  const text = Buffer.isBuffer(content)
    ? content.toString(CSV_ENCODING)
    : String(content);

  const lines = text.split(/\r?\n/);

  // --- Cabecera ---
  // "Sucursales: X" puede venir dentro de un campo entrecomillado que abre en la
  // linea anterior ("Fecha: ..."), asi que se busca por contenido, no por indice.
  const headerIdx = lines.findIndex((l) => /^Producto\s*;/i.test(l.trim()));
  if (headerIdx === -1) {
    const err = new Error(
      'El archivo no tiene la fila de encabezado "Producto;Codigo;Fisico;P. Costo". ¿Es el CSV de stock exportado desde IDUO?',
    );
    err.code = "CSV_NO_HEADER";
    throw err;
  }

  const headerBlock = lines.slice(0, headerIdx).join("\n");

  const branchMatch = headerBlock.match(/Sucursales?\s*:\s*([^";\r\n]+)/i);
  if (!branchMatch) {
    const err = new Error(
      'No se pudo leer la sucursal del archivo (falta la linea "Sucursales: ...").',
    );
    err.code = "CSV_NO_BRANCH";
    throw err;
  }
  const branchName = branchMatch[1].trim();

  const dateMatch = headerBlock.match(
    /Fecha\s*:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/i,
  );
  const exportedAt = dateMatch
    ? new Date(
        Number(dateMatch[3]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[1]),
        Number(dateMatch[4]),
        Number(dateMatch[5]),
        Number(dateMatch[6]),
      )
    : null;

  // --- Filas ---
  const rows = [];
  const warnings = [];
  const scientific = [];
  const seenCodes = new Map();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const fields = line.split(DELIMITER);
    // El export cierra cada fila con un ';' extra, asi que sobra un campo vacio.
    if (fields.length < 4) {
      warnings.push(`Linea ${i + 1}: se esperaban 4 columnas, se leyeron ${fields.length}. Fila ignorada.`);
      continue;
    }

    const productName = fields[0].trim();
    const code = fields[1].trim();
    const stockRaw = fields[2].trim();
    const stock = parseInt(stockRaw, 10);

    if (!productName) {
      warnings.push(`Linea ${i + 1}: nombre de producto vacio. Fila ignorada.`);
      continue;
    }
    if (!code) {
      // Sin codigo no hay identidad posible: el CSV no trae idproducto.
      warnings.push(`Linea ${i + 1}: "${productName}" no tiene codigo. Fila ignorada.`);
      continue;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      warnings.push(`Linea ${i + 1}: "${productName}" tiene un fisico invalido ("${stockRaw}"). Fila ignorada.`);
      continue;
    }

    if (isScientificNotation(code)) {
      scientific.push(`Linea ${i + 1}: "${productName}" -> codigo "${code}"`);
      continue;
    }

    // Un codigo repetido DENTRO del archivo tambien es sintoma del daño de
    // Excel (o de un export mal armado). Se avisa y se conserva la 1ra.
    if (seenCodes.has(code)) {
      warnings.push(
        `Linea ${i + 1}: el codigo "${code}" ya aparecio en la linea ${seenCodes.get(code)}. Se ignora la repeticion.`,
      );
      continue;
    }
    seenCodes.set(code, i + 1);

    rows.push({
      productName,
      code,
      stock,
      costWithVat: parseCost(fields[3]),
      line: i + 1,
    });
  }

  // Los codigos rotos no se pueden salvar: cortar antes de tocar la BD.
  if (scientific.length > 0) {
    const err = new Error(
      `El archivo tiene ${scientific.length} codigo(s) convertidos a notacion cientifica por Excel (ej. "3,10119E+11"). ` +
        `Ese daño es irreversible y mezclaria el stock entre productos distintos. ` +
        `Volve a exportar el CSV desde IDUO sin abrirlo en Excel, o abri la columna "Codigo" como Texto.`,
    );
    err.code = "CSV_SCIENTIFIC_NOTATION";
    err.details = scientific.slice(0, 10);
    throw err;
  }

  if (rows.length === 0) {
    const err = new Error("El archivo no tiene filas de stock utilizables.");
    err.code = "CSV_NO_ROWS";
    throw err;
  }

  return { branchName, exportedAt, rows, warnings };
}

module.exports = { parseStockCsv, parseCost, isScientificNotation };

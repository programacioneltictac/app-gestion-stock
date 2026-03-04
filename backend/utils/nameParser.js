/**
 * Utilidades para parsear y limpiar nombres de productos de la API externa.
 *
 * Patrón a eliminar del final del nombre:
 *   [MM-AA] [RUBRO]
 *   Ejemplos:
 *     "005236 SEÑAL RECETA METAL 11-25 ARMAZON"     → "005236 SEÑAL RECETA METAL"
 *     "004552 SEÑAL SOL POLARIZADOS 06-25 LENTE DE SOL" → "004552 SEÑAL SOL POLARIZADOS"
 *     "KOMPRESSOR 8220 C4 05-19 ARMAZON"            → "KOMPRESSOR 8220 C4"
 */

// Rubros conocidos (orden importa: los más largos primero para evitar matches parciales)
const KNOWN_RUBROS = ["LENTE DE SOL", "ARMAZON"];

// Regex: espacio + MM-AA + espacio + RUBRO al final del string (case-insensitive)
// MM-AA: dos dígitos, guion, dos dígitos  ej: 11-25
const DATE_RUBRO_REGEX = /\s+\d{2}-\d{2}\s+(?:LENTE DE SOL|ARMAZON)\s*$/i;

/**
 * Limpia el nombre de un producto eliminando la fecha y el rubro del final.
 * @param {string} name - Nombre original del producto
 * @returns {{ cleanName: string, rubro: string|null }}
 */
function parseProductName(name) {
  if (!name) return { cleanName: name, rubro: null };

  const upper = name.trim().toUpperCase();

  // Detectar qué rubro tiene al final
  let detectedRubro = null;
  for (const rubro of KNOWN_RUBROS) {
    // Buscar patrón: \d{2}-\d{2} + espacio + rubro al final
    const regex = new RegExp(`\\s+\\d{2}-\\d{2}\\s+${rubro.replace(/ /g, "\\s+")}\\s*$`, "i");
    if (regex.test(upper)) {
      detectedRubro = rubro;
      break;
    }
  }

  const cleanName = name.trim().replace(DATE_RUBRO_REGEX, "").trim();

  return {
    cleanName,
    rubro: detectedRubro,
  };
}

/**
 * Determina si un producto pertenece a una marca agrupable y devuelve los datos del grupo.
 * @param {string} cleanName   - Nombre ya limpio (sin fecha/rubro)
 * @param {string} rubro       - "ARMAZON" | "LENTE DE SOL" | null
 * @param {Array}  groupableBrands - Array de { id, brand_name } con is_groupable = true
 * @returns {{ isGrouped: boolean, groupKey: string|null, displayName: string|null, brandId: number|null, brandKeyword: string|null }}
 */
function detectGroup(cleanName, rubro, groupableBrands) {
  if (!rubro || !cleanName) {
    return { isGrouped: false, groupKey: null, displayName: null, brandId: null, brandKeyword: null };
  }

  const upperName = cleanName.toUpperCase();

  // Buscar si alguna marca agrupable está contenida en el nombre del producto
  // Ordenar por longitud descendente para que "CELINE KHAN" matchee antes que "KHAN"
  const sorted = [...groupableBrands].sort((a, b) => b.brand_name.length - a.brand_name.length);

  for (const brand of sorted) {
    const keyword = brand.brand_name.toUpperCase();
    if (upperName.includes(keyword)) {
      const rubroLabel = rubro === "ARMAZON" ? "ARMAZONES" : "LENTES DE SOL";
      const displayName = `${brand.brand_name.toUpperCase()} ${rubroLabel}`;
      const groupKey = `${keyword.replace(/\s+/g, "_")}_${rubro.replace(/\s+/g, "_")}`;

      return {
        isGrouped: true,
        groupKey,
        displayName,
        brandId: brand.id,
        brandKeyword: brand.brand_name,
      };
    }
  }

  return { isGrouped: false, groupKey: null, displayName: null, brandId: null, brandKeyword: null };
}

module.exports = { parseProductName, detectGroup };

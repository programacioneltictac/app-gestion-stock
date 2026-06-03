/**
 * Utilidades para parsear y limpiar nombres de productos de la API externa.
 *
 * Patrón a eliminar del final del nombre:
 *   [MM-AA] [RUBRO]
 *   Ejemplos:
 *     "005236 SEÑAL RECETA METAL 11-25 ARMAZON"     → "005236 SEÑAL RECETA METAL"
 *     "004552 SEÑAL SOL POLARIZADOS 06-25 LENTE DE SOL" → "004552 SEÑAL SOL POLARIZADOS"
 *     "KOMPRESSOR 8220 C4 05-19 ARMAZON"            → "KOMPRESSOR 8220 C4"
 *
 * Los rubros (keywords) NO están hardcodeados: vienen de la columna
 * categories.name_keywords y el sync los pasa por categoría. Una categoría
 * puede tener varias variantes (ej: "LENTE DE SOL" y "LENTES DE SOL").
 */

// Calificadores que subdividen un grupo de marca.
// Orden = prioridad: el primero que matchee gana (un solo calificador por producto).
// `synonyms` se matchean con límite de palabra (\b) para evitar falsos positivos.
// `label` es la etiqueta canónica que se inserta en el display_name y group_key.
const GROUP_QUALIFIERS = [
  { label: "KIDS", synonyms: ["KIDS", "KID", "NIÑO", "NIÑOS", "NINO", "NINOS"] },
  { label: "ANTIPARRA ALTO IMPACTO", synonyms: ["ANTIPARRA ALTO IMPACTO"] },
  { label: "ANTIPARRA C/PRESCRIPCION", synonyms: ["ANTIPARRA C/PRESCRIPCION"] },
  { label: "ENTRENAMIENTO", synonyms: ["ENTRENAMIENTO"] },
  { label: "DEPORTIVO", synonyms: ["DEPORTIVO", "DEPORTIVOS"] },
];

// Escapa caracteres especiales de regex en una palabra clave.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Devuelve la etiqueta del primer calificador presente en el nombre (o null).
// Match por límite de palabra para no agrupar substrings accidentales.
function detectQualifier(upperName) {
  for (const q of GROUP_QUALIFIERS) {
    for (const syn of q.synonyms) {
      const re = new RegExp(`\\b${escapeRegex(syn)}\\b`, "i");
      if (re.test(upperName)) return q.label;
    }
  }
  return null;
}

/**
 * Limpia el nombre de un producto eliminando el sufijo "MM-AA RUBRO" del final.
 * El rubro NO se adivina: lo determina la categoría del request (ver syncService).
 * Aquí solo se usan los keywords para borrar el sufijo del nombre.
 *
 * Si el nombre no termina con ninguno de los keywords, se intenta limpiar al
 * menos el sufijo de fecha "MM-AA" suelto al final (defensivo).
 *
 * @param {string} name       - Nombre original del producto
 * @param {string[]} keywords - Variantes del rubro para esta categoría (name_keywords).
 *                              Pueden venir en cualquier orden; se ordenan por longitud
 *                              descendente para evitar matches parciales.
 * @returns {{ cleanName: string }}
 */
function parseProductName(name, keywords = []) {
  if (!name) return { cleanName: name };

  let cleanName = name.trim();

  // Ordenar keywords por longitud descendente: "LENTES DE SOL" antes que
  // "LENTE DE SOL" para que no matchee la variante corta dentro de la larga.
  const sorted = [...(keywords || [])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const kw of sorted) {
    // Patrón: \d{2}-\d{2} + espacio(s) + keyword al final del string.
    // Se escapan los metacaracteres del keyword y sus espacios se vuelven \s+ flexibles.
    const kwPattern = escapeRegex(kw).replace(/ +/g, "\\s+");
    const pattern = `\\s+\\d{2}-\\d{2}\\s+${kwPattern}\\s*$`;
    const regex = new RegExp(pattern, "i");
    if (regex.test(cleanName)) {
      cleanName = cleanName.replace(regex, "").trim();
      return { cleanName };
    }
  }

  // Defensivo: si el nombre termina solo en "MM-AA" sin rubro reconocido, quitarlo.
  cleanName = cleanName.replace(/\s+\d{2}-\d{2}\s*$/i, "").trim();

  return { cleanName };
}

/**
 * Determina si un producto pertenece a una marca agrupable y devuelve los datos del grupo.
 * @param {string} cleanName    - Nombre ya limpio (sin fecha/rubro)
 * @param {string} categoryName - Nombre de la categoría del request (ej: "ARMAZONES",
 *                                "CLIPONES"). Se usa como etiqueta plural del grupo.
 * @param {Array}  groupableBrands - Array de { id, brand_name } con is_groupable = true
 * @returns {{ isGrouped: boolean, groupKey: string|null, displayName: string|null, brandId: number|null, brandKeyword: string|null }}
 */
function detectGroup(cleanName, categoryName, groupableBrands) {
  if (!categoryName || !cleanName) {
    return { isGrouped: false, groupKey: null, displayName: null, brandId: null, brandKeyword: null };
  }

  const upperName = cleanName.toUpperCase();
  const categoryLabel = categoryName.toUpperCase();

  // Buscar si alguna marca agrupable está contenida en el nombre del producto
  // Ordenar por longitud descendente para que "CELINE KHAN" matchee antes que "KHAN"
  const sorted = [...groupableBrands].sort((a, b) => b.brand_name.length - a.brand_name.length);

  for (const brand of sorted) {
    const keyword = brand.brand_name.toUpperCase();
    if (upperName.includes(keyword)) {
      // Si la marca ya implica un calificador (ej: "GOD KIDS" ya es KIDS), no se
      // vuelve a agregar aunque el nombre traiga ese calificador o un sinónimo
      // (evita "GOD KIDS KIDS ..." con "GOD KIDS NIÑO ...").
      const brandQualifier = detectQualifier(keyword);
      const nameQualifier = detectQualifier(upperName);
      const qualifier = nameQualifier === brandQualifier ? null : nameQualifier;

      const displayName = qualifier
        ? `${keyword} ${qualifier} ${categoryLabel}`
        : `${keyword} ${categoryLabel}`;

      // group_key: MARCA[_CALIFICADOR]_CATEGORIA. Sanea espacios y la barra de "C/PRESCRIPCION".
      const keyParts = [keyword.replace(/\s+/g, "_")];
      if (qualifier) keyParts.push(qualifier.replace(/[\s/]+/g, "_"));
      keyParts.push(categoryLabel.replace(/\s+/g, "_"));
      const groupKey = keyParts.join("_");

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

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

// Las regex se compilan UNA vez y no por producto: el sync procesa miles de
// nombres contra las mismas marcas/keywords. Las listas (marcas, keywords) se
// cachean por identidad del array, asi que quien las pasa NO debe mutarlas
// despues de usarlas (el sync y el import las arman una vez por corrida).
const memoByArray = (build) => {
  const cache = new WeakMap();
  return (list) => {
    let compiled = cache.get(list);
    if (!compiled) {
      compiled = build(list);
      cache.set(list, compiled);
    }
    return compiled;
  };
};

// Palabra completa, sin importar mayusculas (ej: "RAY" no matchea "SPRAY").
const wordRegex = (word) => new RegExp(`\\b${escapeRegex(word)}\\b`, "i");

// Keyword de rubro con sus espacios flexibles (tolera doble espacio en la carga de IDUO).
const flexibleKeyword = (kw) => escapeRegex(kw).replace(/ +/g, "\\s+");

const byLengthDesc = (getText) => (a, b) => getText(b).length - getText(a).length;

const QUALIFIER_MATCHERS = GROUP_QUALIFIERS.map((q) => ({
  label: q.label,
  regexes: q.synonyms.map(wordRegex),
}));

// Devuelve la etiqueta del primer calificador presente en el nombre (o null).
// Match por límite de palabra para no agrupar substrings accidentales.
function detectQualifier(upperName) {
  for (const q of QUALIFIER_MATCHERS) {
    if (q.regexes.some((re) => re.test(upperName))) return q.label;
  }
  return null;
}

// "MM-AA RUBRO" al final del nombre, una regex por keyword. Ordenadas por
// longitud descendente: "LENTES DE SOL" antes que "LENTE DE SOL" para que no
// matchee la variante corta dentro de la larga.
const getSuffixMatchers = memoByArray((keywords) =>
  [...keywords]
    .filter(Boolean)
    .sort(byLengthDesc((kw) => kw))
    .map((kw) => new RegExp(`\\s+\\d{2}-\\d{2}\\s+${flexibleKeyword(kw)}\\s*$`, "i")),
);

// (^|\s)KEYWORD$ -> el rubro va al final, con o sin fecha delante.
// Respeta el orden recibido (el llamador ya las ordena por longitud).
const getCategoryMatchers = memoByArray((keywordToCat) =>
  keywordToCat
    .filter((entry) => entry && entry.keyword)
    .map((entry) => ({
      entry,
      re: new RegExp(`(?:^|\\s)${flexibleKeyword(entry.keyword.toUpperCase())}\\s*$`),
    })),
);

// Marcas ordenadas por longitud descendente para que "CELINE KHAN" gane a "KHAN".
const getGroupMatchers = memoByArray((brands) =>
  [...brands]
    .sort(byLengthDesc((b) => b.brand_name))
    .map((brand) => {
      const keyword = brand.brand_name.toUpperCase();
      return { brand, keyword, qualifier: detectQualifier(keyword) };
    }),
);

const getBrandMatchers = memoByArray((brands) =>
  [...brands]
    .sort(byLengthDesc((b) => b.brand_name))
    .map((brand) => ({ brand, re: wordRegex(brand.brand_name.toUpperCase()) })),
);

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

  for (const regex of getSuffixMatchers(keywords || [])) {
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
 * Arma la lista keywordToCat que espera detectCategoryFromName a partir de las
 * filas de `categories` (id + name_keywords), ordenada por longitud
 * descendente: "LENTES DE SOL" tiene que ganarle a "LENTE DE SOL".
 * Compartido por el sync por API y el importador CSV.
 * @param {Array<{id: number, name_keywords: string[]|null}>} categories
 * @returns {Array<{keyword: string, categoryId: number}>}
 */
function buildKeywordToCategory(categories) {
  return categories
    .flatMap((c) =>
      (c.name_keywords || [])
        .filter(Boolean)
        .map((kw) => ({ keyword: String(kw), categoryId: c.id })),
    )
    .sort((a, b) => b.keyword.length - a.keyword.length);
}

/**
 * Determina el rubro que declara el NOMBRE del producto (no el rubro por el que
 * la API lo devolvio). Es el blindaje contra productos que IDUO cuelga de un
 * rubro padre viejo: el sufijo del nombre lo escribe quien carga el producto y
 * es la fuente confiable.
 *
 * No se asume el patron canonico "MM-AA RUBRO" porque hay dos variantes que
 * darian falso negativo:
 *   - Nombres con DOS numeros con forma de fecha ("... 50-44 10-22 CLIPONES"):
 *     un regex anclado en \d{2}-\d{2} matchea la PRIMERA (50-44) y captura
 *     "10-22 CLIPONES", que no coincide con ningun keyword.
 *   - Nombres SIN fecha, con el rubro pegado al final ("ACUVUE 2 ESF+0.50
 *     LCONTACTO", "MIR KETTLEBELL 3KG FITNESS").
 * Por eso se matchea cada keyword conocido ANCLADO AL FINAL del nombre.
 *
 * @param {string} productName - Nombre CRUDO del producto (el sufijo no esta en
 *                               display_name: parseProductName ya lo quito).
 * @param {Array<{keyword: string, categoryId: number}>} keywordToCat
 *        Keywords conocidos con su categoria destino. Deben venir ordenados por
 *        longitud descendente ("LENTES DE SOL" antes que "LENTE DE SOL").
 * @returns {{ categoryId: number, keyword: string } | null}
 *          null = el nombre no declara ningun rubro conocido -> NO tocar,
 *          se respeta la categoria que dijo la API.
 */
function detectCategoryFromName(productName, keywordToCat) {
  const upper = String(productName || "").toUpperCase().trim();
  if (!upper || !Array.isArray(keywordToCat) || keywordToCat.length === 0) {
    return null;
  }

  for (const { entry, re } of getCategoryMatchers(keywordToCat)) {
    if (re.test(upper)) {
      return { categoryId: entry.categoryId, keyword: entry.keyword };
    }
  }
  return null;
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
  for (const { brand, keyword, qualifier: brandQualifier } of getGroupMatchers(groupableBrands)) {
    if (upperName.includes(keyword)) {
      // Si la marca ya implica un calificador (ej: "GOD KIDS" ya es KIDS), no se
      // vuelve a agregar aunque el nombre traiga ese calificador o un sinónimo
      // (evita "GOD KIDS KIDS ..." con "GOD KIDS NIÑO ...").
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

/**
 * Detecta qué marca conocida aparece en el nombre de un producto. A diferencia
 * de detectGroup, NO necesita la categoría: solo busca la marca (para asociar
 * proveedor en el sync de compras). Devuelve el id de la primera marca contenida
 * en el nombre, priorizando las más largas (para que "CELINE KHAN" gane a "KHAN").
 *
 * @param {string} productName  - Nombre del producto (texto libre de la API).
 * @param {Array}  brands       - Array de { id, brand_name }.
 * @returns {{ brandId: number, brandName: string } | null}
 */
function detectBrandInName(productName, brands) {
  if (!productName || !Array.isArray(brands) || brands.length === 0) return null;

  const upperName = productName.toUpperCase();

  // Límite de palabra para no matchear substrings accidentales (ej: "RAY" en "SPRAY").
  for (const { brand, re } of getBrandMatchers(brands)) {
    if (re.test(upperName)) {
      return { brandId: brand.id, brandName: brand.brand_name };
    }
  }
  return null;
}

module.exports = {
  escapeRegex,
  parseProductName,
  detectGroup,
  detectBrandInName,
  detectCategoryFromName,
  buildKeywordToCategory,
};

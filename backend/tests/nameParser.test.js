const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseProductName,
  detectGroup,
  detectBrandInName,
  detectCategoryFromName,
  buildKeywordToCategory,
} = require("../utils/nameParser");

test("parseProductName quita el sufijo MM-AA RUBRO", () => {
  assert.equal(
    parseProductName("005236 SEÑAL RECETA METAL 11-25 ARMAZON", ["ARMAZON"]).cleanName,
    "005236 SEÑAL RECETA METAL",
  );
  assert.equal(
    parseProductName("KOMPRESSOR 8220 C4 05-19 ARMAZON", ["ARMAZON"]).cleanName,
    "KOMPRESSOR 8220 C4",
  );
});

test("parseProductName prioriza el keyword mas largo y tolera doble espacio", () => {
  const keywords = ["LENTE DE SOL", "LENTES DE SOL"];
  assert.equal(
    parseProductName("004552 SEÑAL SOL POLARIZADOS 06-25 LENTES  DE SOL", keywords).cleanName,
    "004552 SEÑAL SOL POLARIZADOS",
  );
  assert.equal(
    parseProductName("004552 SEÑAL SOL 06-25 lente de sol", keywords).cleanName,
    "004552 SEÑAL SOL",
  );
});

test("parseProductName sin rubro reconocido solo quita la fecha final", () => {
  assert.equal(parseProductName("FOO BAR 01-24", ["ARMAZON"]).cleanName, "FOO BAR");
  assert.equal(parseProductName("FOO BAR 01-24 CLIPON", ["ARMAZON"]).cleanName, "FOO BAR 01-24 CLIPON");
  assert.equal(parseProductName("  FOO  ", []).cleanName, "FOO");
  assert.equal(parseProductName("", ["ARMAZON"]).cleanName, "");
  assert.equal(parseProductName(null).cleanName, null);
});

test("parseProductName escapa metacaracteres del keyword", () => {
  assert.equal(parseProductName("X 01-24 C/PRESCRIPCION (A)", ["C/PRESCRIPCION (A)"]).cleanName, "X");
});

test("detectCategoryFromName usa el keyword anclado al final", () => {
  const map = [
    { keyword: "LENTES DE SOL", categoryId: 2 },
    { keyword: "LENTE DE SOL", categoryId: 2 },
    { keyword: "CLIPONES", categoryId: 5 },
    { keyword: "LCONTACTO", categoryId: 8 },
    { keyword: "FITNESS", categoryId: 10 },
  ];
  assert.deepEqual(detectCategoryFromName("RUNFLEX 50-44 10-22 CLIPONES", map), { categoryId: 5, keyword: "CLIPONES" });
  assert.deepEqual(detectCategoryFromName("ACUVUE 2 ESF+0.50 lcontacto", map), { categoryId: 8, keyword: "LCONTACTO" });
  assert.deepEqual(detectCategoryFromName("SOL 01-25 LENTES  DE SOL", map), { categoryId: 2, keyword: "LENTES DE SOL" });
  assert.equal(detectCategoryFromName("MIR KETTLEBELL FITNESSX", map), null);
  assert.equal(detectCategoryFromName("CLIPONES RUNFLEX", map), null);
  assert.equal(detectCategoryFromName("", map), null);
  assert.equal(detectCategoryFromName("X CLIPONES", []), null);
  assert.equal(detectCategoryFromName("X CLIPONES", null), null);
  assert.deepEqual(detectCategoryFromName("CLIPONES", map), { categoryId: 5, keyword: "CLIPONES" });
});

test("detectGroup agrupa por marca (substring) con prioridad a la mas larga", () => {
  const brands = [
    { id: 1, brand_name: "KHAN" },
    { id: 2, brand_name: "Celine Khan" },
  ];
  assert.deepEqual(detectGroup("CELINE KHAN 123 C1", "Armazones", brands), {
    isGrouped: true,
    groupKey: "CELINE_KHAN_ARMAZONES",
    displayName: "CELINE KHAN ARMAZONES",
    brandId: 2,
    brandKeyword: "Celine Khan",
  });
  assert.equal(detectGroup("KHAN 9 C2", "ARMAZONES", brands).brandId, 1);
});

test("detectGroup: el substring matchea sin limite de palabra (comportamiento actual)", () => {
  const r = detectGroup("JOTAVE PLAZA 12", "ARMAZONES", [{ id: 7, brand_name: "LAZ" }]);
  assert.equal(r.isGrouped, true);
  assert.equal(r.groupKey, "LAZ_ARMAZONES");
});

test("detectGroup: con marcas de igual largo gana la primera del array", () => {
  const brands = [{ id: 1, brand_name: "AAA" }, { id: 2, brand_name: "BBB" }];
  assert.equal(detectGroup("BBB AAA", "X", brands).brandId, 1);
  assert.equal(detectGroup("BBB AAA", "X", [...brands].reverse()).brandId, 2);
});

test("detectGroup agrega calificador salvo que la marca ya lo implique", () => {
  const brands = [{ id: 3, brand_name: "GOD" }, { id: 4, brand_name: "GOD KIDS" }];
  assert.deepEqual(detectGroup("GOD NIÑO 22", "ARMAZONES", [brands[0]]), {
    isGrouped: true,
    groupKey: "GOD_KIDS_ARMAZONES",
    displayName: "GOD KIDS ARMAZONES",
    brandId: 3,
    brandKeyword: "GOD",
  });
  assert.equal(detectGroup("GOD KIDS NIÑO 22", "ARMAZONES", brands).displayName, "GOD KIDS ARMAZONES");
  assert.equal(
    detectGroup("GOD ANTIPARRA C/PRESCRIPCION 1", "ARMAZONES", [brands[0]]).groupKey,
    "GOD_ANTIPARRA_C_PRESCRIPCION_ARMAZONES",
  );
  assert.equal(detectGroup("GOD KIDSX 1", "ARMAZONES", [brands[0]]).displayName, "GOD ARMAZONES");
  assert.equal(detectGroup("GOD DEPORTIVOS KIDS", "LENTES DE SOL", [brands[0]]).groupKey, "GOD_KIDS_LENTES_DE_SOL");
});

test("detectGroup sin match o sin datos devuelve no agrupado", () => {
  const none = { isGrouped: false, groupKey: null, displayName: null, brandId: null, brandKeyword: null };
  assert.deepEqual(detectGroup("OTRA 1", "ARMAZONES", [{ id: 1, brand_name: "KHAN" }]), none);
  assert.deepEqual(detectGroup("KHAN", null, [{ id: 1, brand_name: "KHAN" }]), none);
  assert.deepEqual(detectGroup("", "ARMAZONES", [{ id: 1, brand_name: "KHAN" }]), none);
});

test("detectBrandInName usa limite de palabra y prioriza la mas larga", () => {
  const brands = [
    { id: 1, brand_name: "RAY" },
    { id: 2, brand_name: "RAY BAN" },
    { id: 3, brand_name: "A+B" },
  ];
  assert.deepEqual(detectBrandInName("lentes ray ban 3025", brands), { brandId: 2, brandName: "RAY BAN" });
  assert.deepEqual(detectBrandInName("RAY 1", brands), { brandId: 1, brandName: "RAY" });
  assert.equal(detectBrandInName("SPRAY LIMPIADOR", brands), null);
  assert.equal(detectBrandInName("", brands), null);
  assert.equal(detectBrandInName("RAY", []), null);
  assert.equal(detectBrandInName("RAY", null), null);
});

test("detectBrandInName escapa metacaracteres de la marca", () => {
  assert.equal(detectBrandInName("X A.B Y", [{ id: 3, brand_name: "A+B" }]), null);
  assert.deepEqual(detectBrandInName("X A.B Y", [{ id: 4, brand_name: "A.B" }]), { brandId: 4, brandName: "A.B" });
  assert.equal(detectBrandInName("X AXB Y", [{ id: 4, brand_name: "A.B" }]), null);
});

test("buildKeywordToCategory ordena por longitud y descarta vacios", () => {
  const map = buildKeywordToCategory([
    { id: 1, name_keywords: ["LENTE DE SOL", "", null] },
    { id: 2, name_keywords: ["LENTES DE SOL"] },
    { id: 3, name_keywords: null },
  ]);
  assert.deepEqual(map, [
    { keyword: "LENTES DE SOL", categoryId: 2 },
    { keyword: "LENTE DE SOL", categoryId: 1 },
  ]);
});

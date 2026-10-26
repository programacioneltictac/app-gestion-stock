const test = require("node:test");
const assert = require("node:assert/strict");
const { extractApiFields } = require("../utils/syncService");

test("extractApiFields toma la primera unidad y quita el IVA del costo", () => {
  assert.deepEqual(
    extractApiFields({
      idproducto: 123,
      nombreproducto: "  KHAN 1 01-25 ARMAZON ",
      codigos: " 778029 ",
      unidades: [{ stock: "3", preciocosto: "121" }, { stock: "9" }],
    }),
    { externalId: "123", productName: "KHAN 1 01-25 ARMAZON", codigos: "778029", stock: 3, costPrice: 100 },
  );
});

test("extractApiFields tolera producto sin unidades", () => {
  assert.deepEqual(extractApiFields({}), {
    externalId: "",
    productName: "",
    codigos: "",
    stock: 0,
    costPrice: 0,
  });
});

test("extractApiFields nunca devuelve stock negativo", () => {
  assert.equal(extractApiFields({ unidades: [{ stock: "-4" }] }).stock, 0);
});

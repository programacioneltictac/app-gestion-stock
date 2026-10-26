const test = require("node:test");
const assert = require("node:assert/strict");
const { parseStockCsv, parseCost, isScientificNotation } = require("../utils/csvStockParser");

const HEADER = '"Fecha: 08/09/2026 13:32:36\nSucursales: Nodo-hub";;;\nProducto;Codigo;Fisico;P. Costo\n';

const errorCodeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test("parseCost interpreta formato es-AR", () => {
  assert.equal(parseCost("56684,87"), 56684.87);
  assert.equal(parseCost("1.234,5"), 1234.5);
  assert.equal(parseCost(""), null);
  assert.equal(parseCost("0"), null);
  assert.equal(parseCost(undefined), null);
});

test("isScientificNotation detecta codigos rotos por Excel", () => {
  assert.equal(isScientificNotation("3,10119E+11"), true);
  assert.equal(isScientificNotation("778029"), false);
  assert.equal(isScientificNotation(""), false);
});

test("parseStockCsv lee cabecera, filas y avisos", () => {
  const csv =
    HEADER +
    "RUSTY BANRAPP C1 02-26 ARMAZON;778029;1;56684,87;\n" +
    "SIN COSTO;111;3;;\n" +
    "REPETIDO;778029;2;10;\n" +
    ";222;1;1;\n" +
    "SIN CODIGO;;1;1;\n" +
    "MALO;333;x;1;\n" +
    "CORTA;1\n\n";
  const r = parseStockCsv(Buffer.from(csv, "latin1"));
  assert.equal(r.branchName, "Nodo-hub");
  assert.ok(r.exportedAt instanceof Date);
  assert.deepEqual(r.rows, [
    { productName: "RUSTY BANRAPP C1 02-26 ARMAZON", code: "778029", stock: 1, costWithVat: 56684.87, line: 4 },
    { productName: "SIN COSTO", code: "111", stock: 3, costWithVat: null, line: 5 },
  ]);
  assert.equal(r.warnings.length, 5);
});

test("parseStockCsv sin linea de fecha deja exportedAt en null", () => {
  const r = parseStockCsv("Sucursales: Centro;;;\nProducto;Codigo;Fisico;P. Costo\nA;1;2;3;\n");
  assert.equal(r.exportedAt, null);
  assert.equal(r.branchName, "Centro");
});

test("parseStockCsv respeta latin1 en los nombres", () => {
  const r = parseStockCsv(Buffer.from(HEADER + "SEÑAL 1;5;1;1;\n", "latin1"));
  assert.equal(r.rows[0].productName, "SEÑAL 1");
});

test("parseStockCsv aborta con codigos de error", () => {
  assert.equal(errorCodeOf(() => parseStockCsv("nada")), "CSV_NO_HEADER");
  assert.equal(errorCodeOf(() => parseStockCsv("Producto;Codigo;Fisico;P. Costo\nA;1;1;1;")), "CSV_NO_BRANCH");
  assert.equal(errorCodeOf(() => parseStockCsv(HEADER)), "CSV_NO_ROWS");
  assert.equal(errorCodeOf(() => parseStockCsv(HEADER + "A;3,10119E+11;1;1;\n")), "CSV_SCIENTIFIC_NOTATION");
});

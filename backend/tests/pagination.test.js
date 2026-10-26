const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePositiveInt, MAX_ROWS } = require("../utils/pagination");

test("parsePositiveInt respeta el valor pedido dentro del tope", () => {
  assert.equal(parsePositiveInt("200", 50), 200);
  assert.equal(parsePositiveInt(25, 50), 25);
});

test("parsePositiveInt usa el default si falta o es invalido", () => {
  assert.equal(parsePositiveInt(undefined, 50), 50);
  assert.equal(parsePositiveInt("abc", 12), 12);
  assert.equal(parsePositiveInt("0", 100), 100);
  assert.equal(parsePositiveInt("-5", 100), 100);
});

test("parsePositiveInt acota al maximo", () => {
  assert.equal(parsePositiveInt("999999999", 50), MAX_ROWS);
  assert.equal(parsePositiveInt("70", 1, 60), 60);
});

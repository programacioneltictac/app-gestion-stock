const test = require("node:test");
const assert = require("node:assert/strict");
const status = require("../utils/orderStatus");

test("los estados editables son todos menos los terminales", () => {
  assert.deepEqual(
    status.ORDER_STATUSES_EDITABLE,
    status.ORDER_STATUSES.filter((s) => !status.ORDER_STATUSES_TERMINAL.includes(s)),
  );
});

test("liveOrderSql arma la clausula de orden viva", () => {
  assert.equal(status.liveOrderSql(), "oc.status NOT IN ('finalizado', 'cancelado')");
  assert.equal(status.liveOrderSql("o"), "o.status NOT IN ('finalizado', 'cancelado')");
});

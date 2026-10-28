const test = require("node:test");
const assert = require("node:assert/strict");

// Un solo reintento para que el test no espere de más (2s de pausa).
process.env.EXTERNAL_API_RETRIES = "1";
const axios = require("axios");
const { iduoGet, retryableError, isTransient } = require("../utils/iduoClient");

const realGet = axios.get;
const mockGet = (responses) => {
  const calls = [];
  axios.get = async (url, opts) => {
    calls.push({ url, opts });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { data: r };
  };
  return calls;
};
const asArray = (data) => {
  if (!Array.isArray(data)) throw retryableError("no array", "NON_ARRAY_RESPONSE");
  return data;
};

test.afterEach(() => {
  axios.get = realGet;
});

test("iduoGet manda Token y pide la respuesta sin comprimir", async () => {
  const calls = mockGet([[{ id: 1 }]]);
  const data = await iduoGet("http://x/?a=1", { token: "T", validate: asArray });
  assert.deepEqual(data, [{ id: 1 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.headers.Token, "T");
  assert.equal(calls[0].opts.headers["Accept-Encoding"], "identity");
  assert.equal(calls[0].opts.decompress, false);
});

test("iduoGet reintenta una respuesta con forma invalida", async () => {
  const calls = mockGet([{}, [{ id: 2 }]]);
  const data = await iduoGet("http://x", { token: "T", validate: asArray });
  assert.deepEqual(data, [{ id: 2 }]);
  assert.equal(calls.length, 2);
});

test("iduoGet no reintenta hayerror y usa el prefijo", async () => {
  const calls = mockGet([{ hayerror: true, error: "param" }]);
  await assert.rejects(
    iduoGet("http://x", { token: "T", validate: asArray, errorPrefix: "Error de API de compras" }),
    /Error de API de compras: param/,
  );
  assert.equal(calls.length, 1);
});

test("iduoGet corta tras agotar los reintentos", async () => {
  const timeout = Object.assign(new Error("timeout"), { code: "ECONNABORTED" });
  const calls = mockGet([timeout, timeout, [{ id: 3 }]]);
  await assert.rejects(iduoGet("http://x", { token: "T", validate: asArray }), /timeout/);
  assert.equal(calls.length, 2);
});

test("isTransient distingue errores de red de los deterministicos", () => {
  assert.equal(isTransient({ code: "ECONNRESET" }), true);
  assert.equal(isTransient({ message: "incorrect header check" }), true);
  assert.equal(isTransient({ response: { status: 502 } }), true);
  assert.equal(isTransient({ response: { status: 404 } }), false);
  assert.equal(isTransient(new Error("Error de API externa: x")), false);
});

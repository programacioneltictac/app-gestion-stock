const test = require("node:test");
const assert = require("node:assert/strict");
const { validateLoginInput, getUsernameError, getPasswordError, isValidRole } = require("../middlewares/validation");

// Corre el middleware y devuelve el mensaje de error (o "next" si pasó).
const runLogin = (body) => {
  let outcome = null;
  const res = { status: () => ({ json: (payload) => (outcome = payload.message) }) };
  validateLoginInput({ body }, res, () => (outcome = "next"));
  return outcome;
};

test("validateLoginInput conserva el orden de los mensajes", () => {
  assert.equal(runLogin({}), "Usuario y contraseña son requeridos");
  assert.equal(runLogin({ username: 1, password: "abcd" }), "Usuario y contraseña deben ser texto");
  assert.equal(runLogin({ username: "a", password: "x" }), "El usuario debe tener entre 2 y 50 caracteres");
  assert.equal(runLogin({ username: "ju an", password: "x" }), "La contraseña debe tener entre 4 y 100 caracteres");
  assert.match(runLogin({ username: "ju an", password: "abcd" }), /solo puede contener/);
  assert.equal(runLogin({ username: "  juan.p  ", password: "abcd" }), "next");
});

test("reglas de usuario, contraseña y rol", () => {
  assert.equal(getUsernameError("juan_p-1.x"), null);
  assert.match(getUsernameError("juan p"), /solo puede contener/);
  assert.equal(getPasswordError("abc").includes("entre 4 y 100"), true);
  assert.equal(getPasswordError("abcd"), null);
  assert.equal(isValidRole("manager"), true);
  assert.equal(isValidRole("root"), false);
});

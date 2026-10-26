const VALID_ROLES = ["admin", "manager", "employee"];
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * Reglas de usuario/contraseña compartidas por login, registro y el ABM de
 * usuarios. Devuelve el mensaje de error, o null si es válido. `username` ya
 * debe venir recortado (trim).
 */
function getUsernameLengthError(username) {
  return username.length < 2 || username.length > 50
    ? "El usuario debe tener entre 2 y 50 caracteres"
    : null;
}

function getUsernameFormatError(username) {
  return USERNAME_PATTERN.test(username)
    ? null
    : "El usuario solo puede contener letras, números, puntos, guiones y guiones bajos";
}

function getUsernameError(username) {
  return getUsernameLengthError(username) || getUsernameFormatError(username);
}

function getPasswordError(password) {
  if (password.length < 4 || password.length > 100) {
    return "La contraseña debe tener entre 4 y 100 caracteres";
  }
  return null;
}

const isValidRole = (role) => VALID_ROLES.includes(role);

const badRequest = (res, message) => res.status(400).json({ status: "error", message });

// Validación de input para login
function validateLoginInput(req, res, next) {
  const { username, password } = req.body;

  if (!username || !password) {
    return badRequest(res, "Usuario y contraseña son requeridos");
  }

  if (typeof username !== "string" || typeof password !== "string") {
    return badRequest(res, "Usuario y contraseña deben ser texto");
  }

  req.body.username = username.trim();
  const error =
    getUsernameLengthError(req.body.username) ||
    getPasswordError(password) ||
    getUsernameFormatError(req.body.username);
  if (error) return badRequest(res, error);

  next();
}

// Validación de input para registro
function validateRegisterInput(req, res, next) {
  const { role, branch_id } = req.body;

  validateLoginInput(req, res, () => {
    if (role && !isValidRole(role)) {
      return badRequest(res, "Rol inválido. Debe ser: admin, manager o employee");
    }

    if (branch_id && (typeof branch_id !== "number" || branch_id < 1)) {
      return badRequest(res, "ID de sucursal inválido");
    }

    next();
  });
}

// Validar entrada de datos para stock items
const validateStockItemInput = (req, res, next) => {
  const { brand_id, stock_require, stock_current } = req.body;

  if (!brand_id) {
    return res.status(400).json({
      status: "error",
      message: "brand_id es requerido",
    });
  }

  if (typeof stock_require !== "number" || stock_require < 0) {
    return res.status(400).json({
      status: "error",
      message: "stock_require debe ser un número mayor o igual a 0",
    });
  }

  if (typeof stock_current !== "number" || stock_current < 0) {
    return res.status(400).json({
      status: "error",
      message: "stock_current debe ser un número mayor o igual a 0",
    });
  }

  next();
};

// Validar entrada de datos para actualización de stock items
const validateStockItemUpdate = (req, res, next) => {
  const { category_id, condition_id, product_status_id, brand_status_id, stock_require, stock_current } = req.body;

  if (category_id && (typeof category_id !== "number" || category_id < 1)) {
    return res.status(400).json({
      status: "error",
      message: "category_id debe ser un número válido",
    });
  }

  if (condition_id && (typeof condition_id !== "number" || condition_id < 1)) {
    return res.status(400).json({
      status: "error",
      message: "condition_id debe ser un número válido",
    });
  }

  // Aceptar tanto product_status_id (legacy) como brand_status_id (nuevo)
  const statusId = brand_status_id || product_status_id;
  if (statusId && (typeof statusId !== "number" || statusId < 1)) {
    return res.status(400).json({
      status: "error",
      message: "brand_status_id/product_status_id debe ser un número válido",
    });
  }

  if (typeof stock_require !== "number" || stock_require < 0) {
    return res.status(400).json({
      status: "error",
      message: "stock_require debe ser un número mayor o igual a 0",
    });
  }

  if (typeof stock_current !== "number" || stock_current < 0) {
    return res.status(400).json({
      status: "error",
      message: "stock_current debe ser un número mayor o igual a 0",
    });
  }

  next();
};

module.exports = {
  getUsernameError,
  getPasswordError,
  isValidRole,
  validateLoginInput,
  validateRegisterInput,
  validateStockItemInput,
  validateStockItemUpdate,
};

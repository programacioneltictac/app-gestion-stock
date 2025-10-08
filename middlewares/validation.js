// Validación de input para login
function validateLoginInput(req, res, next) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      status: "error",
      message: "Usuario y contraseña son requeridos",
    });
  }

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({
      status: "error",
      message: "Usuario y contraseña deben ser texto",
    });
  }

  req.body.username = username.trim();
  if (req.body.username.length < 2 || req.body.username.length > 50) {
    return res.status(400).json({
      status: "error",
      message: "El usuario debe tener entre 2 y 50 caracteres",
    });
  }

  if (password.length < 4 || password.length > 100) {
    return res.status(400).json({
      status: "error",
      message: "La contraseña debe tener entre 4 y 100 caracteres",
    });
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(req.body.username)) {
    return res.status(400).json({
      status: "error",
      message:
        "El usuario solo puede contener letras, números, puntos, guiones y guiones bajos",
    });
  }

  next();
}

// Validación de input para registro
function validateRegisterInput(req, res, next) {
  const { username, password, role, branch_id } = req.body;

  validateLoginInput(req, res, () => {
    if (role && !["admin", "manager", "employee"].includes(role)) {
      return res.status(400).json({
        status: "error",
        message: "Rol inválido. Debe ser: admin, manager o employee",
      });
    }

    if (branch_id && (typeof branch_id !== "number" || branch_id < 1)) {
      return res.status(400).json({
        status: "error",
        message: "ID de sucursal inválido",
      });
    }

    next();
  });
}

// Validar entrada de datos para stock items
const validateStockItemInput = (req, res, next) => {
  const { product_id, stock_require, stock_current } = req.body;

  if (!product_id) {
    return res.status(400).json({
      status: "error",
      message: "product_id es requerido",
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
  const { stock_require, stock_current } = req.body;

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
  validateLoginInput,
  validateRegisterInput,
  validateStockItemInput,
  validateStockItemUpdate,
};

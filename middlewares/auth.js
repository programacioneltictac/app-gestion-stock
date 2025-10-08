const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET || "fallback-secret-key-change-in-production";

// Middleware para verificar JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res
      .status(401)
      .json({ status: "error", message: "Token de acceso requerido" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ status: "error", message: "Token inválido o expirado" });
    }
    req.user = user;
    next();
  });
};

// Middleware para verificar roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res
        .status(403)
        .json({ status: "error", message: "Acceso denegado: rol requerido" });
    }
    if (roles.includes(req.user.role)) {
      return next();
    }
    return res
      .status(403)
      .json({ status: "error", message: "Acceso denegado: rol insuficiente" });
  };
}

// Middleware para controlar acceso por sucursal
function checkBranchAccess(req, res, next) {
  if (req.user && req.user.branch_id) {
    req.branchFilter = { branch_id: req.user.branch_id };
  }
  next();
}

// Middleware para filtrar automáticamente para empleados
function addBranchFilter(req, res, next) {
  if (req.user && req.user.role === "employee" && req.user.branch_id) {
    req.branchFilter = { branch_id: req.user.branch_id };
  }
  next();
}

// Función auxiliar para validar acceso a sucursal
const canAccessBranch = (user, branchId) => {
  if (user.role === "admin" || user.role === "manager") {
    return true;
  }
  if (user.role === "employee" && user.branch_id === parseInt(branchId)) {
    return true;
  }
  return false;
};

// Función auxiliar para obtener branch_id según el rol
const getBranchId = (user, requestedBranchId) => {
  if (user.role === "employee") {
    return user.branch_id;
  }
  return requestedBranchId || user.branch_id;
};

module.exports = {
  authenticateToken,
  requireRole,
  checkBranchAccess,
  addBranchFilter,
  canAccessBranch,
  getBranchId,
  JWT_SECRET,
};

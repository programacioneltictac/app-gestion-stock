const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { JWT_SECRET } = require("../middlewares/auth");

const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || "24h";

// POST /api/login
const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findByUsername(username);

    if (!user) {
      return res
        .status(401)
        .json({ status: "error", message: "Credenciales inválidas" });
    }

    const match = await User.verifyPassword(password, user.password_hash);

    if (!match) {
      return res
        .status(401)
        .json({ status: "error", message: "Credenciales inválidas" });
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id,
      branch_name: user.branch_name,
      branch_code: user.branch_code,
      iat: Math.floor(Date.now() / 1000),
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRES_IN,
    });

    console.log(
      `✅ Login exitoso - Usuario: ${username}, Role: ${user.role}, Branch: ${
        user.branch_name || "N/A"
      }, IP: ${req.ip}`
    );

    res.json({
      status: "success",
      message: "Login exitoso",
      token: token,
      user: {
        id: payload.id,
        username: payload.username,
        role: payload.role,
        branch_id: payload.branch_id,
        branch_name: payload.branch_name,
        branch_code: payload.branch_code,
      },
    });
  } catch (error) {
    console.error("❌ Error en login:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// POST /api/logout
const logout = (req, res) => {
  console.log(`📤 Logout - Usuario: ${req.user.username}, IP: ${req.ip}`);
  res.json({ status: "success", message: "Logout exitoso" });
};

// POST /api/register
const register = async (req, res) => {
  const {
    username,
    password,
    role = "employee",
    branch_id = null,
  } = req.body;

  try {
    const exists = await User.exists(username);
    if (exists) {
      return res
        .status(409)
        .json({ status: "error", message: "El usuario ya existe" });
    }

    if (branch_id) {
      const Branch = require("../models/Branch");
      const branchExists = await Branch.exists(branch_id);
      if (!branchExists) {
        return res.status(400).json({
          status: "error",
          message: "La sucursal especificada no existe",
        });
      }
    }

    const result = await User.create(username, password, role, branch_id);

    console.log(
      `👤 Usuario creado - ID: ${result.id}, Username: ${username}, Role: ${role}, Branch: ${
        branch_id || "N/A"
      }, Creado por: ${req.user.username}`
    );

    res.json({ status: "success", message: "Usuario creado exitosamente" });
  } catch (error) {
    console.error("❌ Error en registro:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/profile
const getProfile = (req, res) => {
  res.json({
    status: "success",
    message: "Perfil del usuario",
    user: req.user,
  });
};

// GET /api/verify-auth
const verifyAuth = (req, res) => {
  res.json({
    status: "success",
    message: "Usuario autenticado",
    user: req.user,
  });
};

module.exports = {
  login,
  logout,
  register,
  getProfile,
  verifyAuth,
};

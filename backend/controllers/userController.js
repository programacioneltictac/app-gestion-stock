const User = require("../models/User");
const { handleControllerError } = require("../utils/errorHelper");

// GET /api/users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.getAll();
    res.json({
      status: "success",
      users: users,
    });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo usuarios:");
  }
};

// GET /api/users/:id
const getUserById = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "Usuario no encontrado",
      });
    }

    res.json({
      status: "success",
      user: user,
    });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo usuario:");
  }
};

// POST /api/users
const createUser = async (req, res) => {
  try {
    const { username, password, role, branch_id } = req.body;

    // Validaciones
    if (!username || !password || !role) {
      return res.status(400).json({
        status: "error",
        message: "Usuario, contraseña y rol son requeridos",
      });
    }

    // Verificar si el usuario ya existe
    const exists = await User.exists(username);
    if (exists) {
      return res.status(409).json({
        status: "error",
        message: "El nombre de usuario ya existe",
      });
    }

    // Crear usuario
    const newUser = await User.create(username, password, role, branch_id || null);

    // Obtener el usuario completo con sus datos
    const user = await User.findById(newUser.id);

    console.log(`Usuario creado - ID: ${newUser.id}, Username: ${username}, Rol: ${role}`);

    res.status(201).json({
      status: "success",
      message: "Usuario creado exitosamente",
      user: user,
    });
  } catch (error) {
    handleControllerError(res, error, "Error creando usuario:");
  }
};

// PUT /api/users/:id
const updateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { username, password, role, branch_id } = req.body;

    // Verificar que el usuario existe
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "Usuario no encontrado",
      });
    }

    // Validaciones básicas
    if (!username || !role) {
      return res.status(400).json({
        status: "error",
        message: "Usuario y rol son requeridos",
      });
    }

    // Si se cambió el username, verificar que no esté en uso
    if (username !== user.username) {
      const exists = await User.exists(username);
      if (exists) {
        return res.status(409).json({
          status: "error",
          message: "El nombre de usuario ya existe",
        });
      }
    }

    // Actualizar usuario
    await User.update(userId, username, password || null, role, branch_id || null);

    // Obtener el usuario actualizado
    const updatedUser = await User.findById(userId);

    console.log(`Usuario actualizado - ID: ${userId}, Username: ${username}, Rol: ${role}`);

    res.json({
      status: "success",
      message: "Usuario actualizado exitosamente",
      user: updatedUser,
    });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando usuario:");
  }
};

// DELETE /api/users/:id
const deleteUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Verificar que el usuario existe
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "Usuario no encontrado",
      });
    }

    // No permitir que un usuario se elimine a sí mismo
    if (userId === req.user.id) {
      return res.status(400).json({
        status: "error",
        message: "No puedes eliminar tu propia cuenta",
      });
    }

    // Eliminar usuario (necesitaremos agregar este método al modelo)
    await User.delete(userId);

    console.log(`Usuario eliminado - ID: ${userId}, Username: ${user.username}`);

    res.json({
      status: "success",
      message: "Usuario eliminado exitosamente",
    });
  } catch (error) {
    handleControllerError(res, error, "Error eliminando usuario:");
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};

const User = require("../models/User");

// GET /api/users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.getAll();
    res.json({
      status: "success",
      users: users,
    });
  } catch (error) {
    console.error("❌ Error obteniendo usuarios:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

module.exports = {
  getAllUsers,
};

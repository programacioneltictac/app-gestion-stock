const Branch = require("../models/Branch");

// GET /api/branches
const getAllBranches = async (req, res) => {
  try {
    const filterBranchId = req.branchFilter?.branch_id || null;
    const branches = await Branch.findAll(filterBranchId);
    res.json({
      status: "success",
      branches: branches,
    });
  } catch (error) {
    console.error("❌ Error obteniendo sucursales:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/my-branch
const getMyBranch = async (req, res) => {
  try {
    if (!req.user.branch_id) {
      return res.json({
        status: "success",
        branch: null,
        message: "Usuario tiene acceso a todas las sucursales",
      });
    }

    const branch = await Branch.findById(req.user.branch_id);
    res.json({
      status: "success",
      branch: branch,
    });
  } catch (error) {
    console.error("❌ Error obteniendo sucursal del usuario:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/stock/branches-list
const getBranchesList = async (req, res) => {
  try {
    const filterBranchId =
      req.user.role === "employee" ? req.user.branch_id : null;
    const branches = await Branch.findAll(filterBranchId);
    res.json({
      status: "success",
      branches: branches,
    });
  } catch (error) {
    console.error("❌ Error obteniendo lista de sucursales:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

module.exports = {
  getAllBranches,
  getMyBranch,
  getBranchesList,
};

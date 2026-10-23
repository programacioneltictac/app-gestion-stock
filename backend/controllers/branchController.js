const Branch = require("../models/Branch");
const { handleControllerError } = require("../utils/errorHelper");

// PUT /api/branches/:id/api-codes  — configurar códigos de API de una sucursal
const updateApiCodes = async (req, res) => {
  try {
    const { id } = req.params;
    const { api_branch_code, api_deposit_code } = req.body;

    if (!api_branch_code || !api_deposit_code) {
      return res.status(400).json({
        status: "error",
        message: "api_branch_code y api_deposit_code son requeridos",
      });
    }

    const updated = await Branch.updateApiCodes(id, api_branch_code, api_deposit_code);

    if (!updated) {
      return res.status(404).json({ status: "error", message: "Sucursal no encontrada" });
    }

    console.log(`Códigos API actualizados - Sucursal ID: ${id}, Usuario: ${req.user.username}`);

    res.json({ status: "success", data: updated, message: "Códigos de API actualizados" });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando códigos de API:");
  }
};

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
    handleControllerError(res, error, "Error obteniendo sucursales:");
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
    handleControllerError(res, error, "Error obteniendo sucursal del usuario:");
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
    handleControllerError(res, error, "Error obteniendo lista de sucursales:");
  }
};

// GET /api/branches/admin — todas las sucursales con sus bloqueos (solo admin)
const getAdminList = async (req, res) => {
  try {
    const branches = await Branch.findAllAdmin();
    res.json({ status: "success", branches });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo sucursales (admin):");
  }
};

// PUT /api/branches/:id/active { is_active } — desactivar/reactivar (solo admin).
// Desactivar solo si no es el Hub y no tiene controles ni órdenes activas.
const setActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({ status: "error", message: "is_active debe ser true o false" });
    }

    const branch = await Branch.findAdminById(id);
    if (!branch) {
      return res.status(404).json({ status: "error", message: "Sucursal no encontrada" });
    }

    if (!is_active) {
      if (branch.is_hub) {
        return res.status(400).json({
          status: "error",
          message: "El Nodo Hub no se puede desactivar: lo usan las órdenes internas",
        });
      }
      const blockers = [];
      if (branch.active_controls > 0) blockers.push(`${branch.active_controls} control(es) activo(s)`);
      if (branch.active_orders > 0) blockers.push(`${branch.active_orders} orden(es) activa(s)`);
      if (blockers.length > 0) {
        return res.status(400).json({
          status: "error",
          message: `No se puede desactivar ${branch.name}: tiene ${blockers.join(" y ")}`,
        });
      }
    }

    const updated = await Branch.setActive(id, is_active);

    console.log(
      `Sucursal ${is_active ? "reactivada" : "desactivada"} - ${updated.name} (ID ${id}), Usuario: ${req.user.username}`
    );

    res.json({
      status: "success",
      data: updated,
      message: `Sucursal ${is_active ? "reactivada" : "desactivada"}`,
    });
  } catch (error) {
    handleControllerError(res, error, "Error cambiando estado de sucursal:");
  }
};

module.exports = {
  getAllBranches,
  getMyBranch,
  getBranchesList,
  updateApiCodes,
  getAdminList,
  setActive,
};

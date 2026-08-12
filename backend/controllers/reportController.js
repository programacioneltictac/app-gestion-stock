const Report = require("../models/Report");
const { handleControllerError } = require("../utils/errorHelper");

// GET /api/reports/situacion — informe de situación actual (datos para el PDF).
// Employee: solo su sucursal. Admin/manager: todas. El filtro se aplica en SQL,
// así que un employee nunca recibe datos de otras sucursales.
const getSituation = async (req, res) => {
  try {
    const branchId = req.user.role === "employee" ? req.user.branch_id : null;
    const report = await Report.getSituation(branchId);
    res.json({ status: "success", ...report });
  } catch (error) {
    handleControllerError(res, error, "Error generando el informe de situación:");
  }
};

module.exports = { getSituation };

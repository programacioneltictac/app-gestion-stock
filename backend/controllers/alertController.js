const Alert = require("../models/Alert");
const { handleControllerError } = require("../utils/errorHelper");

// GET /api/alerts?branches=1,3 — panel de alertas tempranas.
// Employee: SIEMPRE solo su sucursal (el parámetro se ignora). Admin/manager:
// las sucursales de `branches` (filtro de chips del dashboard), o todas si no
// viene. `branches=` vacío = ninguna sucursal (todo en cero).
const getAlerts = async (req, res) => {
  try {
    let branchIds = null;
    if (req.user.role === "employee") {
      branchIds = req.user.branch_id ? [req.user.branch_id] : null;
    } else if (req.query.branches !== undefined) {
      branchIds = String(req.query.branches)
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
    }
    const summary = await Alert.getSummary(branchIds);
    res.json({ status: "success", ...summary });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo alertas:");
  }
};

module.exports = { getAlerts };

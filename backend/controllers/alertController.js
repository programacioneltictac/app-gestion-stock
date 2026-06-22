const Alert = require("../models/Alert");
const { handleControllerError } = require("../utils/errorHelper");

// GET /api/alerts — panel de alertas tempranas.
// Employee: solo su sucursal. Admin/manager: todas.
const getAlerts = async (req, res) => {
  try {
    const branchId = req.user.role === "employee" ? req.user.branch_id : null;
    const summary = await Alert.getSummary(branchId);
    res.json({ status: "success", ...summary });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo alertas:");
  }
};

module.exports = { getAlerts };

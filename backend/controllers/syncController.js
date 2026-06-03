const { syncAllBranches, syncBranch } = require("../utils/syncService");
const { pool } = require("../database/config");
const { handleControllerError } = require("../utils/errorHelper");

// POST /api/sync/all  — sincroniza todas las sucursales configuradas
const syncAll = async (req, res) => {
  try {
    console.log(`Sync iniciado por usuario: ${req.user.username}`);
    const result = await syncAllBranches();
    res.json({ status: "success", ...result });
  } catch (error) {
    handleControllerError(res, error, "Error en sincronización completa:");
  }
};

// POST /api/sync/branch/:branch_id  — sincroniza una sucursal específica
const syncOneBranch = async (req, res) => {
  try {
    const { branch_id } = req.params;

    const branchResult = await pool.query(
      "SELECT id, name, api_branch_code, api_deposit_code FROM branches WHERE id = $1 AND is_active = true",
      [branch_id]
    );

    const branch = branchResult.rows[0];

    if (!branch) {
      return res.status(404).json({ status: "error", message: "Sucursal no encontrada" });
    }

    if (!branch.api_branch_code) {
      return res.status(400).json({
        status: "error",
        message: "La sucursal no tiene código de API configurado",
      });
    }

    console.log(`Sync de sucursal ${branch.name} iniciado por: ${req.user.username}`);
    const stats = await syncBranch(branch);

    res.json({
      status: "success",
      branch: branch.name,
      ...stats,
    });
  } catch (error) {
    handleControllerError(res, error, "Error sincronizando sucursal:");
  }
};

// GET /api/sync/status  — muestra cuándo fue la última sync por sucursal
const getSyncStatus = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         b.id,
         b.name,
         b.api_branch_code,
         b.api_deposit_code,
         MAX(psb.last_sync_at) AS last_sync_at,
         COUNT(psb.id)         AS items_synced
       FROM branches b
       LEFT JOIN product_stock_by_branch psb ON psb.branch_id = b.id
       WHERE b.is_active = true
       GROUP BY b.id, b.name, b.api_branch_code, b.api_deposit_code
       ORDER BY b.name`
    );

    res.json({ status: "success", branches: result.rows });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo estado de sync:");
  }
};

module.exports = { syncAll, syncOneBranch, getSyncStatus };

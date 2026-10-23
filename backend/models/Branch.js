const { pool } = require("../database/config");
const { ORDER_STATUSES_TERMINAL } = require("../utils/orderStatus");

// Conteos que bloquean desactivar una sucursal ($1 = estados terminales).
const BLOCKER_COUNTS_SQL = `
  (SELECT COUNT(*)::int FROM monthly_controls mc
    WHERE mc.branch_id = b.id AND mc.status IN ('draft', 'completed')) AS active_controls,
  (SELECT COUNT(*)::int FROM orders_controls oc
    WHERE (oc.branch_id = b.id OR oc.source_branch_id = b.id)
      AND oc.status <> ALL($1::text[])) AS active_orders,
  (SELECT COUNT(*)::int FROM users u WHERE u.branch_id = b.id) AS users_count`;

const INACTIVE_CACHE_MS = 60 * 1000;
let inactiveCache = null;

class Branch {
  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM branches WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  static async findAll(filterByBranchId = null) {
    let query = "SELECT * FROM branches WHERE is_active = true";
    let params = [];

    if (filterByBranchId) {
      query += " AND id = $1";
      params.push(filterByBranchId);
    }

    query += " ORDER BY name";
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async exists(id) {
    const result = await pool.query(
      "SELECT id FROM branches WHERE id = $1 AND is_active = true",
      [id]
    );
    return result.rows.length > 0;
  }

  static async findByCode(code) {
    const result = await pool.query(
      "SELECT * FROM branches WHERE code = $1",
      [code]
    );
    return result.rows[0] || null;
  }

  // Actualizar códigos de API de una sucursal
  static async updateApiCodes(id, apiBranchCode, apiDepositCode) {
    const result = await pool.query(
      `UPDATE branches
       SET api_branch_code = $1, api_deposit_code = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [apiBranchCode, apiDepositCode, id]
    );
    return result.rows[0] || null;
  }

  // Listado de administración: TODAS las sucursales (activas e inactivas) con lo
  // que bloquea desactivarlas. Controles activos = draft+completed (los que
  // alimentan dashboard/PDF); órdenes activas = no terminales, como origen o destino.
  static async findAllAdmin() {
    const result = await pool.query(
      `SELECT b.id, b.name, b.code, b.api_branch_code, b.is_active, b.is_hub,
              ${BLOCKER_COUNTS_SQL}
       FROM branches b
       ORDER BY b.is_active DESC, b.name`,
      [ORDER_STATUSES_TERMINAL]
    );
    return result.rows;
  }

  static async findAdminById(id) {
    const result = await pool.query(
      `SELECT b.id, b.name, b.is_active, b.is_hub, ${BLOCKER_COUNTS_SQL}
       FROM branches b
       WHERE b.id = $2`,
      [ORDER_STATUSES_TERMINAL, id]
    );
    return result.rows[0] || null;
  }

  static async setActive(id, isActive) {
    const result = await pool.query(
      `UPDATE branches SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [isActive, id]
    );
    inactiveCache = null;
    return result.rows[0] || null;
  }

  // ¿La sucursal está desactivada? Lo consulta authenticateToken en cada request
  // de un employee, por eso va con caché corta en memoria (se invalida al
  // cambiar el estado desde la app; un cambio por SQL tarda hasta 60 s).
  static async isInactive(id) {
    if (!inactiveCache || Date.now() - inactiveCache.at > INACTIVE_CACHE_MS) {
      const result = await pool.query("SELECT id FROM branches WHERE is_active = false");
      inactiveCache = { at: Date.now(), ids: new Set(result.rows.map((r) => r.id)) };
    }
    return inactiveCache.ids.has(Number(id));
  }

  // Obtener sucursales con códigos de API configurados
  static async findWithApiCodes() {
    const result = await pool.query(
      `SELECT id, name, code, api_branch_code, api_deposit_code
       FROM branches
       WHERE api_branch_code IS NOT NULL AND is_active = true
       ORDER BY name`
    );
    return result.rows;
  }
}

module.exports = Branch;

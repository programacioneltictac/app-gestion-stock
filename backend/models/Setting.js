const { pool } = require("../database/config");

// Acceso a la tabla app_settings (configuracion global clave/valor).
class Setting {
  static async get(key) {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = $1",
      [key]
    );
    return result.rows[0]?.value ?? null;
  }

  // Devuelve el valor como numero, o el default si no existe / no es numerico.
  static async getNumber(key, fallback) {
    const raw = await Setting.get(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  static async getAll() {
    const result = await pool.query(
      "SELECT key, value, description, updated_at FROM app_settings ORDER BY key"
    );
    return result.rows;
  }

  static async set(key, value) {
    const result = await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING key, value, description, updated_at`,
      [key, String(value)]
    );
    return result.rows[0];
  }
}

module.exports = Setting;

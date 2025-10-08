const { Pool } = require("pg");

// Crear un pool de conexiones
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Función para testear la conexión
const testConnection = async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("✅ Conectado a la base de datos, hora actual:", res.rows[0]);
  } catch (err) {
    console.error("❌ Error de conexión:", err);
  }
};

module.exports = { pool, testConnection };

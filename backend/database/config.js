const { Pool } = require("pg");

// En produccion (Render) la conexion viene en DATABASE_URL y exige SSL.
// En local seguimos usando las variables sueltas DB_* sin SSL.
const useConnectionString = Boolean(process.env.DATABASE_URL);

const pool = new Pool(
  useConnectionString
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      }
);

// Un cliente inactivo del pool puede emitir 'error' (ej. la BD corta la
// conexión). Sin listener, Node lo trata como excepción no capturada y tumba el
// proceso; el pool descarta ese cliente y abre otro en el próximo query.
pool.on("error", (err) => {
  console.error("❌ Error en cliente inactivo del pool de PostgreSQL:", err.message);
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

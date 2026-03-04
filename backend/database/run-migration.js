const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Cargar variables de entorno
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Crear pool de conexiones
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log("🔄 Ejecutando migración a sistema de marcas...");

    // Leer archivo SQL
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, "migration-to-brands.sql"),
      "utf8"
    );

    // Ejecutar migración
    await client.query(migrationSQL);

    console.log("✅ Migración completada exitosamente");
    console.log("\nCambios aplicados:");
    console.log("- product_id ahora es nullable");
    console.log("- Se agregó brand_id a stock_controls");
    console.log("- Se actualizó brand_id con datos existentes");
    console.log("- Se creó constraint único: (monthly_control_id, brand_id, category_id)");
    console.log("- Se renombró product_status_id a brand_status_id");
    console.log("- Se creó índice para brand_id");

  } catch (error) {
    console.error("❌ Error ejecutando migración:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

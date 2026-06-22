require("dotenv").config();
const path = require("path");
const express = require("express");
const { testConnection, pool } = require("./database/config");
const { securityHeaders, apiLimiter } = require("./middlewares/security");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");
const { authenticateToken, requireRole } = require("./middlewares/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Probar conexión al iniciar
testConnection();

// ==================== MIDDLEWARE ====================

// Middleware de seguridad
app.use(securityHeaders);

// Body parser
app.use(express.json({ limit: "1mb" }));

// Rate limiting para APIs
app.use("/api", apiLimiter);

// ==================== RUTAS ====================

// Rutas de autenticación
const authRoutes = require("./routes/auth");
app.use("/api", authRoutes);

// Rutas de usuarios
const userRoutes = require("./routes/users");
app.use("/api/users", userRoutes);

// Rutas de sucursales
const branchRoutes = require("./routes/branches");
app.use("/api/branches", branchRoutes);

// Rutas de stock (protegidas con authenticateToken)
const stockRoutes = require("./routes/stock");
app.use("/api/stock", authenticateToken, stockRoutes);

// Rutas de catálogos (protegidas con authenticateToken)
const catalogRoutes = require("./routes/catalogs");
app.use("/api/stock/catalogs", authenticateToken, catalogRoutes);

const productRoutes = require("./routes/products");
app.use(
  "/api/stock/products",
  authenticateToken,
  requireRole("admin"),
  productRoutes
);

// Rutas de grupos de productos
const productGroupRoutes = require("./routes/productGroups");
app.use("/api/product-groups", authenticateToken, productGroupRoutes);

// Rutas de sincronización con API externa
const syncRoutes = require("./routes/sync");
app.use("/api/sync", authenticateToken, syncRoutes);

// Rutas de ordenes de reposicion
const orderRoutes = require("./routes/orders");
app.use("/api/orders", authenticateToken, orderRoutes);

// Rutas de proveedores (catálogo)
const supplierRoutes = require("./routes/suppliers");
app.use("/api/suppliers", supplierRoutes);

// Rutas de configuración global (app_settings)
const settingRoutes = require("./routes/settings");
app.use("/api/settings", settingRoutes);

// Rutas de alertas tempranas (panel del dashboard)
const alertRoutes = require("./routes/alerts");
app.use("/api/alerts", authenticateToken, alertRoutes);

// ==================== MANEJO DE ERRORES ====================

app.use(notFoundHandler);
app.use(errorHandler);

// ==================== INICIO DEL SERVIDOR ====================

const server = app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
  console.log(`🔒 Security features enabled:`);
  console.log(`   - Rate limiting: Login (5/15min), API (100/min)`);
  console.log(`   - Input validation and sanitization`);
  console.log(`   - Security headers`);
  console.log(`   - Audit logging`);
  console.log(`📦 Stock system endpoints available at /api/stock/`);
  console.log(`🏗️  Architecture: MVC (Model-View-Controller)`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    pool.end(() => {
      console.log("✅ Database pool closed");
      process.exit(0);
    });
  });
});

module.exports = app;

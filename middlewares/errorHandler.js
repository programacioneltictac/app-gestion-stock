// Manejo de errores 404
const notFoundHandler = (req, res) => {
  res.status(404).json({
    status: "error",
    message: "Endpoint no encontrado",
  });
};

// Manejo de errores global
const errorHandler = (err, req, res, next) => {
  console.error("💥 Error no manejado:", err);
  res.status(500).json({
    status: "error",
    message: "Error interno del servidor",
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};

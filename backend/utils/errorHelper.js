/**
 * Utility para manejo centralizado de errores en controllers
 */

/**
 * Maneja errores en controllers devolviendo respuesta consistente
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} customMessage - Mensaje personalizado opcional
 */
const handleControllerError = (res, error, customMessage = null) => {
  console.error("❌", customMessage || "Error:", error.message);
  res.status(500).json({
    status: "error",
    message: customMessage || "Error interno del servidor",
  });
};

module.exports = { handleControllerError };

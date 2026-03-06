/**
 * Utility para manejo centralizado de errores en controllers
 */

/**
 * Maneja errores en controllers devolviendo respuesta consistente
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} customMessage - Mensaje personalizado opcional
 */
const BUSINESS_ERROR_CODES = ["HAS_ORDERS"];

const handleControllerError = (res, error, customMessage = null) => {
  console.error("❌", customMessage || "Error:", error.message);

  // Errores de negocio conocidos: devolver 400 con el mensaje real
  if (BUSINESS_ERROR_CODES.includes(error.code)) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }

  res.status(500).json({
    status: "error",
    message: customMessage || "Error interno del servidor",
  });
};

module.exports = { handleControllerError };

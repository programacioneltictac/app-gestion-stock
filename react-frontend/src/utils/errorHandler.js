/**
 * Utility para manejo centralizado de errores en operaciones de API
 */

/**
 * Wrapper que añade manejo de errores consistente a funciones asíncronas
 * @param {Function} fn - Función asíncrona a ejecutar
 * @param {string} errorMsg - Mensaje descriptivo del error
 * @returns {Function} Función wrapped con manejo de errores
 */
export const withErrorHandling = (fn, errorMsg) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(errorMsg, error);
      throw error;
    }
  };
};

/**
 * Ejecuta una función con manejo de errores
 * @param {Function} fn - Función a ejecutar
 * @param {string} errorMsg - Mensaje de error
 */
export const handleAsyncError = async (fn, errorMsg) => {
  try {
    return await fn();
  } catch (error) {
    console.error(errorMsg, error);
    throw error;
  }
};

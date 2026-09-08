const express = require("express");
const router = express.Router();
const importController = require("../controllers/importController");
const { requireRole } = require("../middlewares/auth");

/**
 * El CSV llega como cuerpo crudo, no como JSON ni multipart: evita sumar
 * multer al proyecto para un unico endpoint. Se recibe en latin1 (el export de
 * IDUO no es UTF-8) y como Buffer, para que el parser decodifique el
 * encoding correcto.
 *
 * Limite 5 MB: el CSV mas grande observado (919 filas) pesa ~50 KB, asi que
 * deja margen amplio para la sucursal mas cargada sin exponer un endpoint que
 * acepte cuerpos arbitrariamente grandes.
 */
const csvBody = express.raw({
  type: ["text/csv", "text/plain", "application/octet-stream"],
  limit: "5mb",
});

// POST /api/import/stock/preview — analiza el CSV y devuelve el resumen SIN escribir
router.post(
  "/stock/preview",
  requireRole("admin"),
  csvBody,
  importController.previewStockCsv,
);

// POST /api/import/stock — importa el CSV (paso 2, tras confirmar la preview)
router.post(
  "/stock",
  requireRole("admin"),
  csvBody,
  importController.commitStockCsv,
);

module.exports = router;

const express = require("express");
const router = express.Router();
const searchController = require("../controllers/searchController");

// Buscador rapido (solo lectura). Visible para todos los roles; el controller
// acota los resultados a las sucursales que el usuario puede ver.
router.get("/stock", searchController.searchStock);
router.get("/products", searchController.searchProductOptions);
router.get("/suppliers", searchController.searchSupplierOptions);

module.exports = router;

const Search = require("../models/Search");
const Branch = require("../models/Branch");
const { handleControllerError } = require("../utils/errorHelper");

// Sucursales que el usuario puede ver. Mismo criterio que
// branchController.getBranchesList: employee solo la suya, admin/manager todas.
// Este buscador es multi-sucursal, por eso no sirve canAccessBranch (valida una).
const getVisibleBranchIds = async (user) => {
  const filterBranchId = user.role === "employee" ? user.branch_id : null;
  const branches = await Branch.findAll(filterBranchId);
  return branches.map((b) => b.id);
};

// Normaliza un query param numerico: "" / undefined / basura -> null
const parseIntParam = (value) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
};

// Tope de productos por busqueda. El limite tambien se valida aca y no solo en
// la UI: el parametro viaja en la query string y se puede editar a mano.
const MAX_PRODUCT_NAMES = 5;

// GET /api/search/stock?supplier_id=&product_stock_id=&q=&names=
// Filas producto x sucursal. Los filtros se combinan con AND.
// `names` es una lista separada por "|" (no por coma: los nombres de producto
// pueden contener comas).
const searchStock = async (req, res) => {
  try {
    const supplierId = parseIntParam(req.query.supplier_id);
    const productStockId = parseIntParam(req.query.product_stock_id);
    const q = (req.query.q || "").trim() || null;

    const names = (req.query.names || "")
      .split("|")
      .map((n) => n.trim())
      .filter(Boolean);

    if (names.length > MAX_PRODUCT_NAMES) {
      return res.status(400).json({
        status: "error",
        message: `Se pueden buscar hasta ${MAX_PRODUCT_NAMES} productos a la vez`,
      });
    }

    // Sin ningun criterio la consulta barreria toda la base: se exige al menos
    // uno y el frontend muestra el estado "elegi un producto o proveedor".
    if (!supplierId && !productStockId && !q && !names.length) {
      return res.status(400).json({
        status: "error",
        message: "Indica al menos un producto o un proveedor para buscar",
      });
    }

    const branchIds = await getVisibleBranchIds(req.user);
    const rows = await Search.findStock({ supplierId, productStockId, q, names, branchIds });

    // Se pidio MAX_ROWS + 1: si vino de mas, hay resultados sin mostrar.
    const truncated = rows.length > Search.MAX_ROWS;
    res.json({
      status: "success",
      results: truncated ? rows.slice(0, Search.MAX_ROWS) : rows,
      truncated,
    });
  } catch (error) {
    handleControllerError(res, error, "Error en la busqueda rapida:");
  }
};

// GET /api/search/products?q= — opciones del desplegable de productos
const searchProductOptions = async (req, res) => {
  try {
    const branchIds = await getVisibleBranchIds(req.user);
    const products = await Search.findProductOptions(req.query.q, branchIds);
    res.json({ status: "success", products });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo productos del buscador:");
  }
};

// GET /api/search/suppliers — opciones del desplegable de proveedores.
// Aparte de /api/suppliers (que exige admin/manager) porque un employee
// tambien usa este buscador.
const searchSupplierOptions = async (req, res) => {
  try {
    const branchIds = await getVisibleBranchIds(req.user);
    const suppliers = await Search.findSupplierOptions(branchIds);
    res.json({ status: "success", suppliers });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo proveedores del buscador:");
  }
};

module.exports = { searchStock, searchProductOptions, searchSupplierOptions };

const ProductGroup = require("../models/ProductGroup");
const { handleControllerError } = require("../utils/errorHelper");

// GET /api/product-groups  — listar todos los grupos con stock de la sucursal del usuario
const getAll = async (req, res) => {
  try {
    const { branch_id } = req.query;

    // Si no se pasa branch_id, listar sin stock
    const groups = branch_id
      ? await ProductGroup.findAllWithStock(parseInt(branch_id))
      : await ProductGroup.findAll();

    res.json({ status: "success", data: groups });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo grupos:");
  }
};

// GET /api/product-groups/:id
const getOne = async (req, res) => {
  try {
    const group = await ProductGroup.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ status: "error", message: "Grupo no encontrado" });
    }

    res.json({ status: "success", data: group });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo grupo:");
  }
};

// PUT /api/product-groups/:id/min-stock  — configurar stock mínimo de un grupo
const updateMinStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { min_stock } = req.body;

    if (min_stock === undefined || min_stock === null || isNaN(parseInt(min_stock))) {
      return res.status(400).json({ status: "error", message: "min_stock es requerido y debe ser un número" });
    }

    if (parseInt(min_stock) < 0) {
      return res.status(400).json({ status: "error", message: "min_stock no puede ser negativo" });
    }

    const updated = await ProductGroup.updateMinStock(id, parseInt(min_stock));

    if (!updated) {
      return res.status(404).json({ status: "error", message: "Grupo no encontrado" });
    }

    console.log(`Stock mínimo de grupo ${updated.display_name} actualizado a ${min_stock} por ${req.user.username}`);

    res.json({ status: "success", data: updated, message: "Stock mínimo actualizado" });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando stock mínimo del grupo:");
  }
};

module.exports = { getAll, getOne, updateMinStock };

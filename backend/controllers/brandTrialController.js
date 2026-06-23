const BrandTrial = require("../models/BrandTrial");
const { handleControllerError } = require("../utils/errorHelper");

// GET /api/brand-trials
const getAll = async (req, res) => {
  try {
    const trials = await BrandTrial.findAll();
    res.json({ status: "success", trials });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo marcas a prueba:");
  }
};

// GET /api/brand-trials/:id
const getById = async (req, res) => {
  try {
    const trial = await BrandTrial.findById(req.params.id);
    if (!trial) {
      return res.status(404).json({ status: "error", message: "Prueba no encontrada" });
    }
    res.json({ status: "success", trial });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo prueba:");
  }
};

// POST /api/brand-trials
const create = async (req, res) => {
  try {
    const {
      brand_id, branch_id, category_id,
      start_date, end_date,
      sample_qty, sample_type, sample_unit_cost,
    } = req.body;

    if (!brand_id || !branch_id) {
      return res.status(400).json({ status: "error", message: "brand_id y branch_id son requeridos" });
    }
    if (!end_date) {
      return res.status(400).json({ status: "error", message: "end_date (fin del período de prueba) es requerido" });
    }
    if (sample_type && !BrandTrial.SAMPLE_TYPES.includes(sample_type)) {
      return res.status(400).json({ status: "error", message: "sample_type inválido (consignacion | compra)" });
    }

    const trial = await BrandTrial.create({
      brand_id, branch_id,
      category_id: category_id || null,
      start_date: start_date || null,
      end_date,
      sample_qty: sample_qty != null ? parseInt(sample_qty) : null,
      sample_type: sample_type || null,
      sample_unit_cost: sample_unit_cost != null ? Number(sample_unit_cost) : null,
      created_by: req.user.id,
    });
    res.status(201).json({ status: "success", trial, message: "Prueba creada" });
  } catch (error) {
    handleControllerError(res, error, "Error creando prueba:");
  }
};

// PUT /api/brand-trials/:id  (solo mientras está en_prueba)
const update = async (req, res) => {
  try {
    const existing = await BrandTrial.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ status: "error", message: "Prueba no encontrada" });
    }
    if (existing.status !== "en_prueba") {
      return res.status(400).json({ status: "error", message: "No se puede editar una prueba ya decidida" });
    }

    const { category_id, start_date, end_date, sample_qty, sample_type, sample_unit_cost } = req.body;
    if (sample_type && !BrandTrial.SAMPLE_TYPES.includes(sample_type)) {
      return res.status(400).json({ status: "error", message: "sample_type inválido (consignacion | compra)" });
    }

    const trial = await BrandTrial.update(req.params.id, {
      category_id: category_id || null,
      start_date: start_date || null,
      end_date: end_date || null,
      sample_qty: sample_qty != null ? parseInt(sample_qty) : null,
      sample_type: sample_type || null,
      sample_unit_cost: sample_unit_cost != null ? Number(sample_unit_cost) : null,
    });
    res.json({ status: "success", trial, message: "Prueba actualizada" });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando prueba:");
  }
};

// PATCH /api/brand-trials/:id/decide  { decision: 'incorporada'|'descartada', notes }
const decide = async (req, res) => {
  try {
    const { decision, notes } = req.body;
    if (!["incorporada", "descartada"].includes(decision)) {
      return res.status(400).json({ status: "error", message: "decision debe ser 'incorporada' o 'descartada'" });
    }
    const trial = await BrandTrial.decide(req.params.id, decision, notes?.trim() || null);
    if (!trial) {
      return res.status(404).json({ status: "error", message: "Prueba no encontrada o ya decidida" });
    }
    console.log(`Prueba de marca decidida - ID: ${req.params.id}, Decisión: ${decision}, Usuario: ${req.user.username}`);
    res.json({ status: "success", trial, message: `Prueba marcada como ${decision}` });
  } catch (error) {
    handleControllerError(res, error, "Error decidiendo prueba:");
  }
};

// DELETE /api/brand-trials/:id
const remove = async (req, res) => {
  try {
    const deleted = await BrandTrial.remove(req.params.id);
    if (!deleted) {
      return res.status(404).json({ status: "error", message: "Prueba no encontrada" });
    }
    res.json({ status: "success", message: "Prueba eliminada" });
  } catch (error) {
    handleControllerError(res, error, "Error eliminando prueba:");
  }
};

module.exports = { getAll, getById, create, update, decide, remove };

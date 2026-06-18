const Supplier = require("../models/Supplier");
const { syncCompras } = require("../utils/comprasService");
const { handleControllerError } = require("../utils/errorHelper");

// GET /api/suppliers
const getAllSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.findAll();
    res.json({ status: "success", suppliers });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo proveedores:");
  }
};

// GET /api/suppliers/:id
const getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ status: "error", message: "Proveedor no encontrado" });
    }
    res.json({ status: "success", supplier });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo proveedor:");
  }
};

// POST /api/suppliers
const createSupplier = async (req, res) => {
  try {
    const { supplier_name, contact_info } = req.body;
    if (!supplier_name || !supplier_name.trim()) {
      return res.status(400).json({ status: "error", message: "supplier_name es requerido" });
    }
    const supplier = await Supplier.create({
      supplier_name: supplier_name.trim(),
      contact_info: contact_info?.trim() || null,
    });
    res.status(201).json({ status: "success", supplier, message: "Proveedor creado" });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ status: "error", message: "Ya existe un proveedor con ese nombre" });
    }
    handleControllerError(res, error, "Error creando proveedor:");
  }
};

// PUT /api/suppliers/:id
const updateSupplier = async (req, res) => {
  try {
    const { supplier_name, contact_info } = req.body;
    if (supplier_name !== undefined && !supplier_name.trim()) {
      return res.status(400).json({ status: "error", message: "supplier_name no puede estar vacío" });
    }
    const supplier = await Supplier.update(req.params.id, {
      supplier_name: supplier_name?.trim() ?? null,
      contact_info: contact_info?.trim() || null,
    });
    if (!supplier) {
      return res.status(404).json({ status: "error", message: "Proveedor no encontrado" });
    }
    res.json({ status: "success", supplier, message: "Proveedor actualizado" });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ status: "error", message: "Ya existe un proveedor con ese nombre" });
    }
    handleControllerError(res, error, "Error actualizando proveedor:");
  }
};

// DELETE /api/suppliers/:id  (soft-delete; desvincula sus marcas)
const deleteSupplier = async (req, res) => {
  try {
    const deleted = await Supplier.deactivate(req.params.id);
    if (!deleted) {
      return res.status(404).json({ status: "error", message: "Proveedor no encontrado" });
    }
    res.json({ status: "success", message: "Proveedor eliminado" });
  } catch (error) {
    handleControllerError(res, error, "Error eliminando proveedor:");
  }
};

// POST /api/suppliers/sync-compras
// Sincroniza la API de compras de IDUO: puebla proveedores y asocia marca→proveedor
// (solo rellena marcas sin proveedor; reporta conflictos; ignora marcas nuevas).
const syncComprasController = async (req, res) => {
  try {
    const { monthsBack, desde, hasta } = req.body || {};
    const opts = {};
    if (monthsBack) opts.monthsBack = Number(monthsBack);
    if (desde) opts.desde = new Date(desde);
    if (hasta) opts.hasta = new Date(hasta);

    console.log(`Sync de compras iniciado por: ${req.user.username}`);
    const report = await syncCompras(opts);
    res.json({ status: "success", report });
  } catch (error) {
    handleControllerError(res, error, "Error sincronizando compras:");
  }
};

module.exports = {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  syncCompras: syncComprasController,
};

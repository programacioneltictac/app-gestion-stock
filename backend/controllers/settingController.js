const Setting = require("../models/Setting");
const { handleControllerError } = require("../utils/errorHelper");

// Validadores por clave: acotan/normalizan el valor antes de guardar.
const VALIDATORS = {
  replenish_target_pct: (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      throw new Error("replenish_target_pct debe ser un numero entre 1 y 100");
    }
    return String(Math.round(n));
  },
};

// GET /api/settings — lista toda la configuracion
const getAll = async (req, res) => {
  try {
    const settings = await Setting.getAll();
    res.json({ status: "success", settings });
  } catch (error) {
    handleControllerError(res, error, "Error obteniendo configuracion:");
  }
};

// PUT /api/settings/:key — actualiza un valor (solo admin)
const update = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value == null) {
      return res.status(400).json({ status: "error", message: "value es requerido" });
    }

    const validate = VALIDATORS[key];
    if (!validate) {
      return res.status(400).json({ status: "error", message: `Configuracion desconocida: ${key}` });
    }

    let normalized;
    try {
      normalized = validate(value);
    } catch (e) {
      return res.status(400).json({ status: "error", message: e.message });
    }

    const setting = await Setting.set(key, normalized);
    console.log(`Configuracion actualizada - ${key}=${normalized}, Usuario: ${req.user.username}`);
    res.json({ status: "success", setting });
  } catch (error) {
    handleControllerError(res, error, "Error actualizando configuracion:");
  }
};

module.exports = { getAll, update };

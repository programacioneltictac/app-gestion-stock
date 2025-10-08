const Product = require("../models/Product");
const Category = require("../models/Category");
const Condition = require("../models/Condition");

// GET /api/stock/catalogs/products
const getProducts = async (req, res) => {
  try {
    const { search, limit = 100 } = req.query;
    const products = await Product.search(search, limit);
    res.json({
      status: "success",
      products: products,
    });
  } catch (error) {
    console.error("❌ Error obteniendo productos:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/stock/catalogs/categories
const getCategories = async (req, res) => {
  try {
    const categories = await Category.findAll();
    res.json({
      status: "success",
      categories: categories,
    });
  } catch (error) {
    console.error("❌ Error obteniendo categorías:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

// GET /api/stock/catalogs/conditions
const getConditions = async (req, res) => {
  try {
    const conditions = await Condition.findAll();
    res.json({
      status: "success",
      conditions: conditions,
    });
  } catch (error) {
    console.error("❌ Error obteniendo condiciones:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

module.exports = {
  getProducts,
  getCategories,
  getConditions,
};

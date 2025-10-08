const Product = require("../models/Product");

const register = async (req, resp) => {
  const { name, code, description } = req.body;

  try {
    const searchProduct = await Product.search(code);

    if (searchProduct) {
      return res
        .status(409)
        .json({ status: "error", message: "El producto ya existe" });
    }

    const result = await Product.create(name, code, description);

    console.log(
      `Producto creado - ID: ${result.id}, Product: ${name}, Code: ${code}`
    );

    res.json({ status: "success", message: "Producto creado exitosamente" });
  } catch (error) {
    console.error("❌ Error en registro:", error.message);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
};

module.exports = {
  register,
};

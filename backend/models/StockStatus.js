const { pool } = require("../database/config");

class StockStatus {
  static async findAll() {
    const result = await pool.query(
      "SELECT * FROM stock_status ORDER BY id"
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      "SELECT * FROM stock_status WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  static determineStockStatus(compliance) {
    if (compliance < 70) return 1; // generar_pedido
    if (compliance >= 70 && compliance <= 100) return 2; // stock_optimo
    if (compliance > 100 && compliance <= 150) return 3; // excedido
    return 4; // muy_excedido
  }
}

module.exports = StockStatus;

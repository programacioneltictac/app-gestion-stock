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
    if (compliance < 80) return 1; // generar_pedido
    if (compliance >= 80 && compliance <= 120) return 2; // stock_optimo
    if (compliance > 120 && compliance <= 200) return 3; // excedido
    return 4; // muy_excedido
  }
}

module.exports = StockStatus;

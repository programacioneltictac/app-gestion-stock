const { pool } = require("../database/config");
const StockControl = require("./StockControl");

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

  // Delega en StockControl, la única fuente de verdad de los umbrales.
  static determineStockStatus(compliance) {
    return StockControl.determineStockStatus(compliance);
  }
}

module.exports = StockStatus;

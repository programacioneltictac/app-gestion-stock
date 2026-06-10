const { pool } = require("../database/config");

class Order {

  // ============================================================
  // ORDERS_CONTROLS
  // ============================================================

  /**
   * Crea una orden de reposicion a partir de un control (draft o completed).
   * Copia SOLO los items seleccionados que esten en estado generar_pedido
   * (stock_status_id = 1) y que no hayan sido pedidos antes (order_detail_id
   * IS NULL). Tras copiarlos, los marca como pedidos en stock_controls para
   * que no puedan volver a enviarse a otra orden.
   *
   * @param {number}   monthlyControlId
   * @param {number}   createdBy
   * @param {number[]} stockControlIds  ids de stock_controls seleccionados.
   */
  static async createFromControl(monthlyControlId, createdBy, stockControlIds) {
    if (!Array.isArray(stockControlIds) || stockControlIds.length === 0) {
      throw new Error("Debe seleccionar al menos un item para generar la orden");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Obtener datos del control origen (draft o completed, no cancelado/borrado)
      const controlResult = await client.query(
        `SELECT mc.id, mc.branch_id, mc.control_year, mc.control_month
         FROM monthly_controls mc
         WHERE mc.id = $1 AND mc.status IN ('draft', 'completed')`,
        [monthlyControlId]
      );
      const control = controlResult.rows[0];
      if (!control) throw new Error("Control no encontrado");

      // Crear la orden
      const orderResult = await client.query(
        `INSERT INTO orders_controls
           (branch_id, control_year, control_month, monthly_control_id, status, created_by)
         VALUES ($1, $2, $3, $4, 'pending', $5)
         RETURNING *`,
        [control.branch_id, control.control_year, control.control_month, monthlyControlId, createdBy]
      );
      const order = orderResult.rows[0];

      // Copiar los items SELECCIONADOS que sigan en estado generar_pedido (1)
      // y que no hayan sido pedidos ya (order_detail_id IS NULL).
      // unit_cost y cost_estimate se toman de avg_cost en product_stock_by_branch.
      // Devolvemos tambien stock_control_id para luego marcar el item como pedido.
      const itemsResult = await client.query(
        `INSERT INTO order_details
           (order_control_id, stock_control_id, product_stock_id, display_name,
            quantity_ordered, quantity_received, unit_cost, cost_estimate)
         SELECT
           $1,
           sc.id,
           sc.product_stock_id,
           psb.display_name,
           GREATEST(sc.stock_require - sc.stock_current, 1),
           0,
           COALESCE(psb.avg_cost, 0),
           COALESCE(psb.avg_cost, 0) * GREATEST(sc.stock_require - sc.stock_current, 1)
         FROM stock_controls sc
         JOIN product_stock_by_branch psb ON sc.product_stock_id = psb.id
         WHERE sc.monthly_control_id = $2
           AND sc.id = ANY($3::int[])
           AND sc.stock_status_id = 1
           AND sc.order_detail_id IS NULL
         RETURNING id, stock_control_id`,
        [order.id, monthlyControlId, stockControlIds]
      );

      // Si ningun item seleccionado resulto pedible, no dejar una orden vacia.
      if (itemsResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return { order: null, itemCount: 0 };
      }

      // Marcar como pedidos los items copiados, ligando cada stock_control con
      // la linea de orden que se acaba de crear para el (od.stock_control_id).
      await client.query(
        `UPDATE stock_controls sc
         SET ordered_at      = NOW(),
             order_detail_id = od.id,
             updated_at      = NOW()
         FROM order_details od
         WHERE od.order_control_id = $1
           AND od.stock_control_id = sc.id`,
        [order.id]
      );

      // Calcular y guardar costo estimado total de la orden
      await client.query(
        `UPDATE orders_controls
         SET cost_estimate = (
           SELECT COALESCE(SUM(cost_estimate), 0) FROM order_details WHERE order_control_id = $1
         )
         WHERE id = $1`,
        [order.id]
      );

      await client.query("COMMIT");
      return { order, itemCount: itemsResult.rowCount };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Busca una orden por id con datos de sucursal y control origen.
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT oc.*,
              b.name        AS branch_name,
              b.code        AS branch_code,
              u.username    AS created_by_username,
              mc.status     AS source_control_status
       FROM orders_controls oc
       LEFT JOIN branches         b  ON oc.branch_id          = b.id
       LEFT JOIN users            u  ON oc.created_by         = u.id
       LEFT JOIN monthly_controls mc ON oc.monthly_control_id = mc.id
       WHERE oc.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Lista ordenes por sucursal con totales (usa vista v_order_summary).
   */
  static async findByBranch(branchId, limit = 24) {
    const result = await pool.query(
      `SELECT * FROM v_order_summary
       WHERE branch_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [branchId, parseInt(limit)]
    );
    return result.rows;
  }

  /**
   * Lista todas las ordenes (para admin/manager).
   */
  static async findAll(limit = 50) {
    const result = await pool.query(
      `SELECT * FROM v_order_summary
       ORDER BY created_at DESC
       LIMIT $1`,
      [parseInt(limit)]
    );
    return result.rows;
  }

  /**
   * Actualiza el estado de una orden.
   * Estados validos: pending, sent, partial, completed, cancelled
   */
  static async updateStatus(id, status, notes = null) {
    const result = await pool.query(
      `UPDATE orders_controls
       SET status = $1,
           notes  = COALESCE($2, notes),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, notes, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recalcula cost_estimate de la orden sumando los detalles.
   */
  static async recalcCostEstimate(orderId, client = pool) {
    await client.query(
      `UPDATE orders_controls
       SET cost_estimate = (
         SELECT COALESCE(SUM(cost_estimate), 0) FROM order_details WHERE order_control_id = $1
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );
  }

  // ============================================================
  // ORDER_DETAILS
  // ============================================================

  /**
   * Lista los items de una orden con datos de producto/grupo.
   */
  static async findDetailsByOrderId(orderId) {
    const result = await pool.query(
      `SELECT
         od.id,
         od.stock_control_id,
         od.product_stock_id,
         od.display_name,
         od.quantity_ordered,
         od.quantity_received,
         od.unit_cost,
         od.cost_estimate,
         od.notes,
         psb.stock          AS stock_current,
         psb.avg_cost       AS current_avg_cost,
         COALESCE(c.category_name, pg.category_type) AS category_name,
         od.updated_at
       FROM order_details od
       LEFT JOIN product_stock_by_branch psb ON od.product_stock_id = psb.id
       LEFT JOIN products      p   ON psb.product_id = p.id
       LEFT JOIN categories    c   ON p.category_id  = c.id
       LEFT JOIN product_groups pg ON psb.group_id   = pg.id
       WHERE od.order_control_id = $1
       ORDER BY od.display_name`,
      [orderId]
    );
    return result.rows;
  }

  /**
   * Actualiza quantity_received y recalcula cost_estimate del item.
   * Tambien recalcula el total de la orden.
   */
  static async updateDetailReceived(detailId, quantityReceived, notes = null) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `UPDATE order_details
         SET quantity_received = $1,
             notes             = COALESCE($2, notes),
             cost_estimate     = unit_cost * quantity_ordered,
             updated_at        = NOW()
         WHERE id = $3
         RETURNING order_control_id`,
        [quantityReceived, notes, detailId]
      );
      const detail = result.rows[0];
      if (!detail) throw new Error("Item de orden no encontrado");

      // Recalcular total de la orden
      await Order.recalcCostEstimate(detail.order_control_id, client);

      // Actualizar estado de la orden segun recepcion
      await client.query(
        `UPDATE orders_controls
         SET status = CASE
           WHEN (
             SELECT COUNT(*) FROM order_details
             WHERE order_control_id = $1 AND quantity_received < quantity_ordered
           ) = 0 THEN 'completed'
           WHEN (
             SELECT SUM(quantity_received) FROM order_details
             WHERE order_control_id = $1
           ) > 0 THEN 'partial'
           ELSE status
         END,
         updated_at = NOW()
         WHERE id = $1`,
        [detail.order_control_id]
      );

      await client.query("COMMIT");
      return detail.order_control_id;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Elimina una orden y sus detalles.
   */
  static async delete(id) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM order_details WHERE order_control_id = $1", [id]);
      await client.query("DELETE FROM orders_controls WHERE id = $1", [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Verifica si un monthly_control ya tiene al menos una orden generada.
   */
  static async existsForControl(monthlyControlId) {
    const result = await pool.query(
      "SELECT id FROM orders_controls WHERE monthly_control_id = $1 LIMIT 1",
      [monthlyControlId]
    );
    return result.rows.length > 0;
  }
}

module.exports = Order;

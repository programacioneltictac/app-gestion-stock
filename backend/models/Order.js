const { pool } = require("../database/config");

class Order {

  // ============================================================
  // ORDERS_CONTROLS
  // ============================================================

  /**
   * Crea las ordenes de reposicion a partir de un control (draft o completed).
   * Copia SOLO los items seleccionados que esten en estado generar_pedido
   * (stock_status_id = 1) y que no hayan sido pedidos antes (ordered_at IS NULL).
   *
   * NODO HUB: antes de pedir al proveedor (orden EXTERNA), cubre el faltante con
   * stock del Hub via una orden INTERNA. Por cada item:
   *   faltante     = GREATEST(stock_require - stock_current, 1)
   *   cubrible_hub = min(faltante, disponible_hub)   -> orden interna
   *   resto        = faltante - cubrible_hub          -> orden externa
   * donde disponible_hub = stock del Hub del mismo product_id/group_id MENOS lo
   * comprometido en ordenes internas abiertas (todas salvo 'cancelled'). La app
   * NO mueve stock real: la reserva es estado derivado de las ordenes internas.
   * El Hub se excluye a si mismo (un control de la sucursal Hub no se autoabastece).
   *
   * Tras copiar, marca cada stock_control como pedido (ordered_at). El vinculo
   * canonico control->detalle es order_details.stock_control_id (un control puede
   * tener 2 lineas: interna + externa, ambas con el mismo stock_control_id).
   *
   * @param {number}   monthlyControlId
   * @param {number}   createdBy
   * @param {number[]} stockControlIds  ids de stock_controls seleccionados.
   * @returns {{ orders: object[], itemCount: number }} ordenes creadas (1 o 2).
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

      // Hub: la unica sucursal is_hub=true (garantizado por indice unico parcial).
      const hubResult = await client.query(
        "SELECT id FROM branches WHERE is_hub = true AND is_active = true LIMIT 1"
      );
      const hubBranchId = hubResult.rows[0]?.id || null;
      // El Hub no se autoabastece: si el control es de la propia sucursal Hub,
      // o no hay Hub configurado, no hay particion (todo va a externa).
      const useHub = hubBranchId && hubBranchId !== control.branch_id;

      // Cargar los items pedibles seleccionados con su faltante y la referencia
      // de catalogo (product_id/group_id) para cruzar contra el stock del Hub.
      const itemsResult = await client.query(
        `SELECT
           sc.id                                          AS stock_control_id,
           sc.product_stock_id,
           psb.display_name,
           psb.product_id,
           psb.group_id,
           GREATEST(sc.stock_require - sc.stock_current, 1) AS faltante,
           COALESCE(psb.avg_cost, 0)                      AS unit_cost
         FROM stock_controls sc
         JOIN product_stock_by_branch psb ON sc.product_stock_id = psb.id
         WHERE sc.monthly_control_id = $1
           AND sc.id = ANY($2::int[])
           AND sc.stock_status_id = 1
           AND sc.ordered_at IS NULL`,
        [monthlyControlId, stockControlIds]
      );
      const items = itemsResult.rows;

      // Si ningun item seleccionado resulto pedible, no crear ordenes.
      if (items.length === 0) {
        await client.query("ROLLBACK");
        return { orders: [], itemCount: 0 };
      }

      // Para cada item, calcular cuanto puede cubrir el Hub (cubrible_hub) y el
      // resto que va al proveedor. disponible_hub se calcula por product_id/group_id.
      const internalLines = []; // { stock_control_id, product_stock_id, display_name, qty, unit_cost }
      const externalLines = [];

      for (const it of items) {
        let cubribleHub = 0;
        let hubPsbId = null; // psb del Hub de este producto (origen de la interna)

        if (useHub && (it.product_id || it.group_id)) {
          const column = it.product_id ? "product_id" : "group_id";
          const refId = it.product_id || it.group_id;

          // disponible_hub = stock del Hub del mismo producto/grupo MENOS lo ya
          // comprometido en ordenes internas abiertas (todas salvo 'cancelled').
          // La reserva cruza por el psb del HUB (hub_psb.id): la linea interna se
          // guarda con product_stock_id = psb del Hub (de donde sale el stock).
          const availResult = await client.query(
            `SELECT
               hub_psb.id                 AS hub_psb_id,
               COALESCE(hub_psb.stock, 0) AS hub_stock,
               COALESCE((
                 SELECT SUM(od.quantity_ordered)
                 FROM order_details od
                 JOIN orders_controls oc ON od.order_control_id = oc.id
                 WHERE oc.order_type = 'internal'
                   AND oc.source_branch_id = $1
                   AND oc.status <> 'cancelled'
                   AND od.product_stock_id = hub_psb.id
               ), 0) AS reservado
             FROM product_stock_by_branch hub_psb
             WHERE hub_psb.branch_id = $1 AND hub_psb.${column} = $2`,
            [hubBranchId, refId]
          );

          const row = availResult.rows[0];
          if (row) {
            hubPsbId = row.hub_psb_id;
            const disponible = Math.max(0, Number(row.hub_stock) - Number(row.reservado));
            cubribleHub = Math.min(Number(it.faltante), disponible);
          }
        }

        const resto = Number(it.faltante) - cubribleHub;

        if (cubribleHub > 0 && hubPsbId) {
          internalLines.push({
            stock_control_id: it.stock_control_id,
            product_stock_id: hubPsbId, // psb del HUB (origen del stock)
            display_name: it.display_name,
            qty: cubribleHub,
            unit_cost: Number(it.unit_cost),
          });
        }
        if (resto > 0) {
          externalLines.push({
            stock_control_id: it.stock_control_id,
            product_stock_id: it.product_stock_id, // psb de la SUCURSAL (destino, va al proveedor)
            display_name: it.display_name,
            qty: resto,
            unit_cost: Number(it.unit_cost),
          });
        }
      }

      const orders = [];

      // Helper: crea una orden de un tipo dado con sus lineas. Devuelve la orden
      // o null si no hay lineas. No marca ordered_at (se hace al final, una vez).
      const createOrderWithLines = async (orderType, sourceBranchId, lines) => {
        if (lines.length === 0) return null;

        const orderResult = await client.query(
          `INSERT INTO orders_controls
             (branch_id, control_year, control_month, monthly_control_id,
              status, created_by, order_type, source_branch_id)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
           RETURNING *`,
          [
            control.branch_id, control.control_year, control.control_month,
            monthlyControlId, createdBy, orderType, sourceBranchId,
          ]
        );
        const order = orderResult.rows[0];

        // El proveedor solo aplica a la orden EXTERNA (la interna va al Hub). Se
        // deriva de la marca del producto: psb → product_groups/products → brand.
        const isExternal = orderType === "external";

        for (const ln of lines) {
          await client.query(
            `INSERT INTO order_details
               (order_control_id, stock_control_id, product_stock_id, display_name,
                quantity_ordered, quantity_received, unit_cost, cost_estimate, supplier_id)
             VALUES ($1, $2, $3, $4, $5, 0, $6, $7,
               CASE WHEN $8 THEN (
                 SELECT COALESCE(pg.brand_id_supplier, p.brand_id_supplier)
                 FROM product_stock_by_branch psb
                 LEFT JOIN LATERAL (
                   SELECT b.supplier_id AS brand_id_supplier
                   FROM product_groups g JOIN brands b ON g.brand_id = b.id
                   WHERE g.id = psb.group_id
                 ) pg ON true
                 LEFT JOIN LATERAL (
                   SELECT b.supplier_id AS brand_id_supplier
                   FROM products pr JOIN brands b ON pr.brand_id = b.id
                   WHERE pr.id = psb.product_id
                 ) p ON true
                 WHERE psb.id = $3
               ) ELSE NULL END)`,
            [
              order.id, ln.stock_control_id, ln.product_stock_id, ln.display_name,
              ln.qty, ln.unit_cost, ln.unit_cost * ln.qty, isExternal,
            ]
          );
        }

        // Total estimado de la orden. RETURNING para devolver el objeto fresco
        // (el `order` de arriba se leyo antes de insertar los detalles).
        const totalResult = await client.query(
          `UPDATE orders_controls
           SET cost_estimate = (
             SELECT COALESCE(SUM(cost_estimate), 0) FROM order_details WHERE order_control_id = $1
           )
           WHERE id = $1
           RETURNING cost_estimate`,
          [order.id]
        );
        order.cost_estimate = totalResult.rows[0].cost_estimate;

        return order;
      };

      const internalOrder = await createOrderWithLines("internal", hubBranchId, internalLines);
      const externalOrder = await createOrderWithLines("external", null, externalLines);
      if (internalOrder) orders.push(internalOrder);
      if (externalOrder) orders.push(externalOrder);

      // Marcar como pedidos TODOS los stock_controls que entraron en alguna orden.
      // El flag canonico es ordered_at (un control puede tener linea interna y
      // externa). order_detail_id se conserva pero ya no es el vinculo unico:
      // se setea al detalle EXTERNO si existe, sino al interno, por compatibilidad.
      await client.query(
        `UPDATE stock_controls sc
         SET ordered_at      = NOW(),
             order_detail_id = (
               SELECT od.id
               FROM order_details od
               JOIN orders_controls oc ON od.order_control_id = oc.id
               WHERE od.stock_control_id = sc.id
                 AND oc.monthly_control_id = $1
               ORDER BY (oc.order_type = 'external') DESC, od.id DESC
               LIMIT 1
             ),
             updated_at      = NOW()
         WHERE sc.id = ANY($2::int[])
           AND sc.ordered_at IS NULL
           AND EXISTS (
             SELECT 1 FROM order_details od
             JOIN orders_controls oc ON od.order_control_id = oc.id
             WHERE od.stock_control_id = sc.id AND oc.monthly_control_id = $1
           )`,
        [monthlyControlId, stockControlIds]
      );

      await client.query("COMMIT");
      return { orders, itemCount: items.length };
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
              sb.name       AS source_branch_name,
              u.username    AS created_by_username,
              mc.status     AS source_control_status
       FROM orders_controls oc
       LEFT JOIN branches         b  ON oc.branch_id          = b.id
       LEFT JOIN branches         sb ON oc.source_branch_id   = sb.id
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
         od.supplier_id,
         sup.supplier_name,
         psb.stock          AS stock_current,
         psb.avg_cost       AS current_avg_cost,
         COALESCE(c.category_name, pg.category_type) AS category_name,
         od.updated_at
       FROM order_details od
       LEFT JOIN product_stock_by_branch psb ON od.product_stock_id = psb.id
       LEFT JOIN products      p   ON psb.product_id = p.id
       LEFT JOIN categories    c   ON p.category_id  = c.id
       LEFT JOIN product_groups pg ON psb.group_id   = pg.id
       LEFT JOIN suppliers     sup ON od.supplier_id = sup.id
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

      // Controles ligados a esta orden (via stock_control_id de sus detalles).
      // Tras borrarla hay que reabrir los que se queden SIN ningun detalle: el
      // flag "ya pedido" es stock_controls.ordered_at, y un control puede tener
      // 2 lineas (interna+externa). Solo se reabre si NO le queda ninguna otra.
      const affected = await client.query(
        `SELECT DISTINCT stock_control_id
         FROM order_details
         WHERE order_control_id = $1 AND stock_control_id IS NOT NULL`,
        [id]
      );

      await client.query("DELETE FROM order_details WHERE order_control_id = $1", [id]);
      await client.query("DELETE FROM orders_controls WHERE id = $1", [id]);

      const controlIds = affected.rows.map((r) => r.stock_control_id);
      if (controlIds.length > 0) {
        // Reabrir (ordered_at = NULL) los controles que ya no tienen detalles.
        await client.query(
          `UPDATE stock_controls sc
           SET ordered_at      = NULL,
               order_detail_id = NULL,
               updated_at      = NOW()
           WHERE sc.id = ANY($1::int[])
             AND NOT EXISTS (
               SELECT 1 FROM order_details od WHERE od.stock_control_id = sc.id
             )`,
          [controlIds]
        );
      }

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

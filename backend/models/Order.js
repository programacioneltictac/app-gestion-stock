const { pool } = require("../database/config");
const Setting = require("./Setting");

// Condición 'NUEVA MARCA' (id 4): productos nuevos a prueba. Conviven en la hoja
// de control con el resto pero NO son elegibles para reposición (no entran a
// ninguna orden, aunque su estado de stock sea "Generar Pedido").
const NON_REPLENISHABLE_CONDITION_ID = 4;

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
   *   objetivo     = ceil(stock_require * replenish_target_pct / 100)  (config, def 70%)
   *   faltante     = GREATEST(objetivo - stock_current, 1)
   *   cubrible_hub = min(faltante, disponible_hub)   -> orden interna
   *   resto        = faltante - cubrible_hub          -> orden externa
   * donde disponible_hub = stock del Hub del mismo product_id/group_id MENOS lo
   * comprometido en ordenes internas abiertas (todas salvo 'cancelado'). La app
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

    // % objetivo de reposicion (configurable). La orden repone hasta ese % del
    // stock_require, no hasta el 100%. Default 70 (piso del rango optimo). Se
    // acota a [1, 100] para no generar pedidos negativos o desproporcionados.
    const rawPct = await Setting.getNumber("replenish_target_pct", 70);
    const targetPct = Math.min(100, Math.max(1, rawPct));

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
      // ¿Este control es del PROPIO Hub? Si lo es, el faltante debe contemplar lo
      // que el Hub ya tiene comprometido a otras sucursales (reservado por ordenes
      // internas abiertas): la "Dif." del control muestra el disponible NETO
      // (stock - requerido - comprometido), y la orden de reposicion del Hub debe
      // pedir hasta cubrir ese neto, no solo stock_require - stock_current.
      const isHubControl = hubBranchId && hubBranchId === control.branch_id;

      // Cargar los items pedibles seleccionados con su faltante y la referencia
      // de catalogo (product_id/group_id) para cruzar contra el stock del Hub.
      // En el control del propio Hub, el faltante suma lo comprometido (reservado
      // por ordenes internas abiertas sobre ESTE mismo psb) para que la orden
      // reponga el disponible neto. En el resto de sucursales, $3=false y el
      // termino se anula (suma 0).
      const itemsResult = await client.query(
        `SELECT
           sc.id                                          AS stock_control_id,
           sc.product_stock_id,
           psb.display_name,
           psb.product_id,
           psb.group_id,
           -- Proveedor del item (orden externa). Se deriva de la marca via
           -- product_groups.brand_id (grupos) o products.brand_id (sueltos) ->
           -- brands.supplier_id. NULL si la marca no tiene proveedor mapeado.
           COALESCE(pg_sup.supplier_id, prod_sup.supplier_id)  AS supplier_id,
           GREATEST(
             CEIL(sc.stock_require * $4::numeric / 100) - sc.stock_current
               + CASE WHEN $3 THEN COALESCE((
                   SELECT SUM(od.quantity_ordered)
                   FROM order_details od
                   JOIN orders_controls oc ON od.order_control_id = oc.id
                   WHERE oc.order_type = 'internal'
                     AND oc.status <> 'cancelado'
                     AND od.product_stock_id = sc.product_stock_id
                 ), 0) ELSE 0 END,
             1
           )                                              AS faltante,
           -- Costo unitario con FALLBACK para evitar $0 cuando la sucursal no
           -- tiene costo propio (producto sin stock local => avg_cost 0/NULL):
           --   1) avg_cost de la sucursal (costo real local), si > 0
           --   2) productos individuales: products.cost_price (catalogo global)
           --   3) grupos: promedio del avg_cost de ESE grupo en otras sucursales
           --      que si tengan costo (> 0)
           --   4) 0 si no hay ningun dato de costo en ningun lado
           COALESCE(
             NULLIF(psb.avg_cost, 0),
             p.cost_price,
             CASE WHEN psb.group_id IS NOT NULL THEN (
               SELECT AVG(other.avg_cost)
               FROM product_stock_by_branch other
               WHERE other.group_id = psb.group_id
                 AND other.avg_cost > 0
             ) END,
             0
           )                                              AS unit_cost
         FROM stock_controls sc
         JOIN product_stock_by_branch psb ON sc.product_stock_id = psb.id
         LEFT JOIN products p ON psb.product_id = p.id
         LEFT JOIN LATERAL (
           SELECT b.supplier_id
           FROM product_groups g JOIN brands b ON g.brand_id = b.id
           WHERE g.id = psb.group_id
         ) pg_sup ON true
         LEFT JOIN LATERAL (
           SELECT b.supplier_id
           FROM products pr JOIN brands b ON pr.brand_id = b.id
           WHERE pr.id = psb.product_id
         ) prod_sup ON true
         WHERE sc.monthly_control_id = $1
           AND sc.id = ANY($2::int[])
           AND sc.stock_status_id = 1
           AND sc.ordered_at IS NULL
           -- 'NUEVA MARCA' (productos a prueba) no es reponible: nunca entra a
           -- una orden aunque su estado sea "Generar Pedido".
           AND (sc.condition_id IS NULL OR sc.condition_id <> ${NON_REPLENISHABLE_CONDITION_ID})`,
        [monthlyControlId, stockControlIds, isHubControl, targetPct]
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
          // comprometido en ordenes internas abiertas (todas salvo 'cancelado').
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
                   AND oc.status <> 'cancelado'
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
            supplier_id: it.supplier_id || null, // proveedor (NULL = sin asignar)
          });
        }
      }

      const orders = [];

      // Helper: inserta lineas en una orden ya existente. La interna no lleva
      // proveedor; la externa lo guarda en cada detalle (ya derivado en ln.supplier_id).
      const appendLinesToOrder = async (orderId, lines, isExternal) => {
        for (const ln of lines) {
          await client.query(
            `INSERT INTO order_details
               (order_control_id, stock_control_id, product_stock_id, display_name,
                quantity_ordered, quantity_received, unit_cost, cost_estimate, supplier_id)
             VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)`,
            [
              orderId, ln.stock_control_id, ln.product_stock_id, ln.display_name,
              ln.qty, ln.unit_cost, ln.unit_cost * ln.qty,
              isExternal ? ln.supplier_id || null : null,
            ]
          );
        }
      };

      // Helper: recalcula el total de la orden y devuelve el objeto fresco.
      const refreshOrderTotal = async (order) => {
        const totalResult = await client.query(
          `UPDATE orders_controls
           SET cost_estimate = (
             SELECT COALESCE(SUM(cost_estimate), 0) FROM order_details WHERE order_control_id = $1
           ),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [order.id]
        );
        return totalResult.rows[0];
      };

      // ---- Orden INTERNA (Hub): se crea 1 por control, sin consolidar. --------
      if (internalLines.length > 0) {
        const orderResult = await client.query(
          `INSERT INTO orders_controls
             (branch_id, control_year, control_month, monthly_control_id,
              status, created_by, order_type, source_branch_id)
           VALUES ($1, $2, $3, $4, 'pending', $5, 'internal', $6)
           RETURNING *`,
          [
            control.branch_id, control.control_year, control.control_month,
            monthlyControlId, createdBy, hubBranchId,
          ]
        );
        const internalOrder = orderResult.rows[0];
        await appendLinesToOrder(internalOrder.id, internalLines, false);
        orders.push(await refreshOrderTotal(internalOrder));
      }

      // ---- Ordenes EXTERNAS: CONSOLIDADAS por proveedor. ----------------------
      // Por cada supplier_id distinto (incluido NULL = "sin proveedor"), buscar
      // la orden externa ABIERTA de ese proveedor (pending|en_evaluacion) y
      // acumular las lineas; si no existe, crear una nueva en 'pending'. El
      // indice unico parcial garantiza maximo 1 orden abierta por proveedor.
      const linesBySupplier = new Map(); // supplier_id (o 'null') -> lines[]
      for (const ln of externalLines) {
        const key = ln.supplier_id == null ? "null" : String(ln.supplier_id);
        if (!linesBySupplier.has(key)) linesBySupplier.set(key, []);
        linesBySupplier.get(key).push(ln);
      }

      for (const [, lines] of linesBySupplier) {
        const supplierId = lines[0].supplier_id || null;

        // Buscar la orden externa abierta del proveedor (FOR UPDATE para
        // serializar contra otra generacion concurrente del mismo proveedor).
        const openResult = await client.query(
          `SELECT * FROM orders_controls
           WHERE order_type = 'external'
             AND status IN ('pending', 'en_evaluacion')
             AND supplier_id IS NOT DISTINCT FROM $1
           ORDER BY id
           LIMIT 1
           FOR UPDATE`,
          [supplierId]
        );

        let order = openResult.rows[0];
        if (!order) {
          const created = await client.query(
            `INSERT INTO orders_controls
               (branch_id, control_year, control_month, monthly_control_id,
                status, created_by, order_type, source_branch_id, supplier_id)
             VALUES ($1, $2, $3, $4, 'pending', $5, 'external', NULL, $6)
             RETURNING *`,
            [
              control.branch_id, control.control_year, control.control_month,
              monthlyControlId, createdBy, supplierId,
            ]
          );
          order = created.rows[0];
        }

        await appendLinesToOrder(order.id, lines, true);
        orders.push(await refreshOrderTotal(order));
      }

      // Marcar como pedidos TODOS los stock_controls que entraron en alguna orden.
      // El flag canonico es ordered_at (un control puede tener linea interna y
      // externa). El vinculo es DIRECTO por od.stock_control_id: una orden externa
      // consolidada puede pertenecer a OTRO control (Casa Central) y aun asi
      // contener lineas de ESTE control (Boutique). Por eso NO se filtra por
      // oc.monthly_control_id (eso dejaba sin marcar los items acumulados en
      // ordenes de otro control -> el chip "Pedido a proveedor" no aparecia y el
      // item volvia a ser pedible, duplicando ordenes). order_detail_id se setea
      // al detalle EXTERNO si existe, sino al interno, por compatibilidad.
      await client.query(
        `UPDATE stock_controls sc
         SET ordered_at      = NOW(),
             order_detail_id = (
               SELECT od.id
               FROM order_details od
               JOIN orders_controls oc ON od.order_control_id = oc.id
               WHERE od.stock_control_id = sc.id
               ORDER BY (oc.order_type = 'external') DESC, od.id DESC
               LIMIT 1
             ),
             updated_at      = NOW()
         WHERE sc.id = ANY($1::int[])
           AND sc.ordered_at IS NULL
           AND EXISTS (
             SELECT 1 FROM order_details od WHERE od.stock_control_id = sc.id
           )`,
        [stockControlIds]
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
              sup.supplier_name,
              u.username    AS created_by_username,
              mc.status     AS source_control_status,
              mc.category_id,
              cat.category_name
       FROM orders_controls oc
       LEFT JOIN branches         b   ON oc.branch_id          = b.id
       LEFT JOIN branches         sb  ON oc.source_branch_id   = sb.id
       LEFT JOIN suppliers        sup ON oc.supplier_id        = sup.id
       LEFT JOIN users            u   ON oc.created_by         = u.id
       LEFT JOIN monthly_controls mc  ON oc.monthly_control_id = mc.id
       LEFT JOIN categories       cat ON mc.category_id        = cat.id
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
         sc.condition_id,
         cond.condition_name,
         sc.branch_id       AS item_branch_id,
         scb.name           AS item_branch_name,
         -- Finalización de gestión (solo se usa en órdenes internas/Hub): quién y
         -- cuándo marcó el ítem como completado. NULL = no finalizado.
         od.completed_at,
         od.completed_by,
         cu.username        AS completed_by_username,
         od.updated_at
       FROM order_details od
       LEFT JOIN product_stock_by_branch psb ON od.product_stock_id = psb.id
       LEFT JOIN products      p   ON psb.product_id = p.id
       LEFT JOIN categories    c   ON p.category_id  = c.id
       LEFT JOIN product_groups pg ON psb.group_id   = pg.id
       LEFT JOIN suppliers     sup ON od.supplier_id = sup.id
       LEFT JOIN stock_controls sc ON od.stock_control_id = sc.id
       LEFT JOIN branches      scb ON sc.branch_id = scb.id
       LEFT JOIN conditions    cond ON sc.condition_id = cond.id
       LEFT JOIN users         cu  ON od.completed_by = cu.id
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

      // Recalcular total de la orden. El ESTADO de la orden NO se toca: en el
      // flujo de gestion de compras los estados son manuales (Variante B); la
      // recepcion solo registra cantidades.
      await Order.recalcCostEstimate(detail.order_control_id, client);

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
   * Marca TODOS los items de una orden como recibidos en su totalidad
   * (quantity_received = quantity_ordered) en una sola transaccion. Atomico: una
   * sola llamada en vez de N por item. El ESTADO de la orden NO se cambia: en el
   * flujo de gestion de compras (Variante B) el paso a 'finalizado' es manual.
   */
  static async receiveAll(orderId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE order_details
         SET quantity_received = quantity_ordered,
             cost_estimate     = unit_cost * quantity_ordered,
             updated_at        = NOW()
         WHERE order_control_id = $1
           AND quantity_received < quantity_ordered`,
        [orderId]
      );

      await Order.recalcCostEstimate(orderId, client);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Marca (o reabre) como FINALIZADOS un conjunto de items de una orden. Es una
   * marca de gestión independiente de la recepción: permite que varias personas
   * que gestionan la misma orden coordinen qué items ya fueron atendidos. Solo se
   * usa en ordenes internas (Hub); el controller blinda ese alcance.
   *
   * Acota el UPDATE a los detailIds que REALMENTE pertenecen a la orden (defensa
   * contra ids de otra orden). Al finalizar, sella completed_at=NOW() y
   * completed_by=userId; al reabrir, ambos a NULL.
   *
   * @param {number}   orderId
   * @param {number[]} detailIds
   * @param {number}   userId     usuario que finaliza (ignorado al reabrir).
   * @param {boolean}  completed  true = finalizar, false = reabrir.
   * @returns {number} cantidad de items afectados.
   */
  static async setItemsCompleted(orderId, detailIds, userId, completed) {
    if (!Array.isArray(detailIds) || detailIds.length === 0) return 0;

    const result = await pool.query(
      `UPDATE order_details
       SET completed_at = CASE WHEN $4 THEN NOW() ELSE NULL::timestamp END,
           completed_by = CASE WHEN $4 THEN $3::int ELSE NULL::int END,
           updated_at   = NOW()
       WHERE order_control_id = $1
         AND id = ANY($2::int[])`,
      [orderId, detailIds, userId, completed]
    );
    return result.rowCount;
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
   * Devuelve la orden (cabecera) a la que pertenece un order_detail. Util para
   * validar acceso/estado antes de operar sobre un item.
   */
  static async findByDetailId(detailId) {
    const result = await pool.query(
      `SELECT oc.*
       FROM order_details od
       JOIN orders_controls oc ON od.order_control_id = oc.id
       WHERE od.id = $1`,
      [detailId]
    );
    return result.rows[0] || null;
  }

  /**
   * Borra UN item (order_detail) de una orden. Si su stock_control queda sin
   * ningun otro detalle, lo reabre (ordered_at=NULL) para volver a hacerlo
   * pedible en su control. Si la orden queda sin items, la elimina tambien.
   * Devuelve { orderId, orderDeleted } para que el controller decida la respuesta.
   * Respeta el caso Hub: un control con linea interna + externa NO se reabre al
   * borrar solo una de las dos (queda la otra referenciandolo).
   */
  static async deleteDetail(detailId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Datos del detalle a borrar (orden y control asociados).
      const detRes = await client.query(
        `SELECT order_control_id, stock_control_id
         FROM order_details WHERE id = $1`,
        [detailId]
      );
      const det = detRes.rows[0];
      if (!det) throw new Error("Item de orden no encontrado");

      const orderId = det.order_control_id;
      const stockControlId = det.stock_control_id;

      await client.query("DELETE FROM order_details WHERE id = $1", [detailId]);

      // Reabrir el control si ya no le queda NINGUN detalle (respeta Hub).
      if (stockControlId) {
        await client.query(
          `UPDATE stock_controls sc
           SET ordered_at = NULL, order_detail_id = NULL, updated_at = NOW()
           WHERE sc.id = $1
             AND NOT EXISTS (
               SELECT 1 FROM order_details od WHERE od.stock_control_id = sc.id
             )`,
          [stockControlId]
        );
      }

      // Si la orden quedo vacia, eliminarla; sino recalcular su total.
      const remaining = await client.query(
        "SELECT COUNT(*)::int AS n FROM order_details WHERE order_control_id = $1",
        [orderId]
      );
      let orderDeleted = false;
      if (remaining.rows[0].n === 0) {
        await client.query("DELETE FROM orders_controls WHERE id = $1", [orderId]);
        orderDeleted = true;
      } else {
        await Order.recalcCostEstimate(orderId, client);
      }

      await client.query("COMMIT");
      return { orderId, orderDeleted };
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

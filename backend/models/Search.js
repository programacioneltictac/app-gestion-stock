const { pool } = require("../database/config");

// Tope defensivo: una busqueda por proveedor grande puede traer muchas filas
// (un producto x sucursal). Si se alcanza, el controller avisa al frontend.
const MAX_ROWS = 2000;

/**
 * Buscador rapido: productos por proveedor/nombre, con su situacion en cada
 * sucursal. Es la vista inversa a la del control de stock (sucursal -> rubro ->
 * productos): aca se parte del producto/proveedor y se responde "donde esta".
 *
 * Solo lectura. No reemplaza al control ni arma ordenes.
 */
class Search {
  static MAX_ROWS = MAX_ROWS;

  /**
   * Filas planas producto x sucursal. El agrupado por sucursal lo hace el
   * frontend.
   *
   * @param {Object}   filters
   * @param {number?}  filters.supplierId      proveedor exacto (del desplegable)
   * @param {number?}  filters.productStockId  producto exacto (del desplegable)
   * @param {string?}  filters.q               texto libre sobre el nombre
   * @param {string[]} filters.names           nombres EXACTOS (seleccion multiple)
   * @param {number[]} filters.branchIds       sucursales permitidas por rol
   *
   * `names` y `q` son excluyentes por naturaleza: el primero viene de elegir
   * productos de la lista (coincidencia exacta) y el segundo de tipear. Si
   * llegan los dos, manda `names` — es la seleccion explicita del usuario.
   */
  static async findStock({
    supplierId = null,
    productStockId = null,
    q = null,
    names = [],
    branchIds = [],
  }) {
    if (!branchIds.length) return [];

    // Seleccion multiple: se buscan los nombres EXACTOS elegidos, no un ILIKE.
    // Es a proposito — un texto libre como "SOL" matchea 43 productos, asi que
    // permitir varios terminos libres haria que el tope de 5 no acotara nada.
    const exactNames = Array.isArray(names) ? names.filter(Boolean) : [];
    const useNames = exactNames.length > 0;

    // El "estado" y la "condicion" no son propiedades del producto: viven en
    // stock_controls, que es por sucursal + rubro. Por eso se elige EL control
    // mas reciente de cada psb (draft primero, luego el mas nuevo) via LATERAL.
    //
    // El JOIN LATERAL es INNER a proposito: un producto con stock pero que
    // nunca entro a un control de esa sucursal no tiene estado ni minimo, y se
    // decidio ocultarlo en vez de mostrar una fila a medias. Consecuencia: esta
    // pantalla lista lo que se GESTIONA, no todo lo que hay en la sucursal.
    const result = await pool.query(
      `SELECT b.id                                        AS branch_id,
              b.name                                      AS branch_name,
              b.is_hub,
              psb.id                                      AS product_stock_id,
              psb.display_name,
              psb.stock,
              psb.last_sync_at,
              COALESCE(c.category_name, pg.category_type) AS category_name,
              sup.id                                      AS supplier_id,
              sup.supplier_name,
              COALESCE(pg_b.brand_name, p_b.brand_name)   AS brand_name,
              sc.stock_require,
              -- Faltante literal (minimo - stock), NO el de las ordenes, que
              -- aplica el % de reposicion objetivo. Esta pantalla informa
              -- cuanto falta para el minimo; no propone cuanto pedir.
              GREATEST(sc.stock_require - psb.stock, 0)   AS faltante,
              sc.stock_status_id,
              ss.stock_status_name,
              ss.color_indicator,
              sc.condition_id,
              co.condition_name,
              sc.control_status,
              sc.control_updated_at                       AS control_date
         FROM product_stock_by_branch psb
         JOIN branches b ON psb.branch_id = b.id AND b.is_active = true
         LEFT JOIN products p        ON psb.product_id = p.id
         LEFT JOIN categories c      ON p.category_id  = c.id
         LEFT JOIN product_groups pg ON psb.group_id   = pg.id
         LEFT JOIN brands pg_b       ON pg.brand_id    = pg_b.id
         LEFT JOIN brands p_b        ON p.brand_id     = p_b.id
         -- Proveedor: siempre indirecto via la marca, por las dos ramas
         -- (grupo o producto suelto). Mismo patron que Order.js.
         LEFT JOIN suppliers sup
                ON sup.id = COALESCE(pg_b.supplier_id, p_b.supplier_id)
         JOIN LATERAL (
           SELECT sc2.stock_require,
                  sc2.stock_status_id,
                  sc2.condition_id,
                  mc2.status     AS control_status,
                  mc2.updated_at AS control_updated_at
             FROM stock_controls sc2
             JOIN monthly_controls mc2 ON sc2.monthly_control_id = mc2.id
            WHERE sc2.product_stock_id = psb.id
            ORDER BY (mc2.status = 'draft') DESC, mc2.updated_at DESC
            LIMIT 1
         ) sc ON true
         LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
         LEFT JOIN conditions co   ON sc.condition_id    = co.id
        WHERE psb.display_name IS NOT NULL
          AND psb.branch_id = ANY($1::int[])
          AND ($2::int  IS NULL OR sup.id = $2)
          AND ($3::int  IS NULL OR psb.id = $3)
          AND ($4::text IS NULL OR psb.display_name ILIKE '%' || $4 || '%')
          AND ($5::text[] IS NULL OR psb.display_name = ANY($5::text[]))
        ORDER BY b.is_hub DESC, b.name, psb.display_name
        LIMIT ${MAX_ROWS + 1}`,
      [branchIds, supplierId, productStockId, useNames ? null : q, useNames ? exactNames : null]
    );
    return result.rows;
  }

  /**
   * Opciones del desplegable de productos. Sale de product_stock_by_branch (no
   * de products) porque el stock de las marcas agrupables vive en un grupo
   * marca+rubro, y esos grupos tambien tienen que poder buscarse.
   *
   * Un mismo display_name existe una vez por sucursal; se colapsa por nombre y
   * se devuelve un id representativo solo para mostrar. La busqueda real usa el
   * nombre (ver el controller), asi se cubren todas las sucursales.
   */
  static async findProductOptions(q, branchIds = [], limit = 50) {
    if (!branchIds.length || !q || q.trim().length < 2) return [];

    const result = await pool.query(
      `SELECT MIN(psb.id) AS id, psb.display_name
         FROM product_stock_by_branch psb
        WHERE psb.display_name IS NOT NULL
          AND psb.branch_id = ANY($1::int[])
          AND psb.display_name ILIKE '%' || $2 || '%'
        GROUP BY psb.display_name
        ORDER BY psb.display_name
        LIMIT $3`,
      [branchIds, q.trim(), limit]
    );
    return result.rows;
  }

  /**
   * Proveedores que efectivamente tienen productos bajo control en las
   * sucursales visibles. Existe aparte de /api/suppliers porque aquel exige
   * admin/manager y este buscador tambien lo usa un employee.
   */
  static async findSupplierOptions(branchIds = []) {
    if (!branchIds.length) return [];

    const result = await pool.query(
      `SELECT DISTINCT s.id, s.supplier_name
         FROM product_stock_by_branch psb
         LEFT JOIN products p        ON psb.product_id = p.id
         LEFT JOIN product_groups pg ON psb.group_id   = pg.id
         LEFT JOIN brands pg_b       ON pg.brand_id    = pg_b.id
         LEFT JOIN brands p_b        ON p.brand_id     = p_b.id
         JOIN suppliers s
           ON s.id = COALESCE(pg_b.supplier_id, p_b.supplier_id)
          AND s.is_active = true
        WHERE psb.branch_id = ANY($1::int[])
          AND EXISTS (
            SELECT 1 FROM stock_controls sc
             WHERE sc.product_stock_id = psb.id
          )
        ORDER BY s.supplier_name`,
      [branchIds]
    );
    return result.rows;
  }
}

module.exports = Search;

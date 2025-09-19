// routes/stock.js - PARTE 1 de 3
const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// ==================== FUNCIONES AUXILIARES ====================

// Obtener el mes y año actual
const getCurrentPeriod = () => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1 // JavaScript months are 0-based
  };
};

// Validar si el usuario puede acceder a la sucursal
const canAccessBranch = (user, branchId) => {
  // Admin y manager pueden acceder a cualquier sucursal
  if (user.role === 'admin' || user.role === 'manager') {
    return true;
  }
  // Employee solo puede acceder a su sucursal
  if (user.role === 'employee' && user.branch_id === parseInt(branchId)) {
    return true;
  }
  return false;
};

// Obtener branch_id según el rol del usuario
const getBranchId = (user, requestedBranchId) => {
  if (user.role === 'employee') {
    return user.branch_id; // Forzar la sucursal del empleado
  }
  return requestedBranchId || user.branch_id;
};

// Calcular diferencia de stock (CORREGIDO)
const calculateStockDifference = (stockCurrent, stockRequire) => {
  return stockCurrent - stockRequire;
};

// Calcular compliance de stock (porcentaje de cumplimiento)
const calculateStockCompliance = (stockCurrent, stockRequire) => {
  if (stockRequire === 0) return 100; // Si no se requiere stock, compliance es 100%
  return Math.round((stockCurrent / stockRequire) * 100);
};

// Determinar stock_status_id basado en el compliance (CORREGIDO - removido async)
const determineStockStatus = (compliance) => {
  if (compliance < 80) return 1;
  if (compliance >= 80 && compliance <= 100) return 2;
  if (compliance > 100 && compliance <= 120) return 3;
  return 4;
};

// Validar entrada de datos para stock items
const validateStockItemInput = (req, res, next) => {
  const { product_id, stock_require, stock_current } = req.body;
  
  // Validar campos requeridos
  if (!product_id) {
    return res.status(400).json({
      status: 'error',
      message: 'product_id es requerido'
    });
  }
  
  if (typeof stock_require !== 'number' || stock_require < 0) {
    return res.status(400).json({
      status: 'error',
      message: 'stock_require debe ser un número mayor o igual a 0'
    });
  }
  
  if (typeof stock_current !== 'number' || stock_current < 0) {
    return res.status(400).json({
      status: 'error',
      message: 'stock_current debe ser un número mayor o igual a 0'
    });
  }
  
  next();
};

// Validar entrada de datos para actualización de stock items
const validateStockItemUpdate = (req, res, next) => {
  const { stock_require, stock_current } = req.body;
  
  if (typeof stock_require !== 'number' || stock_require < 0) {
    return res.status(400).json({
      status: 'error',
      message: 'stock_require debe ser un número mayor o igual a 0'
    });
  }
  
  if (typeof stock_current !== 'number' || stock_current < 0) {
    return res.status(400).json({
      status: 'error',
      message: 'stock_current debe ser un número mayor o igual a 0'
    });
  }
  
  next();
};



// ==================== ENDPOINTS DE MONTHLY CONTROLS (PASO C1) ====================

// POST /api/stock/monthly-control/create
router.post('/monthly-control/create', async (req, res) => {
  try {
    const { branch_id: requestedBranchId, year, month } = req.body;
    const period = year && month ? { year, month } : getCurrentPeriod();
    const branchId = getBranchId(req.user, requestedBranchId);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a esta sucursal'
      });
    }

    const existingControl = await pool.query(
      'SELECT id FROM monthly_controls WHERE branch_id = $1 AND control_year = $2 AND control_month = $3',
      [branchId, period.year, period.month]
    );

    if (existingControl.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: `Ya existe un control para ${period.month}/${period.year} en esta sucursal`
      });
    }

    const result = await pool.query(
      `INSERT INTO monthly_controls (branch_id, control_year, control_month, created_by, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING id, branch_id, control_year, control_month, control_date, status`,
      [branchId, period.year, period.month, req.user.id]
    );

    const newControl = result.rows[0];
    console.log(`Control mensual creado - ID: ${newControl.id}, Branch: ${branchId}, Período: ${period.month}/${period.year}, Usuario: ${req.user.username}`);

    res.json({
      status: 'success',
      message: 'Control mensual creado exitosamente',
      control: newControl
    });

  } catch (error) {
    console.error('Error creando control mensual:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/stock/monthly-control/current
router.get('/monthly-control/current', async (req, res) => {
  try {
    const { branch_id: requestedBranchId, year, month } = req.query;
    const period = year && month ? { year: parseInt(year), month: parseInt(month) } : getCurrentPeriod();
    const branchId = getBranchId(req.user, requestedBranchId ? parseInt(requestedBranchId) : null);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a esta sucursal'
      });
    }

    const result = await pool.query(
      `SELECT mc.*, b.name as branch_name, b.code as branch_code,
              u.username as created_by_username
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN users u ON mc.created_by = u.id
       WHERE mc.branch_id = $1 AND mc.control_year = $2 AND mc.control_month = $3`,
      [branchId, period.year, period.month]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        control: null,
        message: 'No existe control para este período. Puedes crear uno nuevo.',
        canCreate: true,
        period: period
      });
    }

    const control = result.rows[0];

    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as total_items,
         COUNT(CASE WHEN ss.stock_status_name = 'generar_pedido' THEN 1 END) as need_order,
         COUNT(CASE WHEN ss.stock_status_name = 'stock_optimo' THEN 1 END) as optimal,
         COUNT(CASE WHEN ss.stock_status_name = 'excedido' THEN 1 END) as excess,
         COUNT(CASE WHEN ss.stock_status_name = 'muy_excedido' THEN 1 END) as high_excess,
         ROUND(AVG(sc.stock_compliance), 2) as avg_compliance
       FROM stock_controls sc
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       WHERE sc.monthly_control_id = $1`,
      [control.id]
    );

    const stats = statsResult.rows[0];

    res.json({
      status: 'success',
      control: control,
      stats: stats,
      canEdit: control.status === 'draft'
    });

  } catch (error) {
    console.error('Error obteniendo control actual:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// PUT /api/stock/monthly-control/save
router.put('/monthly-control/save', async (req, res) => {
  try {
    const { control_id, notes } = req.body;

    if (!control_id) {
      return res.status(400).json({
        status: 'error',
        message: 'ID del control es requerido'
      });
    }

    const controlResult = await pool.query(
      'SELECT * FROM monthly_controls WHERE id = $1',
      [control_id]
    );

    if (controlResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Control no encontrado'
      });
    }

    const control = controlResult.rows[0];

    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a este control'
      });
    }

    if (control.status !== 'draft') {
      return res.status(400).json({
        status: 'error',
        message: 'Solo se pueden editar controles en estado borrador'
      });
    }

    await pool.query(
      'UPDATE monthly_controls SET notes = $1, updated_at = NOW() WHERE id = $2',
      [notes || control.notes, control_id]
    );

    console.log(`Control guardado - ID: ${control_id}, Usuario: ${req.user.username}`);

    res.json({
      status: 'success',
      message: 'Control guardado exitosamente'
    });

  } catch (error) {
    console.error('Error guardando control:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// routes/stock.js - PARTE 2 de 3

// PUT /api/stock/monthly-control/complete
router.put('/monthly-control/complete', async (req, res) => {
  try {
    const { control_id } = req.body;

    if (!control_id) {
      return res.status(400).json({
        status: 'error',
        message: 'ID del control es requerido'
      });
    }

    const controlResult = await pool.query(
      'SELECT * FROM monthly_controls WHERE id = $1',
      [control_id]
    );

    if (controlResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Control no encontrado'
      });
    }

    const control = controlResult.rows[0];

    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a este control'
      });
    }

    if (control.status !== 'draft') {
      return res.status(400).json({
        status: 'error',
        message: 'Solo se pueden completar controles en estado borrador'
      });
    }

    const itemsResult = await pool.query(
      'SELECT COUNT(*) as count FROM stock_controls WHERE monthly_control_id = $1',
      [control_id]
    );

    const itemCount = parseInt(itemsResult.rows[0].count);
    
    if (itemCount === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No se puede completar un control sin productos registrados'
      });
    }

    const updateResult = await pool.query(
      `UPDATE monthly_controls 
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [control_id]
    );

    const updatedControl = updateResult.rows[0];
    console.log(`Control completado - ID: ${control_id}, Items: ${itemCount}, Usuario: ${req.user.username}`);

    res.json({
      status: 'success',
      message: `Control completado exitosamente con ${itemCount} productos`,
      control: updatedControl
    });

  } catch (error) {
    console.error('Error completando control:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/stock/monthly-control/history
router.get('/monthly-control/history', async (req, res) => {
  try {
    const { branch_id: requestedBranchId, limit = 12 } = req.query;
    const branchId = getBranchId(req.user, requestedBranchId ? parseInt(requestedBranchId) : null);

    if (!canAccessBranch(req.user, branchId)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a esta sucursal'
      });
    }

    const result = await pool.query(
      `SELECT mc.*, b.name as branch_name, b.code as branch_code,
              u.username as created_by_username,
              COUNT(sc.id) as total_items
       FROM monthly_controls mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN users u ON mc.created_by = u.id
       LEFT JOIN stock_controls sc ON mc.id = sc.monthly_control_id
       WHERE mc.branch_id = $1
       GROUP BY mc.id, b.name, b.code, u.username
       ORDER BY mc.control_year DESC, mc.control_month DESC
       LIMIT $2`,
      [branchId, parseInt(limit)]
    );

    res.json({
      status: 'success',
      history: result.rows
    });

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// ==================== ENDPOINTS DE STOCK ITEMS (PASO C2) ====================

// POST /api/stock/items/add
router.post('/items/add', validateStockItemInput, async (req, res) => {
  try {
    const { monthly_control_id, product_id, category_id, condition_id, product_status_id, stock_require, stock_current, notes } = req.body;

    if (!monthly_control_id) {
      return res.status(400).json({
        status: 'error',
        message: 'monthly_control_id es requerido'
      });
    }

    // Verificar que el control mensual existe y el usuario puede editarlo
    const controlResult = await pool.query(
      'SELECT * FROM monthly_controls WHERE id = $1',
      [monthly_control_id]
    );

    if (controlResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Control mensual no encontrado'
      });
    }

    const control = controlResult.rows[0];

    // Validar acceso a la sucursal
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a este control'
      });
    }

    // Solo se puede editar si está en estado draft
    if (control.status !== 'draft') {
      return res.status(400).json({
        status: 'error',
        message: 'Solo se pueden agregar productos a controles en estado borrador'
      });
    }

    // Verificar que el producto existe
    const productResult = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND is_active = true',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Producto no encontrado o inactivo'
      });
    }

    // Verificar que el producto no esté ya agregado al control
    const existingItem = await pool.query(
      'SELECT id FROM stock_controls WHERE monthly_control_id = $1 AND product_id = $2',
      [monthly_control_id, product_id]
    );

    if (existingItem.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'Este producto ya está agregado al control mensual'
      });
    }

    // Determinar stock_status_id basado en compliance
    const stockCompliance = stock_require > 0 ? Math.round((stock_current / stock_require) * 100) : 100;

    let stockStatusId = 2; // stock_optimo por defecto
    if (stockCompliance < 50) stockStatusId = 1; // generar_pedido
    else if (stockCompliance > 120 && stockCompliance <= 200) stockStatusId = 3; // excedido
    else if (stockCompliance > 200) stockStatusId = 4; // muy_excedido

    // Insertar el item de stock - INCLUYE branch_id
    const insertResult = await pool.query(
      `INSERT INTO stock_controls 
       (monthly_control_id, product_id, branch_id, category_id, condition_id, product_status_id, 
        stock_require, stock_current, stock_status_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [monthly_control_id, product_id, control.branch_id, category_id || 1, condition_id || 1, product_status_id || 1,
       stock_require, stock_current, stockStatusId, notes]
    );

    const newItem = insertResult.rows[0];

    // Obtener información completa del item creado
    const itemDetailResult = await pool.query(
      `SELECT sc.*, p.product_name, p.product_code, 
              c.category_name, cond.condition_name, 
              ps.product_status_name, ss.stock_status_name, ss.color_indicator
       FROM stock_controls sc
       JOIN products p ON sc.product_id = p.id
       LEFT JOIN categories c ON sc.category_id = c.id
       LEFT JOIN conditions cond ON sc.condition_id = cond.id
       LEFT JOIN products_status ps ON sc.product_status_id = ps.id
       LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
       WHERE sc.id = $1`,
      [newItem.id]
    );

    const itemDetail = itemDetailResult.rows[0];

    console.log(`Producto agregado al control - Control ID: ${monthly_control_id}, Producto: ${itemDetail.product_name}, Usuario: ${req.user.username}`);

    res.json({
      status: 'success',
      message: 'Producto agregado exitosamente al control',
      item: itemDetail
    });

  } catch (error) {
    console.error('Error agregando producto al control:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/stock/items/:control_id
router.get('/items/:control_id', async (req, res) => {
  try {
    const { control_id } = req.params;
    const { 
      category_id, 
      condition_id, 
      product_status_id, 
      stock_status_id,
      search,
      page = 1, 
      limit = 50 
    } = req.query;

    const controlResult = await pool.query(
      'SELECT * FROM monthly_controls WHERE id = $1',
      [control_id]
    );

    if (controlResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Control mensual no encontrado'
      });
    }

    const control = controlResult.rows[0];

    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a este control'
      });
    }

    let query = `
      SELECT sc.*, p.product_name, p.product_code, p.description,
            c.category_name, cond.condition_name, 
            ps.product_status_name, ss.stock_status_name, ss.color_indicator
      FROM stock_controls sc
      JOIN products p ON sc.product_id = p.id
      LEFT JOIN categories c ON sc.category_id = c.id  
      LEFT JOIN conditions cond ON sc.condition_id = cond.id  
      LEFT JOIN products_status ps ON sc.product_status_id = ps.id 
      LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
      WHERE sc.monthly_control_id = $1
    `;

    const queryParams = [control_id];
    let paramCount = 1;

    // Aplicar filtros
    if (category_id) {
      paramCount++;
      query += ` AND sc.category_id = $${paramCount}`;  // ← CORREGIDO: sc.category_id
      queryParams.push(category_id);
    }

    if (condition_id) {
      paramCount++;
      query += ` AND sc.condition_id = $${paramCount}`;  // ← CORREGIDO: sc.condition_id
      queryParams.push(condition_id);
    }

    if (product_status_id) {
      paramCount++;
      query += ` AND sc.product_status_id = $${paramCount}`;  // ← Usar sc.product_status_id
      queryParams.push(product_status_id);
    }

    if (stock_status_id) {
      paramCount++;
      query += ` AND sc.stock_status_id = $${paramCount}`;
      queryParams.push(stock_status_id);
    }

    if (search) {
      paramCount++;
      query += ` AND (p.product_name ILIKE $${paramCount} OR p.product_code ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    query += ` ORDER BY p.product_name`;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(parseInt(limit));
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await pool.query(query, queryParams);

    // routes/stock.js - PARTE 3 de 3 (FINAL)

    // Continuación de GET /api/stock/items/:control_id

    let countQuery = `
      SELECT COUNT(*) as total
      FROM stock_controls sc
      JOIN products p ON sc.product_id = p.id
      WHERE sc.monthly_control_id = $1
    `;

    const countParams = [control_id];
    let countParamCount = 1;

    // Aplicar mismos filtros para el count
    if (category_id) {
      countParamCount++;
      countQuery += ` AND sc.category_id = $${countParamCount}`;  // ← CORREGIDO
      countParams.push(category_id);
    }

    if (condition_id) {
      countParamCount++;
      countQuery += ` AND sc.condition_id = $${countParamCount}`;  // ← CORREGIDO
      countParams.push(condition_id);
    }

    if (product_status_id) {
      countParamCount++;
      countQuery += ` AND sc.product_status_id = $${countParamCount}`;
      countParams.push(product_status_id);
    }

    if (stock_status_id) {
      countParamCount++;
      countQuery += ` AND sc.stock_status_id = $${countParamCount}`;
      countParams.push(stock_status_id);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (p.product_name ILIKE $${countParamCount} OR p.product_code ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalItems = parseInt(countResult.rows[0].total);

    res.json({
      status: 'success',
      items: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalItems,
        pages: Math.ceil(totalItems / parseInt(limit))
      },
      control: {
        id: control.id,
        branch_id: control.branch_id,
        status: control.status,
        canEdit: control.status === 'draft'
      }
    });

  } catch (error) {
    console.error('Error obteniendo items del control:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// PUT /api/stock/items/:item_id
router.put('/items/:item_id', validateStockItemUpdate, async (req, res) => {
  try {
    const { item_id } = req.params;
    const { stock_require, stock_current, notes } = req.body;

    const itemResult = await pool.query(
      `SELECT sc.*, mc.status as control_status, mc.branch_id
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       WHERE sc.id = $1`,
      [item_id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Item de stock no encontrado'
      });
    }

    const item = itemResult.rows[0];

    if (!canAccessBranch(req.user, item.branch_id)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a este control'
      });
    }

    if (item.control_status !== 'draft') {
      return res.status(400).json({
        status: 'error',
        message: 'Solo se pueden editar productos en controles en estado borrador'
      });
    }

    // CORREGIR: Remover await de funciones no asíncronas
    const stockDifference = calculateStockDifference(stock_current, stock_require);
    const stockCompliance = calculateStockCompliance(stock_current, stock_require);
    const stockStatusId = determineStockStatus(stockCompliance);


    // Si necesitas actualizar manualmente:
    const updateResult = await pool.query(
      `UPDATE stock_controls 
       SET stock_require = $1, stock_current = $2, stock_status_id = $3, notes = $4, 
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [stock_require, stock_current, stockStatusId, notes, item_id]
    );

    const itemDetailResult = await pool.query(
      `SELECT sc.*, p.product_name, p.product_code, 
              c.category_name, cond.condition_name, 
              ps.product_status_name, ss.stock_status_name, ss.color_indicator,
              (sc.stock_current - sc.stock_require) as stock_difference,
              CASE 
                WHEN sc.stock_require = 0 THEN 100
                ELSE ROUND((sc.stock_current::numeric / sc.stock_require::numeric) * 100, 2)
              END as stock_compliance
      FROM stock_controls sc
      JOIN products p ON sc.product_id = p.id
      LEFT JOIN categories c ON sc.category_id = c.id
      LEFT JOIN conditions cond ON sc.condition_id = cond.id
      LEFT JOIN products_status ps ON sc.product_status_id = ps.id
      LEFT JOIN stock_status ss ON sc.stock_status_id = ss.id
      WHERE sc.id = $1`,
      [item_id]
    );

    const updatedItem = itemDetailResult.rows[0];
    console.log(`Producto actualizado - ID: ${item_id}, Producto: ${updatedItem.product_name}, Usuario: ${req.user.username}`);

    res.json({
      status: 'success',
      message: 'Producto actualizado exitosamente',
      item: updatedItem
    });

  } catch (error) {
    console.error('Error actualizando item de stock:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// DELETE /api/stock/items/:item_id
router.delete('/items/:item_id', async (req, res) => {
  try {
    const { item_id } = req.params;

    const itemResult = await pool.query(
      `SELECT sc.*, mc.status as control_status, mc.branch_id, p.product_name
       FROM stock_controls sc
       JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
       JOIN products p ON sc.product_id = p.id
       WHERE sc.id = $1`,
      [item_id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Item de stock no encontrado'
      });
    }

    const item = itemResult.rows[0];

    if (!canAccessBranch(req.user, item.branch_id)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a este control'
      });
    }

    if (item.control_status !== 'draft') {
      return res.status(400).json({
        status: 'error',
        message: 'Solo se pueden eliminar productos de controles en estado borrador'
      });
    }

    await pool.query(
      'DELETE FROM stock_controls WHERE id = $1',
      [item_id]
    );

    console.log(`Producto eliminado del control - ID: ${item_id}, Producto: ${item.product_name}, Usuario: ${req.user.username}`);

    res.json({
      status: 'success',
      message: 'Producto eliminado exitosamente del control'
    });

  } catch (error) {
    console.error('Error eliminando item de stock:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// PUT /api/stock/items/:item_id/status
router.put('/items/:item_id/status', async (req, res) => {
    try {
        const { item_id } = req.params;
        const { product_status_id } = req.body;

        // Verificar que el item existe y el usuario puede editarlo
        const itemResult = await pool.query(
            `SELECT sc.*, mc.status as control_status, mc.branch_id, p.product_name, sc.product_status_id, ps.product_status_name
             FROM stock_controls sc
             JOIN monthly_controls mc ON sc.monthly_control_id = mc.id
             JOIN products p ON sc.product_id = p.id
             JOIN products_status ps ON sc.product_status_id = ps.id
             WHERE sc.id = $1`,
            [item_id]
        );

        if (itemResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Item no encontrado'
            });
        }

        const item = itemResult.rows[0];

        if (!canAccessBranch(req.user, item.branch_id)) {
            return res.status(403).json({
                status: 'error',
                message: 'No tienes acceso a este control'
            });
        }

        if (item.control_status !== 'draft') {
            return res.status(400).json({
                status: 'error',
                message: 'Solo se pueden editar controles en borrador'
            });
        }

        // Actualizar solo el product_status_id
        await pool.query(
            'UPDATE stock_controls SET product_status_id = $1, updated_at = NOW() WHERE id = $2',
            [product_status_id, item_id]
        );

        const itemDetailResult = await pool.query(
            `SELECT sc.*, p.product_name, p.product_code, ps.product_status_name
             FROM stock_controls sc
             JOIN products p ON sc.product_id = p.id
             JOIN products_status ps ON sc.product_status_id = ps.id
             WHERE sc.id = $1`,
            [item_id]
        );

        const updatedItem = itemDetailResult.rows[0];
        console.log(`Producto actualizado - ID: ${item_id}, Producto: ${updatedItem.product_name}, Producto Estado: ${updatedItem.product_status_name}, Usuario: ${req.user.username}`);

        res.json({
            status: 'success',
            message: 'Estado del producto actualizado'
        });

    } catch (error) {
        console.error('Error actualizando estado:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error interno del servidor'
        });
    }
});

// ==================== ENDPOINTS DE RESUMENES DE SUCURSALES ======================

// GET /api/stock/branches-summary/:branch_id
// GET /api/stock/branches-summary/:branch_id
router.get('/branches-summary/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    const { limit = 12 } = req.query;

    // Verificar acceso a la sucursal
    if (!canAccessBranch(req.user, parseInt(branch_id))) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a esta sucursal'
      });
    }

    // Obtener el código de la sucursal
    const branchResult = await pool.query(
      'SELECT code FROM branches WHERE id = $1',
      [branch_id]
    );

    if (branchResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Sucursal no encontrada'
      });
    }

    const branchCode = branchResult.rows[0].code;

    // Obtener resumen de controles desde la vista usando branch_code
    const result = await pool.query(
      `SELECT 
         control_id,
         control_year,
         control_month,
         control_date,
         branch_name,
         branch_code,
         status,
         total_products as total_items,
         products_need_order as need_order,
         products_optimal as optimal_stock,
         products_excess as excess_stock,
         products_high_excess as high_excess_stock,
         avg_compliance,
         'N/A' as created_by_username
       FROM v_monthly_control_summary 
       WHERE branch_code = $1 
       ORDER BY control_year DESC, control_month DESC 
       LIMIT $2`,
      [branchCode, parseInt(limit)]
    );

    // Obtener estadísticas generales
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as total_controls,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_controls,
         COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_controls
       FROM v_monthly_control_summary 
       WHERE branch_code = $1`,
      [branchCode]
    );

    // Agregar branch_id a cada control para los enlaces
    const controlsWithBranchId = result.rows.map(control => ({
      ...control,
      branch_id: parseInt(branch_id)
    }));

    res.json({
      status: 'success',
      controls: controlsWithBranchId,
      stats: statsResult.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo resumen de sucursal:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// DELETE /api/stock/monthly-control/:control_id
router.delete('/monthly-control/:control_id', async (req, res) => {
  try {
    const { control_id } = req.params;

    // Verificar que el control existe
    const controlResult = await pool.query(
      'SELECT * FROM monthly_controls WHERE id = $1',
      [control_id]
    );

    if (controlResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Control no encontrado'
      });
    }

    const control = controlResult.rows[0];

    // Verificar acceso a la sucursal
    if (!canAccessBranch(req.user, control.branch_id)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes acceso a este control'
      });
    }

    // Verificar permisos (solo admin puede eliminar)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Solo los administradores pueden eliminar controles'
      });
    }

    // Eliminar en orden correcto para mantener integridad referencial
    await pool.query('BEGIN');
    
    try {
      // Primero eliminar los items de stock
      await pool.query(
        'DELETE FROM stock_controls WHERE monthly_control_id = $1',
        [control_id]
      );

      // Luego eliminar el control mensual
      await pool.query(
        'DELETE FROM monthly_controls WHERE id = $1',
        [control_id]
      );

      await pool.query('COMMIT');

      console.log(`Control eliminado - ID: ${control_id}, Usuario: ${req.user.username}`);

      res.json({
        status: 'success',
        message: 'Control eliminado exitosamente'
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error eliminando control:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/stock/branches-list - Lista de sucursales accesibles
router.get('/branches-list', async (req, res) => {
  try {
    let query = 'SELECT id, name, code FROM branches WHERE is_active = true';
    let queryParams = [];

    // Si es employee, solo su sucursal
    if (req.user.role === 'employee') {
      query += ' AND id = $1';
      queryParams.push(req.user.branch_id);
    }

    query += ' ORDER BY name';

    const result = await pool.query(query, queryParams);

    res.json({
      status: 'success',
      branches: result.rows
    });

  } catch (error) {
    console.error('Error obteniendo lista de sucursales:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});



// ==================== ENDPOINTS ADICIONALES PARA CATÁLOGOS ====================

// GET /api/stock/catalogs/products

// GET /api/stock/catalogs/products - CORREGIDO
router.get('/catalogs/products', async (req, res) => {
  try {
    const { search, limit = 100 } = req.query;
    
    let query = `
      SELECT p.id, p.product_name, p.product_code, p.description, p.is_active
      FROM products p
      WHERE p.is_active = true
    `;
    
    const queryParams = [];
    let paramCount = 0;
    
    if (search) {
      paramCount++;
      query += ` AND (p.product_name ILIKE $${paramCount} OR p.product_code ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }
    
    query += ` ORDER BY p.product_name LIMIT $${paramCount + 1}`;
    queryParams.push(parseInt(limit));
    
    const result = await pool.query(query, queryParams);
    
    res.json({
      status: 'success',
      products: result.rows
    });
    
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/stock/catalogs/categories - CORREGIDO
router.get('/catalogs/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories WHERE is_active = true ORDER BY category_name'
    );
    
    res.json({
      status: 'success',
      categories: result.rows
    });
    
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/stock/catalogs/conditions - CORREGIDO
router.get('/catalogs/conditions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM conditions ORDER BY condition_name'
    );
    
    res.json({
      status: 'success',
      conditions: result.rows
    });
    
  } catch (error) {
    console.error('Error obteniendo condiciones:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
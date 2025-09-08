
require('dotenv').config();
const path = require('path');
const express = require('express');
const { testConnection, pool } = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Probar conexión al iniciar
testConnection();

// Configuración de seguridad
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-production';
const SALT_ROUNDS = 12;
const TOKEN_EXPIRES_IN = '24h';

// Flag para activar/desactivar nuevo sistema de auth
const USE_NEW_AUTH = process.env.USE_NEW_AUTH === 'true';

// ==================== MEJORAS DE SEGURIDAD ====================

// 1. RATE LIMITING - Protección contra ataques de fuerza bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos por IP por ventana de tiempo
  message: {
    status: 'error',
    message: 'Demasiados intentos de login. Intenta nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: true
  // Removed custom keyGenerator - using default IP-based limiting
});

// Rate limiting general para APIs
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // máximo 100 requests por IP por minuto
  message: {
    status: 'error',
    message: 'Demasiadas peticiones. Intenta nuevamente en un minuto.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 2. HEADERS DE SEGURIDAD
app.use((req, res, next) => {
  // Security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // CORS headers (mantenemos los existentes pero más específicos)
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Auth-Token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  
  next();
});

// 3. VALIDACIONES DE ENTRADA
function validateLoginInput(req, res, next) {
  const { username, password } = req.body;
  
  // Validar presencia
  if (!username || !password) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Usuario y contraseña son requeridos' 
    });
  }
  
  // Validar tipos
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Usuario y contraseña deben ser texto' 
    });
  }
  
  // Sanitizar y validar longitud
  req.body.username = username.trim();
  if (req.body.username.length < 2 || req.body.username.length > 50) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'El usuario debe tener entre 2 y 50 caracteres' 
    });
  }
  
  if (password.length < 4 || password.length > 100) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'La contraseña debe tener entre 4 y 100 caracteres' 
    });
  }
  
  // Validar caracteres permitidos en username (solo alfanuméricos, guiones y puntos)
  if (!/^[a-zA-Z0-9._-]+$/.test(req.body.username)) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'El usuario solo puede contener letras, números, puntos, guiones y guiones bajos' 
    });
  }
  
  next();
}

function validateRegisterInput(req, res, next) {
  const { username, password, role, branch_id } = req.body;
  
  // Reutilizar validación básica de login
  validateLoginInput(req, res, () => {
    // Validaciones adicionales para registro
    if (role && !['admin', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Rol inválido. Debe ser: admin, manager o employee' 
      });
    }
    
    if (branch_id && (typeof branch_id !== 'number' || branch_id < 1)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'ID de sucursal inválido' 
      });
    }
    
    next();
  });
}

// 4. SANITIZACIÓN DE DATOS SQL (usando parámetros preparados - ya implementado)
// PostgreSQL ya maneja esto con los parámetros $1, $2, etc.

// ==================== MIDDLEWARE EXISTENTE ====================

app.use(express.json({ limit: '1mb' })); // Limitar tamaño del payload
app.use(express.static(path.join(__dirname, 'public')));

// Aplicar rate limiting a todas las rutas API
app.use('/api', apiLimiter);

// Middleware para verificar JWT (sin cambios)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Token de acceso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ status: 'error', message: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
};

// Middleware para verificar roles (sin cambios)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ status: 'error', message: 'Acceso denegado: rol requerido' });
    }
    if (roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ status: 'error', message: 'Acceso denegado: rol insuficiente' });
  };
}

// Middleware para controlar acceso por sucursal (sin cambios)
function checkBranchAccess(req, res, next) {
  if (req.user && req.user.branch_id) {
    req.branchFilter = { branch_id: req.user.branch_id };
  }
  next();
}

// Middleware para filtrar automáticamente para empleados (sin cambios)
function addBranchFilter(req, res, next) {
  if (req.user && req.user.role === 'employee' && req.user.branch_id) {
    req.branchFilter = { branch_id: req.user.branch_id };
  }
  next();
}

// ==================== ENDPOINTS CON SEGURIDAD MEJORADA ====================

// LOGIN con rate limiting y validación mejorada
app.post('/api/login', loginLimiter, validateLoginInput, async (req, res) => {
  const { username, password } = req.body;

  try {
    // Consulta con JOIN para obtener datos de sucursal
    const result = await pool.query(`
      SELECT u.id, u.username, u.password_hash, u.role, u.branch_id, u.is_active,
             b.name AS branch_name, b.code AS branch_code
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.username = $1 AND u.is_active = true
    `, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    // Verificación de contraseña
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ status: 'error', message: 'Credenciales inválidas' });
    }

    // JWT incluye: role, branch_id, branch_name, branch_code
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id,
      branch_name: user.branch_name,
      branch_code: user.branch_code,
      iat: Math.floor(Date.now() / 1000) // timestamp para tracking
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

    // Log de seguridad (sin información sensible)
    console.log(`✅ Login exitoso - Usuario: ${username}, Role: ${user.role}, Branch: ${user.branch_name || 'N/A'}, IP: ${req.ip}`);

    res.json({
      status: 'success',
      message: 'Login exitoso',
      token: token,
      user: {
        id: payload.id,
        username: payload.username,
        role: payload.role,
        branch_id: payload.branch_id,
        branch_name: payload.branch_name,
        branch_code: payload.branch_code
      }
    });

  } catch (error) {
    console.error('❌ Error en login:', error.message);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

// LOGOUT mejorado
app.post('/api/logout', authenticateToken, (req, res) => {
  // Log de seguridad
  console.log(`📤 Logout - Usuario: ${req.user.username}, IP: ${req.ip}`);
  
  // En una implementación más avanzada aquí se podría agregar el token a una blacklist
  res.json({ status: 'success', message: 'Logout exitoso' });
});

// REGISTRO con validación mejorada (solo admin puede registrar usuarios)
app.post('/api/register', authenticateToken, requireRole('admin'), validateRegisterInput, async (req, res) => {
  const { username, password, role = 'employee', branch_id = null } = req.body;
  
  try {
    // Verificar si el usuario ya existe
    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ status: 'error', message: 'El usuario ya existe' });
    }
    
    // Si se especifica branch_id, verificar que la sucursal existe
    if (branch_id) {
      const branchExists = await pool.query('SELECT id FROM branches WHERE id = $1 AND is_active = true', [branch_id]);
      if (branchExists.rows.length === 0) {
        return res.status(400).json({ status: 'error', message: 'La sucursal especificada no existe' });
      }
    }
    
    // Hashear la contraseña
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role, branch_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, password_hash, role, branch_id]
    );
    
    // Log de seguridad
    console.log(`👤 Usuario creado - ID: ${result.rows[0].id}, Username: ${username}, Role: ${role}, Branch: ${branch_id || 'N/A'}, Creado por: ${req.user.username}`);
    
    res.json({ status: 'success', message: 'Usuario creado exitosamente' });
  } catch (error) {
    console.error('❌ Error en registro:', error.message);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

// ==================== ENDPOINTS EXISTENTES (sin cambios funcionales) ====================

app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({
    status: 'success',
    message: 'Perfil del usuario',
    user: req.user
  });
});

app.get('/api/branches', authenticateToken, requireRole('admin', 'manager'), checkBranchAccess, async (req, res) => {
  try {
    let query = 'SELECT * FROM branches WHERE is_active = true';
    let params = [];
    if (req.branchFilter && req.branchFilter.branch_id) {
      query += ' AND id = $1';
      params.push(req.branchFilter.branch_id);
    }
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json({
      status: 'success',
      branches: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo sucursales:', error.message);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

app.get('/api/my-branch', authenticateToken, async (req, res) => {
  try {
    if (!req.user.branch_id) {
      return res.json({
        status: 'success',
        branch: null,
        message: 'Usuario tiene acceso a todas las sucursales'
      });
    }

    const result = await pool.query('SELECT * FROM branches WHERE id = $1', [req.user.branch_id]);
    res.json({
      status: 'success',
      branch: result.rows[0] || null
    });
  } catch (error) {
    console.error('❌ Error obteniendo sucursal del usuario:', error.message);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.role, u.branch_id, u.is_active, u.created_at,
             b.name as branch_name, b.code as branch_code
      FROM users u 
      LEFT JOIN branches b ON u.branch_id = b.id 
      ORDER BY u.created_at DESC
    `);
    
    res.json({
      status: 'success',
      users: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo usuarios:', error.message);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

app.get('/api/verify-auth', authenticateToken, (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'Usuario autenticado',
    user: req.user 
  });
});

// ==================== RUTAS ESTÁTICAS ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

// ==================== MANEJO DE ERRORES GLOBAL ====================

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint no encontrado'
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('💥 Error no manejado:', err);
  res.status(500).json({
    status: 'error',
    message: 'Error interno del servidor'
  });
});

// ==================== INICIO DEL SERVIDOR ====================

const server = app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
  console.log(`🔒 Security features enabled:`);
  console.log(`   - Rate limiting: Login (5/15min), API (100/min)`);
  console.log(`   - Input validation and sanitization`);
  console.log(`   - Security headers`);
  console.log(`   - Audit logging`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    pool.end(() => {
      console.log('✅ Database pool closed');
      process.exit(0);
    });
  });
});

module.exports = app;
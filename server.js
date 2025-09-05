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

//middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Auth-Token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para verificar JWT
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

// Middleware para verificar roles
function requireRole(...roles) {
  return (req, res, next) => {
    // Si el usuario no tiene rol, denegar acceso
    if (!req.user || !req.user.role) {
      return res.status(403).json({ status: 'error', message: 'Acceso denegado: rol requerido' });
    }
    // Si el rol del usuario está en la lista de roles permitidos, continuar
    if (roles.includes(req.user.role)) {
      return next();
    }
    // Si no, denegar acceso
    return res.status(403).json({ status: 'error', message: 'Acceso denegado: rol insuficiente' });
  };
}

// Middleware para controlar acceso por sucursal (branch)
function checkBranchAccess(req, res, next) {
  // Si el usuario tiene branch_id, solo puede acceder a su sucursal
  if (req.user && req.user.branch_id) {
    req.branchFilter = { branch_id: req.user.branch_id };
  }
  next();
}

// Middleware para filtrar automáticamente para empleados
function addBranchFilter(req, res, next) {
  // Si el usuario es empleado y tiene branch_id, filtra por sucursal
  if (req.user && req.user.role === 'employee' && req.user.branch_id) {
    req.branchFilter = { branch_id: req.user.branch_id };
  }
  next();
}

//endpoints
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Consulta con JOIN para obtener datos de sucursal
    const result = await pool.query(`
      SELECT u.id, u.username, u.password_hash, u.role, u.branch_id, u.is_active,
             b.name AS branch_name, b.code AS branch_code
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.username = $1
    `, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    // Verificación de usuarios activos
    if (!user.is_active) {
      return res.status(403).json({ status: 'error', message: 'Usuario inactivo' });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ status: 'error', message: 'Contraseña incorrecta' });
    }

    // JWT incluye: role, branch_id, branch_name, branch_code
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: user.branch_id,
      branch_name: user.branch_name,
      branch_code: user.branch_code
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

    res.json({
      status: 'success',
      message: 'Login exitoso',
      token: token,
      user: payload
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

app.post('/api/logout', (req, res) => {
  console.log('Logout attempt');
  // El logout se maneja en el frontend limpiando el token del localStorage
  // En una implementación más avanzada aquí se podría agregar el token a una blacklist
  res.json({ status: 'success', message: 'Logout exitoso' });
});

// Endpoint protegido de ejemplo para verificar token
app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({
    status: 'success',
    message: 'Perfil del usuario',
    user: req.user
  });
});

// Endpoint para obtener todas las sucursales (solo admin y manager)
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
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

// Endpoint para obtener sucursal del usuario actual
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
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

// Endpoint para gestión de usuarios (solo admin)
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
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Usuario y contraseña requeridos' });
  }
  try {
    // Verifica si el usuario ya existe
    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ status: 'error', message: 'El usuario ya existe' });
    }
    // Hashea la contraseña
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
      [username, password_hash]
    );
    res.json({ status: 'success', message: 'Usuario creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
  }
});

//endpoint estaticos
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta /control - NO protegida a nivel de servidor
// La protección se maneja en el frontend (control.js)
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

// Endpoint para verificar autenticación desde el frontend
app.get('/api/verify-auth', authenticateToken, (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'Usuario autenticado',
    user: req.user 
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
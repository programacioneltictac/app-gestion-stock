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

//endpoints
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Usuario no encontrado' });
    }
    
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    
    if (!match) {
      return res.status(401).json({ status: 'error', message: 'Contraseña incorrecta' });
    }
    
    // Generar JWT Token
    const payload = {
      id: user.id,
      username: user.username
    };
    
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
    
    res.json({ 
      status: 'success', 
      message: 'Login exitoso',
      token: token,
      user: {
        id: user.id,
        username: user.username
      }
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
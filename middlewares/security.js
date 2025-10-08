const rateLimit = require("express-rate-limit");

// Rate limiting para login
const loginLimiter = rateLimit({
  windowMs: process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000, // 15 minutos
  max: Number(process.env.LOGIN_MAX_ATTEMPTS) || 5,
  message: {
    status: "error",
    message: "Demasiados intentos de login. Intenta nuevamente en 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Rate limiting general para APIs
const apiLimiter = rateLimit({
  windowMs: process.env.API_WINDOW_MS || 1 * 60 * 1000, // 1 minuto
  max: Number(process.env.API_MAX_REQUESTS) || 100,
  message: {
    status: "error",
    message: "Demasiadas peticiones. Intenta nuevamente en un minuto.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware de headers de seguridad
const securityHeaders = (req, res, next) => {
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "DENY");
  res.header("X-XSS-Protection", "1; mode=block");
  res.header("Referrer-Policy", "strict-origin-when-cross-origin");
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Auth-Token"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  next();
};

module.exports = {
  loginLimiter,
  apiLimiter,
  securityHeaders,
};

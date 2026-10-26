const rateLimit = require("express-rate-limit");

// Rate limiting para login
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
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
  windowMs: Number(process.env.API_WINDOW_MS) || 1 * 60 * 1000, // 1 minuto
  max: Number(process.env.API_MAX_REQUESTS) || 100,
  message: {
    status: "error",
    message: "Demasiadas peticiones. Intenta nuevamente en un minuto.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS: en produccion el front se sirve desde el mismo origen y no lo necesita.
// Solo hace falta en desarrollo (Vite en otro puerto que el backend). Se admite
// cualquier localhost y los origenes extra listados en CORS_ORIGINS (coma).
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const EXTRA_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) =>
  Boolean(origin) && (LOCALHOST_ORIGIN.test(origin) || EXTRA_ORIGINS.includes(origin));

// Middleware de headers de seguridad y CORS
const securityHeaders = (req, res, next) => {
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "DENY");
  res.header("X-XSS-Protection", "1; mode=block");
  res.header("Referrer-Policy", "strict-origin-when-cross-origin");

  // CORS headers
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Auth-Token"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
};

module.exports = {
  loginLimiter,
  apiLimiter,
  securityHeaders,
};

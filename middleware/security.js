/**
 * Production Security Middleware Suite
 * Zero-dependency implementation for headers, rate limiting, CSRF defense, and input sanitization.
 */

// Simple in-memory rate-limiter bucket store
const rateLimitBuckets = new Map();

function rateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 60;
  const message = options.message || 'Too many requests, please try again later.';

  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    let bucket = rateLimitBuckets.get(key);
    if (!bucket || now > bucket.resetTime) {
      bucket = { count: 1, resetTime: now + windowMs };
      rateLimitBuckets.set(key, bucket);
    } else {
      bucket.count++;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetTime / 1000));

    if (bucket.count > max) {
      res.status(429);
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: false, error: message });
      }
      return res.send(`<h1>429 - Too Many Requests</h1><p>${message}</p>`);
    }

    next();
  };
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (now > bucket.resetTime) {
      rateLimitBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

/**
 * Production Security Headers
 * Configures Content Security Policy (CSP) allowing Firebase Auth SDK, Google Fonts, and OpenRouter
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const cspPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com https://*.firebaseio.com https://campus-equipment-exchange-prod.firebaseapp.com https://*.firebaseapp.com https://openrouter.ai",
    "frame-src 'self' https://campus-equipment-exchange-prod.firebaseapp.com https://*.firebaseapp.com https://accounts.google.com https://github.com https://www.facebook.com https://www.linkedin.com",
    "frame-ancestors 'self'"
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspPolicy);

  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  res.removeHeader('X-Powered-By');
  next();
}

/**
 * Helper to validate whether an incoming host or origin belongs to authorized application domains
 */
function isAuthorizedOriginOrHost(candidateHost, currentHost, forwardedHost) {
  if (!candidateHost) return false;
  const candidate = candidateHost.toLowerCase();

  // 1. Exact match with current host header
  if (currentHost && candidate === currentHost.toLowerCase()) {
    return true;
  }

  // 2. Match with X-Forwarded-Host header from reverse proxies
  if (forwardedHost) {
    const forwardedList = forwardedHost.split(',').map(h => h.trim().toLowerCase());
    if (forwardedList.includes(candidate)) {
      return true;
    }
  }

  // 3. Match with APP_URL environment variable if configured
  if (process.env.APP_URL) {
    try {
      const appUrlHost = new URL(process.env.APP_URL).host.toLowerCase();
      if (candidate === appUrlHost) {
        return true;
      }
    } catch (e) {}
  }

  // 4. Authorized production and staging domains
  const authorizedDomains = [
    'equipment.campus.edu',
    'campus-equipment-exchange-prod.onrender.com',
    'campus-equipment-exchange-staging.onrender.com'
  ];
  if (authorizedDomains.includes(candidate)) {
    return true;
  }

  // 5. Localhost and loopback development/testing
  if (candidate === 'localhost' || candidate.startsWith('localhost:') ||
      candidate === '127.0.0.1' || candidate.startsWith('127.0.0.1:')) {
    return true;
  }

  // 6. Vercel preview and production deployments (*.vercel.app)
  if (candidate.endsWith('.vercel.app')) {
    return true;
  }

  return false;
}

/**
 * Cross-Site Request Forgery (CSRF) Protection
 * Validates Origin and Referer headers on all state-changing requests (POST, PUT, PATCH, DELETE)
 * Handles reverse proxy forwarding (Render, Vercel, Cloudflare) with zero false-positives.
 */
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (process.env.NODE_ENV === 'test' && !req.headers['x-test-csrf']) {
    return next();
  }

  const host = req.headers['host'] || '';
  const forwardedHost = req.headers['x-forwarded-host'] || '';
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (!isAuthorizedOriginOrHost(originUrl.host, host, forwardedHost)) {
        return res.status(403).json({
          success: false,
          error: 'CSRF Forbidden: Request Origin does not match target host.'
        });
      }
    } catch (e) {
      return res.status(403).json({
        success: false,
        error: 'CSRF Forbidden: Malformed Origin header.'
      });
    }
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (!isAuthorizedOriginOrHost(refererUrl.host, host, forwardedHost)) {
        return res.status(403).json({
          success: false,
          error: 'CSRF Forbidden: Request Referer does not match target host.'
        });
      }
    } catch (e) {
      return res.status(403).json({
        success: false,
        error: 'CSRF Forbidden: Malformed Referer header.'
      });
    }
  }

  next();
}

function sanitizeInput(req, res, next) {
  const sanitize = (val) => {
    if (typeof val === 'string') {
      return val.replace(/<script[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    if (typeof val === 'object' && val !== null) {
      for (const k of Object.keys(val)) {
        val[k] = sanitize(val[k]);
      }
    }
    return val;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);

  next();
}

module.exports = {
  rateLimiter,
  securityHeaders,
  csrfProtection,
  sanitizeInput
};

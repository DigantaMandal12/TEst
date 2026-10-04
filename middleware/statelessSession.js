/**
 * Stateless Serverless Session Resilience Middleware
 * Provides zero-loss session persistence across serverless container recycling and multi-region routing.
 * Uses HMAC-SHA256 cryptographically signed cookies compatible with Node 24 runtime without external dependencies.
 */

const crypto = require('crypto');

const COOKIE_NAME = 'campus_auth_session';

function getSecret() {
  return process.env.SESSION_SECRET || 'campus-equipment-lending-secret-key-2026';
}

/**
 * Sign session data into a tamper-evident payload
 */
function signSession(data) {
  try {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  } catch (err) {
    console.error('[STATELESS SESSION SIGN ERROR]', err.message);
    return null;
  }
}

/**
 * Verify signed session payload using constant-time timing-safe comparison
 */
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware to ensure session survives serverless cold starts & multi-instance scaling
 */
function statelessSessionMiddleware(req, res, next) {
  req.session = req.session || {};

  // 1. Restore user from signed cookie if serverless memory store was recycled
  if ((!req.session.user || req.session.user === null) && req.cookies && req.cookies[COOKIE_NAME]) {
    const restoredUser = verifySession(req.cookies[COOKIE_NAME]);
    if (restoredUser && (!req.session || !req.session.isLoggedOut)) {
      req.session.user = restoredUser;
    }
  }

  // 2. Synchronize response cookie before headers are sent
  function syncCookie() {
    if (res.headersSent) return;

    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
      path: '/',
      secure: isProd && process.env.COOKIE_SECURE === 'true'
    };

    if (req.session && req.session.isLoggedOut) {
      res.clearCookie('campus_sid', { path: '/' });
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return;
    }

    if (req.session && req.session.user) {
      const token = signSession(req.session.user);
      if (token) {
        res.cookie(COOKIE_NAME, token, cookieOpts);
      }
    }
  }

  // Intercept response lifecycle methods to guarantee cookie sync
  const origRedirect = res.redirect.bind(res);
  res.redirect = function (...args) {
    syncCookie();
    return origRedirect(...args);
  };

  const origRender = res.render.bind(res);
  res.render = function (...args) {
    syncCookie();
    return origRender(...args);
  };

  const origJson = res.json.bind(res);
  res.json = function (...args) {
    syncCookie();
    return origJson(...args);
  };

  const origSend = res.send.bind(res);
  res.send = function (...args) {
    syncCookie();
    return origSend(...args);
  };

  next();
}

module.exports = {
  COOKIE_NAME,
  signSession,
  verifySession,
  statelessSessionMiddleware
};

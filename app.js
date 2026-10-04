const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const connectDB = require('./config/db');
const { populateUserLocals, requireAuth, requireAdmin } = require('./middleware/auth');
const { statelessSessionMiddleware } = require('./middleware/statelessSession');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { securityHeaders, sanitizeInput, rateLimiter, csrfProtection } = require('./middleware/security');
const metricsService = require('./services/metricsService');
const { getAIObservabilityMetrics } = require('./services/aiService');

// Route modules
const indexRoutes = require('./routes/indexRoutes');
const authRoutes = require('./routes/authRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const borrowRoutes = require('./routes/borrowRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const chatRoutes = require('./routes/chatRoutes');
const equipmentController = require('./controllers/equipmentController');
const authController = require('./controllers/authController');
const borrowController = require('./controllers/borrowController');

const app = express();

// Enable Trust Proxy for Render & Vercel HTTPS reverse proxies
app.set('trust proxy', 1);

// 1. Lightweight Production Health Check (Before Rate Limiting & Auth for Probes)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// 2. Production Observability & Structured Request Metrics Middleware
app.use(metricsService.middleware());

// 3. Production Security Headers (includes Firebase Auth CSP)
app.use(securityHeaders);

// 4. View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 5. Static assets
app.use(express.static(path.join(__dirname, 'public')));

// 6. Body parsing with strict limits & sanitization
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(sanitizeInput);
app.use(cookieParser());
app.use(csrfProtection);

// 7. Hardened Session Setup
const isProd = process.env.NODE_ENV === 'production';
const sessionConfig = {
  name: 'campus_sid',
  secret: process.env.SESSION_SECRET || 'campus-equipment-lending-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: (isProd && process.env.COOKIE_SECURE === 'true') ? 'auto' : false,
  }
};

app.use(session(sessionConfig));

// Stateless Session Persistence for Vercel Serverless Containers
app.use(statelessSessionMiddleware);

// 8. Database Connection Hook (Cloud Firestore) with Auto-Seeding
let seedTriggered = false;
app.use(async (req, res, next) => {
  try {
    await connectDB();
    if (!seedTriggered) {
      seedTriggered = true;
      const { seedInitialData } = require('./config/seedData');
      seedInitialData().catch(e => console.warn('[AUTO-SEED WARNING]', e.message));
    }
    next();
  } catch (err) {
    console.error('[DB HOOK ERROR]', err.message);
    next();
  }
});

// 9. Populate View Locals
app.use(populateUserLocals);

// 10. Rate Limiting for sensitive routes
const authLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many login attempts, please try again in 15 minutes.' });
const chatLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 45, message: 'Rate limit exceeded for assistant queries. Please wait a moment.' });

// Direct API endpoint for equipment image uploads
app.post('/api/upload-image', requireAuth, equipmentController.apiUploadImage);

// Authenticated Operational Metrics API (Administrator Only)
app.get('/admin/api/metrics', requireAuth, requireAdmin, (req, res) => {
  const snapshot = metricsService.getSnapshot(getAIObservabilityMetrics());
  res.json(snapshot);
});

// Top-level Auth, Navigation, & Workflow Aliases
app.get('/login', authController.loginForm);
app.post('/login', authLimiter, authController.loginSubmit);
app.get('/register', authController.registerForm);
app.post('/register', authLimiter, authController.registerSubmit);
app.post('/session-login', authLimiter, authController.sessionLogin);
app.get('/logout', authController.logout);
app.get('/dashboard', (req, res) => res.redirect('/borrow/my-loans'));
app.get('/my-loans', (req, res) => res.redirect('/borrow/my-loans'));
app.get('/lender', (req, res) => res.redirect('/borrow/lender'));

// Direct borrow request aliases (/request/:equipmentId and /request)
app.get('/request/:equipmentId', requireAuth, borrowController.requestForm);
app.post('/request', requireAuth, borrowController.submitRequest);

// 11. Mount Application Routes
app.use('/', indexRoutes);
app.use('/auth', authLimiter, authRoutes);
app.use('/equipment', equipmentRoutes);
app.use('/search', equipmentRoutes); // Route alias for Smart Search
app.use('/borrow', borrowRoutes);
app.use('/reviews', reviewRoutes);
app.use('/notifications', notificationRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatLimiter, chatRoutes);
app.use('/chatbot', chatLimiter, chatRoutes); // Route alias for AI Hardware Assistant

// 12. Handle 404 & Global Errors
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

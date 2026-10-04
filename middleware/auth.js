const User = require('../models/User');
const Notification = require('../models/Notification');

async function populateUserLocals(req, res, next) {
  res.locals = res.locals || {};
  res.locals.currentPath = req.path || '/';
  
  const isDevOrTest = process.env.ALLOW_DEMO_LOGIN === 'true';
  const isAuthRoute = req.path.startsWith('/auth') || req.path === '/login' || req.path === '/register';

  if (isDevOrTest && !isAuthRoute && (!req.session || (!req.session.user && !req.session.isLoggedOut))) {
    let demoUser = await User.findOne({ email: 'rahul.das@campus.edu' });
    if (!demoUser) {
      demoUser = await User.create({
        name: 'Rahul Das',
        email: 'rahul.das@campus.edu',
        password: 'password123',
        role: 'student',
        department: 'Mechanical',
        collegeId: 'ME-2024-042',
        trustScore: 92,
        trustTier: 'Gold',
        ratingAvg: 4.9,
        ratingCount: 14,
        totalBorrowed: 6,
        totalLent: 2
      });
    }
    if (req.session) {
      req.session.user = {
        id: demoUser._id || demoUser.id,
        _id: demoUser._id || demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        role: demoUser.role,
        department: demoUser.department,
        collegeId: demoUser.collegeId,
        trustScore: demoUser.trustScore,
        trustTier: demoUser.trustTier
      };
    }
  }

  res.locals.user = (req.session && req.session.user) || null;

  if (!res.locals.user && req.cookies && req.cookies['campus_auth_session']) {
    try {
      const { verifySession } = require('./statelessSession');
      const restored = verifySession(req.cookies['campus_auth_session']);
      if (restored && (!req.session || !req.session.isLoggedOut)) {
        res.locals.user = restored;
        if (req.session) req.session.user = restored;
      }
    } catch (e) {
      console.warn('[AUTH LOCALS] Could not verify stateless session cookie:', e.message);
    }
  }

  res.locals.flash = (req.session && req.session.flash) || {};
  if (req.session) req.session.flash = {};

  if (res.locals.user) {
    try {
      const unread = await Notification.countDocuments({ 
        user: res.locals.user.id || res.locals.user._id, 
        read: false 
      });
      res.locals.unreadNotifCount = unread || 0;
    } catch (err) {
      res.locals.unreadNotifCount = 0;
    }
  } else {
    res.locals.unreadNotifCount = 0;
  }

  next();
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/auth/login?redirect=' + encodeURIComponent(req.originalUrl || '/'));
}

function requireSenior(req, res, next) {
  if (req.session && req.session.user && (req.session.user.role === 'senior' || req.session.user.role === 'admin' || req.session.user.role === 'teacher')) {
    return next();
  }
  if (req.session) {
    req.session.flash = { error: 'Senior student or department authorization required for this action.' };
  }
  return res.redirect('/');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  if (req.session) {
    req.session.flash = { error: 'Campus administrator clearance required.' };
  }
  return res.redirect('/');
}

module.exports = {
  populateUserLocals,
  requireAuth,
  requireSenior,
  requireAdmin
};

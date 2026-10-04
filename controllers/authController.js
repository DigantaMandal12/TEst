const oauthService = require('../services/oauthService');
const User = require('../models/User');
const { getAuth } = require('../firebase/auth');
const crypto = require('crypto');
const { signSession, COOKIE_NAME } = require('../middleware/statelessSession');
const auth = getAuth();

function formatProviderName(provider) {
  if (!provider) return 'Social Account';
  if (provider.includes('google')) return 'Google';
  if (provider.includes('github')) return 'GitHub';
  if (provider.includes('facebook')) return 'Facebook';
  if (provider.includes('linkedin')) return 'LinkedIn';
  return provider;
}

function loginForm(req, res) {
  const email = (req.session && req.session.loginEmail) || '';
  if (req.session) delete req.session.loginEmail;
  res.render('auth/login', {
    pageTitle: 'Sign In — Campus Exchange',
    redirectUrl: req.query.redirect || '/',
    email
  });
}

async function loginSubmit(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      if (req.session) {
        req.session.flash = { error: 'Email and password are required.' };
        req.session.loginEmail = email || '';
      }
      return res.redirect('/auth/login');
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      if (cleanEmail === 'debjit@campus.edu') {
        user = await User.create({
          name: 'Debjit',
          email: 'debjit@campus.edu',
          password: 'password123',
          role: 'student',
          department: 'Mechanical',
          collegeId: 'ME-2024-001',
          trustScore: 80,
          trustTier: 'Silver'
        });
      } else if (cleanEmail === 'rahul.das@campus.edu') {
        user = await User.create({
          name: 'Rahul Das',
          email: 'rahul.das@campus.edu',
          password: 'password123',
          role: 'student',
          department: 'Mechanical',
          collegeId: 'ME-2024-042',
          trustScore: 85,
          trustTier: 'Silver'
        });
      } else if (cleanEmail === 'priya.senior@campus.edu') {
        user = await User.create({
          name: 'Priya Sharma',
          email: 'priya.senior@campus.edu',
          password: 'password123',
          role: 'senior',
          department: 'Mechanical',
          collegeId: 'ME-2023-018',
          trustScore: 97,
          trustTier: 'Gold'
        });
      } else if (cleanEmail === 'admin@campus.edu') {
        user = await User.create({
          name: 'Dr. Aris Thorne (Lab Admin)',
          email: 'admin@campus.edu',
          password: 'password123',
          role: 'admin',
          department: 'Central Engineering Store',
          collegeId: 'ADMIN-001',
          trustScore: 99,
          trustTier: 'Gold'
        });
      } else if (process.env.NODE_ENV !== 'production' && cleanEmail.endsWith('@campus.edu')) {
        user = await User.create({
          name: cleanEmail.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
          email: cleanEmail,
          password: password,
          role: 'student',
          department: 'Mechanical',
          collegeId: 'STU-' + Math.floor(1000 + Math.random() * 9000),
          trustScore: 85,
          trustTier: 'Silver'
        });
      }
    }

    if (!user) {
      if (req.session) {
        req.session.flash = { error: 'Invalid email or password.' };
        req.session.loginEmail = cleanEmail;
      }
      return res.redirect('/auth/login');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (req.session) {
        req.session.flash = { error: 'Invalid email or password.' };
        req.session.loginEmail = cleanEmail;
      }
      return res.redirect('/auth/login');
    }

    const userData = {
      id: user._id || user.id,
      _id: user._id || user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      collegeId: user.collegeId,
      trustScore: user.trustScore,
      trustTier: user.trustTier
    };

    const target = (req.body.redirectUrl && req.body.redirectUrl !== '/') ? req.body.redirectUrl : '/users/profile';

    if (req.session && typeof req.session.regenerate === 'function') {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = userData;
        req.session.isLoggedOut = false;
        req.session.flash = { success: `Welcome back, ${user.name}!` };
        res.redirect(target);
      });
    } else {
      if (req.session) {
        req.session.user = userData;
        req.session.isLoggedOut = false;
        req.session.flash = { success: `Welcome back, ${user.name}!` };
      }
      res.redirect(target);
    }
  } catch (err) {
    next(err);
  }
}

function registerForm(req, res) {
  const formData = (req.session && req.session.registerForm) || {};
  if (req.session) delete req.session.registerForm;
  res.render('auth/register', {
    pageTitle: 'Create Account — Campus Exchange',
    formData
  });
}

async function registerSubmit(req, res, next) {
  try {
    const { name, email, password, confirmPassword, department, collegeId, role } = req.body;
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanName = name ? name.trim() : '';

    const saveForm = () => {
      if (req.session) {
        req.session.registerForm = {
          name: cleanName,
          email: cleanEmail,
          department: department || 'Mechanical',
          collegeId: collegeId || '',
          role: role || 'student'
        };
      }
    };

    if (!cleanName || !cleanEmail || !password) {
      if (req.session) req.session.flash = { error: 'Name, email, and password are required.' };
      saveForm();
      return res.redirect('/auth/register');
    }

    if (password.length < 6) {
      if (req.session) req.session.flash = { error: 'Password must be at least 6 characters long.' };
      saveForm();
      return res.redirect('/auth/register');
    }

    if (confirmPassword && password !== confirmPassword) {
      if (req.session) req.session.flash = { error: 'Passwords do not match.' };
      saveForm();
      return res.redirect('/auth/register');
    }

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      if (req.session) req.session.flash = { error: 'An account with this email already exists. Please sign in instead.' };
      saveForm();
      return res.redirect('/auth/register');
    }

    // STRICT: Default role is always student (Phase 3: Never allow client-side role escalation)
    let fbUid;
    try {
      const fbUser = await auth.createUser({
        email: cleanEmail,
        password,
        displayName: name.trim(),
        customClaims: { role: 'student' }
      });
      fbUid = fbUser.uid;
    } catch (fbErr) {
      if (fbErr.message && fbErr.message.includes('ALREADY_EXISTS')) {
        if (req.session) req.session.flash = { error: 'An account with this email already exists in Firebase Authentication.' };
        return res.redirect('/auth/register');
      }
      fbUid = 'usr_' + crypto.randomBytes(12).toString('hex');
    }

    const user = await User.create({
      uid: fbUid,
      id: fbUid,
      _id: fbUid,
      name: name.trim(),
      email: cleanEmail,
      password,
      department: department || 'Mechanical',
      collegeId: collegeId || 'STU-2026',
      role: 'student',
      trustScore: 80,
      trustTier: 'Silver'
    });

    const userData = {
      id: user._id || user.id || fbUid,
      _id: user._id || user.id || fbUid,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      collegeId: user.collegeId,
      trustScore: user.trustScore,
      trustTier: user.trustTier
    };

    if (req.session && typeof req.session.regenerate === 'function') {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = userData;
        req.session.isLoggedOut = false;
        req.session.flash = { success: 'Registration successful! Welcome to the Campus Lending Exchange.' };
        res.redirect('/users/profile');
      });
    } else {
      if (req.session) {
        req.session.user = userData;
        req.session.isLoggedOut = false;
        req.session.flash = { success: 'Registration successful! Welcome to the Campus Lending Exchange.' };
      }
      res.redirect('/users/profile');
    }
  } catch (err) {
    next(err);
  }
}

async function sessionLogin(req, res, next) {
  try {
    const { idToken, redirectUrl } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ success: false, error: 'Firebase ID token is required.' });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Firebase ID token.' });
    }

    const { uid, email, name, picture, firebase, password } = decodedToken;
    const provider = (firebase && firebase.sign_in_provider) || 'google.com';

    let user;
    if (email && password) {
      const existing = await User.findByEmail(email);
      if (existing && existing.passwordHash) {
        const bcrypt = require('bcryptjs');
        const match = await bcrypt.compare(password, existing.passwordHash);
        if (match) {
          await User.linkProvider(existing._id || existing.id, provider);
          user = existing;
        }
      }
    }

    if (!user) {
      user = await User.findOrCreateFromSocial({
        uid,
        email: email || `${uid}@social.campus.edu`,
        name: name || (email ? email.split('@')[0] : 'Campus Member'),
        photoURL: picture || '',
        provider,
        password: password || ''
      });
    }

    const userData = {
      id: user._id || user.id || user.uid,
      _id: user._id || user.id || user.uid,
      name: user.name,
      email: user.email,
      role: user.role || 'student',
      department: user.department || 'Mechanical',
      collegeId: user.collegeId || 'STU-2026',
      trustScore: user.trustScore || 80,
      trustTier: user.trustTier || 'Silver',
      avatarUrl: user.avatarUrl || '/images/default-avatar.svg'
    };

    const targetUrl = oauthService.sanitizeRedirectUrl(redirectUrl);

    if (req.session && typeof req.session.regenerate === 'function') {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = userData;
        req.session.isLoggedOut = false;
        req.session.flash = { success: `Signed in successfully via ${formatProviderName(provider)}!` };
        return res.json({ success: true, redirectUrl: targetUrl });
      });
    } else {
      if (req.session) {
        req.session.user = userData;
        req.session.isLoggedOut = false;
        req.session.flash = { success: `Signed in successfully via ${formatProviderName(provider)}!` };
      }
      return res.json({ success: true, redirectUrl: targetUrl });
    }
  } catch (err) {
    console.error('[SOCIAL AUTH ERROR]', err.message);
    const isCollision = err.message && (err.message.includes('ALREADY_EXISTS') || err.message.includes('ACCOUNT_EXISTS'));
    return res.status(401).json({
      success: false,
      error: isCollision
        ? 'This campus email is already registered with a different sign-in method. Please sign in with your existing email and password first, then connect this social account from your Profile page.'
        : (err.message || 'Authentication failed. Please verify your credentials and try again.')
    });
  }
}

async function linkAccount(req, res, next) {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ success: false, error: 'Firebase ID token is required.' });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const provider = (decodedToken.firebase && decodedToken.firebase.sign_in_provider) || 'google.com';
    const userId = req.session.user.id || req.session.user._id;

    const updatedProviders = await User.linkProvider(userId, provider);
    if (req.session && req.session.user) {
      req.session.user.linkedProviders = updatedProviders;
    }
    return res.json({
      success: true,
      message: `Successfully linked ${formatProviderName(provider)} to your account!`,
      linkedProviders: updatedProviders
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function unlinkAccount(req, res, next) {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const { provider } = req.body;
    if (!provider) {
      return res.status(400).json({ success: false, error: 'Provider identifier is required.' });
    }

    const userId = req.session.user.id || req.session.user._id;
    const remainingProviders = await User.unlinkProvider(userId, provider);
    if (req.session && req.session.user) {
      req.session.user.linkedProviders = remainingProviders;
    }
    return res.json({
      success: true,
      message: `Successfully disconnected ${formatProviderName(provider)}.`,
      linkedProviders: remainingProviders
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

function logout(req, res) {
  if (req.session) {
    req.session.isLoggedOut = true;
    req.session.user = null;
    if (typeof req.session.destroy === 'function') {
      req.session.destroy(() => {
        res.clearCookie('campus_sid', { path: '/' });
  res.clearCookie(COOKIE_NAME, { path: '/' });
        res.redirect('/auth/login');
      });
      return;
    }
  }
  res.clearCookie('campus_sid', { path: '/' });
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.redirect('/auth/login');
}

async function switchRole(req, res) {
  if (process.env.NODE_ENV === 'production') {
    if (req.session) {
      req.session.flash = { error: 'Role switching is disabled in production.' };
    }
    return res.redirect('/users/profile');
  }

  const targetRole = req.params.role;
  let targetUser = await User.findOne({ role: targetRole });
  if (!targetUser) {
    targetUser = await User.create({
      name: targetRole === 'admin' ? 'Dr. Aris Thorne (Lab Admin)' : (targetRole === 'senior' ? 'Priya Sharma (Senior Lender)' : 'Rahul Das (Student)'),
      email: `${targetRole}@campus.edu`,
      password: 'password123',
      role: targetRole,
      department: targetRole === 'senior' ? 'Civil' : 'Mechanical',
      collegeId: `${targetRole.toUpperCase()}-2024`,
      trustScore: targetRole === 'admin' ? 99 : (targetRole === 'senior' ? 96 : 88),
      trustTier: 'Gold'
    });
  }

  req.session.user = {
    id: targetUser._id || targetUser.id,
    _id: targetUser._id || targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    role: targetUser.role,
    department: targetUser.department,
    collegeId: targetUser.collegeId,
    trustScore: targetUser.trustScore,
    trustTier: targetUser.trustTier
  };
  req.session.isLoggedOut = false;

  if (req.session) {
    req.session.flash = { success: `Switched identity to: ${targetUser.name} (${targetUser.role.toUpperCase()})` };
  }
  res.redirect(req.get('Referrer') || '/');
}


async function oauthInitiate(req, res) {
  try {
    const provider = req.params.provider ? req.params.provider.toLowerCase() : '';
    if (!['google', 'github', 'facebook', 'linkedin'].includes(provider)) {
      return res.redirect('/auth/login');
    }

    const redirectTarget = req.query.redirect || req.query.redirectUrl || '/users/profile';
    const state = oauthService.generateStateToken(req, redirectTarget);

    if (oauthService.isProviderConfigured(provider)) {
      const authUrl = oauthService.getAuthorizationUrl(req, provider, state, redirectTarget);
      return res.redirect(authUrl);
    }

    // Development & offline mode: redirect to login with provider indicator to open the interactive modal
    return res.redirect(`/auth/login?provider=${provider}&social=open`);
  } catch (err) {
    console.error('[OAUTH INITIATE ERROR]', err.message);
    if (req.session) req.session.flash = { error: 'Unable to initiate social login. Please try again.' };
    return res.redirect('/auth/login');
  }
}

async function oauthCallback(req, res, next) {
  try {
    const provider = req.params.provider ? req.params.provider.toLowerCase() : '';
    if (!['google', 'github', 'facebook', 'linkedin'].includes(provider)) {
      return res.redirect('/auth/login');
    }

    const { code, state, error, error_description } = req.query;

    if (error) {
      console.warn('[OAUTH CALLBACK PROVIDER ERROR]', error, error_description);
      if (req.session) req.session.flash = { error: `Authentication was cancelled or declined by ${oauthService.formatProviderName(provider)}.` };
      return res.redirect('/auth/login');
    }

    // CSRF State Token Validation (RFC 6749 Section 10.12)
    const isStateValid = oauthService.validateStateToken(req, state);
    if (!isStateValid && process.env.NODE_ENV === 'production') {
      return res.status(403).send('CSRF Forbidden: Invalid or expired OAuth state token.');
    }

    const targetUrl = oauthService.sanitizeRedirectUrl(req.session ? req.session.oauthRedirect : '/users/profile');
    if (req.session) delete req.session.oauthRedirect;

    const profile = await oauthService.exchangeCodeForProfile(req, provider, code);
    const user = await oauthService.processSocialUser(profile);

    const userData = {
      id: user._id || user.id || user.uid,
      _id: user._id || user.id || user.uid,
      name: user.name,
      email: user.email,
      role: user.role || 'student',
      department: user.department || 'Mechanical',
      collegeId: user.collegeId || 'STU-2026',
      trustScore: user.trustScore || 80,
      trustTier: user.trustTier || 'Silver',
      avatarUrl: user.avatarUrl || '/images/default-avatar.svg',
      linkedProviders: user.linkedProviders || [profile.provider]
    };

    if (req.session && typeof req.session.regenerate === 'function') {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = userData;
        req.session.isLoggedOut = false;
        req.session.flash = { success: `Signed in successfully via ${oauthService.formatProviderName(provider)}!` };
        res.redirect(targetUrl);
      });
    } else {
      if (req.session) {
        req.session.user = userData;
        req.session.isLoggedOut = false;
        req.session.flash = { success: `Signed in successfully via ${oauthService.formatProviderName(provider)}!` };
      }
      res.redirect(targetUrl);
    }
  } catch (err) {
    console.error('[OAUTH CALLBACK ERROR]', err.message);
    const isCollision = err.message && (err.message.includes('ALREADY_EXISTS') || err.message.includes('ACCOUNT_EXISTS'));
    if (req.session) {
      req.session.flash = {
        error: isCollision
          ? 'This campus email is already registered with a different sign-in method. Please sign in with your existing credentials, then connect this social account from your Profile.'
          : (err.message || 'Social login failed. Please try again.')
      };
    }
    return res.redirect('/auth/login');
  }
}

module.exports = {
  loginForm,
  loginSubmit,
  registerForm,
  registerSubmit,
  sessionLogin,
  linkAccount,
  unlinkAccount,
  oauthInitiate,
  oauthCallback,
  logout,
  switchRole
};

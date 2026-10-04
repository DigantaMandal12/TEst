const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.get('/login', authController.loginForm);
router.post('/login', authController.loginSubmit);
router.get('/register', authController.registerForm);
router.post('/register', authController.registerSubmit);
router.get('/signup', authController.registerForm);
router.post('/signup', authController.registerSubmit);
router.post('/session-login', authController.sessionLogin);

// Protected Social Login / OAuth 2.0 & OIDC routes
['google', 'github', 'facebook', 'linkedin'].forEach(provider => {
  router.get('/' + provider, (req, res, next) => {
    req.params = req.params || {};
    req.params.provider = provider;
    return authController.oauthInitiate(req, res, next);
  });
  router.get('/' + provider + '/callback', (req, res, next) => {
    req.params = req.params || {};
    req.params.provider = provider;
    return authController.oauthCallback(req, res, next);
  });
});
router.post('/link-account', requireAuth, authController.linkAccount);
router.post('/unlink-account', requireAuth, authController.unlinkAccount);
router.get('/logout', authController.logout);
router.get('/switch-role/:role', authController.switchRole);

module.exports = router;

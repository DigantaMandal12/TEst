const express = require('express');
const router = express.Router();
const indexController = require('../controllers/indexController');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const borrowController = require('../controllers/borrowController');
const { requireAuth } = require('../middleware/auth');

// Main navigation
router.get('/', indexController.home);
router.get('/search', indexController.search);
router.get('/profile', requireAuth, userController.profile);
router.get('/users/profile', requireAuth, userController.profile);

// Direct authentication aliases
router.get('/login', authController.loginForm);
router.post('/login', authController.loginSubmit);
router.get('/register', authController.registerForm);
router.post('/register', authController.registerSubmit);
router.get('/signup', authController.registerForm);
router.post('/signup', authController.registerSubmit);
router.post('/session-login', authController.sessionLogin);
router.get('/logout', authController.logout);

// Navigation & dashboard aliases
router.get('/dashboard', (req, res) => res.redirect('/borrow/my-loans'));
router.get('/my-loans', (req, res) => res.redirect('/borrow/my-loans'));
router.get('/lender', (req, res) => res.redirect('/borrow/lender'));

// Direct borrow request aliases (/request/:equipmentId and /request)
router.get('/request/:equipmentId', requireAuth, borrowController.requestForm);
router.post('/request', requireAuth, borrowController.submitRequest);

module.exports = router;

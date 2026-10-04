const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/', requireAuth, requireAdmin, adminController.index);

module.exports = router;

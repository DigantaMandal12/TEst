const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, notificationController.index);
router.post('/:id/read', requireAuth, notificationController.markRead);
router.post('/read-all', requireAuth, notificationController.markAllRead);

module.exports = router;

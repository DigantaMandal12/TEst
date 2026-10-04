const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { requireAuth } = require('../middleware/auth');

router.get('/new', requireAuth, reviewController.newForm);
router.post('/', requireAuth, reviewController.create);

module.exports = router;

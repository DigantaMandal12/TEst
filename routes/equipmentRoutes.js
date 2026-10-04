const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipmentController');
const { requireAuth } = require('../middleware/auth');

router.get('/', equipmentController.index);
router.get('/new', requireAuth, equipmentController.newForm);
router.post('/', requireAuth, equipmentController.create);
router.get('/:id', equipmentController.show);
router.get('/:id/edit', requireAuth, equipmentController.editForm);
router.post('/:id', requireAuth, equipmentController.update);
router.post('/:id/delete', requireAuth, equipmentController.remove);

module.exports = router;

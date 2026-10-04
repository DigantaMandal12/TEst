const express = require('express');
const router = express.Router();
const borrowController = require('../controllers/borrowController');
const { requireAuth, requireSenior } = require('../middleware/auth');

router.get('/request/:equipmentId', requireAuth, borrowController.requestForm);
router.post('/request', requireAuth, borrowController.submitRequest);
router.get('/my-loans', requireAuth, borrowController.borrowerDashboard);
router.get('/lender', requireAuth, requireSenior, borrowController.lenderDashboard);
router.post('/:id/approve', requireAuth, requireSenior, borrowController.approveRequest);
router.post('/:id/decline', requireAuth, requireSenior, borrowController.declineRequest);
router.post('/:id/pickup', requireAuth, borrowController.confirmPickup);
router.post('/:id/return', requireAuth, borrowController.returnEquipment);

module.exports = router;

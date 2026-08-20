const express = require('express');
const router = express.Router();
const purchaseOrderController = require('../controllers/purchaseOrderController');

router.get('/', purchaseOrderController.getAll);
router.get('/:id', purchaseOrderController.getById);
router.post('/', purchaseOrderController.create);
router.put('/:id/approve', purchaseOrderController.approve);
router.put('/:id/cancel', purchaseOrderController.cancel);

module.exports = router;

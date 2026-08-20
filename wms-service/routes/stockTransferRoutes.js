const express = require('express');
const router = express.Router();
const controller = require('../controllers/stockTransferController');

router.post('/', controller.createTransfer);
router.get('/', controller.getTransfers);
router.get('/:id', controller.getTransferById);
router.put('/:id/status', controller.updateTransferStatus);

module.exports = router;

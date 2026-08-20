const express = require('express');
const router = express.Router();
const goodsReceiptController = require('../controllers/goodsReceiptController');

router.get('/', goodsReceiptController.getAll);
router.get('/:id', goodsReceiptController.getById);
router.post('/', goodsReceiptController.create);
router.put('/:id/status', goodsReceiptController.updateStatus);

module.exports = router;

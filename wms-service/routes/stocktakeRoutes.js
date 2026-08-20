const express = require('express');
const router = express.Router();
const stocktakeController = require('../controllers/stocktakeController');

router.get('/', stocktakeController.getAll);
router.get('/:id', stocktakeController.getById);
router.post('/', stocktakeController.create);
router.put('/:id/items', stocktakeController.updateCountedItems);
router.post('/:id/complete-and-adjust', stocktakeController.completeAndAdjust);

module.exports = router;

const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');

router.get('/', stockController.getStocks);
router.get('/variant/:variantId', stockController.getStockByVariant);
router.put('/:stockId/config', stockController.updateStockConfig);
router.get('/transactions', stockController.getTransactions);

// Internal Endpoints for Main Order Service
router.post('/allocate', stockController.allocateStock);
router.post('/release', stockController.releaseStock);

module.exports = router;

const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/summary', reportController.getDashboardSummary);
router.get('/movement', reportController.getStockMovementReport);

module.exports = router;

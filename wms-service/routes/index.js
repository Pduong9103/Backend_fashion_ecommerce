const express = require('express');
const router = express.Router();

const warehouseRoutes = require('./warehouseRoutes');
const stockRoutes = require('./stockRoutes');
const purchaseOrderRoutes = require('./purchaseOrderRoutes');
const goodsReceiptRoutes = require('./goodsReceiptRoutes');
const goodsIssueRoutes = require('./goodsIssueRoutes');
const stocktakeRoutes = require('./stocktakeRoutes');
const stockTransferRoutes = require('./stockTransferRoutes');
const reportRoutes = require('./reportRoutes');

router.use('/warehouses', warehouseRoutes);
router.use('/stocks', stockRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/goods-receipts', goodsReceiptRoutes);
router.use('/goods-issues', goodsIssueRoutes);
router.use('/stocktakes', stocktakeRoutes);
router.use('/transfers', stockTransferRoutes);
router.use('/reports', reportRoutes);

module.exports = router;

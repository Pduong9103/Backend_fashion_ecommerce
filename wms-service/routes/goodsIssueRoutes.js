const express = require('express');
const router = express.Router();
const goodsIssueController = require('../controllers/goodsIssueController');

router.get('/', goodsIssueController.getAll);
router.get('/:id', goodsIssueController.getById);
router.post('/', goodsIssueController.create);
router.put('/:id/status', goodsIssueController.updateStatus);

module.exports = router;

const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');

router.get('/', warehouseController.getAll);
router.get('/:id', warehouseController.getById);
router.post('/', warehouseController.create);
router.put('/:id', warehouseController.update);

module.exports = router;

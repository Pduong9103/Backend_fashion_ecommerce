// routes/comboRoutes.js
const express = require('express');
const router = express.Router();
const comboController = require('../controllers/comboController');

router.get('/combos', comboController.getAll);
router.get('/combos/:id', comboController.getById);

module.exports = router;

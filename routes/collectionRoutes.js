// routes/collectionRoutes.js
const express = require('express');
const router = express.Router();
const collectionController = require('../controllers/collectionController');

// Public endpoints
router.get('/collections/featured', collectionController.getFeatured);
router.get('/collections/:id', collectionController.getById);
router.get('/lookbook/slides', collectionController.getLookbookSlides);

// Admin endpoints
router.get('/admin/collections', collectionController.getAllAdmin);
router.post('/admin/collections', collectionController.create);
router.put('/admin/collections/:id', collectionController.update);
router.delete('/admin/collections/:id', collectionController.delete);

router.get('/admin/lookbook/slides', collectionController.getLookbookSlides);
router.post('/admin/lookbook/slides', collectionController.createLookbookSlide);
router.put('/admin/lookbook/slides/:id', collectionController.updateLookbookSlide);
router.delete('/admin/lookbook/slides/:id', collectionController.deleteLookbookSlide);

module.exports = router;


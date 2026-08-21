// controllers/collectionController.js
const collectionService = require('../services/collectionService');

exports.getFeatured = async (req, res) => {
  try {
    const data = await collectionService.getFeaturedCollections();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[collectionController.getFeatured]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllAdmin = async (req, res) => {
  try {
    const data = await collectionService.getAllCollectionsAdmin();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[collectionController.getAllAdmin]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await collectionService.getCollectionById(id);
    if (!data) return res.status(404).json({ success: false, message: 'Bộ sưu tập không tồn tại' });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[collectionController.getById]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const data = await collectionService.createCollection(req.body);
    return res.status(201).json({ success: true, data, message: 'Tạo Bộ Sưu Tập thành công' });
  } catch (error) {
    console.error('[collectionController.create]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await collectionService.updateCollection(id, req.body);
    return res.status(200).json({ success: true, data, message: 'Cập nhật Bộ Sưu Tập thành công' });
  } catch (error) {
    console.error('[collectionController.update]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await collectionService.deleteCollection(id);
    return res.status(200).json({ success: true, message: 'Đã xóa Bộ Sưu Tập' });
  } catch (error) {
    console.error('[collectionController.delete]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* --- Lookbook Exhibition Slides Controller --- */
exports.getLookbookSlides = async (req, res) => {
  try {
    const data = await collectionService.getAllLookbookSlides();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[collectionController.getLookbookSlides]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createLookbookSlide = async (req, res) => {
  try {
    const data = await collectionService.createLookbookSlide(req.body);
    return res.status(201).json({ success: true, data, message: 'Tạo Slide Triển Lãm thành công' });
  } catch (error) {
    console.error('[collectionController.createLookbookSlide]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateLookbookSlide = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await collectionService.updateLookbookSlide(id, req.body);
    return res.status(200).json({ success: true, data, message: 'Cập nhật Slide Triển Lãm thành công' });
  } catch (error) {
    console.error('[collectionController.updateLookbookSlide]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteLookbookSlide = async (req, res) => {
  try {
    const { id } = req.params;
    await collectionService.deleteLookbookSlide(id);
    return res.status(200).json({ success: true, message: 'Đã xóa Slide Triển Lãm' });
  } catch (error) {
    console.error('[collectionController.deleteLookbookSlide]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


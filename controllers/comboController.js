// controllers/comboController.js
const comboService = require('../services/comboService');

exports.getAll = async (req, res) => {
  try {
    const data = await comboService.getAllCombos();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[comboController.getAll]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await comboService.getComboById(id);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Combo không tồn tại' });
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[comboController.getById]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

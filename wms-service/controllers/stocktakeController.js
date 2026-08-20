const stocktakeService = require('../services/stocktakeService');

exports.getAll = async (req, res, next) => {
  try {
    const result = await stocktakeService.getAll(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await stocktakeService.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = await stocktakeService.create(req.body, req.user?.id);
    res.status(201).json({ success: true, message: 'Khởi tạo đợt kiểm kê kho thành công', data });
  } catch (err) {
    next(err);
  }
};

exports.updateCountedItems = async (req, res, next) => {
  try {
    const data = await stocktakeService.updateCountedItems(req.params.id, req.body.items);
    res.json({ success: true, message: 'Cập nhật số lượng đếm thực tế thành công', data });
  } catch (err) {
    next(err);
  }
};

exports.completeAndAdjust = async (req, res, next) => {
  try {
    const data = await stocktakeService.completeAndAdjust(req.params.id, req.user?.id);
    res.json({ success: true, message: 'Phê duyệt và cân bằng tồn kho thành công', data });
  } catch (err) {
    next(err);
  }
};

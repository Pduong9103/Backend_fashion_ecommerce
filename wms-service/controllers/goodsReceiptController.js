const goodsReceiptService = require('../services/goodsReceiptService');

exports.getAll = async (req, res, next) => {
  try {
    const result = await goodsReceiptService.getAll(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await goodsReceiptService.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = await goodsReceiptService.create(req.body, req.user?.id);
    res.status(201).json({ success: true, message: 'Tạo phiếu nhập kho thành công', data });
  } catch (err) {
    next(err);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const data = await goodsReceiptService.updateStatus(req.params.id, status, req.user?.id);
    res.json({ success: true, message: 'Cập nhật trạng thái phiếu nhập kho thành công', data });
  } catch (err) {
    next(err);
  }
};

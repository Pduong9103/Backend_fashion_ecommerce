const purchaseOrderService = require('../services/purchaseOrderService');

exports.getAll = async (req, res, next) => {
  try {
    const result = await purchaseOrderService.getAll(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await purchaseOrderService.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = await purchaseOrderService.create(req.body, req.user?.id);
    res.status(201).json({ success: true, message: 'Tạo đơn mua hàng NCC thành công', data });
  } catch (err) {
    next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const data = await purchaseOrderService.approve(req.params.id, req.user?.id);
    res.json({ success: true, message: 'Phê duyệt đơn mua hàng thành công', data });
  } catch (err) {
    next(err);
  }
};

exports.cancel = async (req, res, next) => {
  try {
    const data = await purchaseOrderService.cancel(req.params.id, req.body?.reason || 'Hủy bởi Admin');
    res.json({ success: true, message: 'Hủy đơn mua hàng thành công', data });
  } catch (err) {
    next(err);
  }
};

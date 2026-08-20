const warehouseService = require('../services/warehouseService');

exports.getAll = async (req, res, next) => {
  try {
    const result = await warehouseService.getAllWarehouses(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await warehouseService.getWarehouseById(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = await warehouseService.createWarehouse(req.body);
    res.status(201).json({ success: true, message: 'Tạo kho hàng thành công', data });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const data = await warehouseService.updateWarehouse(req.params.id, req.body);
    res.json({ success: true, message: 'Cập nhật kho hàng thành công', data });
  } catch (err) {
    next(err);
  }
};

const stockService = require('../services/stockService');
const inventoryEngine = require('../services/inventoryEngine');

exports.getStocks = async (req, res, next) => {
  try {
    const result = await stockService.getStocks(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getStockByVariant = async (req, res, next) => {
  try {
    const data = await stockService.getStockByVariant(req.params.variantId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.updateStockConfig = async (req, res, next) => {
  try {
    const data = await stockService.updateStockConfig(req.params.stockId, req.body);
    res.json({ success: true, message: 'Cập nhật cấu hình tồn kho thành công', data });
  } catch (err) {
    next(err);
  }
};

exports.getTransactions = async (req, res, next) => {
  try {
    const result = await stockService.getTransactions(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint phục vụ Order Service gọi khóa tồn kho (Allocate)
 */
exports.allocateStock = async (req, res, next) => {
  try {
    const { warehouse_id, variant_id, sku, quantity, order_id, order_code, user_id } = req.body;
    const data = await inventoryEngine.allocateStock({
      warehouseId: warehouse_id,
      variantId: variant_id,
      sku,
      qty: parseInt(quantity),
      refType: 'orders',
      refId: order_id,
      refCode: order_code,
      userId: user_id,
    });
    res.json({ success: true, message: 'Khóa tồn kho thành công', data });
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint phục vụ Order Service gọi mở khóa tồn kho khi hủy đơn (Release)
 */
exports.releaseStock = async (req, res, next) => {
  try {
    const { warehouse_id, variant_id, sku, quantity, order_id, order_code, user_id, notes } = req.body;
    const data = await inventoryEngine.releaseStock({
      warehouseId: warehouse_id,
      variantId: variant_id,
      sku,
      qty: parseInt(quantity),
      refType: 'orders',
      refId: order_id,
      refCode: order_code,
      userId: user_id,
      notes,
    });
    res.json({ success: true, message: 'Mở khóa tồn kho thành công', data });
  } catch (err) {
    next(err);
  }
};

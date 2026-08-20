const stockTransferService = require('../services/stockTransferService');

exports.createTransfer = async (req, res, next) => {
  try {
    const data = await stockTransferService.createTransfer(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.getTransfers = async (req, res, next) => {
  try {
    const data = await stockTransferService.getTransfers(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

exports.getTransferById = async (req, res, next) => {
  try {
    const data = await stockTransferService.getTransferById(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.updateTransferStatus = async (req, res, next) => {
  try {
    const { status, userId } = req.body;
    const data = await stockTransferService.updateTransferStatus(req.params.id, status, userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

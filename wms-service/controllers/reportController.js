const reportService = require('../services/reportService');

exports.getDashboardSummary = async (req, res, next) => {
  try {
    const data = await reportService.getDashboardSummary();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.getStockMovementReport = async (req, res, next) => {
  try {
    const data = await reportService.getStockMovementReport(req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

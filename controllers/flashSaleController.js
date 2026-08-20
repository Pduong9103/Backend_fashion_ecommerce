// controllers/flashSaleController.js
const flashSaleService = require('../services/flashSaleService');

// [ADMIN] Lấy danh sách tất cả các chiến dịch
exports.getAllCampaigns = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await flashSaleService.getAllCampaigns({ status, page, limit });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// [ADMIN] Lấy chi tiết 1 chiến dịch
exports.getCampaignById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await flashSaleService.getCampaignById(id);
    return res.status(200).json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
};

// [ADMIN] Tạo chiến dịch mới
exports.createCampaign = async (req, res, next) => {
  try {
    const { name, description, start_time, end_time, banner_url, items } = req.body;
    if (!name || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'Tên chiến dịch, thời gian bắt đầu và kết thúc là bắt buộc.',
      });
    }

    const campaign = await flashSaleService.createCampaign({
      name,
      description,
      start_time,
      end_time,
      banner_url,
      items,
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo chiến dịch Flash Sale thành công!',
      campaign,
    });
  } catch (err) {
    next(err);
  }
};

// [ADMIN] Cập nhật chiến dịch
exports.updateCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, start_time, end_time, status, banner_url, items } = req.body;

    const campaign = await flashSaleService.updateCampaign(id, {
      name,
      description,
      start_time,
      end_time,
      status,
      banner_url,
      items,
    });

    return res.status(200).json({
      success: true,
      message: 'Cập nhật chiến dịch Flash Sale thành công!',
      campaign,
    });
  } catch (err) {
    next(err);
  }
};

// [ADMIN] Xóa chiến dịch
exports.deleteCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await flashSaleService.deleteCampaign(id);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// [ADMIN] Cập nhật trạng thái (Bật/Tắt khẩn cấp)
exports.updateCampaignStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Thiếu trường status cần cập nhật.' });
    }

    const result = await flashSaleService.updateCampaignStatus(id, status);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// [PUBLIC] Lấy chiến dịch đang hoạt động cho khách hàng
exports.getCurrentActiveFlashSale = async (req, res, next) => {
  try {
    const data = await flashSaleService.getCurrentActiveFlashSale();
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

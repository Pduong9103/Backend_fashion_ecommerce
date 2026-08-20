// controllers/notificationController.js
const notificationService = require('../services/notificationService');

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.user_id;
    const role = req.user?.role === 'admin' ? 'admin' : 'customer';
    const { limit = 20, unread_only } = req.query;

    const data = await notificationService.getUserNotifications({
      userId,
      role,
      limit: parseInt(limit) || 20,
      unreadOnly: unread_only === 'true',
    });

    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('[getNotifications]', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.user_id;

    await notificationService.markAsRead(id, userId);

    return res.json({
      success: true,
      message: 'Đã đánh dấu thông báo là đã đọc',
    });
  } catch (error) {
    console.error('[markAsRead]', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.user_id;
    const role = req.user?.role === 'admin' ? 'admin' : 'customer';

    await notificationService.markAllAsRead({ userId, role });

    return res.json({
      success: true,
      message: 'Đã đánh dấu tất cả thông báo là đã đọc',
    });
  } catch (error) {
    console.error('[markAllAsRead]', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.user_id;
    const settings = await notificationService.getUserNotificationSettings(userId);
    return res.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('[getSettings]', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.user_id;
    const settingsPayload = req.body;
    const updated = await notificationService.updateUserNotificationSettings(userId, settingsPayload);
    return res.json({
      success: true,
      settings: updated,
      message: 'Cập nhật cài đặt thông báo thành công',
    });
  } catch (error) {
    console.error('[updateSettings]', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
};

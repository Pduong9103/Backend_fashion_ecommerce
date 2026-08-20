// services/notificationService.js
const prisma = require('../config/prisma');
const pool = require('../config/db');

const DEFAULT_SETTINGS = {
  order_status: true,
  order_delivering: true,
  post_purchase_review: true,
  promotions: true,
  flash_sale: true,
  news_editorial: true,
};

/**
 * Lấy cài đặt nhận thông báo của người dùng
 */
async function getUserNotificationSettings(userId) {
  try {
    if (!userId) return DEFAULT_SETTINGS;
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { notification_settings: true },
    });

    if (!user || !user.notification_settings) {
      return DEFAULT_SETTINGS;
    }

    let settings = user.notification_settings;
    if (typeof settings === 'string') {
      try {
        settings = JSON.parse(settings);
      } catch {
        settings = {};
      }
    }

    return {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
  } catch (error) {
    console.error('[notificationService.getUserNotificationSettings] Error:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Cập nhật cài đặt nhận thông báo của người dùng
 */
async function updateUserNotificationSettings(userId, settingsPayload = {}) {
  try {
    const current = await getUserNotificationSettings(userId);
    const updated = {
      ...current,
      ...settingsPayload,
    };

    await prisma.users.update({
      where: { id: userId },
      data: {
        notification_settings: updated,
      },
    });

    return updated;
  } catch (error) {
    console.error('[notificationService.updateUserNotificationSettings] Error:', error);
    throw error;
  }
}

/**
 * Tạo một thông báo mới trong hệ thống (Kiểm tra cài đặt của người dùng trước khi tạo)
 */
async function createNotification({
  userId = null,
  role = 'customer',
  type = 'order',
  title,
  message,
  linkUrl = null,
  metadata = {},
}) {
  try {
    // Nếu gửi cho user cụ thể, kiểm tra preference của user
    if (userId) {
      const settings = await getUserNotificationSettings(userId);
      const subType = metadata?.sub_type || type;

      // 1. Kiểm tra tắt thông báo trạng thái đơn hàng
      if (subType === 'order_delivering' && settings.order_delivering === false) return null;
      if (subType === 'post_purchase_review' && settings.post_purchase_review === false) return null;
      if (type === 'order' && subType === 'order_status' && settings.order_status === false) return null;

      // 2. Kiểm tra tắt khuyến mãi / flash sale
      if (type === 'promotion' && settings.promotions === false) return null;
      if (type === 'flash_sale' && settings.flash_sale === false) return null;

      // 3. Kiểm tra tắt tin tức / tạp chí
      if (type === 'news' && settings.news_editorial === false) return null;
    }

    const notif = await prisma.notifications.create({
      data: {
        user_id: userId || null,
        role: role || 'customer',
        type: type || 'order',
        title: title || 'Thông báo mới',
        message: message || '',
        link_url: linkUrl || null,
        metadata: metadata || {},
        is_read: false,
      },
    });
    return notif;
  } catch (error) {
    console.error('[notificationService.createNotification] Error:', error);
    return null;
  }
}

/**
 * Lấy danh sách thông báo cho User hoặc Admin
 */
async function getUserNotifications({ userId, role = 'customer', limit = 20, unreadOnly = false }) {
  try {
    const where = {};

    if (role === 'admin') {
      where.OR = [
        { role: 'admin' },
        { role: 'all' },
        ...(userId ? [{ user_id: userId }] : []),
      ];
    } else {
      where.OR = [
        ...(userId ? [{ user_id: userId }] : []),
        { role: 'all' },
      ];
    }

    if (unreadOnly) {
      where.is_read = false;
    }

    const [items, unreadCount] = await Promise.all([
      prisma.notifications.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: parseInt(limit) || 20,
      }),
      prisma.notifications.count({
        where: {
          ...where,
          is_read: false,
        },
      }),
    ]);

    return {
      items,
      unreadCount,
      total: items.length,
    };
  } catch (error) {
    console.error('[notificationService.getUserNotifications] Error:', error);
    throw error;
  }
}

/**
 * Đánh dấu 1 thông báo là đã đọc
 */
async function markAsRead(notificationId, userId) {
  try {
    const updated = await prisma.notifications.update({
      where: { id: notificationId },
      data: { is_read: true },
    });
    return updated;
  } catch (error) {
    console.error('[notificationService.markAsRead] Error:', error);
    throw error;
  }
}

/**
 * Đánh dấu tất cả thông báo là đã đọc
 */
async function markAllAsRead({ userId, role = 'customer' }) {
  try {
    const where = {};
    if (role === 'admin') {
      where.OR = [
        { role: 'admin' },
        { role: 'all' },
        ...(userId ? [{ user_id: userId }] : []),
      ];
    } else {
      where.OR = [
        ...(userId ? [{ user_id: userId }] : []),
        { role: 'all' },
      ];
    }

    const res = await prisma.notifications.updateMany({
      where: {
        ...where,
        is_read: false,
      },
      data: { is_read: true },
    });
    return res;
  } catch (error) {
    console.error('[notificationService.markAllAsRead] Error:', error);
    throw error;
  }
}

/**
 * Tự động chuyển các đơn hàng Pending sang Confirmed sau 15 phút ân hạn (Grace period)
 */
async function autoConfirmPendingOrders() {
  try {
    const client = await pool.connect();
    try {
      const q = `
        UPDATE orders
        SET order_status = 'confirmed', updated_at = NOW()
        WHERE order_status = 'pending' 
          AND created_at <= NOW() - INTERVAL '15 minutes'
        RETURNING id, user_id, final_amount, order_status
      `;
      const { rows } = await client.query(q);

      for (const order of rows) {
        await createNotification({
          userId: order.user_id,
          role: 'customer',
          type: 'order',
          title: 'Đơn hàng đã được xác nhận!',
          message: `Đơn hàng #${order.id.slice(0, 8).toUpperCase()} đã được hệ thống tự động xác nhận và đang được đóng gói.`,
          linkUrl: `/customer/order/${order.id}`,
          metadata: { order_id: order.id, status: 'confirmed', sub_type: 'order_status' },
        });
      }

      if (rows.length > 0) {
        console.log(`[AutoConfirm] Tự động xác nhận thành công ${rows.length} đơn hàng.`);
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[notificationService.autoConfirmPendingOrders] Error:', error);
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  getUserNotificationSettings,
  updateUserNotificationSettings,
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  autoConfirmPendingOrders,
};

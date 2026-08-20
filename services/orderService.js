const pool = require('../config/db');
const notificationService = require('./notificationService');
const orderNotificationService = require('./orderNotificationService');

/**
 * Admin cập nhật trạng thái đơn hàng (kèm thông tin vận đơn)
 */
exports.updateOrderStatus = async ({
  userId,
  role,
  orderId,
  status,
  cancel_reason,
  tracking_code,
  carrier_name,
  estimated_delivery_at,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kiểm tra trạng thái hợp lệ
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid order status: ${status}`);
    }

    if (role !== 'admin') {
      throw new Error('Access denied: Only admin can update order status');
    }

    // Lấy thông tin đơn hàng hiện tại
    const orderCheck = await client.query(
      `SELECT id, order_code, user_id, order_status, tracking_code, carrier_name, estimated_delivery_at
       FROM orders
       WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (orderCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const currentOrder = orderCheck.rows[0];
    const currentStatus = currentOrder.order_status;

    let updatedOrder = null;

    // 1. Xử lý trạng thái HỦY ĐƠN (cancelled)
    if (status === 'cancelled') {
      if (currentStatus !== 'delivered') {
        // Hoàn lại tồn kho
        const items = await client.query(
          `SELECT variant_id, qty FROM order_items WHERE order_id = $1`,
          [orderId]
        );

        for (const item of items.rows) {
          await client.query(
            `UPDATE product_variants 
             SET stock_qty = stock_qty + $1, sold_qty = GREATEST(COALESCE(sold_qty, 0) - $1, 0),
                 updated_at = NOW()
             WHERE id = $2`,
            [item.qty, item.variant_id]
          );

          // Mở khóa slot Flash Sale
          await client.query(
            `UPDATE flash_sale_items fsi
             SET sold_count = GREATEST(fsi.sold_count - $1, 0),
                 updated_at = NOW()
             FROM product_variants pv
             WHERE pv.id = $2 AND fsi.product_id = pv.product_id`,
            [item.qty, item.variant_id]
          );
        }
      }

      const updateRes = await client.query(
        `UPDATE orders
         SET order_status = $1, updated_at = NOW(), cancel_reason = $3
         WHERE id = $2
         RETURNING *`,
        [status, orderId, cancel_reason || null]
      );
      updatedOrder = updateRes.rows[0];
    }
    // 2. Xử lý trạng thái GIAO THÀNH CÔNG (delivered)
    else if (status === 'delivered') {
      const updateRes = await client.query(
        `UPDATE orders
         SET order_status = $1, 
             payment_status = 'paid', 
             delivered_at = COALESCE(delivered_at, NOW()),
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, orderId]
      );
      updatedOrder = updateRes.rows[0];
    }
    // 3. Xử lý trạng thái ĐANG VẬN CHUYỂN (shipped) hoặc XÁC NHẬN (confirmed)
    else {
      const updateRes = await client.query(
        `UPDATE orders
         SET order_status = $1,
             tracking_code = COALESCE($3, tracking_code),
             carrier_name = COALESCE($4, carrier_name),
             estimated_delivery_at = COALESCE($5, estimated_delivery_at),
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [
          status,
          orderId,
          tracking_code || null,
          carrier_name || null,
          estimated_delivery_at ? new Date(estimated_delivery_at) : null,
        ]
      );
      updatedOrder = updateRes.rows[0];
    }

    await client.query('COMMIT');

    // Sau khi commit thành công: Bắn notification & email bên ngoài transaction
    if (updatedOrder && updatedOrder.user_id) {
      const codeDisplay = updatedOrder.order_code || orderId.slice(0, 8).toUpperCase();
      const carrierInfo = updatedOrder.carrier_name ? ` qua ${updatedOrder.carrier_name}` : '';
      const trackInfo = updatedOrder.tracking_code ? ` (Mã vận đơn: ${updatedOrder.tracking_code})` : '';

      const notifMsgMap = {
        confirmed: `Đơn hàng #${codeDisplay} đã được tiếp nhận và xưởng may đang đóng gói may đo chuẩn mực.`,
        shipped: `Đơn hàng #${codeDisplay} đang trên đường giao tới bạn${carrierInfo}${trackInfo}. Hãy chú ý điện thoại nhận kiện hàng nhé!`,
        delivered: `Đơn hàng #${codeDisplay} đã được giao thành công. Chúc bạn có trải nghiệm tuyệt vời cùng thiết kế may đo HS Atelier!`,
        cancelled: `Đơn hàng #${codeDisplay} đã bị hủy.${cancel_reason ? ` Lý do: ${cancel_reason}` : ''}`,
      };

      if (notifMsgMap[status]) {
        notificationService
          .createNotification({
            userId: updatedOrder.user_id,
            role: 'customer',
            type: 'order',
            title: `Cập nhật đơn hàng #${codeDisplay}`,
            message: notifMsgMap[status],
            linkUrl: `/customer/order/${orderId}`,
            metadata: {
              order_id: orderId,
              status,
              tracking_code: updatedOrder.tracking_code,
              carrier_name: updatedOrder.carrier_name,
            },
          })
          .catch((err) => console.error('[orderService] notify error:', err));
      }

      // Kích hoạt gửi email hoàn thành đơn hàng nếu trạng thái là delivered
      if (status === 'delivered') {
        orderNotificationService
          .sendDeliveryEmailIfNeeded(orderId)
          .catch((err) => console.error('[orderService] send delivery email error:', err));
      }
    }

    return updatedOrder;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Khách hàng chủ động bấm "Đã nhận được hàng"
 */
exports.confirmReceivedByUser = async ({ userId, orderId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oRes = await client.query(
      `SELECT id, order_code, user_id, order_status, payment_status, final_amount
       FROM orders
       WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (oRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new Error('Order not found');
    }

    const order = oRes.rows[0];
    if (order.user_id !== userId) {
      await client.query('ROLLBACK');
      throw new Error('Access denied: You do not own this order');
    }

    if (order.order_status === 'delivered') {
      await client.query('ROLLBACK');
      return order; // Đã nhận rồi
    }

    if (order.order_status === 'cancelled') {
      await client.query('ROLLBACK');
      throw new Error('Cannot confirm delivery for a cancelled order');
    }

    const updateRes = await client.query(
      `UPDATE orders
       SET order_status = 'delivered',
           payment_status = 'paid',
           delivered_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [orderId]
    );

    const updatedOrder = updateRes.rows[0];
    await client.query('COMMIT');

    const codeDisplay = updatedOrder.order_code || orderId.slice(0, 8).toUpperCase();

    // Gửi thông báo cảm ơn cho khách
    notificationService
      .createNotification({
        userId,
        role: 'customer',
        type: 'order',
        title: `Đã hoàn tất đơn hàng #${codeDisplay}`,
        message: 'Cảm ơn quý khách đã xác nhận nhận hàng. Mời quý khách viết đánh giá để nhận thêm điểm thưởng VIP!',
        linkUrl: `/customer/order/${orderId}`,
        metadata: { order_id: orderId, status: 'delivered' },
      })
      .catch(() => {});

    // Gửi thông báo cho Admin
    notificationService
      .createNotification({
        role: 'admin',
        type: 'order',
        title: `Khách đã nhận hàng #${codeDisplay}`,
        message: `Khách hàng vừa xác nhận đã nhận đơn hàng #${codeDisplay}.`,
        linkUrl: `/admin/order/${orderId}`,
        metadata: { order_id: orderId, user_id: userId, status: 'delivered' },
      })
      .catch(() => {});

    // Gửi email hoàn thành đơn hàng
    orderNotificationService
      .sendDeliveryEmailIfNeeded(orderId)
      .catch((err) => console.error('[orderService] send delivery email error:', err));

    return updatedOrder;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Khách hàng gửi yêu cầu đổi trả / may đo căn chỉnh trong 07 ngày
 */
exports.requestReturnByUser = async ({ userId, orderId, return_reason }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oRes = await client.query(
      `SELECT id, order_code, user_id, order_status, delivered_at, return_status
       FROM orders
       WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (oRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new Error('Order not found');
    }

    const order = oRes.rows[0];
    if (order.user_id !== userId) {
      await client.query('ROLLBACK');
      throw new Error('Access denied');
    }

    if (order.order_status !== 'delivered') {
      await client.query('ROLLBACK');
      throw new Error('Chỉ có thể yêu cầu đổi trả cho đơn hàng đã giao thành công');
    }

    const updateRes = await client.query(
      `UPDATE orders
       SET return_status = 'requested',
           return_reason = $2,
           return_requested_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [orderId, return_reason || 'Khách hàng yêu cầu đổi size / may đo căn chỉnh lại']
    );

    const updatedOrder = updateRes.rows[0];
    await client.query('COMMIT');

    const codeDisplay = updatedOrder.order_code || orderId.slice(0, 8).toUpperCase();

    // Thông báo Admin tiếp nhận yêu cầu đổi trả
    notificationService
      .createNotification({
        role: 'admin',
        type: 'order',
        title: `Yêu cầu đổi trả đơn #${codeDisplay}`,
        message: `Khách hàng vừa gửi yêu cầu đổi trả / may đo căn chỉnh cho đơn #${codeDisplay}. Lý do: ${return_reason}`,
        linkUrl: `/admin/order/${orderId}`,
        metadata: { order_id: orderId, user_id: userId, return_status: 'requested' },
      })
      .catch(() => {});

    // Thông báo xác nhận cho khách
    notificationService
      .createNotification({
        userId,
        role: 'customer',
        type: 'order',
        title: `Đã tiếp nhận yêu cầu đổi trả #${codeDisplay}`,
        message: 'Concierge Desk của HS Atelier đã ghi nhận yêu cầu của quý khách và sẽ liên hệ hỗ trợ trong vòng 24h.',
        linkUrl: `/customer/order/${orderId}`,
        metadata: { order_id: orderId, return_status: 'requested' },
      })
      .catch(() => {});

    return updatedOrder;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};
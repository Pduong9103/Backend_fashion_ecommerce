// services/agents/orderAgent.js
const { getUserOrdersDB } = require('./agentTools');

const STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận (Đang chuẩn bị hàng)',
  delivering: 'Đang vận chuyển',
  delivered: 'Đã giao thành công',
  completed: 'Đã hoàn tất',
  cancelled: 'Đã hủy',
  returned: 'Đã hoàn trả',
};

const PAYMENT_LABELS = {
  paid: 'Đã thanh toán',
  unpaid: 'Thanh toán khi nhận hàng (COD)',
  refunded: 'Đã hoàn tiền',
};

/**
 * Handles order inquiry with conversational multi-step selection & single order deep dive.
 */
async function handleOrderInquiry({ userId, query = '' }) {
  if (!userId) {
    return {
      type: 'order_tracking',
      reply: 'Bạn vui lòng đăng nhập tài khoản để mình có thể hỗ trợ tra cứu chính xác đơn hàng nhé!',
      orders: [],
      data: [],
    };
  }

  try {
    const orders = await getUserOrdersDB({ userId, limit: 5 });

    if (!orders || orders.length === 0) {
      return {
        type: 'order_tracking',
        reply:
          'Bạn hiện chưa có đơn hàng nào tại HS Atelier. Bạn có thể dạo quanh bộ sưu tập mới nhất để chọn thiết kế ưng ý nhé!',
        orders: [],
        data: [],
      };
    }

    const formatPrice = (p) =>
      new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p || 0);

    const m = (query || '').toLowerCase().trim();

    // 1. Kiểm tra xem người dùng có yêu cầu xem 1 đơn hàng cụ thể không (theo mã đơn hoặc "đơn gần nhất")
    let targetOrder = null;

    if (/\b(gần nhất|gan nhat|mới nhất|moi nhat|đơn 1|don 1)\b/i.test(m) && orders.length > 0) {
      targetOrder = orders[0];
    } else {
      // Tìm theo mã đơn hàng hex xuất hiện trong tin nhắn
      for (const ord of orders) {
        const fullId = String(ord.id || '').toLowerCase();
        const shortId = fullId.slice(0, 8);
        if (m.includes(shortId) || m.includes(fullId)) {
          targetOrder = ord;
          break;
        }
      }
    }

    // 2. Nếu người dùng chỉ có đúng 1 đơn hàng, tự động hiển thị chi tiết đơn đó
    if (!targetOrder && orders.length === 1) {
      targetOrder = orders[0];
    }

    // 3. Nếu tìm thấy đơn hàng mục tiêu -> Hiển thị chi tiết chuyên sâu của DUY NHẤT đơn hàng đó
    if (targetOrder) {
      const orderCode = String(targetOrder.id || '').slice(0, 8).toUpperCase();
      const dateStr = targetOrder.created_at ? new Date(targetOrder.created_at).toLocaleDateString('vi-VN') : 'Gần đây';
      const statusStr = STATUS_LABELS[targetOrder.order_status] || targetOrder.order_status || 'Đang xử lý';
      const paymentStr = PAYMENT_LABELS[targetOrder.payment_status] || targetOrder.payment_status || 'Chưa xác định';
      const totalStr = formatPrice(targetOrder.total_amount);

      let itemsFormatted = '';
      if (targetOrder.items && targetOrder.items.length > 0) {
        itemsFormatted = targetOrder.items
          .map((i, idx) => `   ${idx + 1}. ${i.name} (Số lượng: ${i.quantity || 1}${i.size ? `, Size: ${i.size}` : ''})`)
          .join('\n');
      } else {
        itemsFormatted = '   • Sản phẩm may đo';
      }

      let addressStr = '';
      if (targetOrder.shipping_address_snapshot) {
        const addr = typeof targetOrder.shipping_address_snapshot === 'object'
          ? targetOrder.shipping_address_snapshot.address
          : targetOrder.shipping_address_snapshot;
        if (addr) addressStr = `\n• Địa chỉ giao: ${addr}`;
      }

      const reply =
        `Thông tin chi tiết đơn hàng #${orderCode}:\n\n` +
        `• Ngày đặt: ${dateStr}\n` +
        `• Trạng thái: ${statusStr}\n` +
        `• Thanh toán: ${paymentStr}\n` +
        `• Tổng giá trị đơn: ${totalStr}${addressStr}\n\n` +
        `Sản phẩm trong đơn:\n${itemsFormatted}\n\n` +
        `Bạn có cần hỗ trợ gì thêm về đơn hàng này (như đổi size, chính sách giao hàng) không?`;

      return {
        type: 'order_tracking',
        reply,
        orders: [targetOrder],
        data: [],
        followUp: {
          question: 'Hỗ trợ đơn hàng',
          quickReplies: ['Chính sách đổi trả 7 ngày', 'Kiểm tra đơn khác', 'Tư vấn phối đồ'],
        },
      };
    }

    // 4. Nếu người dùng có NHIỀU đơn hàng và hỏi chung chung -> Liệt kê tóm tắt và cho người dùng BẤM CHỌN đơn cần hỏi
    const summaryList = orders
      .slice(0, 3)
      .map((o, idx) => {
        const orderCode = String(o.id || '').slice(0, 8).toUpperCase();
        const dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString('vi-VN') : 'Gần đây';
        const statusStr = STATUS_LABELS[o.order_status] || o.order_status || 'Đang xử lý';
        const totalStr = formatPrice(o.total_amount);
        return `${idx + 1}. Đơn #${orderCode} (Ngày ${dateStr} - ${totalStr}) — ${statusStr}`;
      })
      .join('\n');

    const quickReplyList = orders.slice(0, 3).map((o) => `Đơn #${String(o.id || '').slice(0, 8).toUpperCase()}`);
    quickReplyList.push('Đơn gần nhất');

    const reply =
      `Bạn đang có ${orders.length} đơn hàng gần đây:\n\n` +
      `${summaryList}\n\n` +
      `Bạn muốn kiểm tra chi tiết đơn hàng nào? (Bạn có thể bấm chọn nhanh bên dưới hoặc nhắn mã đơn nhé)`;

    return {
      type: 'order_tracking',
      reply,
      orders: orders,
      data: [],
      followUp: {
        question: 'Chọn đơn hàng cần tra cứu',
        quickReplies: quickReplyList,
      },
    };
  } catch (error) {
    console.error('[orderAgent.handleOrderInquiry] Lỗi tra cứu đơn hàng:', error);
    return {
      type: 'order_tracking',
      reply: 'Hệ thống đang gặp sự cố khi tra cứu đơn hàng. Bạn vui lòng vào mục Đơn Hàng trong trang cá nhân để xem chi tiết.',
      orders: [],
      data: [],
      error: error.message,
    };
  }
}

module.exports = {
  handleOrderInquiry,
};

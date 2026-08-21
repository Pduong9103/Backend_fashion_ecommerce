// services/agents/promotionAgent.js
const pool = require('../../config/db');

/**
 * Handles promotion, voucher and coupon inquiries.
 * Understands Promotion Scopes:
 * - 'ALL': Applicable to all products
 * - 'CATEGORY': Applicable only to specific categories
 * - 'PRODUCT': Applicable to specific products
 */
async function handlePromotionInquiry({ userId, query }) {
  const client = await pool.connect();
  try {
    // 1. Fetch active promotions & vouchers
    const promoRes = await client.query(`
      SELECT 
        p.id, 
        p.name, 
        p.code, 
        p.description, 
        p.type, 
        p.value, 
        p.min_order_value, 
        p.max_discount_value, 
        p.start_date, 
        p.end_date,
        (
          SELECT json_agg(pr.name)
          FROM promotion_products pp
          JOIN products pr ON pr.id = pp.product_id
          WHERE pp.promotion_id = p.id
        ) as product_names
      FROM promotions p
      WHERE (p.status = 'active' OR p.status IS NULL)
        AND (p.end_date IS NULL OR p.end_date >= NOW())
        AND (p.start_date IS NULL OR p.start_date <= NOW())
      ORDER BY p.value DESC
      LIMIT 6;
    `);

    const promotions = promoRes.rows;

    if (promotions.length === 0) {
      return {
        type: 'text',
        reply: 'Hiện tại hệ thống đang cập nhật các chương trình ưu đãi mới. Bạn hãy theo dõi thêm tại trang Khuyến mãi hoặc đăng ký nhận tin từ HS Atelier nhé!',
        followUp: {
          question: 'Bạn có muốn xem các bộ sưu tập đang thịnh hành không?',
          quickReplies: ['Xem sản phẩm mới', 'Tư vấn phối đồ', 'Bảng quy đổi size'],
        },
      };
    }

    // Format list of vouchers and scope for the customer
    const promoLines = promotions.map((p, idx) => {
      const discountText =
        p.type === 'percentage' || p.type === 'percent'
          ? `Giảm ${p.value}%${p.max_discount_value ? ` (tối đa ${Number(p.max_discount_value).toLocaleString('vi-VN')}đ)` : ''}`
          : `Giảm ${Number(p.value).toLocaleString('vi-VN')}đ`;

      const minOrderText = Number(p.min_order_value) > 0
        ? ` • Đơn tối thiểu: ${Number(p.min_order_value).toLocaleString('vi-VN')}đ`
        : ' • Không giới hạn đơn tối thiểu';

      let scopeText = 'Toàn bộ sản phẩm trên hệ thống';
      if (Array.isArray(p.product_names) && p.product_names.length > 0) {
        scopeText = `Sản phẩm áp dụng: ${p.product_names.slice(0, 3).join(', ')}${p.product_names.length > 3 ? '...' : ''}`;
      }

      return `🎫 **Mã: \`${p.code || p.name}\`**\n   • Ưu đãi: ${discountText}${minOrderText}\n   • Phạm vi áp dụng: ${scopeText}`;
    }).join('\n\n');

    const reply = `Luna gửi bạn danh sách các **Mã Ưu Đãi & Voucher Đang Hoạt Động** với phạm vi áp dụng chi tiết nè:\n\n${promoLines}\n\n💡 *Mẹo:* Bạn chỉ cần nhập mã tại bước thanh toán để được áp dụng giảm giá tự động!`;

    return {
      type: 'promotion_list',
      reply,
      promotions: promotions.map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        discount_type: p.type,
        discount_value: p.value,
        scope_type: p.product_names && p.product_names.length > 0 ? 'PRODUCT' : 'ALL',
      })),
      followUp: {
        question: 'Bạn muốn áp dụng mã cho đơn hàng nào?',
        quickReplies: ['Xem giỏ hàng', 'Tư vấn phối đồ theo ngân sách', 'Tìm kiếm sản phẩm mới'],
      },
    };
  } catch (err) {
    console.error('[promotionAgent] Error:', err);
    return {
      type: 'text',
      reply: 'Hiện tại có chương trình ưu đãi giảm 10% khi mua trọn bộ Set đồ tại Studio Phối Đồ. Bạn có thể ghé xem thử nhé!',
      followUp: {
        question: 'Bạn muốn tìm hiểu thêm gì nữa không?',
        quickReplies: ['Thử đồ ảo', 'Xem sản phẩm mới'],
      },
    };
  } finally {
    client.release();
  }
}

module.exports = {
  handlePromotionInquiry,
};

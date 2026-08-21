// services/agents/orchestratorAgent.js
const openai = require('../../utils/openai');
const stylistAgent = require('./stylistAgent');
const catalogAgent = require('./catalogAgent');
const orderAgent = require('./orderAgent');
const ragKnowledgeAgent = require('./ragKnowledgeAgent');
const adminAnalyticsAgent = require('./adminAnalyticsAgent');
const promotionAgent = require('./promotionAgent');
const inventoryAgent = require('./inventoryAgent');

/**
 * Classifies user message intent into one of:
 * - 'admin' (revenue, reports, sales metrics - ONLY for admin role)
 * - 'admin_forbidden' (revenue, reports - when non-admin asks)
 * - 'inventory' (WMS stock check, low stock alert, reorder suggestions - for admin/staff)
 * - 'promotion' (voucher, discount codes, scope of promo, coupons)
 * - 'stylist' (outfit, styling, coordination)
 * - 'catalog' (search, price, check stock)
 * - 'order' (order history, delivery status)
 * - 'policy' (return policy, warranty, size chart, fabric care)
 */
async function classifyIntent(message, userRole = 'customer') {
  const m = (message || '').toLowerCase().trim();
  const isAdmin = ['admin', 'superadmin', 'manager', 'staff'].includes(String(userRole || '').toLowerCase().trim());

  // =========================================================================
  // 🧠 TẦNG 1: LLM SEMANTIC SUPERVISOR (HIỂU NGỮ CẢNH & Ý ĐỊNH SÂU SẮC)
  // =========================================================================
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await openai.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Bạn là Master Supervisor / Router AI của hệ thống thời trang cao cấp HS Atelier.
Nhiệm vụ: Phân tích Ý ĐỊNH THỰC SỰ (Semantic Intent) của người dùng bất kể cách dùng từ, ẩn dụ, từ lóng hay phương ngữ.

PHÂN LOẠI CHÍNH XÁC VÀO ĐÚNG 1 TRONG CÁC NHÓM SAU:
1. "policy": Khách hỏi về chính sách đổi trả, bảo hành, hoàn tiền, hướng dẫn giặt là, bảo quản chất liệu vải (lụa, len, da, denim), bảng size, tư vấn chọn size theo chiều cao/cân nặng.
   (Ví dụ: "Hàng mua về mặc không vừa thì làm sao?", "Có được đổi mẫu khác không?", "Áo này giặt máy được không?", "Cao 1m75 nặng 70kg mặc size gì?")
2. "promotion": Khách hỏi về mã giảm giá, voucher, khuyến mãi, coupon, ưu đãi, freeship, phạm vi áp dụng mã.
   (Ví dụ: "Có mã nào giảm giá không?", "Mua đơn này có được bớt tiền không?", "Có voucher freeship không?")
3. "stylist": Khách cần tư vấn phong cách, gợi ý phối đồ (outfit), cách kết hợp áo quần phụ kiện theo dịp sự kiện, tone màu hoặc ngân sách.
   (Ví dụ: "Tư vấn cho mình set đồ đi tiệc sang trọng", "Cuối tuần đi hẹn hò nên mặc gì?", "Áo blazer này phối với quần gì thì đẹp?")
4. "catalog": Khách tìm kiếm sản phẩm cụ thể, hỏi giá sản phẩm, kiểm tra còn hàng/màu sắc/mẫu mới.
   (Ví dụ: "Shop có áo sơ mi trắng không?", "Cho mình xem các mẫu túi xách mới nhất", "Quần jean này giá bao nhiêu?")
5. "order": Khách tra cứu tình trạng đơn hàng, lịch sử mua hàng, thời gian giao hàng, hủy đơn.
   (Ví dụ: "Đơn của mình giao tới đâu rồi?", "Kiểm tra đơn hàng vừa đặt", "Hàng của mình gửi đi chưa?")
6. "admin": Hỏi về báo cáo doanh thu, doanh số, thống kê kinh doanh, lợi nhuận, top sản phẩm bán chạy.
   (Ví dụ: "Doanh thu tháng này thế nào?", "Bán được bao nhiêu đơn rồi?", "Sản phẩm nào bán chạy nhất?")
7. "inventory": Hỏi về quản lý kho WMS, kiểm tra tồn kho chi tiết, cảnh báo hàng sắp hết, gợi ý nhập hàng.
   (Ví dụ: "Trong kho còn bao nhiêu cái size L?", "Những mẫu nào đang dưới định mức an toàn cần nhập?")

Trả về định dạng JSON:
{"intent": "policy" | "promotion" | "stylist" | "catalog" | "order" | "admin" | "inventory", "reason": "giải thích ngắn gọn"}`
          },
          { role: 'user', content: message }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 60
      });

      const parsed = JSON.parse(response.choices[0].message.content);
      const classified = (parsed.intent || '').toLowerCase().trim();

      console.log(`[Supervisor AI] Semantic Reasoning: "${parsed.reason}" -> Intent: [${classified.toUpperCase()}]`);

      if (classified === 'admin') {
        return { intent: isAdmin ? 'admin' : 'admin_forbidden' };
      }
      if (classified === 'inventory') {
        return { intent: isAdmin ? 'inventory' : 'catalog' };
      }
      if (['policy', 'promotion', 'stylist', 'catalog', 'order'].includes(classified)) {
        return { intent: classified };
      }
    } catch (err) {
      console.warn('[Supervisor AI] LLM classification error, activating dynamic fallback:', err.message);
    }
  }

  // =========================================================================
  // 🛡️ TẦNG 2: DYNAMIC INTENT FALLBACK (KHI MẤT KẾT NỐI LLM HOẶC TIMEOUT)
  // =========================================================================
  if (/(doanh thu|danh thu|doanh số|danh so|doang thu|tong thu|tổng thu|báo cáo|bao cao|thống kê|thong ke|revenue|report|tổng tiền|tong tien|bán chạy|ban chay|lợi nhuận|loi nhuan|kinh doanh|bán được bao nhiêu|tiền thu được|bán được)/i.test(m)) {
    return { intent: isAdmin ? 'admin' : 'admin_forbidden' };
  }

  if (/(sắp hết|sap het|hết hàng|het hang|cảnh báo kho|canh bao kho|low stock|cần nhập|can nhap|nhập hàng|nhap hang|reorder|tồn kho|ton kho|sổ kho|so kho|wms|kiểm kho|kiem kho)/i.test(m)) {
    return { intent: isAdmin ? 'inventory' : 'catalog' };
  }

  if (/(đổi trả|doi tra|chính sách|chinh sach|bảo hành|bao hanh|hoàn tiền|hoan tien|trả hàng|tra hang|đổi hàng|doi hang|đổi size|doi size|giặt|giat|bảo quản|bao quan|hướng dẫn giặt|lụa|cashmere|bảng size|bang size|chọn size|chon size|tư vấn size|tu van size|số đo|so do|size s|size m|size l|size xl|size xxl|free size)/i.test(m)) {
    return { intent: 'policy' };
  }

  if (/(voucher|mã giảm|ma giam|khuyến mãi|khuyen mai|mã ưu đãi|ma uu dai|coupon|discount|áp mã|ap ma|mã code|giam gia|giảm giá|phạm vi|scope|freeship|ưu đãi|uu dai)/i.test(m)) {
    return { intent: 'promotion' };
  }

  if (/(đơn hàng|don hang|đơn gần nhất|don gan nhat|đơn mới nhất|don moi nhat|chi tiết đơn|chi tiet don|đơn vừa đặt|don vua dat|trạng thái đơn|trang thai don|mã đơn|ma don|tra cứu đơn|tra cuu don|kiểm tra đơn|kiem tra don|check đơn|xem đơn|lịch sử đơn|lich su don|giao hàng chưa|giao hang chua|tình trạng đơn|tinh trang don|vận chuyển đơn|van chuyen don|hủy đơn|huy don|đơn của|đơn số|đơn #|đơn 1|đơn 2|đơn 3)/i.test(m) || /(^|\s)(đơn|don)($|\s|#|[0-9]|[a-f])/i.test(m) || /#?[a-f0-9]{8}\b/i.test(m)) {
    return { intent: 'order' };
  }

  if (/(phối đồ|phoi do|tư vấn phối|tu van phoi|set đồ|set do|outfit|mặc gì|mac gi|đi tiệc|di tiec|đi chơi|di choi|hẹn hò|hen ho|công sở|cong so|hợp với|hop voi|gợi ý outfit|goi y outfit|gợi ý set)/i.test(m)) {
    return { intent: 'stylist' };
  }

  if (/(tìm|tim|có áo|co ao|có quần|co quan|có váy|co vay|có túi|co tui|giá bao nhiêu|gia bao nhieu|còn hàng|con hang|sản phẩm mới|san pham moi|mới nhất|moi nhat|xem áo|xem quần|xem túi)/i.test(m)) {
    return { intent: 'catalog' };
  }

  return { intent: 'stylist' };
}

/**
 * Master Dispatcher: Routes incoming chat to the specialized sub-agent
 */
async function processChatMessage({ userId, userRole = 'customer', message, sessionId }) {
  console.log(`[Orchestrator] Processing message from user ${userId} (role: ${userRole}): "${message}"`);

  // 1. Intent Classification
  const { intent } = await classifyIntent(message, userRole);
  console.log(`[Orchestrator] Dispatched to sub-agent: [${intent.toUpperCase()}_AGENT]`);

  let responsePayload = null;

  switch (intent) {
    case 'admin':
      if (['admin', 'superadmin', 'manager', 'staff'].includes(String(userRole || '').toLowerCase().trim())) {
        responsePayload = await adminAnalyticsAgent.handleAdminAnalytics({ query: message, userRole });
      } else {
        responsePayload = {
          type: 'text',
          reply:
            'Thông tin doanh thu và số liệu kinh doanh là dữ liệu nội bộ chỉ dành riêng cho tài khoản Quản trị viên. Bạn có thể hỏi mình về tư vấn trang phục, tìm kiếm sản phẩm hoặc kiểm tra đơn hàng cá nhân nhé!',
        };
      }
      break;

    case 'admin_forbidden':
      responsePayload = {
        type: 'text',
        reply:
          'Thông tin doanh thu và số liệu kinh doanh là dữ liệu nội bộ chỉ dành riêng cho tài khoản Quản trị viên. Bạn có thể hỏi mình về tư vấn trang phục, tìm kiếm sản phẩm hoặc kiểm tra đơn hàng cá nhân nhé!',
      };
      break;

    case 'inventory':
      responsePayload = await inventoryAgent.handleInventoryInquiry({ userRole, query: message });
      break;

    case 'promotion':
      responsePayload = await promotionAgent.handlePromotionInquiry({ userId, query: message });
      break;

    case 'order':
      responsePayload = await orderAgent.handleOrderInquiry({ userId, query: message });
      break;

    case 'policy':
      responsePayload = await ragKnowledgeAgent.handlePolicyAndKnowledge({ query: message });
      break;

    case 'catalog':
      responsePayload = await catalogAgent.handleCatalogSearch({ query: message });
      break;

    case 'stylist':
    default:
      responsePayload = await stylistAgent.handleStylistConsultation({ userId, message });
      break;
  }

  return {
    success: true,
    sessionId: sessionId || null,
    ...responsePayload,
  };
}

module.exports = {
  classifyIntent,
  processChatMessage,
};

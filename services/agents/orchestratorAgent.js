// services/agents/orchestratorAgent.js
const openai = require('../../utils/openai');
const stylistAgent = require('./stylistAgent');
const catalogAgent = require('./catalogAgent');
const orderAgent = require('./orderAgent');
const ragKnowledgeAgent = require('./ragKnowledgeAgent');
const adminAnalyticsAgent = require('./adminAnalyticsAgent');

/**
 * Classifies user message intent into one of:
 * - 'admin' (revenue, reports, sales metrics - ONLY for admin role)
 * - 'admin_forbidden' (revenue, reports - when non-admin asks)
 * - 'stylist' (outfit, styling, coordination)
 * - 'catalog' (search, price, check stock)
 * - 'order' (order history, delivery status)
 * - 'policy' (return policy, warranty, size chart, fabric care)
 */
async function classifyIntent(message, userRole = 'customer') {
  const m = (message || '').toLowerCase().trim();
  const isAdmin = ['admin', 'superadmin', 'manager', 'staff'].includes(String(userRole || '').toLowerCase().trim());

  // 1. Admin Analytics & Revenue Keyword Pattern (Supports accents, typos, unaccented variations)
  const isRevenueQuery =
    /\b(doanh thu|danh thu|doanh số|danh so|doang thu|tong thu|tổng thu|báo cáo|bao cao|thống kê|thong ke|revenue|report|tổng tiền|tong tien|bán chạy|ban chay|lợi nhuận|loi nhuan|kinh doanh|bán được bao nhiêu|tiền thu được|bán được)\b/i.test(
      m
    );

  if (isRevenueQuery) {
    if (isAdmin) {
      return { intent: 'admin' };
    } else {
      return { intent: 'admin_forbidden' };
    }
  }

  // 2. Order Tracking Regex Quick Match (Không phụ thuộc \b ASCII để nhận diện tiếng Việt có dấu chuẩn 100%)
  if (
    /(đơn hàng|don hang|đơn gần nhất|don gan nhat|đơn mới nhất|don moi nhat|chi tiết đơn|chi tiet don|đơn vừa đặt|don vua dat|trạng thái đơn|trang thai don|mã đơn|ma don|tra cứu đơn|tra cuu don|kiểm tra đơn|kiem tra don|check đơn|xem đơn|lịch sử đơn|lich su don|giao hàng chưa|giao hang chua|tình trạng đơn|tinh trang don|vận chuyển đơn|van chuyen don|hủy đơn|huy don|đơn của|đơn số|đơn #|đơn 1|đơn 2|đơn 3)/i.test(m) ||
    /(^|\s)(đơn|don)($|\s|#|[0-9]|[a-f])/i.test(m) ||
    /#?[a-f0-9]{8}\b/i.test(m)
  ) {
    return { intent: 'order' };
  }

  // 3. Policy & Fabric Care Regex Quick Match
  if (
    /\b(đổi trả|doi tra|bảo hành|bao hanh|hoàn tiền|giặt|bảo quản|lụa|cashmere|bảng size|chọn size|số đo|size s|size m|size l|size xl)\b/i.test(
      m
    )
  ) {
    return { intent: 'policy' };
  }

  // 4. Stylist Coordination Match
  if (
    /\b(phối đồ|phoi do|tư vấn|tu van|set đồ|outfit|mặc gì|mac gi|đi tiệc|đi chơi|hẹn hò|công sở|hợp với|gợi ý)\b/i.test(
      m
    )
  ) {
    return { intent: 'stylist' };
  }

  // 5. Catalog Search Match
  if (
    /\b(tìm|tim|có áo|co ao|có quần|co quan|có váy|co vay|có túi|co tui|giá bao nhiêu|còn hàng|con hang|sản phẩm mới|mới nhất)\b/i.test(
      m
    )
  ) {
    return { intent: 'catalog' };
  }

  // 6. LLM Intent Classifier for nuanced prompts
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await openai.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Bạn là Intent Router cho hệ thống thời trang. Phân loại tin nhắn của người dùng vào đúng 1 trong các nhóm sau:
- "admin": Hỏi về doanh thu, doanh số, báo cáo bán hàng, thống kê số liệu kinh doanh.
- "stylist": Tư vấn phối đồ, phong cách thời trang, gợi ý outfit.
- "catalog": Tìm kiếm sản phẩm, xem giá, kiểm tra hàng còn/hết.
- "order": Tra cứu đơn hàng, tình trạng giao hàng.
- "policy": Chính sách đổi trả 7 ngày, bảo hành, hướng dẫn giặt là, bảng size.
- "general": Chào hỏi hoặc trò chuyện chung.
Chỉ trả về chuỗi tên intent duy nhất.`
          },
          { role: 'user', content: message }
        ],
        temperature: 0,
        max_tokens: 10
      });
      const classified = response.choices[0].message.content.trim().toLowerCase();
      if (classified === 'admin') {
        return { intent: isAdmin ? 'admin' : 'admin_forbidden' };
      }
      if (['stylist', 'catalog', 'order', 'policy'].includes(classified)) {
        return { intent: classified };
      }
    } catch (err) {
      console.warn('[Orchestrator] LLM Intent classification fallback:', err.message);
    }
  }

  return { intent: 'stylist' }; // Default to stylist assistant
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

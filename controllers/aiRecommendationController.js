const aiService = require('../services/aiRecommendationService');
const orchestrator = require('../services/agents/orchestratorAgent');
const pool = require('../config/db');

// startSession: gọi khi user click vào chatbox
exports.startSession = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { session_id } = req.body || {};
    const loadMessages = req.body?.loadMessages === true || req.query?.loadMessages === 'true';
    const messagesLimit = Number(req.body?.messagesLimit || req.query?.messagesLimit) || 20;

    let effectiveSessionId = null;
    if (session_id) {
      try {
        if (typeof aiService.getChatSessionById === 'function') {
          const userSession = await aiService.getChatSessionById(userId);
          if (userSession && String(userSession.id) === String(session_id)) {
            effectiveSessionId = session_id;
          }
        }
      } catch (e) {
        console.warn('[startSession] session validation notice:', e.message);
      }
    }
    
    const sessionRes = await aiService.startChatSession(userId, effectiveSessionId || null, { loadMessages, messagesLimit });
    return res.json({
      success: true,
      isNew: sessionRes.isNew,
      messages: sessionRes.messages || [],
      hasMore: !!sessionRes.hasMore,
      nextCursor: sessionRes.nextCursor || null,
      sessionId: sessionRes.sessionId
    });
  } catch (error) {
    console.error('[aiRecommendationController.startSession]', error);
    return res.status(500).json({ success: false, message: 'Luna đang bận, thử lại sau nha!', error: error.message });
  }
};

// loadSessionMessages: phân trang tin nhắn cũ (cursor pagination)
exports.loadSessionMessages = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const sessionId = req.params?.sessionId || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return res.status(400).json({ success: false, message: 'Missing session_id' });

    let before = req.query?.before || req.body?.before || null;
    if (before) {
      const parsed = (typeof before === 'number') ? new Date(before) : new Date(String(before));
      if (!isNaN(parsed.getTime())) before = parsed.toISOString();
    }

    const limit = Math.min(100, Number(req.query?.limit || req.body?.limit || 20));
    const page = await aiService.loadSessionMessages(sessionId, { before, limit });

    return res.json({
      success: true,
      messages: page.messages || [],
      hasMore: !!page.hasMore,
      nextCursor: page.nextCursor || null
    });
  } catch (error) {
    console.error('[aiRecommendationController.loadSessionMessages]', error);
    return res.status(500).json({ success: false, message: 'Luna đang bận, thử lại sau nha!', error: error.message });
  }
};

// handleChat: Xử lý chat qua Mô hình Đa tầng Agent (Hierarchical Multi-Agent & RAG)
exports.handleChat = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Lấy role trực tiếp từ database để đảm bảo an toàn tuyệt đối 100%
    let userRole = req.user?.role || 'customer';
    try {
      const userQ = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
      if (userQ.rows.length > 0 && userQ.rows[0].role) {
        userRole = userQ.rows[0].role;
      }
    } catch (e) {
      console.warn('[handleChat] Lấy role từ DB thất bại:', e.message);
    }

    const { message, session_id } = req.body || {};
    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tin nhắn.' });
    }

    const cleanMsg = String(message).trim();

    // 1. Lưu tin nhắn của User vào DB
    if (session_id) {
      try {
        await aiService.saveChatMessage(userId, {
          sessionId: session_id,
          role: 'user',
          content: cleanMsg
        });
        await aiService.updateSessionTimestamp(session_id);
      } catch (e) {
        console.warn('[handleChat] Lưu tin nhắn user thất bại:', e.message);
      }
    }

    // 2. Dispatch qua Orchestrator Multi-Agent Engine
    const agentResponse = await orchestrator.processChatMessage({
      userId,
      userRole,
      message: cleanMsg,
      sessionId: session_id
    });

    // 3. Lưu phản hồi của Assistant vào DB
    if (session_id) {
      try {
        await aiService.saveChatMessage(userId, {
          sessionId: session_id,
          role: 'assistant',
          content: agentResponse.reply || '',
          metadata: {
            type: agentResponse.type,
            outfits: agentResponse.outfits || null,
            items: (agentResponse.outfits && agentResponse.outfits.length > 0) ? null : (agentResponse.data || null),
            followUp: agentResponse.followUp || null
          }
        });
      } catch (e) {
        console.warn('[handleChat] Lưu tin nhắn assistant thất bại:', e.message);
      }
    }

    // 4. Trả kết quả về cho Frontend Chatbox
    return res.json({
      success: true,
      message: agentResponse.reply,
      reply: agentResponse.reply,
      type: agentResponse.type,
      data: agentResponse.data || agentResponse.products || [],
      outfits: agentResponse.outfits || [],
      products: agentResponse.products || [],
      orders: agentResponse.orders || [],
      followUp: agentResponse.followUp || null,
      sessionId: session_id || agentResponse.sessionId
    });
  } catch (error) {
    console.error('[aiRecommendationController.handleChat] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra khi xử lý phản hồi từ AI Stylist.',
      error: error.message
    });
  }
};

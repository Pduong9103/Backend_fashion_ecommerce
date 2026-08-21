// services/agents/ragKnowledgeAgent.js
const openai = require('../../utils/openai');
const { searchKnowledgeBase } = require('./ragService');

async function handlePolicyAndKnowledge({ query }) {
  // 1. Semantic Search from Vector Knowledge Base
  const relevantChunks = await searchKnowledgeBase(query, 3);
  const contextText = relevantChunks.map(c => `[${c.title}]: ${c.content}`).join('\n\n');

  const systemPrompt = `Bạn là Luna - Trợ lý chăm sóc khách hàng và tư vấn chất liệu của thương hiệu thời trang cao cấp HS Atelier.
Hãy trả lời câu hỏi của khách hàng một cách thân thiện, chính xác 100% dựa DUY NHẤT trên thông tin chính sách/hướng dẫn sau:

THÔNG TIN CHÍNH SÁCH VÀ KIẾN THỨC NỘI BỘ:
${contextText}

YÊU CẦU ĐỊNH DẠNG JSON TRẢ VỀ:
{
  "reply": "Lời giải đáp chi tiết, lịch sự, đúng trọng tâm câu hỏi của khách",
  "quick_replies": ["Câu hỏi tiếp nối liên quan 1", "Câu hỏi tiếp nối liên quan 2", "Câu hỏi tiếp nối liên quan 3"]
}

QUY TẮC BẮT BUỘC CHO QUICK REPLIES:
1. Quick Replies PHẢI LIÊN QUAN TRỰC TIẾP ĐẾN VẤN ĐỀ KHÁCH ĐANG HỎI (viết từ góc nhìn người dùng).
2. NẾU khách hỏi về sai size / đổi trả / hoàn tiền: Gợi ý các bước đổi hàng, phí ship đổi trả, bảng size chuẩn (ví dụ: "Quy trình gửi đổi hàng", "Đổi sang mẫu khác được không", "Bảng quy đổi size chuẩn"). CẤM gợi ý lạc đề như giặt lụa hay vận chuyển hỏa tốc!
3. NẾU khách hỏi về giặt / bảo quản chất liệu: Gợi ý về ủi đồ, phơi đồ, bảo quản mùa nồm.
4. NẾU khách hỏi về vận chuyển: Gợi ý về thời gian giao hàng, kiểm tra hàng trước khi nhận, giao hỏa tốc.`;

  try {
    let replyText = '';
    let quickReplies = ["Quy trình đổi trả", "Chính sách bảo hành", "Bảng quy đổi size"];

    if (process.env.OPENAI_API_KEY) {
      const completion = await openai.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        response_format: { type: 'json_object' }
      });
      const parsed = JSON.parse(completion.choices[0].message.content);
      replyText = parsed.reply || '';
      if (Array.isArray(parsed.quick_replies) && parsed.quick_replies.length > 0) {
        quickReplies = parsed.quick_replies;
      }
    } else {
      replyText = relevantChunks[0]?.content || "HS Atelier hỗ trợ đổi size và đổi mẫu trong vòng 7 ngày kể từ khi nhận hàng cho sản phẩm còn nguyên tem mác.";
      if (/size|đổi|doi|trả|tra/i.test(query)) {
        quickReplies = ["Quy trình gửi đổi hàng", "Phí đổi hàng do lỗi shop", "Bảng quy đổi size chuẩn"];
      } else if (/giặt|giat|lụa|len|da/i.test(query)) {
        quickReplies = ["Nhiệt độ ủi đồ", "Cách phơi giữ phom dáng", "Bảo hành chất liệu"];
      } else {
        quickReplies = ["Thời gian giao hàng", "Kiểm tra hàng khi nhận", "Chính sách đổi trả 7 ngày"];
      }
    }

    return {
      type: 'policy',
      reply: replyText,
      data: [],
      knowledge_chunks: relevantChunks,
      followUp: {
        question: "Luna có thể giúp bạn giải đáp thêm điều gì không?",
        quickReplies: quickReplies
      }
    };
  } catch (err) {
    console.error('[ragKnowledgeAgent] error:', err);
    return {
      type: 'policy',
      reply: relevantChunks[0]?.content || "Atelier cam kết chất lượng chuẩn may đo cao cấp và hỗ trợ đổi trả trong 7 ngày.",
      data: [],
      knowledge_chunks: relevantChunks,
      followUp: {
        question: "Bạn cần hỗ trợ thêm thông tin nào?",
        quickReplies: ["Quy trình gửi đổi hàng", "Liên hệ hotline hỗ trợ", "Xem bảng size chuẩn"]
      }
    };
  }
}

module.exports = {
  handlePolicyAndKnowledge
};

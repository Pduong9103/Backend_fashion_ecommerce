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

Nếu không có thông tin trong văn bản trên, hãy trả lời nhã nhặn và hướng dẫn khách hàng liên hệ hotline chăm sóc khách hàng.`;

  try {
    let replyText = '';
    if (process.env.OPENAI_API_KEY) {
      const completion = await openai.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ]
      });
      replyText = completion.choices[0].message.content;
    } else {
      replyText = relevantChunks[0]?.content || "HS Atelier hỗ trợ đổi size và đổi mẫu trong vòng 7 ngày kể từ khi nhận hàng cho sản phẩm còn nguyên tem mác.";
    }

    return {
      type: 'policy_knowledge',
      reply: replyText,
      data: relevantChunks,
      followUp: {
        question: "Luna có thể giúp bạn giải đáp thêm điều gì không?",
        quickReplies: ["Hướng dẫn giặt lụa", "Chính sách vận chuyển", "Bảng quy đổi size"]
      }
    };
  } catch (err) {
    console.error('[ragKnowledgeAgent] error:', err);
    return {
      type: 'policy_knowledge',
      reply: relevantChunks[0]?.content || "Atelier cam kết chất lượng chuẩn may đo cao cấp và hỗ trợ đổi trả trong 7 ngày.",
      data: relevantChunks
    };
  }
}

module.exports = {
  handlePolicyAndKnowledge
};

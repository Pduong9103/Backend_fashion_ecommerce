// services/agents/stylistAgent.js
const openai = require('../../utils/openai');
const { searchProductsDB } = require('./agentTools');
const { validateAndEnrichProducts } = require('./productValidator');

/**
 * Tool Definition for OpenAI Function Calling
 */
const stylistTools = [
  {
    type: 'function',
    function: {
      name: 'search_fashion_items',
      description: 'Tìm kiếm các sản phẩm thời trang thực tế trong kho theo từng tầng trang phục, giới tính (Nam/Nữ/Unisex), từ khóa phong cách, màu sắc, danh mục và khoảng giá.',
      parameters: {
        type: 'object',
        properties: {
          layer_type: {
            type: 'string',
            enum: ['inner_top', 'bottom', 'outerwear', 'accessory', 'dress_or_set'],
            description: 'Tầng trang phục: inner_top (áo trong: sơ mi, thun, polo, sweater, hoodie), bottom (quần: âu, jean, kaki, short), outerwear (áo khoác: bomber, varsity, blazer), accessory (phụ kiện: ví da nam, túi xách nữ, kính mát, thắt lưng), dress_or_set (đầm, váy...)'
          },
          gender: {
            type: 'string',
            enum: ['men', 'women', 'unisex'],
            description: 'Giới tính khách hàng hoặc phong cách trang phục: "men" (Nam), "women" (Nữ), "unisex" (Đồ dùng chung). BẮT BUỘC chọn đúng để phụ kiện và quần áo đồng bộ.'
          },
          query: {
            type: 'string',
            description: 'Từ khóa tìm kiếm phù hợp với phong cách, dịp sử dụng hoặc loại đồ người dùng yêu cầu (vd: "áo sơ mi trắng", "quần short nam", "quần âu đen", "áo thun nam", "ví da nam", "túi da nữ", "kính mát")'
          },
          category_name: {
            type: 'string',
            description: 'Tên danh mục nếu có (vd: "Áo", "Quần", "Phụ kiện", "Túi xách")'
          },
          color: {
            type: 'string',
            description: 'Màu sắc mong muốn nếu người dùng có đề cập (vd: "trắng", "đen", "be", "xanh", "nâu")'
          },
          min_price: {
            type: 'number',
            description: 'Mức giá tối thiểu (VNĐ)'
          },
          max_price: {
            type: 'number',
            description: 'Mức giá tối đa (VNĐ)'
          }
        },
        required: ['layer_type', 'query']
      }
    }
  }
];

/**
 * Fallback static retrieval when OpenAI API is not available or encounters error.
 */
async function fallbackStaticRetrieval(preferredGender = 'men') {
  const innerTops = await searchProductsDB({ query: 'áo sơ mi', limit: 4 });
  const tshirts = await searchProductsDB({ query: 'áo thun', limit: 4 });
  const sweaters = await searchProductsDB({ query: 'hoodie', limit: 3 });
  const allInnerTops = [...innerTops, ...tshirts, ...sweaters];

  const bottomsJean = await searchProductsDB({ query: 'jean', limit: 4 });
  const bottomsAu = await searchProductsDB({ query: 'quần âu', limit: 4 });
  const bottomsKaki = await searchProductsDB({ query: 'kaki', limit: 3 });
  const bottomsShort = await searchProductsDB({ query: 'short', limit: 3 });
  const allBottoms = [...bottomsAu, ...bottomsJean, ...bottomsKaki, ...bottomsShort];

  const outerwear = await searchProductsDB({ query: 'bomber', limit: 3 });
  
  // Phụ kiện phân theo giới tính
  const menAccessories = await searchProductsDB({ query: 'ví', limit: 4 });
  const womenAccessories = await searchProductsDB({ query: 'túi xách', limit: 4 });
  const allAcc = preferredGender === 'women' ? [...womenAccessories, ...menAccessories] : [...menAccessories, ...womenAccessories];

  return {
    allInnerTops,
    allBottoms,
    outerwear,
    allAcc
  };
}

/**
 * AI Stylist Agent with Function Calling / Tool Use (Agentic AI), Gender Awareness & Layering Rules.
 */
async function handleStylistConsultation({ userId, message, context = {} }) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log('[stylistAgent] No OpenAI API Key found, using fallback retrieval.');
      return await executeFallbackWorkflow(message);
    }

    // --- STEP 1: INITIAL REASONING & GENDER-AWARE TOOL CALLING ---
    const initialMessages = [
      {
        role: 'system',
        content: `Bạn là Luna - Chuyên gia Stylist & Giám đốc Sáng tạo Thời trang của thương hiệu Haute Couture HS Atelier.
Khi người dùng yêu cầu tư vấn phối đồ / phong cách thời trang:
1. PHÂN TÍCH GIỚI TÍNH & NGỮ CẢNH:
   - Đoán hoặc xác định xem khách hàng là NAM hay NỮ từ câu hỏi, từ khóa (ví dụ: "quần short", "áo polo", "suit nam" -> Nam; "đầm", "váy", "croptop" -> Nữ).
   - NGUYÊN TẮC BẤT DI BẤT DỊCH VỀ PHỤ KIỆN (GENDER CONSISTENCY):
     * Nếu là khách NAM (hoặc đồ Nam): Phụ kiện BẮT BUỘC phải là đồ Nam/Unisex (Ví da nam, thắt lưng, kính mát, balo/túi đeo chéo nam). TUYỆT ĐỐI CẤM gợi ý túi xách nữ hay ví nữ cho set đồ Nam!
     * Nếu là khách NỮ (hoặc đồ Nữ): Phụ kiện là Túi xách nữ, ví nữ.
2. BẮT BUỘC gọi công cụ \`search_fashion_items\` để tìm kiếm các món đồ thực tế trong kho:
   - Gọi ít nhất 1-2 lần cho \`inner_top\` (Áo sơ mi, áo thun, polo, sweater...) kèm gender tương ứng.
   - Gọi ít nhất 1-2 lần cho \`bottom\` (Quần âu, quần jean, kaki, short...) kèm gender tương ứng.
   - Gọi ít nhất 1 lần cho \`accessory\` (Ví da nam/kính mát cho Nam, Túi xách nữ cho Nữ) với từ khóa chính xác.
   - Gọi cho \`outerwear\` (Áo khoác bomber, blazer...) nếu cần phong cách layer.
   - Hoặc \`dress_or_set\` nếu khách hàng hỏi váy/đầm.
Hãy linh hoạt điền từ khóa (query), màu sắc (color), mức giá dựa trên đúng yêu cầu của người dùng.`
      },
      { role: 'user', content: message }
    ];

    console.log(`[stylistAgent] Step 1: Requesting Tool Calls for user message: "${message}"`);

    const firstResponse = await openai.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: initialMessages,
      tools: stylistTools,
      tool_choice: 'auto',
      temperature: 0.2
    });

    const choice = firstResponse.choices[0];
    const toolCalls = choice.message?.tool_calls;

    // If the model did not call tools, fallback to searching default items
    let retrievedProductsMap = new Map();
    const toolMessages = [];

    if (toolCalls && toolCalls.length > 0) {
      console.log(`[stylistAgent] Model called ${toolCalls.length} tool(s):`, toolCalls.map(tc => tc.function.name));

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall) => {
          try {
            const args = JSON.parse(toolCall.function.arguments || '{}');
            const foundItems = await searchProductsDB({
              query: args.query || '',
              category_name: args.category_name,
              color: args.color,
              min_price: args.min_price,
              max_price: args.max_price,
              limit: 4
            });

            foundItems.forEach(item => retrievedProductsMap.set(item.id, item));

            return {
              tool_call_id: toolCall.id,
              role: 'tool',
              name: toolCall.function.name,
              content: JSON.stringify({
                layer_type: args.layer_type,
                gender: args.gender,
                query: args.query,
                found_count: foundItems.length,
                products: foundItems.map(p => ({
                  id: p.id,
                  name: p.name,
                  price: p.price,
                  color: p.color,
                  category_name: p.category_name
                }))
              })
            };
          } catch (e) {
            console.warn('[stylistAgent] Tool call execution error:', e.message);
            return {
              tool_call_id: toolCall.id,
              role: 'tool',
              name: toolCall.function.name,
              content: JSON.stringify({ error: e.message, products: [] })
            };
          }
        })
      );

      toolMessages.push(choice.message);
      toolMessages.push(...toolResults);
    }

    // If tool calling returned too few items, augment with base inventory
    if (retrievedProductsMap.size < 4) {
      console.log('[stylistAgent] Tool calling returned few items, augmenting with base catalog.');
      const isFemaleQuery = /\b(nữ|váy|đầm|chân váy|croptop)\b/i.test(message);
      const baseData = await fallbackStaticRetrieval(isFemaleQuery ? 'women' : 'men');
      [...baseData.allInnerTops, ...baseData.allBottoms, ...baseData.outerwear, ...baseData.allAcc].forEach(it => {
        if (it && it.id) retrievedProductsMap.set(it.id, it);
      });
    }

    const availableProductsList = Array.from(retrievedProductsMap.values())
      .map(p => `[ID: ${p.id}] Tên: ${p.name} | Giá: ${p.price}đ | Màu: ${p.color || 'Tự nhiên'} | Danh mục: ${p.category_name || 'Thời trang'}`)
      .join('\n');

    // --- STEP 2: OUTFIT SYNTHESIS & GENDER-CONSISTENT COMPOSITION ---
    const synthesisPrompt = `Bạn là Luna - Chuyên gia Stylist & Giám đốc Sáng tạo Thời trang của thương hiệu Haute Couture HS Atelier.
Dưới đây là danh sách SẢN PHẨM THỰC TẾ CÓ TRONG KHO sau khi tra cứu:
${availableProductsList}

NHIỆM VỤ:
Tạo ra 2 đến 3 SET PHỐI ĐỒ (OUTFITS) ĐA DẠNG, HOÀN HẢO theo yêu cầu người dùng: "${message}".

QUY TẮC PHỐI ĐỒ BẮT BUỘC:
1. MỖI SET ĐỒ PHẢI ĐỦ CÁC TẦNG VÀ ĐỒNG BỘ GIỚI TÍNH:
   - 01 Áo trong (Inner Top: Áo sơ mi / Áo thun / Polo / Sweater)
   - 01 Quần (Bottom: Quần âu / Quần jean / Kaki / Short)
   - 01 Phụ kiện (Accessory: Ví da nam/kính mát cho đồ Nam; Túi xách nữ cho đồ Nữ. TUYỆT ĐỐI KHÔNG ghép túi xách nữ vào set đồ nam).
   - (Tùy chọn) 01 Áo khoác ngoài (Outerwear) khoác bên ngoài áo trong nếu phù hợp.
2. TUYỆT ĐỐI CHỈ DÙNG ID CÓ THẬT trong danh sách sản phẩm ở trên!
3. QUICK REPLIES: Phải là câu trả lời/yêu cầu tiếp theo từ GÓC NHÌN NGƯỜI DÙNG (vd: "Phối bộ khác", "Tư vấn phụ kiện ví da", "Bảng quy đổi size").

CẤU TRÚC JSON TRẢ VỀ:
{
  "reply": "Lời tư vấn phong cách tinh tế, lịch thiệp của Luna",
  "outfits": [
    {
      "name": "Tên Set 1 (VD: Set 1 - Parisian Chic Minimalist)",
      "description": "Giải thích chi tiết vì sao sự kết hợp này đẹp, tôn dáng và phù hợp",
      "items": ["product_id_1", "product_id_2", "product_id_3"]
    },
    {
      "name": "Tên Set 2 (VD: Set 2 - Modern Luxury Streetwear)",
      "description": "Giải thích phong cách phối layer",
      "items": ["product_id_1", "product_id_2", "product_id_3", "product_id_4"]
    }
  ],
  "quick_replies": ["Phối bộ khác", "Tư vấn phụ kiện", "Bảng quy đổi kích cỡ"]
}`;

    const secondMessages = [
      ...initialMessages,
      ...(toolMessages.length > 0 ? toolMessages : []),
      { role: 'system', content: synthesisPrompt }
    ];

    const synthesisResponse = await openai.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: secondMessages,
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const result = JSON.parse(synthesisResponse.choices[0].message.content);

    // --- STEP 3: GROUNDING & PRODUCT VALIDATION ---
    const validatedOutfits = [];
    const allValidatedItemsFlat = [];

    for (const outfit of (result.outfits || [])) {
      const rawItemIds = Array.isArray(outfit.items) ? outfit.items : [];
      const validatedItems = await validateAndEnrichProducts(
        rawItemIds.map(id => ({ product_id: id }))
      );

      if (validatedItems.length >= 2) {
        validatedOutfits.push({
          name: outfit.name || 'Haute Couture Look',
          description: outfit.description || 'Thiết kế phom dáng may đo chuẩn mực.',
          items: validatedItems,
          total_price: validatedItems.reduce((sum, it) => sum + (Number(it.price) || 0), 0)
        });
        allValidatedItemsFlat.push(...validatedItems);
      }
    }

    // If AI failed to compose at least 1 valid outfit, fallback
    if (validatedOutfits.length === 0) {
      console.warn('[stylistAgent] AI outfits failed validation, applying fallback.');
      return await executeFallbackWorkflow(message);
    }

    return {
      type: 'outfit_recommendation',
      reply: result.reply || 'Luna đã chọn lọc các set phối đồ may đo chuẩn phong cách cho bạn:',
      outfits: validatedOutfits,
      data: allValidatedItemsFlat,
      followUp: {
        question: "Bạn thấy những set đồ này thế nào?",
        quickReplies: result.quick_replies || ["Phối bộ khác", "Xem thêm phụ kiện", "Bảng quy đổi size"]
      }
    };

  } catch (err) {
    console.error('[stylistAgent] Function Calling workflow error:', err);
    return await executeFallbackWorkflow(message);
  }
}

/**
 * Fallback workflow generator
 */
async function executeFallbackWorkflow(message) {
  const baseData = await fallbackStaticRetrieval();
  const fallbackItems1 = await validateAndEnrichProducts([
    { product_id: baseData.allInnerTops[0]?.id },
    { product_id: baseData.allBottoms[0]?.id },
    { product_id: baseData.allAcc[0]?.id }
  ]);

  const fallbackItems2 = await validateAndEnrichProducts([
    { product_id: baseData.allInnerTops[1]?.id },
    { product_id: baseData.allBottoms[1]?.id },
    { product_id: baseData.allAcc[1]?.id }
  ]);

  const outfits = [
    {
      name: "Set 1: Phong Cách Tối Giản Quý Tộc (Minimalist Classic)",
      description: "Sự kết hợp giữa Áo sơ mi may đo thanh lịch cùng Quần âu xếp ly và Túi xách da sang trọng.",
      items: fallbackItems1,
      total_price: fallbackItems1.reduce((sum, it) => sum + (Number(it.price) || 0), 0)
    }
  ];

  if (fallbackItems2.length >= 2) {
    outfits.push({
      name: "Set 2: Phong Cách Phóng Khoáng Hiện Đại (Relaxed Luxury)",
      description: "Áo thun mềm mịn phối cùng Quần Jean và Phụ kiện cao cấp tạo nét trẻ trung mà đẳng cấp.",
      items: fallbackItems2,
      total_price: fallbackItems2.reduce((sum, it) => sum + (Number(it.price) || 0), 0)
    });
  }

  const allItems = [...fallbackItems1, ...fallbackItems2];

  return {
    type: 'outfit_recommendation',
    reply: "Luna gửi bạn gợi ý các set phối đồ chuẩn phom dáng may đo cao cấp:",
    outfits: outfits,
    data: allItems,
    followUp: {
      question: "Bạn muốn tìm thêm phong cách nào?",
      quickReplies: ["Phối bộ khác", "Tư vấn phụ kiện túi", "Bảng quy đổi size"]
    }
  };
}

module.exports = {
  handleStylistConsultation
};


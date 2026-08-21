require('dotenv').config();
const orchestratorAgent = require('../services/agents/orchestratorAgent');

async function testNaturalLanguageVariations() {
  console.log('================================================================');
  console.log('🧠 TESTING LLM-FIRST SEMANTIC SUPERVISOR (ZERO HARDCODED KEYWORDS)');
  console.log('================================================================\n');

  const naturalVariations = [
    {
      case: 'Phương ngữ & cách nói gián tiếp về Đổi trả',
      prompt: 'Hàng mình mua về lỡ mặc bị chật nách thì có gửi lại đổi cái bự hơn được không shop ơi?',
      expectedIntent: 'POLICY',
      role: 'customer'
    },
    {
      case: 'Cách hỏi gián tiếp về Giặt là & Bảo quản chất liệu',
      prompt: 'Cái đầm lụa này mình quăng vô máy giặt quay vắt cực khô luôn được không?',
      expectedIntent: 'POLICY',
      role: 'customer'
    },
    {
      case: 'Hỏi ưu đãi bằng từ lóng dân dã',
      prompt: 'Đang nghèo quá có cái mã nào bớt được đồng nào hay đồng nấy không em?',
      expectedIntent: 'PROMOTION',
      role: 'customer'
    },
    {
      case: 'Tư vấn phối đồ theo hoàn cảnh đời thực',
      prompt: 'Tối nay ra mắt gia đình người yêu ở nhà hàng sang, nên mặc gì cho vừa lịch sự vừa không bị già?',
      expectedIntent: 'STYLIST',
      role: 'customer'
    },
    {
      case: 'Kiểm tra hàng hóa / catalog tự nhiên',
      prompt: 'Bên mình có cái áo khoác da nào màu đen ngầu ngầu xíu không?',
      expectedIntent: 'CATALOG',
      role: 'customer'
    },
    {
      case: 'Hỏi doanh số bằng tiếng lóng (Khách hỏi -> Phải bị cấm)',
      prompt: 'Tháng này tiệm mình gom được bao nhiêu lúa rồi ad?',
      expectedIntent: 'ADMIN_FORBIDDEN',
      role: 'customer'
    },
    {
      case: 'Hỏi doanh số bằng tiếng lóng (Admin hỏi -> Phải trả báo cáo)',
      prompt: 'Tháng này tiệm mình gom được bao nhiêu lúa rồi ad?',
      expectedIntent: 'ADMIN',
      role: 'admin'
    }
  ];

  let passed = 0;
  for (const t of naturalVariations) {
    console.log(`\n▶️ Test Case: [${t.case}]`);
    console.log(`   Prompt: "${t.prompt}" (Role: ${t.role})`);
    
    const intentRes = await orchestratorAgent.classifyIntent(t.prompt, t.role);
    console.log(`   👉 Intent nhận diện: [${intentRes.intent?.toUpperCase()}] (Kỳ vọng: [${t.expectedIntent}])`);

    const chatRes = await orchestratorAgent.processChatMessage({
      userId: 'test-user-123',
      userRole: t.role,
      message: t.prompt
    });
    console.log(`   👉 Response Type: ${chatRes.type}`);
    console.log(`   👉 Trả lời mẫu: ${chatRes.reply?.slice(0, 140).replace(/\n/g, ' ')}...`);

    if (intentRes.intent?.toUpperCase() === t.expectedIntent) {
      console.log(`   ✅ PASSED (LLM Semantic Reasoning thành công)`);
      passed++;
    } else {
      console.error(`   ❌ FAILED`);
    }
  }

  console.log(`\n================================================================`);
  console.log(`🎯 KẾT QUẢ PHÂN LUỒNG LLM SUPERVISOR: ${passed}/${naturalVariations.length} PASSED!`);
  console.log(`================================================================`);
}

testNaturalLanguageVariations();

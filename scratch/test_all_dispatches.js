require('dotenv').config();
const orchestratorAgent = require('../services/agents/orchestratorAgent');

async function testAllDispatches() {
  console.log('================================================================');
  console.log('🧪 TESTING INTENT CLASSIFICATION & DISPATCHING FOR ALL CASES');
  console.log('================================================================\n');

  const testCases = [
    {
      name: '1. User exact question (Chính sách đổi trả)',
      message: 'cho mình hỏi về chính sách đổi trả bên mình như thế nào nhỉ',
      userRole: 'customer',
      expectedType: 'policy_knowledge'
    },
    {
      name: '2. Bảo hành & giặt là',
      message: 'Áo lụa và len cashmere giặt và bảo quản thế nào?',
      userRole: 'customer',
      expectedType: 'policy_knowledge'
    },
    {
      name: '3. Voucher & Khuyến mãi',
      message: 'Shop có mã giảm giá voucher hay ưu đãi nào không?',
      userRole: 'customer',
      expectedType: 'promotion_list'
    },
    {
      name: '4. Stylist phối đồ',
      message: 'Tư vấn cho mình set đồ đi tiệc sang trọng',
      userRole: 'customer',
      expectedType: 'outfit_recommendation'
    },
    {
      name: '5. Catalog tìm kiếm sản phẩm',
      message: 'Tìm cho mình áo sơ mi nam hoặc áo khoác jean',
      userRole: 'customer',
      expectedType: 'product_search'
    },
    {
      name: '6. Tra cứu đơn hàng cá nhân',
      message: 'Kiểm tra trạng thái đơn hàng gần nhất của mình',
      userRole: 'customer',
      expectedType: 'order_tracking'
    },
    {
      name: '7. Khách hỏi doanh thu (Phải bị chặn bảo mật)',
      message: 'Báo cáo doanh thu và doanh số tháng này',
      userRole: 'customer',
      expectedType: 'text'
    },
    {
      name: '8. Admin hỏi doanh thu (Phải trả dữ liệu kinh doanh)',
      message: 'Báo cáo doanh thu và doanh số tháng này',
      userRole: 'admin',
      expectedType: 'admin_report'
    },
    {
      name: '9. Admin hỏi tồn kho WMS (Cảnh báo low stock)',
      message: 'Cảnh báo những mặt hàng sắp hết trong kho và cần nhập hàng',
      userRole: 'admin',
      expectedType: 'inventory_report'
    }
  ];

  let passed = 0;
  for (const tc of testCases) {
    console.log(`\n▶️ TEST CASE: ${tc.name}`);
    console.log(`   Message: "${tc.message}" (Role: ${tc.userRole})`);
    const intentRes = await orchestratorAgent.classifyIntent(tc.message, tc.userRole);
    console.log(`   👉 Classified Intent: [${intentRes.intent?.toUpperCase()}]`);

    const res = await orchestratorAgent.processChatMessage({
      userId: 'test-user-123',
      userRole: tc.userRole,
      message: tc.message
    });

    console.log(`   👉 Result Type: ${res.type}`);
    console.log(`   👉 Reply Preview: ${res.reply?.slice(0, 120).replace(/\n/g, ' ')}...`);

    if (res.type === tc.expectedType || (tc.expectedType === 'catalog_search' && res.type === 'catalog_search')) {
      console.log(`   ✅ PASSED`);
      passed++;
    } else {
      console.error(`   ❌ FAILED: Expected ${tc.expectedType}, got ${res.type}`);
    }
  }

  console.log(`\n================================================================`);
  console.log(`📊 FINAL RESULT: ${passed}/${testCases.length} TEST CASES PASSED!`);
  console.log(`================================================================`);

  process.exit(passed === testCases.length ? 0 : 1);
}

testAllDispatches();

require('dotenv').config();
const pool = require('../config/db');
const comboService = require('../services/comboService');
const userOrderService = require('../services/userOrderServices');

async function testComboBOMLifecycle() {
  console.log('================================================================');
  console.log('📦 RUNNING TEST: COMBO BOM -> BUNDLE KIT & STOCK DEDUCTION');
  console.log('================================================================\n');

  const client = await pool.connect();
  try {
    // 1. Test Querying Combos & BOM Components
    console.log('--- STEP 1: QUERY ALL ACTIVE COMBOS WITH BOM COMPONENTS ---');
    const combos = await comboService.getAllCombos();
    console.log(`Found ${combos.length} active Master Combos.`);

    for (const c of combos) {
      console.log(`\n🏷️ COMBO: ${c.name} (${c.code})`);
      console.log(`   • Original Price: ${c.original_total_price?.toLocaleString('vi-VN')}đ`);
      console.log(`   • Discount: -${c.discount_percent}% (Tiết kiệm ${c.discount_amount?.toLocaleString('vi-VN')}đ)`);
      console.log(`   • Combo Deal Price: ${c.final_price?.toLocaleString('vi-VN')}đ`);
      console.log(`   • Components count (BOM): ${c.components?.length} món:`);
      c.components.forEach((comp, idx) => {
        const variant = comp.variants?.[0];
        const sizeCount = variant?.sizes?.length || 0;
        console.log(`     ${idx + 1}. ${comp.product_name} (${Number(comp.product_price).toLocaleString('vi-VN')}đ) - ${sizeCount} size options`);
      });
    }

    // 2. Select First Combo for Test Checkout & Stock Deduction Verification
    console.log('\n--- STEP 2: VERIFY BOM INVENTORY DEDUCTION ON 3-TIER STOCK ---');
    const targetCombo = combos[0];
    if (!targetCombo || !targetCombo.components || targetCombo.components.length === 0) {
      throw new Error('No combos found to test!');
    }

    // Pick a test user
    const userRes = await client.query('SELECT id, email FROM users LIMIT 1');
    const testUser = userRes.rows[0];

    // Pick 1 size for each component in the combo and record initial stock
    const testOrderItems = [];
    const initialStocks = [];

    for (const comp of targetCombo.components) {
      const variant = comp.variants?.[0];
      const sizeObj = variant?.sizes?.[0];
      if (!variant || !sizeObj) continue;

      // Check current stock in product_variant_sizes
      const stockRes = await client.query(`
        SELECT pvs.id, pvs.variant_id, pvs.size_label, pvs.stock_qty, pvs.sold_qty, pv.color_name, p.name as product_name
        FROM product_variant_sizes pvs
        JOIN product_variants pv ON pv.id = pvs.variant_id
        JOIN products p ON p.id = pv.product_id
        WHERE pvs.id = $1
      `, [sizeObj.size_id]);

      const stockBefore = stockRes.rows[0];
      initialStocks.push(stockBefore);

      testOrderItems.push({
        product_id: comp.product_id,
        variant_id: variant.variant_id,
        qty: 1,
        unit_price: Number(comp.product_price),
        size_snapshot: sizeObj.size_label,
        color_snapshot: variant.color_name || 'Tiêu chuẩn',
        name_snapshot: comp.product_name
      });
    }

    console.log(`Preparing Combo Order for user ${testUser.email} with ${testOrderItems.length} components:`);
    initialStocks.forEach(s => {
      console.log(`   • [TRƯỚC KHI ĐẶT] ${s.product_name} (Size ${s.size_label}): Tồn kho = ${s.stock_qty}, Đã bán = ${s.sold_qty}`);
    });

    // Create Order with Combo components
    const createdOrder = await userOrderService.createOrder(testUser.id, {
      payment_method: 'cod',
      shipping_fee: 30000,
      shipping_address_snapshot: {
        full_name: 'Khách Hàng Mua Combo',
        phone: '0988776655',
        address: '123 Đường Thời Trang Haute Couture'
      },
      items: testOrderItems
    });

    console.log(`\n✅ Order Created Successfully! Order Code: ${createdOrder.order_code}`);

    // Verify Updated Stock in product_variant_sizes for all components
    console.log('\n--- STEP 3: VERIFY UPDATED INVENTORY IN DATABASE ---');
    let allDecremented = true;

    for (const init of initialStocks) {
      const updatedRes = await client.query(`
        SELECT pvs.id, pvs.stock_qty, pvs.sold_qty
        FROM product_variant_sizes pvs
        WHERE pvs.id = $1
      `, [init.id]);

      const updated = updatedRes.rows[0];
      const stockDiff = init.stock_qty - updated.stock_qty;
      const soldDiff = updated.sold_qty - init.sold_qty;

      console.log(`   • [SAU KHI ĐẶT] ${init.product_name} (Size ${init.size_label}): Tồn kho = ${updated.stock_qty} (Giảm -${stockDiff}), Đã bán = ${updated.sold_qty} (Tăng +${soldDiff})`);

      if (stockDiff !== 1 || soldDiff !== 1) {
        allDecremented = false;
      }
    }

    if (allDecremented) {
      console.log('\n🎉 SUCCESS: All BOM component items in the Combo were decremented accurately (-1) in `product_variant_sizes`!');
    } else {
      console.error('\n❌ Stock decrement verification failed!');
    }

  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

testComboBOMLifecycle();

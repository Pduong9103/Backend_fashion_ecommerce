require('dotenv').config();
const collectionService = require('../services/collectionService');

async function testCollections() {
  console.log('Testing HS Exclusive Collections retrieval...');
  const data = await collectionService.getFeaturedCollections();
  console.log('Featured Collections count:', data.length);
  data.forEach((c, idx) => {
    console.log(`\n✨ CAPSULE #${idx + 1}: ${c.name}`);
    console.log(`   Theme: ${c.theme_tag} | Season: ${c.season}`);
    console.log(`   Total items: ${c.products?.length} | Price: ${c.final_price?.toLocaleString('vi-VN')}đ (-${c.discount_percent}%)`);
    c.products.forEach(p => console.log(`     - ${p.product_name} (${p.custom_role}): ${Number(p.product_price).toLocaleString('vi-VN')}đ`));
  });
  process.exit(0);
}

testCollections();

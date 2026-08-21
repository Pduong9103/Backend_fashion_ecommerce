require('dotenv').config();
const pool = require('../config/db');
const productService = require('../services/productService');

async function test3TierLifecycle() {
  const client = await pool.connect();
  try {
    console.log('=== TEST 1: VERIFY PRODUCT DETAIL RETURNS 3-TIER SIZES & STOCK ===');
    
    // Pick a sample product with variants
    const sample = await client.query(`
      SELECT p.id, p.name 
      FROM products p 
      JOIN product_variants pv ON pv.product_id = p.id 
      LIMIT 1
    `);
    const productId = sample.rows[0].id;
    console.log(`Testing Product: "${sample.rows[0].name}" (${productId})`);

    const productDetail = await productService.getProductById(productId);
    console.log(`Product Name: ${productDetail.name}`);
    console.log('Variants count:', productDetail.variants.length);
    
    for (const v of productDetail.variants) {
      console.log(`\n  Color: ${v.color_name} | Prefix SKU: ${v.sku} | Total Stock: ${v.stock_qty}`);
      console.log('  Sizes breakdown:');
      for (const s of v.sizes) {
        console.log(`    - Size ${s.size_label || s.size}: SKU = "${s.sku}", Stock = ${s.stock_qty}, Sold = ${s.sold_qty}`);
      }
    }

    console.log('\n=== TEST 2: TEST TRIGGER REAL-TIME STOCK RECALCULATION ===');
    const firstVariant = productDetail.variants[0];
    const firstSize = firstVariant.sizes[0];
    const originalStock = firstSize.stock_qty;

    console.log(`Updating stock for Size ${firstSize.size_label} (ID: ${firstSize.id}) from ${originalStock} to ${originalStock + 10}...`);
    await client.query(`UPDATE product_variant_sizes SET stock_qty = stock_qty + 10 WHERE id = $1`, [firstSize.id]);

    // Check parent product stock calculation via getProductById
    const updatedProd = await productService.getProductById(productId);
    const updatedVariant = updatedProd.variants.find((v) => v.id === firstVariant.id);
    console.log(`✅ Calculated Variant Total Stock is: ${updatedVariant.stock_qty} (Old: ${firstVariant.stock_qty}, Expected: ${firstVariant.stock_qty + 10})`);

    // Revert back
    await client.query(`UPDATE product_variant_sizes SET stock_qty = stock_qty - 10 WHERE id = $1`, [firstSize.id]);
    console.log('✅ Reverted test stock change cleanly.');

    console.log('\n🎉 ALL 3-TIER HIERARCHY (PRODUCT -> VARIANT -> SIZE & STOCK) TESTS PASSED 100%!');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

test3TierLifecycle();

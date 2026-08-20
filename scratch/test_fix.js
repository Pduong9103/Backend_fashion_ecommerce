const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PASSWORD || '090103',
  database: 'fashion_ecommerce',
});

async function testFix() {
  try {
    const coolmateId = 'ee9a160e-1810-4411-bb4e-ab931cb09079';
    // 1. Get variants
    const variants = await pool.query(`
      SELECT pv.id as variant_id, p.name as product_name, pv.color_name, s.name as supplier_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.supplier_id::text = $1
    `, [coolmateId]);
    console.log('Found Coolmate variant IDs in DB:', variants.rows.length);

    const vIds = variants.rows.map(r => r.variant_id);
    const stocks = await pool.query(`
      SELECT * FROM inventory_stocks
      WHERE variant_id = ANY($1::uuid[])
    `, [vIds]);
    console.log('Found inventory_stocks for Coolmate in WMS db:', stocks.rows.length);
    console.log('Sample stock item:', stocks.rows[0]);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

testFix();

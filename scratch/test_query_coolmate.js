require('dotenv').config();
const pool = require('../config/db');

async function testQuery() {
  try {
    const coolmateId = 'ee9a160e-1810-4411-bb4e-ab931cb09079';
    const res = await pool.query(`
      SELECT pv.id as variant_id, pv.color_name, p.name as product_name, p.supplier_id, s.name as supplier_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.supplier_id = $1::uuid
    `, [coolmateId]);
    console.log('Coolmate variants in DB:', res.rows.length);
    console.log('Sample rows:', res.rows.slice(0, 5));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

testQuery();

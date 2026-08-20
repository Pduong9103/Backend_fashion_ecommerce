const pool = require('../config/db');

async function check() {
  const res = await pool.query(`
    SELECT pv.id, pv.sku, pv.sizes, p.name
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE p.name ILIKE '%Quần tây%' OR p.name ILIKE '%Baggy%' OR p.name ILIKE '%Áo%'
    LIMIT 10
  `);
  console.log(res.rows);
  await pool.end();
}

check().catch(console.error);

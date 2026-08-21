require('dotenv').config();
const pool = require('../config/db');

async function findStudioItems() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        p.id, 
        p.name, 
        p.price, 
        p.final_price, 
        c.name as category_name, 
        s.name as supplier_name,
        COALESCE(
          (SELECT url FROM product_images pi WHERE pi.product_id = p.id AND pi.variant_id IS NULL LIMIT 1),
          (SELECT pi2.url FROM product_variants pv JOIN product_images pi2 ON pi2.variant_id = pv.id WHERE pv.product_id = p.id LIMIT 1)
        ) as image,
        (SELECT color_name FROM product_variants pv WHERE pv.product_id = p.id LIMIT 1) as color_name,
        (SELECT color_code FROM product_variants pv WHERE pv.product_id = p.id LIMIT 1) as color_code
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.status = 'active'
      ORDER BY p.sequence_id ASC;
    `);

    console.log(JSON.stringify(res.rows.slice(0, 30), null, 2));
  } finally {
    client.release();
    pool.end();
  }
}

findStudioItems();

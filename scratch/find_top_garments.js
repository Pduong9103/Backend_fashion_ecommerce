require('dotenv').config();
const pool = require('../config/db');

async function findTopGarments() {
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
        ) as image
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.status = 'active' AND (
        c.name ILIKE '%khoác%' OR 
        c.name ILIKE '%hoodie%' OR 
        c.name ILIKE '%sơ mi%' OR 
        c.name ILIKE '%polo%' OR
        c.name ILIKE '%jean%' OR
        c.name ILIKE '%kaki%' OR
        c.name ILIKE '%túi%'
      )
      ORDER BY p.price DESC;
    `);

    console.log(JSON.stringify(res.rows.slice(0, 25), null, 2));
  } finally {
    client.release();
    pool.end();
  }
}

findTopGarments();

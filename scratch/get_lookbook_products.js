require('dotenv').config();
const pool = require('../config/db');

async function getLookbookProducts() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        p.id, 
        p.name, 
        p.price, 
        p.description,
        s.name as supplier_name,
        c.name as category_name,
        COALESCE(
          (SELECT json_agg(pi.url) FROM product_images pi WHERE pi.product_id = p.id),
          '[]'::json
        ) as images
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active'
      ORDER BY p.price DESC
      LIMIT 12;
    `);

    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    client.release();
    pool.end();
  }
}

getLookbookProducts();

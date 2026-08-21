require('dotenv').config();
const pool = require('../config/db');

async function checkAllImages() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT p.id, p.name, pi.url
      FROM products p
      JOIN product_images pi ON pi.product_id = p.id
      ORDER BY p.name;
    `);

    const map = {};
    res.rows.forEach(r => {
      if (!map[r.name]) map[r.name] = [];
      map[r.name].push({ id: r.id, url: r.url });
    });

    console.log(JSON.stringify(map, null, 2));
  } finally {
    client.release();
    pool.end();
  }
}

checkAllImages();

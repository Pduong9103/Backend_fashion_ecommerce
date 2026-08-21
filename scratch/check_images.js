require('dotenv').config();
const pool = require('../config/db');

async function checkProductImages() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT p.id, p.name, pi.url
      FROM products p
      JOIN product_images pi ON pi.product_id = p.id
      WHERE p.name ILIKE '%Sơ Mi%' OR p.name ILIKE '%Teelab%' OR p.name ILIKE '%HAPAS%' OR p.name ILIKE '%Keepal%';
    `);
    console.log(res.rows);
  } finally {
    client.release();
    pool.end();
  }
}

checkProductImages();

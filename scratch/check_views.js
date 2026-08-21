require('dotenv').config();
const pool = require('../config/db');

async function checkViews() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name, view_definition 
      FROM information_schema.views 
      WHERE table_name IN ('v_item_document', 'v_product_full');
    `);
    console.log(res.rows);
  } finally {
    client.release();
    pool.end();
  }
}

checkViews();

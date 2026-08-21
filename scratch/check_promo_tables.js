require('dotenv').config();
const pool = require('../config/db');

async function checkPromoTables() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND (table_name ILIKE '%promo%' OR table_name ILIKE '%voucher%' OR table_name ILIKE '%discount%');
    `);
    console.log('Tables:', res.rows);

    for (const row of res.rows) {
      const cols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1;
      `, [row.table_name]);
      console.log(`\nColumns of ${row.table_name}:`, cols.rows.map(c => `${c.column_name} (${c.data_type})`));
    }
  } finally {
    client.release();
    pool.end();
  }
}

checkPromoTables();

const { Pool } = require('pg');

async function listSchemas() {
  const p = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: process.env.DB_PASSWORD || '090103',
    database: 'fashion_ecommerce',
  });
  try {
    const res = await p.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%stock%' OR table_name LIKE '%ware%' OR table_name LIKE '%receipt%'
    `);
    console.log('Tables matching in fashion_ecommerce:', res.rows);
  } finally {
    await p.end();
  }
}

listSchemas();

const { Pool } = require('pg');

async function listDbs() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: process.env.DB_PASSWORD || '090103',
    database: 'postgres',
  });

  try {
    const dbs = await pool.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('Databases:', dbs.rows);

    for (const d of dbs.rows) {
      const p = new Pool({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: process.env.DB_PASSWORD || '090103',
        database: d.datname,
      });
      try {
        const tbls = await p.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name LIKE '%stock%' OR table_name LIKE '%product%'
        `);
        console.log(`Tables in ${d.datname}:`, tbls.rows.map(r => r.table_name));
      } catch (e) {
        console.log(`Could not query ${d.datname}:`, e.message);
      } finally {
        await p.end();
      }
    }
  } finally {
    await pool.end();
  }
}

listDbs();

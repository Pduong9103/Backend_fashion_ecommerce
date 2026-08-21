require('dotenv').config();
const pool = require('../config/db');
const { execSync } = require('child_process');

async function syncSKUsToDocker() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT id, sku FROM product_variants');
    console.log(`Fetched ${res.rows.length} updated SKUs from host DB.`);

    // Build SQL statements for docker container
    let sql = 'BEGIN;\n';
    for (const r of res.rows) {
      sql += `UPDATE product_variants SET sku = '${r.sku}' WHERE id = '${r.id}';\n`;
      sql += `UPDATE inventory_stocks SET sku = '${r.sku}' WHERE variant_id = '${r.id}';\n`;
    }
    sql += 'COMMIT;\n';

    // Execute directly in docker container
    console.log('Executing SKU updates in docker postgres...');
    execSync(`docker exec -i fashion_postgres psql -U postgres -d fashion_ecommerce`, {
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    console.log('✅ Synchronized all SKUs into docker postgres container!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

syncSKUsToDocker();

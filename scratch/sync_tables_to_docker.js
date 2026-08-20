require('dotenv').config();
const { execSync } = require('child_process');
const pool = require('../config/db');

async function syncAllTables() {
  try {
    console.log('--- SYNCING ALL PRODUCTS & SUPPLIERS INTO DOCKER POSTGRES ---');
    
    // Dump data from host postgres to docker container
    const cmd = `pg_dump -U postgres -h localhost -p 5432 -d fashion_ecommerce -t suppliers -t products -t product_variants -t product_images -a | docker exec -i fashion_postgres psql -U postgres -d fashion_ecommerce`;
    
    // First, let's create the schema of suppliers, products, product_variants, product_images if needed
    const dumpSchema = `pg_dump -U postgres -h localhost -p 5432 -d fashion_ecommerce -t suppliers -t products -t product_variants -t product_images --schema-only | docker exec -i fashion_postgres psql -U postgres -d fashion_ecommerce`;
    
    console.log('Creating schemas...');
    try {
      execSync(dumpSchema, { env: { ...process.env, PGPASSWORD: '090103' }, stdio: 'inherit' });
    } catch (e) {
      console.log('Schema dump output/warning:', e.message);
    }

    console.log('Copying data...');
    try {
      execSync(cmd, { env: { ...process.env, PGPASSWORD: '090103' }, stdio: 'inherit' });
    } catch (e) {
      console.log('Data dump output/warning:', e.message);
    }

    console.log('Done syncing tables.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

syncAllTables();

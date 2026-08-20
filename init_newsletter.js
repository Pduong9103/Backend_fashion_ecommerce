const pool = require('./config/db');

async function initNewsletter() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('TABLE_CREATED_SUCCESS');
  } catch (err) {
    console.error('DB_ERROR:', err);
  } finally {
    process.exit(0);
  }
}

initNewsletter();

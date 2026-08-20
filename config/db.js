const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: (process.env.DB_HOST || 'localhost').trim(),
  port: Number(process.env.DB_PORT) || 5432,
  user: (process.env.DB_USER || 'postgres').trim(),
  password: (process.env.DB_PASSWORD || '').trim(),
  database: (process.env.DB_NAME || 'fashion_ecommerce').trim(),
  max: 20
});
module.exports = pool;

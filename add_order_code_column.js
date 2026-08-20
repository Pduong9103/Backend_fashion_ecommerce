const pool = require('./config/db');

async function migrateOrderCode() {
  try {
    // 1. Thêm cột order_code nếu chưa có
    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS order_code VARCHAR(30);
    `);

    // 2. Backfill dữ liệu cho các đơn hàng cũ
    await pool.query(`
      UPDATE orders 
      SET order_code = CONCAT('HS-', UPPER(SUBSTRING(id::text, 1, 8))) 
      WHERE order_code IS NULL;
    `);

    // 3. Đảm bảo index UNIQUE
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_code_unique'
        ) THEN
          ALTER TABLE orders ADD CONSTRAINT orders_order_code_unique UNIQUE (order_code);
        END IF;
      END $$;
    `);

    console.log('MIGRATION_ORDER_CODE_SUCCESS');
  } catch (err) {
    console.error('MIGRATION_ERROR:', err);
  } finally {
    process.exit(0);
  }
}

migrateOrderCode();

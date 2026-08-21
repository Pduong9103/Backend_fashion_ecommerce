require('dotenv').config();
const pool = require('../config/db');
const { execSync } = require('child_process');

async function setupStockSingleSourceOfTruth() {
  const client = await pool.connect();
  try {
    console.log('=== SETTING UP SINGLE SOURCE OF TRUTH FOR VARIANT SIZES STOCK ===');

    // 1. Create function to recalculate parent product_variants stock_qty from product_variant_sizes
    const sql = `
      CREATE OR REPLACE FUNCTION sync_variant_total_stock()
      RETURNS TRIGGER AS $$
      DECLARE
        target_variant_id UUID;
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          target_variant_id := OLD.variant_id;
        ELSE
          target_variant_id := NEW.variant_id;
        END IF;

        UPDATE product_variants
        SET 
          stock_qty = COALESCE((SELECT SUM(stock_qty) FROM product_variant_sizes WHERE variant_id = target_variant_id), 0),
          sold_qty = COALESCE((SELECT SUM(sold_qty) FROM product_variant_sizes WHERE variant_id = target_variant_id), 0),
          updated_at = NOW()
        WHERE id = target_variant_id;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_variant_total_stock ON product_variant_sizes;

      CREATE TRIGGER trg_sync_variant_total_stock
      AFTER INSERT OR UPDATE OR DELETE ON product_variant_sizes
      FOR EACH ROW
      EXECUTE FUNCTION sync_variant_total_stock();
    `;

    console.log('Applying trigger to host PostgreSQL...');
    await client.query(sql);

    // Initial sync
    await client.query(`
      UPDATE product_variants pv
      SET 
        stock_qty = COALESCE((SELECT SUM(stock_qty) FROM product_variant_sizes WHERE variant_id = pv.id), 0),
        sold_qty = COALESCE((SELECT SUM(sold_qty) FROM product_variant_sizes WHERE variant_id = pv.id), 0);
    `);
    console.log('✅ Host database synchronized!');

    // Apply to docker postgres container as well
    console.log('Applying trigger to docker postgres container...');
    execSync(`docker exec -i fashion_postgres psql -U postgres -d fashion_ecommerce`, {
      input: sql + `
        UPDATE product_variants pv
        SET 
          stock_qty = COALESCE((SELECT SUM(stock_qty) FROM product_variant_sizes WHERE variant_id = pv.id), 0),
          sold_qty = COALESCE((SELECT SUM(sold_qty) FROM product_variant_sizes WHERE variant_id = pv.id), 0);
      `,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    console.log('✅ Docker container database synchronized!');

  } catch (err) {
    console.error('Error setting up stock trigger:', err);
  } finally {
    client.release();
    pool.end();
  }
}

setupStockSingleSourceOfTruth();

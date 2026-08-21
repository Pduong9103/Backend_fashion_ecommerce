require('dotenv').config();
const pool = require('../config/db');
const { execSync } = require('child_process');

async function dropColumnsAndRebuildViews() {
  const client = await pool.connect();
  try {
    console.log('=== DROPPING SIZES & STOCK_QTY COLUMNS AND REBUILDING VIEWS ===');

    const sql = `
      -- 1. Drop dependent views and triggers
      DROP VIEW IF EXISTS v_item_document CASCADE;
      DROP VIEW IF EXISTS v_product_full CASCADE;
      DROP TRIGGER IF EXISTS trg_sync_variant_total_stock ON product_variant_sizes;
      DROP FUNCTION IF EXISTS sync_variant_total_stock();

      -- 2. Drop redundant columns from product_variants
      ALTER TABLE product_variants DROP COLUMN IF EXISTS sizes CASCADE;
      ALTER TABLE product_variants DROP COLUMN IF EXISTS stock_qty CASCADE;

      -- 3. Recreate v_product_full using product_variant_sizes
      CREATE OR REPLACE VIEW v_product_full AS
      SELECT p.id,
        p.name,
        p.description,
        p.category_id,
        p.supplier_id,
        p.status,
        p.created_at,
        p.updated_at,
        p.price,
        p.sale_percent,
        p.is_flash_sale,
        p.final_price,
        c.name AS category_name,
        s.name AS supplier_name,
        COALESCE((
          SELECT json_agg(json_build_object('url', pi.url) ORDER BY COALESCE(pi."position", 0), pi.id)
          FROM product_images pi
          WHERE pi.product_id = p.id AND pi.variant_id IS NULL
        ), '[]'::json) AS product_images,
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', pv.id,
              'sku', pv.sku,
              'color_name', pv.color_name,
              'color_code', pv.color_code,
              'sizes', (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', pvs.id,
                      'size', pvs.size_label,
                      'size_label', pvs.size_label,
                      'sku', pvs.sku,
                      'stock_qty', pvs.stock_qty,
                      'sold_qty', pvs.sold_qty
                    ) ORDER BY pvs.id
                  ), '[]'::json
                )
                FROM product_variant_sizes pvs
                WHERE pvs.variant_id = pv.id
              ),
              'stock_qty', (
                SELECT COALESCE(SUM(pvs.stock_qty), 0)
                FROM product_variant_sizes pvs
                WHERE pvs.variant_id = pv.id
              ),
              'images', (
                SELECT COALESCE(json_agg(json_build_object('url', pi2.url) ORDER BY COALESCE(pi2."position", 0), pi2.id), '[]'::json)
                FROM product_images pi2
                WHERE pi2.variant_id = pv.id
              )
            ) ORDER BY pv.id
          )
          FROM product_variants pv
          WHERE pv.product_id = p.id
        ), '[]'::json) AS variants,
        p.sequence_id
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id;

      -- 4. Recreate v_item_document using product_variant_sizes
      CREATE OR REPLACE VIEW v_item_document AS
      SELECT pv.id AS variant_id,
        p.id AS product_id,
        p.name AS product_name,
        pv.sku,
        pv.color_name,
        p.description,
        p.price,
        p.sale_percent,
        p.is_flash_sale,
        p.final_price,
        c.name AS category_name,
        s.name AS supplier_name,
        COALESCE((
          SELECT json_agg(pi.url ORDER BY COALESCE(pi."position", 0))
          FROM product_images pi
          WHERE pi.variant_id = pv.id OR (pi.product_id = p.id AND pi.variant_id IS NULL)
        ), '[]'::json) AS image_urls,
        COALESCE(p.name, '') || ' || ' || COALESCE(p.description, '') || ' || Supplier: ' || COALESCE(s.name, '') || ' || Category: ' || COALESCE(c.name, '') || ' || Variant: ' || COALESCE(pv.color_name, '') AS text_document,
        jsonb_build_object(
          'variant_id', pv.id,
          'product_id', p.id,
          'product_name', p.name,
          'sku', pv.sku,
          'color_name', pv.color_name,
          'sizes', (
            SELECT COALESCE(json_agg(pvs.size_label ORDER BY pvs.id), '[]'::json)
            FROM product_variant_sizes pvs
            WHERE pvs.variant_id = pv.id
          ),
          'stock_qty', (
            SELECT COALESCE(SUM(pvs.stock_qty), 0)
            FROM product_variant_sizes pvs
            WHERE pvs.variant_id = pv.id
          ),
          'price', p.price,
          'sale_percent', p.sale_percent,
          'is_flash_sale', p.is_flash_sale,
          'final_price', p.final_price,
          'category', c.name,
          'supplier', s.name
        ) AS metadata
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id;
    `;

    console.log('Applying changes on host PostgreSQL...');
    await client.query(sql);
    console.log('✅ Host database: Successfully dropped redundant columns from product_variants and updated views!');

    console.log('Applying changes on docker postgres container...');
    execSync(`docker exec -i fashion_postgres psql -U postgres -d fashion_ecommerce`, {
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    console.log('✅ Docker container: Successfully dropped redundant columns from product_variants and updated views!');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

dropColumnsAndRebuildViews();

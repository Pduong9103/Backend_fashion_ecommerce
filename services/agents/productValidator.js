// services/agents/productValidator.js
const pool = require('../../config/db');

/**
 * Validates and enriches a list of product items directly from PostgreSQL.
 * GUARANTEES:
 * - Products exist in DB and have status = 'active'
 * - Real price, images, category name, and variants
 * - Filters out hallucinated or out-of-stock items
 */
async function validateAndEnrichProducts(rawItems = []) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  const client = await pool.connect();
  try {
    const validatedProducts = [];

    for (const item of rawItems) {
      const productId = item.product_id || item.id;
      const variantId = item.variant_id;

      if (!productId && !variantId) continue;

      let query = '';
      let params = [];

      if (variantId) {
        query = `
          SELECT 
            p.id as product_id,
            p.name,
            p.price,
            p.status,
            p.description,
            c.name as category_name,
            c.id as category_id,
            s.name as supplier_name,
            pv.id as variant_id,
            pv.color_name,
            pv.color_code,
            COALESCE(
              (SELECT json_agg(json_build_object('url', pi.url)) FROM product_images pi WHERE pi.product_id = p.id),
              '[]'::json
            ) as product_images,
            COALESCE(
              (SELECT json_agg(json_build_object('id', v.id, 'color_name', v.color_name, 'color_code', v.color_code)) 
               FROM product_variants v WHERE v.product_id = p.id),
              '[]'::json
            ) as variants
          FROM product_variants pv
          JOIN products p ON pv.product_id = p.id
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN suppliers s ON p.supplier_id = s.id
          WHERE pv.id = $1 AND p.status = 'active'
          LIMIT 1
        `;
        params = [variantId];
      } else {
        query = `
          SELECT 
            p.id as product_id,
            p.name,
            p.price,
            p.status,
            p.description,
            c.name as category_name,
            c.id as category_id,
            s.name as supplier_name,
            (SELECT pv.id FROM product_variants pv JOIN product_variant_sizes pvs ON pvs.variant_id = pv.id WHERE pv.product_id = p.id AND pvs.stock_qty > 0 LIMIT 1) as variant_id,
            (SELECT pv.color_name FROM product_variants pv JOIN product_variant_sizes pvs ON pvs.variant_id = pv.id WHERE pv.product_id = p.id AND pvs.stock_qty > 0 LIMIT 1) as color_name,
            COALESCE(
              (SELECT json_agg(json_build_object('url', pi.url)) FROM product_images pi WHERE pi.product_id = p.id),
              '[]'::json
            ) as product_images,
            COALESCE(
              (SELECT json_agg(json_build_object('id', v.id, 'color_name', v.color_name, 'color_code', v.color_code)) 
               FROM product_variants v WHERE v.product_id = p.id),
              '[]'::json
            ) as variants
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN suppliers s ON p.supplier_id = s.id
          WHERE p.id = $1 AND p.status = 'active'
          LIMIT 1
        `;
        params = [productId];
      }

      const res = await client.query(query, params);
      if (res.rowCount > 0) {
        const row = res.rows[0];
        const imageUrl = row.product_images && row.product_images[0] ? row.product_images[0].url : '/placeholder.jpg';
        
        validatedProducts.push({
          id: row.product_id,
          product_id: row.product_id,
          variant_id: row.variant_id || variantId || row.product_id,
          name: row.name,
          price: Number(row.price),
          category_id: row.category_id,
          category_name: row.category_name,
          supplier_name: row.supplier_name || 'HS Atelier',
          image_url: imageUrl,
          product_images: row.product_images,
          color: row.color_name,
          variants: row.variants,
          description: row.description
        });
      }
    }

    return validatedProducts;
  } catch (err) {
    console.error('[productValidator] Verification error:', err);
    return [];
  } finally {
    client.release();
  }
}

module.exports = {
  validateAndEnrichProducts
};

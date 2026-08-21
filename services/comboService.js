// services/comboService.js
const pool = require('../config/db');

/**
 * Service to manage Product Combos / Bundles (BOM structure).
 */
exports.getAllCombos = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        c.id,
        c.name,
        c.code,
        c.description,
        c.discount_percent,
        c.fixed_price,
        c.image_url,
        c.status,
        COALESCE(
          json_agg(
            json_build_object(
              'combo_item_id', ci.id,
              'product_id', p.id,
              'product_name', p.name,
              'product_price', p.price,
              'quantity', ci.quantity,
              'image_url', (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id LIMIT 1),
              'variants', (
                SELECT json_agg(
                  json_build_object(
                    'variant_id', pv.id,
                    'color_name', pv.color_name,
                    'color_code', pv.color_code,
                    'sizes', (
                      SELECT json_agg(
                        json_build_object(
                          'size_id', pvs.id,
                          'size_label', pvs.size_label,
                          'sku', pvs.sku,
                          'stock_qty', pvs.stock_qty
                        ) ORDER BY pvs.size_label
                      )
                      FROM product_variant_sizes pvs
                      WHERE pvs.variant_id = pv.id
                    )
                  )
                )
                FROM product_variants pv
                WHERE pv.product_id = p.id
              )
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) as components
      FROM combos c
      LEFT JOIN combo_items ci ON ci.combo_id = c.id
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE c.status = 'active'
      GROUP BY c.id
      ORDER BY c.created_at DESC;
    `);

    // Calculate calculated prices and available combo stock
    return res.rows.map(combo => {
      const rawTotal = (combo.components || []).reduce((sum, item) => {
        return sum + (Number(item.product_price) || 0) * (Number(item.quantity) || 1);
      }, 0);

      const discountPercent = Number(combo.discount_percent) || 0;
      const finalPrice = combo.fixed_price 
        ? Number(combo.fixed_price) 
        : Math.round(rawTotal * (1 - discountPercent / 100));

      return {
        ...combo,
        original_total_price: rawTotal,
        discount_amount: rawTotal - finalPrice,
        final_price: finalPrice,
        items_count: (combo.components || []).length
      };
    });
  } finally {
    client.release();
  }
};

exports.getComboById = async (comboId) => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        c.id,
        c.name,
        c.code,
        c.description,
        c.discount_percent,
        c.fixed_price,
        c.image_url,
        c.status,
        COALESCE(
          json_agg(
            json_build_object(
              'combo_item_id', ci.id,
              'product_id', p.id,
              'product_name', p.name,
              'product_price', p.price,
              'quantity', ci.quantity,
              'image_url', (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id LIMIT 1),
              'variants', (
                SELECT json_agg(
                  json_build_object(
                    'variant_id', pv.id,
                    'color_name', pv.color_name,
                    'color_code', pv.color_code,
                    'sizes', (
                      SELECT json_agg(
                        json_build_object(
                          'size_id', pvs.id,
                          'size_label', pvs.size_label,
                          'sku', pvs.sku,
                          'stock_qty', pvs.stock_qty
                        ) ORDER BY pvs.size_label
                      )
                      FROM product_variant_sizes pvs
                      WHERE pvs.variant_id = pv.id
                    )
                  )
                )
                FROM product_variants pv
                WHERE pv.product_id = p.id
              )
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) as components
      FROM combos c
      LEFT JOIN combo_items ci ON ci.combo_id = c.id
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE c.id = $1
      GROUP BY c.id;
    `, [comboId]);

    if (res.rows.length === 0) return null;

    const combo = res.rows[0];
    const rawTotal = (combo.components || []).reduce((sum, item) => {
      return sum + (Number(item.product_price) || 0) * (Number(item.quantity) || 1);
    }, 0);

    const discountPercent = Number(combo.discount_percent) || 0;
    const finalPrice = combo.fixed_price 
      ? Number(combo.fixed_price) 
      : Math.round(rawTotal * (1 - discountPercent / 100));

    return {
      ...combo,
      original_total_price: rawTotal,
      discount_amount: rawTotal - finalPrice,
      final_price: finalPrice,
      items_count: (combo.components || []).length
    };
  } finally {
    client.release();
  }
};

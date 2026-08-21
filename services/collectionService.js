// services/collectionService.js
const pool = require('../config/db');

/**
 * Service to manage HS Exclusive Collections & Haute Couture Archive.
 */
exports.getFeaturedCollections = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        c.id,
        c.name,
        c.slug,
        c.theme_tag,
        c.season,
        c.manifesto,
        c.main_image,
        c.detail_image,
        c.audio_aesthetic,
        c.swatches,
        c.discount_percent,
        c.is_limited,
        c.is_featured,
        c.status,
        COALESCE(
          json_agg(
            json_build_object(
              'collection_item_id', ci.id,
              'product_id', p.id,
              'product_name', p.name,
              'product_price', p.price,
              'custom_role', ci.custom_role,
              'sort_order', ci.sort_order,
              'image_url', (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id LIMIT 1),
              'category_name', (SELECT cat.name FROM categories cat WHERE cat.id = p.category_id),
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
            ) ORDER BY ci.sort_order ASC
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) as products
      FROM collections c
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE c.status = 'active' AND c.is_featured = true
      GROUP BY c.id
      ORDER BY c.created_at ASC;
    `);

    return res.rows.map(col => {
      const rawTotal = (col.products || []).reduce((sum, item) => sum + (Number(item.product_price) || 0), 0);
      const discountPercent = Number(col.discount_percent) || 10;
      const finalPrice = Math.round(rawTotal * (1 - discountPercent / 100));

      return {
        ...col,
        original_total_price: rawTotal,
        discount_amount: rawTotal - finalPrice,
        final_price: finalPrice,
        items_count: (col.products || []).length
      };
    });
  } finally {
    client.release();
  }
};

exports.getAllCollectionsAdmin = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        c.*,
        COUNT(ci.id)::int as total_products,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', p.id,
              'product_name', p.name,
              'product_price', p.price,
              'image_url', (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id LIMIT 1)
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) as products_preview
      FROM collections c
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      LEFT JOIN products p ON p.id = ci.product_id
      GROUP BY c.id
      ORDER BY c.created_at DESC;
    `);
    return res.rows;
  } finally {
    client.release();
  }
};

exports.getCollectionById = async (id) => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        c.*,
        COALESCE(
          json_agg(
            json_build_object(
              'collection_item_id', ci.id,
              'product_id', p.id,
              'product_name', p.name,
              'product_price', p.price,
              'custom_role', ci.custom_role,
              'sort_order', ci.sort_order,
              'image_url', (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id LIMIT 1)
            ) ORDER BY ci.sort_order ASC
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) as products
      FROM collections c
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE c.id = $1
      GROUP BY c.id;
    `, [id]);
    return res.rows[0] || null;
  } finally {
    client.release();
  }
};

exports.createCollection = async (data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    const insertRes = await client.query(`
      INSERT INTO collections (
        name, slug, theme_tag, season, manifesto, main_image, detail_image, 
        audio_aesthetic, swatches, discount_percent, is_limited, is_featured, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `, [
      data.name,
      slug,
      data.theme_tag || 'THEME / HS PRIVATE ARCHIVE',
      data.season || 'SEASON 2026',
      data.manifesto || '',
      data.main_image,
      data.detail_image || data.main_image,
      data.audio_aesthetic || 'HS ATELIER • AMBIENT STRINGS',
      JSON.stringify(data.swatches || []),
      data.discount_percent || 10.00,
      data.is_limited !== undefined ? data.is_limited : true,
      data.is_featured !== undefined ? data.is_featured : true,
      data.status || 'active'
    ]);

    const newCollection = insertRes.rows[0];

    // If initial product_ids provided
    if (Array.isArray(data.product_ids) && data.product_ids.length > 0) {
      for (let i = 0; i < data.product_ids.length; i++) {
        await client.query(`
          INSERT INTO collection_items (collection_id, product_id, sort_order)
          VALUES ($1, $2, $3);
        `, [newCollection.id, data.product_ids[i], i + 1]);
      }
    }

    await client.query('COMMIT');
    return newCollection;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.updateCollection = async (id, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updateRes = await client.query(`
      UPDATE collections
      SET
        name = COALESCE($1, name),
        theme_tag = COALESCE($2, theme_tag),
        season = COALESCE($3, season),
        manifesto = COALESCE($4, manifesto),
        main_image = COALESCE($5, main_image),
        detail_image = COALESCE($6, detail_image),
        audio_aesthetic = COALESCE($7, audio_aesthetic),
        swatches = COALESCE($8, swatches),
        discount_percent = COALESCE($9, discount_percent),
        is_limited = COALESCE($10, is_limited),
        is_featured = COALESCE($11, is_featured),
        status = COALESCE($12, status),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *;
    `, [
      data.name,
      data.theme_tag,
      data.season,
      data.manifesto,
      data.main_image,
      data.detail_image,
      data.audio_aesthetic,
      data.swatches ? JSON.stringify(data.swatches) : null,
      data.discount_percent,
      data.is_limited,
      data.is_featured,
      data.status,
      id
    ]);

    if (Array.isArray(data.product_ids)) {
      await client.query(`DELETE FROM collection_items WHERE collection_id = $1`, [id]);
      for (let i = 0; i < data.product_ids.length; i++) {
        await client.query(`
          INSERT INTO collection_items (collection_id, product_id, sort_order)
          VALUES ($1, $2, $3);
        `, [id, data.product_ids[i], i + 1]);
      }
    }

    await client.query('COMMIT');
    return updateRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.deleteCollection = async (id) => {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM collections WHERE id = $1`, [id]);
    return { success: true };
  } finally {
    client.release();
  }
};

/* -------------------------------------------------------------
   LOOKBOOK EXHIBITION SLIDES SERVICES
------------------------------------------------------------- */
exports.getAllLookbookSlides = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT * FROM lookbook_slides
      WHERE status = 'active'
      ORDER BY sort_order ASC, created_at ASC;
    `);
    return res.rows;
  } finally {
    client.release();
  }
};

exports.createLookbookSlide = async (data) => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      INSERT INTO lookbook_slides (
        season_tag, title, subtitle, manifesto, material_info, 
        artisan_hours, image, look_number, shop_link, combo_title, combo_discount, sort_order, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `, [
      data.season_tag || 'COLLECTION ISSUE / HAUTE COUTURE',
      data.title,
      data.subtitle || '',
      data.manifesto,
      data.material_info || '',
      data.artisan_hours || '15 Giờ Đính Kết Thủ Công',
      data.image,
      data.look_number || 'ARCHIVE N°',
      data.shop_link || '/product',
      data.combo_title || 'Combo Set Lookbook',
      data.combo_discount || 10.00,
      data.sort_order || 0,
      data.status || 'active'
    ]);
    return res.rows[0];
  } finally {
    client.release();
  }
};

exports.updateLookbookSlide = async (id, data) => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      UPDATE lookbook_slides
      SET
        season_tag = COALESCE($1, season_tag),
        title = COALESCE($2, title),
        subtitle = COALESCE($3, subtitle),
        manifesto = COALESCE($4, manifesto),
        material_info = COALESCE($5, material_info),
        artisan_hours = COALESCE($6, artisan_hours),
        image = COALESCE($7, image),
        look_number = COALESCE($8, look_number),
        shop_link = COALESCE($9, shop_link),
        combo_title = COALESCE($10, combo_title),
        combo_discount = COALESCE($11, combo_discount),
        sort_order = COALESCE($12, sort_order),
        status = COALESCE($13, status),
        updated_at = NOW()
      WHERE id = $14
      RETURNING *;
    `, [
      data.season_tag,
      data.title,
      data.subtitle,
      data.manifesto,
      data.material_info,
      data.artisan_hours,
      data.image,
      data.look_number,
      data.shop_link,
      data.combo_title,
      data.combo_discount,
      data.sort_order,
      data.status,
      id
    ]);
    return res.rows[0];
  } finally {
    client.release();
  }
};

exports.deleteLookbookSlide = async (id) => {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM lookbook_slides WHERE id = $1`, [id]);
    return { success: true };
  } finally {
    client.release();
  }
};


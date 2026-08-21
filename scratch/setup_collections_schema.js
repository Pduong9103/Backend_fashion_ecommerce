require('dotenv').config();
const pool = require('../config/db');

async function setupCollectionsTables() {
  console.log('🚀 Setting up HS Exclusive Collections & Haute Couture Archive Schema...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create table `collections`
    await client.query(`
      CREATE TABLE IF NOT EXISTS collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE,
        theme_tag VARCHAR(150),
        season VARCHAR(100) DEFAULT 'SEASON 2026',
        manifesto TEXT,
        main_image VARCHAR(500) NOT NULL,
        detail_image VARCHAR(500),
        audio_aesthetic VARCHAR(255),
        swatches JSONB DEFAULT '[]'::jsonb,
        discount_percent NUMERIC(5,2) DEFAULT 10.00,
        is_limited BOOLEAN DEFAULT true,
        is_featured BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      );
    `);

    // 2. Create table `collection_items`
    await client.query(`
      CREATE TABLE IF NOT EXISTS collection_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        custom_role VARCHAR(100) DEFAULT 'Tác Phẩm Chủ Đạo',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      );
    `);

    console.log('✅ Created tables `collections` and `collection_items` successfully.');

    // 3. Seed 3 Curated HS Exclusive Haute Couture Collections
    // BST 01: HS Nocturne Avant-Garde
    const c1 = await client.query(`
      INSERT INTO collections (name, slug, theme_tag, season, manifesto, main_image, detail_image, audio_aesthetic, swatches, is_limited, is_featured, status)
      VALUES (
        'HS Atelier Capsule 01: Nocturne Streetwear Avant-Garde',
        'hs-nocturne-avant-garde',
        'THEME 01 / HS PRIVATE ARCHIVE',
        'AUTUMN / WINTER 2026',
        'Sự giao thoa độc bản giữa kỹ nghệ may đo thủ công Savile Row và tinh thần đường phố đương đại của HS Atelier. Thân áo dạ dệt mật độ cao phối da cao cấp, tôn vinh phong thái tự do của người mặc.',
        'https://res.cloudinary.com/dge8dkqyt/image/upload/v1766845582/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Teelab%20Preppy%20Varsity%20Jacket/qnwsrzcul44aefve3y3y.webp',
        'https://res.cloudinary.com/dge8dkqyt/image/upload/v1766843205/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20Da%20DANTE%20%C4%90eo%20Ch%C3%A9o%20D%E1%BA%ADp%20Ch%C3%ACm/wh4k9zuw1y9gfdyso7sx.webp',
        'HS ATELIER SOUNDSCAPE • 02:15 AM • MIDNIGHT STRINGS',
        '[
          {"name": "Midnight Navy", "hex": "#1B2A47", "material": "Heavyweight Varsity Wool"},
          {"name": "Obsidian Leather", "hex": "#141414", "material": "Embossed Calfskin"},
          {"name": "Raw Indigo", "hex": "#2C3E50", "material": "12oz Selvedge Denim"}
        ]'::jsonb,
        true,
        true,
        'active'
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        manifesto = EXCLUDED.manifesto,
        main_image = EXCLUDED.main_image,
        detail_image = EXCLUDED.detail_image,
        swatches = EXCLUDED.swatches
      RETURNING id;
    `);
    const c1Id = c1.rows[0].id;

    await client.query(`DELETE FROM collection_items WHERE collection_id = $1`, [c1Id]);
    await client.query(`
      INSERT INTO collection_items (collection_id, product_id, custom_role, sort_order)
      VALUES
        ($1, 'eca6636e-a344-45e8-92c8-bd6f9127bee8', 'Áo Khoác Dạ Phối Da', 1),
        ($1, '004ca463-3862-4b7b-93a6-41e41250ecb7', 'Quần Jeans Slim Fit', 2),
        ($1, 'bbe869f0-96c0-41a8-a2b5-eb9d3b38dd4d', 'Túi Da Đeo Chéo DANTE', 3);
    `, [c1Id]);

    // BST 02: HS Sculptural Leatherette & Silk
    const c2 = await client.query(`
      INSERT INTO collections (name, slug, theme_tag, season, manifesto, main_image, detail_image, audio_aesthetic, swatches, is_limited, is_featured, status)
      VALUES (
        'HS Atelier Capsule 02: Sculptural Leather & Champagne Luxe',
        'hs-sculptural-leather-luxe',
        'THEME 02 / MODERN BESPOKE',
        'TIMELESS CAPSULE 2026',
        'Tôn vinh vẻ đẹp nguyên bản của quý cô hiện đại qua những đường cắt hình học sắc sảo, chất liệu da PU độc quyền xử lý vân tự nhiên chống xước và phụ kiện chuỗi xích mạ tĩnh điện tinh xảo.',
        'https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737314/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS/iougp1lrl6mbwijqml8a.webp',
        'https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834439/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20n%E1%BB%AF%20cao%20c%E1%BA%A5p%20ph%E1%BB%9Fi%20x%C3%ADch/jhljqmczhqc5odys6csd.webp',
        'HS ATELIER PARIS • WARM ACOUSTIC RESIDUAL',
        '[
          {"name": "Noir Obsidian", "hex": "#121212", "material": "PU Grain Leather"},
          {"name": "Champagne Gold", "hex": "#D4AF37", "material": "Electroplated Alloy"},
          {"name": "Ivory Silk", "hex": "#F5F2EB", "material": "Mulberry Silk 22 Momme"}
        ]'::jsonb,
        true,
        true,
        'active'
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        manifesto = EXCLUDED.manifesto,
        main_image = EXCLUDED.main_image,
        detail_image = EXCLUDED.detail_image,
        swatches = EXCLUDED.swatches
      RETURNING id;
    `);
    const c2Id = c2.rows[0].id;

    await client.query(`DELETE FROM collection_items WHERE collection_id = $1`, [c2Id]);
    await client.query(`
      INSERT INTO collection_items (collection_id, product_id, custom_role, sort_order)
      VALUES
        ($1, 'b486bb46-094f-4e92-9543-fb12aaa640fc', 'Túi Quai Xích Lea Chain', 1),
        ($1, 'b498eac7-3002-41e0-bbe6-f0c7763bee25', 'Áo Khoác Denim Vintage', 2),
        ($1, '65595694-dc73-40b5-b1e9-b7663e86b027', 'Kính Mắt Lilywear', 3);
    `, [c2Id]);

    // BST 03: HS Sartorial Raw Linen & Monogram Heritage
    const c3 = await client.query(`
      INSERT INTO collections (name, slug, theme_tag, season, manifesto, main_image, detail_image, audio_aesthetic, swatches, is_limited, is_featured, status)
      VALUES (
        'HS Atelier Capsule 03: Sartorial Raw Linen & Monogram Heritage',
        'hs-sartorial-raw-linen',
        'THEME 03 / HERITAGE ARCHIVE',
        'SUMMER / RESORT 2026',
        'Khắc họa tinh thần phóng khoáng của phong cách Quý tộc Địa Trung Hải. Sợi đũi dệt thô mộc thoáng khí kết hợp cùng họa tiết Monogram tráng phủ cổ điển, bền bỉ qua năm tháng.',
        'https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832519/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i/kx3xxawz4wtc03r5te37.webp',
        'https://res.cloudinary.com/dge8dkqyt/image/upload/v1766842849/fashion_ecommerce/product/Tr%E1%BB%91ng%20Da%20%C4%90eo%20Ch%C3%A9o%20Nam%20Monogram%20Keepal/f2iwmmprm3fyqeb0mm0y.webp',
        'HS MEDITERRANEAN RESORT • BREEZE & GUITAR',
        '[
          {"name": "Raw Linen Cream", "hex": "#EFECE6", "material": "100% Organic Flax Linen"},
          {"name": "Desert Khaki", "hex": "#C2B280", "material": "Combed Chino Twill"},
          {"name": "Monogram Coated", "hex": "#3A2A1A", "material": "Waterproof Coated Canvas"}
        ]'::jsonb,
        true,
        true,
        'active'
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        manifesto = EXCLUDED.manifesto,
        main_image = EXCLUDED.main_image,
        detail_image = EXCLUDED.detail_image,
        swatches = EXCLUDED.swatches
      RETURNING id;
    `);
    const c3Id = c3.rows[0].id;

    await client.query(`DELETE FROM collection_items WHERE collection_id = $1`, [c3Id]);
    await client.query(`
      INSERT INTO collection_items (collection_id, product_id, custom_role, sort_order)
      VALUES
        ($1, '2796f05d-c729-48bd-983e-8e3d48923fe2', 'Áo Sơ Mi Đũi Thô Mộc', 1),
        ($1, '6bed6005-f417-4c9e-ac03-94f8e8928f56', 'Quần Chino Khaki 7 Inch', 2),
        ($1, 'febe7db9-7a6f-4e7a-8167-ee7a816ade5c', 'Trống Da Monogram Keepal', 3);
    `, [c3Id]);

    await client.query('COMMIT');
    console.log('🎉 Seeded 3 Curated HS Exclusive Collections successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed setting up collections schema:', err);
  } finally {
    client.release();
    pool.end();
  }
}

setupCollectionsTables();

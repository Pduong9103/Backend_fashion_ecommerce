require('dotenv').config();
const pool = require('../config/db');

async function setupComboTables() {
  console.log('🚀 Setting up Combo & BOM (Bill of Materials) schema...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create table `combos`
    await client.query(`
      CREATE TABLE IF NOT EXISTS combos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        code VARCHAR(100) UNIQUE,
        description TEXT,
        discount_percent NUMERIC(5,2) DEFAULT 10.00,
        fixed_price NUMERIC(15,2),
        image_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      );
    `);

    // 2. Create table `combo_items` (BOM components)
    await client.query(`
      CREATE TABLE IF NOT EXISTS combo_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1,
        is_required BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      );
    `);

    console.log('✅ Created tables `combos` and `combo_items` successfully.');

    // 3. Seed Master Curated Combos
    // Combo 1: Lookbook Heritage Streetwear Set
    const combo1Res = await client.query(`
      INSERT INTO combos (name, code, description, discount_percent, image_url, status)
      VALUES (
        'Set Lookbook Heritage Preppy & Leather',
        'COMBO-HERITAGE-01',
        'Bộ sưu tập phối đồ Haute Couture gồm Áo khoác Varsity Teelab + Quần Tây Vintino + Trống Da Monogram Keepal. Chiết khấu combo 10%.',
        10.00,
        'https://res.cloudinary.com/dge8dkqyt/image/upload/v1766845582/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Teelab%20Preppy%20Varsity%20Jacket/qnwsrzcul44aefve3y3y.webp',
        'active'
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        discount_percent = EXCLUDED.discount_percent,
        image_url = EXCLUDED.image_url
      RETURNING id;
    `);
    const combo1Id = combo1Res.rows[0].id;

    // Add BOM items for Combo 1
    await client.query(`DELETE FROM combo_items WHERE combo_id = $1`, [combo1Id]);
    await client.query(`
      INSERT INTO combo_items (combo_id, product_id, quantity)
      VALUES 
        ($1, 'eca6636e-a344-45e8-92c8-bd6f9127bee8', 1), -- Áo Khoác Teelab Varsity
        ($1, 'a91d7f6d-2c7a-4195-9a6f-09bf59bfe297', 1), -- Quần Copper Denim OG Slim
        ($1, 'febe7db9-7a6f-4e7a-8167-ee7a816ade5c', 1);  -- Trống Da Keepal
    `, [combo1Id]);

    // Combo 2: Parisian Minimalist Linen Set
    const combo2Res = await client.query(`
      INSERT INTO combos (name, code, description, discount_percent, image_url, status)
      VALUES (
        'Set Quý Tộc Sartorial Linen & Dante Leather',
        'COMBO-SARTORIAL-02',
        'Bộ phối đồ phong cách Địa Trung Hải gồm Áo Sơ Mi Vải Đũi + Quần Chino Nam + Túi Xách Da DANTE. Chiết khấu combo 10%.',
        10.00,
        'https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832519/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i/kx3xxawz4wtc03r5te37.webp',
        'active'
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        discount_percent = EXCLUDED.discount_percent,
        image_url = EXCLUDED.image_url
      RETURNING id;
    `);
    const combo2Id = combo2Res.rows[0].id;

    // Add BOM items for Combo 2
    await client.query(`DELETE FROM combo_items WHERE combo_id = $1`, [combo2Id]);
    await client.query(`
      INSERT INTO combo_items (combo_id, product_id, quantity)
      VALUES 
        ($1, '2796f05d-c729-48bd-983e-8e3d48923fe2', 1), -- Áo Sơ Mi Nam Vải Đũi
        ($1, '6bed6005-f417-4c9e-ac03-94f8e8928f56', 1), -- Quần Chino Nam 7 Inch
        ($1, 'bbe869f0-96c0-41a8-a2b5-eb9d3b38dd4d', 1);  -- Túi Xách Da DANTE
    `, [combo2Id]);

    await client.query('COMMIT');
    console.log('🎉 Seeded 2 Curated Master Combos with BOM item structure successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed setting up combo BOM tables:', err);
  } finally {
    client.release();
    pool.end();
  }
}

setupComboTables();

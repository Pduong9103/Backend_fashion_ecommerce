const pool = require('../config/db');

async function syncVariants() {
  const client = await pool.connect();
  try {
    console.log('Connecting to database...');

    // 1. Get or create default warehouse
    let whRes = await client.query('SELECT * FROM warehouses ORDER BY is_default DESC, created_at ASC LIMIT 1');
    let warehouse;
    if (whRes.rows.length === 0) {
      const insWh = await client.query(`
        INSERT INTO warehouses (code, name, address, phone, is_active, is_default)
        VALUES ('KHO-TONG-HN', 'Kho Tổng Hà Nội - HS Atelier', 'Tầng 3, Tòa Nhà May Đo Atelier, Hà Nội', '0901234567', true, true)
        RETURNING *
      `);
      warehouse = insWh.rows[0];
      console.log('Created default warehouse:', warehouse.name);
    } else {
      warehouse = whRes.rows[0];
      console.log('Using existing warehouse:', warehouse.name, `(${warehouse.code})`);
    }

    // 2. Fetch all product_variants with their product names
    const variantsRes = await client.query(`
      SELECT pv.id as variant_id, pv.sku, pv.color_name, pv.stock_qty, p.name as product_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
    `);

    console.log(`Found ${variantsRes.rows.length} product variants across all products.`);

    let createdCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < variantsRes.rows.length; i++) {
      const v = variantsRes.rows[i];
      const initialStock = Number(v.stock_qty) || 50;
      const binLoc = `KE-A${(i % 5) + 1}-T${(i % 3) + 1}`;
      const skuVal = v.sku || `SKU-${v.variant_id.slice(0, 8).toUpperCase()}`;

      const res = await client.query(`
        INSERT INTO inventory_stocks (warehouse_id, variant_id, sku, on_hand_qty, allocated_qty, available_qty, min_alert_qty, bin_location, updated_at)
        VALUES ($1, $2, $3, $4, 0, $4, 5, $5, NOW())
        ON CONFLICT (warehouse_id, variant_id) DO UPDATE
        SET sku = EXCLUDED.sku,
            on_hand_qty = CASE WHEN inventory_stocks.on_hand_qty = 0 THEN EXCLUDED.on_hand_qty ELSE inventory_stocks.on_hand_qty END,
            available_qty = CASE WHEN inventory_stocks.available_qty = 0 THEN EXCLUDED.available_qty ELSE inventory_stocks.available_qty END,
            bin_location = COALESCE(inventory_stocks.bin_location, EXCLUDED.bin_location),
            updated_at = NOW()
        RETURNING id
      `, [warehouse.id, v.variant_id, skuVal, initialStock, binLoc]);

      createdCount++;
    }

    console.log(`✅ Synced ${createdCount} product variants into inventory_stocks for warehouse ${warehouse.name}!`);

    // 3. Count total in inventory_stocks
    const totalRes = await client.query('SELECT count(*) FROM inventory_stocks');
    console.log('Total records in inventory_stocks:', totalRes.rows[0].count);

  } catch (err) {
    console.error('Error syncing variants:', err);
  } finally {
    client.release();
    pool.end();
  }
}

syncVariants();

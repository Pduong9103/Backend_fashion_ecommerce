const prisma = require('../config/prisma');
const { execSync } = require('child_process');

async function seedFullWms() {
  try {
    console.log('1. Fetching all products & variants from main database...');
    const products = await prisma.products.findMany({
      include: {
        product_variants: true,
        categories: true,
        suppliers: true,
      },
    });

    console.log(`Found ${products.length} products in main database.`);

    // 2. Prepare SQL statements for Docker Postgres
    const statements = [];

    // Ensure Warehouse exists
    statements.push(`
      INSERT INTO warehouses (id, code, name, address, phone, is_active, is_default)
      VALUES ('f1c0d9c7-8e8a-41c8-841a-bbf617d08db8', 'KHO-TONG-HN', 'Kho Tổng Hà Nội - HS Atelier', 'Tầng 3, Tòa Nhà May Đo Atelier, Hà Nội', '0901234567', true, true)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, is_default = true;
    `);

    let count = 0;
    for (const p of products) {
      for (let vi = 0; vi < p.product_variants.length; vi++) {
        const v = p.product_variants[vi];
        const stockQty = Number(v.stock_qty) || 50;
        const binLoc = `KE-A${(count % 6) + 1}-T${(count % 4) + 1}`;
        const cleanSku = (v.sku || `${p.name}-${v.color_name}-${vi + 1}`).replace(/'/g, "''");

        statements.push(`
          INSERT INTO inventory_stocks (warehouse_id, variant_id, sku, on_hand_qty, allocated_qty, available_qty, min_alert_qty, bin_location, updated_at)
          VALUES ('f1c0d9c7-8e8a-41c8-841a-bbf617d08db8', '${v.id}', '${cleanSku}', ${stockQty}, 0, ${stockQty}, 5, '${binLoc}', NOW())
          ON CONFLICT (warehouse_id, variant_id) DO UPDATE
          SET sku = EXCLUDED.sku,
              on_hand_qty = EXCLUDED.on_hand_qty,
              available_qty = EXCLUDED.available_qty,
              bin_location = EXCLUDED.bin_location,
              updated_at = NOW();
        `);
        count++;
      }
    }

    console.log(`Prepared ${count} variant stock entries. Executing into Docker PostgreSQL...`);

    const sqlContent = statements.join('\n');
    execSync('docker exec -i fashion_postgres psql -U postgres -d fashion_ecommerce', {
      input: sqlContent,
      encoding: 'utf-8',
    });

    console.log(`✅ Successfully seeded ${count} variants into inventory_stocks!`);

    // Verify
    const checkOut = execSync('docker exec fashion_postgres psql -U postgres -d fashion_ecommerce -c "SELECT count(*) FROM inventory_stocks;"', {
      encoding: 'utf-8',
    });
    console.log('Result count in inventory_stocks:', checkOut);

  } catch (err) {
    console.error('Error seeding WMS inventory:', err);
  } finally {
    await prisma.$disconnect();
  }
}

seedFullWms();

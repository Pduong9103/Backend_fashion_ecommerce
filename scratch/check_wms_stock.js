const prisma = require('../config/prisma');

async function main() {
  const products = await prisma.products.findMany({
    include: { product_variants: true }
  });
  console.log('Total products:', products.length);
  for (const p of products) {
    console.log('-', p.name, 'Variants:', p.product_variants.map(v => ({ id: v.id, sku: v.sku, color: v.color_name, stock: v.stock_qty })));
  }

  const stocks = await prisma.inventory_stocks.findMany({
    include: { warehouse: true }
  });
  console.log('\nTotal inventory_stocks in WMS table:', stocks.length);
  for (const s of stocks) {
    console.log('Stock ID:', s.id, 'SKU:', s.sku, 'Warehouse:', s.warehouse?.name, 'on_hand:', s.on_hand_qty, 'avail:', s.available_qty);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

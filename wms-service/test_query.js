const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const stocks = await prisma.inventory_stocks.findMany({ take: 2 });
  const variantIds = stocks.map(s => s.variant_id);
  console.log('variantIds:', variantIds);
  try {
    const vd = await prisma.$queryRawUnsafe(
      `SELECT pv.id as variant_id, pv.color_name, pv.sizes, p.name as product_name
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       WHERE pv.id IN ('${variantIds.join("','")}')`
    );
    console.log('Result:', vd);
  } catch (e) {
    console.error('Raw query error:', e);
  }
  await prisma.$disconnect();
}

test();

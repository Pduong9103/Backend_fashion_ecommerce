const prisma = require('./config/prisma');
const stockService = require('./services/stockService');

async function testSupplierStocks() {
  try {
    const suppliers = await prisma.$queryRawUnsafe(`SELECT id, name FROM suppliers`);
    console.log('Suppliers in DB:', suppliers);

    const products = await prisma.$queryRawUnsafe(`SELECT id, name, supplier_id FROM products LIMIT 10`);
    console.log('Sample Products in DB:', products);

    for (const sup of suppliers) {
      const res = await stockService.getStocks({ supplierId: sup.id });
      console.log(`Stocks for supplier ${sup.name} (${sup.id}):`, res.data.length, 'items');
      if (res.data.length > 0) {
        console.log('Sample item:', res.data[0].product_name, res.data[0].supplier_name);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testSupplierStocks();

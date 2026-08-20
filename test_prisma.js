const prisma = require('./config/prisma');

async function main() {
  try {
    const userCount = await prisma.users.count();
    const productCount = await prisma.products.count();
    console.log('✅ Prisma connected to database successfully!');
    console.log(`📊 Statistics: ${userCount} users, ${productCount} products found.`);
  } catch (error) {
    console.error('❌ Prisma connection error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

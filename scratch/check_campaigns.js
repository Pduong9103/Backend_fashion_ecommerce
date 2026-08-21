const prisma = require('../config/prisma');

async function main() {
  const campaigns = await prisma.flash_sale_campaigns.findMany({
    orderBy: { created_at: 'desc' }
  });
  console.log(JSON.stringify(campaigns, null, 2));
}

main().finally(() => prisma.$disconnect());

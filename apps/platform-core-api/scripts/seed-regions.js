const { PrismaClient } = require('@prisma/client');

// Turkey's 7 traditional geographical regions, used as the platform's flat region list.
const regions = [
  'Marmara',
  'Ege',
  'Akdeniz',
  'Ic Anadolu',
  'Karadeniz',
  'Dogu Anadolu',
  'Guneydogu Anadolu',
];

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/platform_core_test' },
    },
  });

  for (const name of regions) {
    await prisma.region.upsert({
      where: { id: name },
      update: {},
      create: {
        id: name,
        name,
        regionType: 'ZONE',
        country: 'Turkiye',
        status: 'ACTIVE',
      },
    });
  }

  const count = await prisma.region.count();
  console.log(`Region seed complete. Total regions: ${count}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});

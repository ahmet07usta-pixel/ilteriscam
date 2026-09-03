// Seeds Turkey's 81 provinces (il) as CITY-type Region records, nested under the 7 existing ZONE regions.
// Must run AFTER seed-regions.js (which creates the 7 zones this script looks up by name).
const { PrismaClient } = require('@prisma/client');

// Standard 7-region -> il classification (Turkish MEB/TUIK grouping), 81 il total.
const PROVINCES_BY_ZONE = {
  Marmara: [
    'Istanbul', 'Kirklareli', 'Edirne', 'Tekirdag', 'Canakkale', 'Balikesir', 'Bursa', 'Yalova', 'Kocaeli', 'Sakarya', 'Bilecik',
  ],
  Ege: [
    'Izmir', 'Manisa', 'Aydin', 'Denizli', 'Mugla', 'Usak', 'Kutahya', 'Afyonkarahisar',
  ],
  Akdeniz: [
    'Antalya', 'Isparta', 'Burdur', 'Mersin', 'Adana', 'Osmaniye', 'Hatay', 'Kahramanmaras',
  ],
  'Ic Anadolu': [
    'Ankara', 'Konya', 'Kayseri', 'Sivas', 'Yozgat', 'Cankiri', 'Kirikkale', 'Kirsehir', 'Nevsehir', 'Nigde', 'Aksaray', 'Karaman', 'Eskisehir',
  ],
  Karadeniz: [
    'Zonguldak', 'Bartin', 'Karabuk', 'Kastamonu', 'Sinop', 'Samsun', 'Corum', 'Amasya', 'Tokat', 'Ordu', 'Giresun', 'Trabzon', 'Rize', 'Artvin', 'Gumushane', 'Bayburt', 'Bolu', 'Duzce',
  ],
  'Dogu Anadolu': [
    'Erzurum', 'Erzincan', 'Kars', 'Ardahan', 'Igdir', 'Agri', 'Van', 'Mus', 'Bitlis', 'Hakkari', 'Malatya', 'Elazig', 'Tunceli', 'Bingol',
  ],
  'Guneydogu Anadolu': [
    'Gaziantep', 'Kilis', 'Sanliurfa', 'Adiyaman', 'Diyarbakir', 'Mardin', 'Siirt', 'Sirnak', 'Batman',
  ],
};

async function main() {
  const prisma = new PrismaClient();

  let created = 0;
  for (const [zoneName, provinces] of Object.entries(PROVINCES_BY_ZONE)) {
    const zone = await prisma.region.findUnique({ where: { id: zoneName } });
    if (!zone) {
      throw new Error(`Zone "${zoneName}" not found - run seed-regions.js first`);
    }

    for (const provinceName of provinces) {
      await prisma.region.upsert({
        where: { id: provinceName },
        update: { parentRegionId: zone.id },
        create: {
          id: provinceName,
          name: provinceName,
          regionType: 'CITY',
          parentRegionId: zone.id,
          country: 'Turkiye',
          city: provinceName,
          status: 'ACTIVE',
        },
      });
      created += 1;
    }
  }

  const total = await prisma.region.count();
  console.log(`Province seed complete. Provinces upserted: ${created}. Total regions (zones + provinces): ${total}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});

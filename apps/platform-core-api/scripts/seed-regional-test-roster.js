// One-off reset + realistic multi-region seed for full-system live testing.
// 1) Wipes all transactional/business data and ad-hoc test companies/users (keeps admin + synthetic Playwright fixtures).
// 2) Creates 21 fictional glass-producer companies (3 per Turkish region) with users + a starter price catalog.
// 3) Creates 10 fictional buyer companies spread across regions with users.
const { PrismaClient, Role, CompanyType, CompanyStatus, MeasurementUnit, PriceCatalogStatus } = require('@prisma/client');
const bcrypt = require('bcrypt');

const KEEP_COMPANY_NAMES = ['Synthetic Alpha Holdings', 'Synthetic Beta Partners'];
const KEEP_USER_EMAILS = ['admin@platform.local', 'synthetic-admin@localhost', 'synthetic-user-a@localhost', 'synthetic-user-b@localhost'];

const PRODUCER_PASSWORD = 'Uretici2026!';
const BUYER_PASSWORD = 'Alici2026!';

const PRODUCERS = [
  { region: 'Marmara', legalName: 'Bogazici Cam Sanayi A.S.' },
  { region: 'Marmara', legalName: 'Kocaeli Yapi Cam Ltd. Sti.' },
  { region: 'Marmara', legalName: 'Marmara Ekiz Cam Ticaret A.S.' },
  { region: 'Ege', legalName: 'Ege Kristal Cam Sanayi A.S.' },
  { region: 'Ege', legalName: 'Izmir Vega Cam Ltd. Sti.' },
  { region: 'Ege', legalName: 'Menderes Cam ve Yapi A.S.' },
  { region: 'Akdeniz', legalName: 'Akdeniz Mavi Cam Sanayi A.S.' },
  { region: 'Akdeniz', legalName: 'Toroslar Cam Ltd. Sti.' },
  { region: 'Akdeniz', legalName: 'Cukurova Cam Ticaret A.S.' },
  { region: 'Ic Anadolu', legalName: 'Baskent Cam Sanayi A.S.' },
  { region: 'Ic Anadolu', legalName: 'Ankara Yildiz Cam Ltd. Sti.' },
  { region: 'Ic Anadolu', legalName: 'Konya Ovasi Cam A.S.' },
  { region: 'Karadeniz', legalName: 'Karadeniz Inci Cam Sanayi A.S.' },
  { region: 'Karadeniz', legalName: 'Samsun Yesil Cam Ltd. Sti.' },
  { region: 'Karadeniz', legalName: 'Trabzon Sahil Cam A.S.' },
  { region: 'Dogu Anadolu', legalName: 'Erzurum Dag Cam Sanayi A.S.' },
  { region: 'Dogu Anadolu', legalName: 'Van Golu Cam Ltd. Sti.' },
  { region: 'Dogu Anadolu', legalName: 'Dogu Anadolu Cam Ticaret A.S.' },
  { region: 'Guneydogu Anadolu', legalName: 'Guneydogu Firat Cam Sanayi A.S.' },
  { region: 'Guneydogu Anadolu', legalName: 'Diyarbakir Sur Cam Ltd. Sti.' },
  { region: 'Guneydogu Anadolu', legalName: 'Gaziantep Zeytin Cam A.S.' },
];

const BUYERS = [
  { region: 'Marmara', legalName: 'Yildiz Pencere Sistemleri Ltd. Sti.', companyType: CompanyType.PVC },
  { region: 'Marmara', legalName: 'Bogaz Cephe ve Cam Balkon Ltd. Sti.', companyType: CompanyType.BALCONY },
  { region: 'Ege', legalName: 'Izmir Aluminyum Dograma San. Tic. A.S.', companyType: CompanyType.ALUMINUM },
  { region: 'Ege', legalName: 'Menderes Mobilya ve Cam Ltd. Sti.', companyType: CompanyType.FURNITURE },
  { region: 'Akdeniz', legalName: 'Akdeniz Mobilya ve Dekorasyon Ltd. Sti.', companyType: CompanyType.FURNITURE },
  { region: 'Akdeniz', legalName: 'Antalya Cam Balkon Sistemleri Ltd. Sti.', companyType: CompanyType.BALCONY },
  { region: 'Ic Anadolu', legalName: 'Baskent Pencere ve Kapi Sistemleri A.S.', companyType: CompanyType.PVC },
  { region: 'Karadeniz', legalName: 'Karadeniz Yapi Market Ltd. Sti.', companyType: CompanyType.OTHER },
  { region: 'Dogu Anadolu', legalName: 'Erzurum Aluminyum Sistemleri Ltd. Sti.', companyType: CompanyType.ALUMINUM },
  { region: 'Guneydogu Anadolu', legalName: 'Gaziantep Dograma ve Cephe Ltd. Sti.', companyType: CompanyType.ALUMINUM },
];

const CATALOG_TEMPLATE = [
  { code: 'ISICAM', productType: 'Isıcam', basePrice: 1400 },
  { code: 'TEMPERLI', productType: 'Temperli Cam', basePrice: 1200 },
  { code: 'LAMINE', productType: 'Lamine Cam', basePrice: 1600 },
  { code: 'BUZLU', productType: 'Buzlu Cam', basePrice: 1300 },
  { code: 'DUZCAM', productType: 'Düz Cam', basePrice: 800 },
  { code: 'AYNA', productType: 'Ayna', basePrice: 1100 },
  { code: 'FUME', productType: 'Füme Cam', basePrice: 950 },
  { code: 'SEFFAF', productType: 'Şeffaf Cam', basePrice: 850 },
  { code: 'BRONZ', productType: 'Bronz Cam', basePrice: 1000 },
  { code: 'BUZLUISI', productType: 'Buzlu Isıcam', basePrice: 1550 },
  { code: 'FUMETEMP', productType: 'Füme Temperli Cam', basePrice: 1450 },
  { code: 'ISICIFT', productType: 'Isıcam / Çift Cam', basePrice: 1400 },
];

function jitteredPrice(base, seed) {
  const factor = 0.9 + (seed % 21) / 100; // 0.90x - 1.10x, deterministic per index
  return Math.round((base * factor) / 10) * 10;
}

async function wipeTransactionalData(prisma) {
  await prisma.measurementReview.deleteMany({});
  await prisma.quotationItem.deleteMany({});
  await prisma.shipment.deleteMany({});
  await prisma.production.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.quotationCalculation.deleteMany({});
  await prisma.quotation.deleteMany({});
  await prisma.detectedMeasurement.deleteMany({});
  await prisma.analysisResult.deleteMany({});
  await prisma.analysisJob.deleteMany({});
  await prisma.attachment.deleteMany({});
  await prisma.requestItem.deleteMany({});
  await prisma.requestRecipient.deleteMany({});
  await prisma.request.deleteMany({});
  await prisma.priceRegionalAdjustment.deleteMany({});
  await prisma.priceCatalogItem.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.manufacturerCustomer.deleteMany({});
  await prisma.auditLog.deleteMany({});
}

async function wipeAdHocCompaniesAndUsers(prisma) {
  await prisma.company.deleteMany({ where: { legalName: { notIn: KEEP_COMPANY_NAMES } } });
  await prisma.user.deleteMany({ where: { email: { notIn: KEEP_USER_EMAILS } } });
}

async function createProducer(prisma, spec, index) {
  const passwordHash = await bcrypt.hash(PRODUCER_PASSWORD, 12);
  const email = `uretici${index + 1}@test.local`;

  const company = await prisma.company.create({
    data: {
      legalName: spec.legalName,
      tradeName: spec.legalName,
      companyType: CompanyType.GLASS_PRODUCER,
      regionId: spec.region,
      status: CompanyStatus.ACTIVE,
      activatedAt: new Date(),
      contactEmail: email,
      contactPhone: `+9053000${String(index + 1).padStart(5, '0')}`,
      taxNumber: `2${String(index + 1).padStart(9, '0')}`,
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      fullName: `${spec.legalName} Yetkilisi`,
      passwordHash,
      role: Role.PRODUCER,
      isActive: true,
      permissions: [],
    },
  });

  await prisma.companyUserMembership.create({
    data: { companyId: company.id, userId: user.id, role: 'OWNER' },
  });

  for (const item of CATALOG_TEMPLATE) {
    await prisma.priceCatalogItem.create({
      data: {
        companyId: company.id,
        productCode: item.code,
        productType: item.productType,
        baseUnit: MeasurementUnit.M2,
        unitPrice: jitteredPrice(item.basePrice, index + item.code.length),
        currency: 'TRY',
        defaultWasteRate: 0,
        defaultDiscountRate: 0,
        status: PriceCatalogStatus.ACTIVE,
      },
    });
  }

  return { email, password: PRODUCER_PASSWORD, legalName: spec.legalName, region: spec.region };
}

async function createBuyer(prisma, spec, index) {
  const passwordHash = await bcrypt.hash(BUYER_PASSWORD, 12);
  const email = `alici${index + 1}@test.local`;

  const company = await prisma.company.create({
    data: {
      legalName: spec.legalName,
      tradeName: spec.legalName,
      companyType: spec.companyType,
      regionId: spec.region,
      status: CompanyStatus.ACTIVE,
      activatedAt: new Date(),
      contactEmail: email,
      contactPhone: `+9054000${String(index + 1).padStart(5, '0')}`,
      taxNumber: `3${String(index + 1).padStart(9, '0')}`,
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      fullName: `${spec.legalName} Yetkilisi`,
      passwordHash,
      role: Role.SALES,
      isActive: true,
      permissions: [],
    },
  });

  await prisma.companyUserMembership.create({
    data: { companyId: company.id, userId: user.id, role: 'OWNER' },
  });

  return { email, password: BUYER_PASSWORD, legalName: spec.legalName, region: spec.region };
}

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/platform_core_test' } },
  });

  console.log('Wiping transactional data...');
  await wipeTransactionalData(prisma);
  console.log('Wiping ad-hoc companies/users...');
  await wipeAdHocCompaniesAndUsers(prisma);

  console.log('Creating producers...');
  const producers = [];
  for (let i = 0; i < PRODUCERS.length; i += 1) {
    producers.push(await createProducer(prisma, PRODUCERS[i], i));
  }

  console.log('Creating buyers...');
  const buyers = [];
  for (let i = 0; i < BUYERS.length; i += 1) {
    buyers.push(await createBuyer(prisma, BUYERS[i], i));
  }

  console.log(JSON.stringify({ producers, buyers }, null, 2));
  await prisma.$disconnect();
}

void main();

const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcrypt');

const syntheticAuthFixture = {
  admin: {
    email: process.env.SYNTHETIC_ADMIN_EMAIL ?? 'synthetic-admin@localhost',
    password: process.env.SYNTHETIC_ADMIN_PASSWORD ?? 'Admin123',
  },
  userA: {
    email: process.env.SYNTHETIC_USER_A_EMAIL ?? 'synthetic-user-a@localhost',
    password: process.env.SYNTHETIC_USER_A_PASSWORD ?? 'Buyer123',
  },
  userB: {
    email: process.env.SYNTHETIC_USER_B_EMAIL ?? 'synthetic-user-b@localhost',
    password: process.env.SYNTHETIC_USER_B_PASSWORD ?? 'Buyer456',
  },
};

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/platform_core_test' },
    },
  });

  const adminEmail = syntheticAuthFixture.admin.email;
  const adminPassword = syntheticAuthFixture.admin.password;
  const userAEmail = syntheticAuthFixture.userA.email;
  const userAPassword = syntheticAuthFixture.userA.password;
  const userBEmail = syntheticAuthFixture.userB.email;
  const userBPassword = syntheticAuthFixture.userB.password;

  const companyAName = 'Synthetic Alpha Holdings';
  const companyBName = 'Synthetic Beta Partners';

  await prisma.companyUserMembership.deleteMany({
    where: {
      user: {
        email: {
          in: [adminEmail, userAEmail, userBEmail],
        },
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: {
        in: [adminEmail, userAEmail, userBEmail],
      },
    },
  });

  await prisma.company.deleteMany({
    where: {
      legalName: {
        in: [companyAName, companyBName],
      },
    },
  });

  const companyA = await prisma.company.create({
    data: {
      legalName: companyAName,
      tradeName: 'Synthetic Alpha',
      companyType: 'OTHER',
      status: 'ACTIVE',
      contactEmail: 'alpha@synthetic.local',
      contactPhone: '+905300000010',
      taxNumber: '1000000001',
    },
  });

  const companyB = await prisma.company.create({
    data: {
      legalName: companyBName,
      tradeName: 'Synthetic Beta',
      companyType: 'OTHER',
      status: 'ACTIVE',
      contactEmail: 'beta@synthetic.local',
      contactPhone: '+905300000020',
      taxNumber: '1000000002',
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      fullName: 'Synthetic Admin',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: Role.ADMIN,
      isActive: true,
      permissions: ['auth.manage', 'users.read', 'users.manage', 'audit.read'],
    },
  });

  const userA = await prisma.user.create({
    data: {
      email: userAEmail,
      fullName: 'Synthetic User A',
      passwordHash: await bcrypt.hash(userAPassword, 12),
      role: Role.USER,
      isActive: true,
      permissions: ['users.read'],
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: userBEmail,
      fullName: 'Synthetic User B',
      passwordHash: await bcrypt.hash(userBPassword, 12),
      role: Role.USER,
      isActive: true,
      permissions: ['users.read'],
    },
  });

  await prisma.companyUserMembership.createMany({
    data: [
      { companyId: companyA.id, userId: admin.id, role: 'OWNER', status: 'ACTIVE' },
      { companyId: companyA.id, userId: userA.id, role: 'MEMBER', status: 'ACTIVE' },
      { companyId: companyB.id, userId: admin.id, role: 'OWNER', status: 'ACTIVE' },
      { companyId: companyB.id, userId: userB.id, role: 'MEMBER', status: 'ACTIVE' },
    ],
  });

  const seededFixture = {
    admin: { email: adminEmail, password: adminPassword },
    userA: { email: userAEmail, password: userAPassword, companyId: companyA.id },
    userB: { email: userBEmail, password: userBPassword, companyId: companyB.id },
    companyAId: companyA.id,
    companyBId: companyB.id,
  };

  console.log(JSON.stringify(seededFixture, null, 2));
  return seededFixture;
}

module.exports = { syntheticAuthFixture, seedSyntheticAuthFixture: main };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

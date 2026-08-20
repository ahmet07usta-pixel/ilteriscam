const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { Role } = require('@prisma/client');
const { UsersService } = require('./users.service.ts');
const { RbacService } = require('../rbac/rbac.service.ts');

const baseUser = {
  id: 'user-1',
  email: 'producer@example.invalid',
  phone: null,
  fullName: 'Staging Producer',
  role: Role.PRODUCER,
  permissions: null,
  isActive: true,
  createdAt: new Date('2026-08-10T00:00:00.000Z'),
  updatedAt: new Date('2026-08-10T00:00:00.000Z'),
};

function createService(user) {
  const prisma = {
    user: {
      findUnique: async () => ({ ...user, memberships: [] }),
    },
  };
  return new UsersService(prisma, new RbacService());
}

test('getPublicProfile resolves role-default permissions when the user has no custom overrides', async () => {
  const service = createService(baseUser);

  const profile = await service.getPublicProfile('user-1');

  assert.ok(Array.isArray(profile.permissions));
  assert.ok(profile.permissions.includes('quotations.read'));
  assert.ok(profile.permissions.includes('request-items.read'));
  assert.ok(profile.permissions.includes('attachments.read'));
});

test('getPublicProfile merges stored custom permissions with role defaults', async () => {
  const service = createService({ ...baseUser, permissions: ['manufacturer-customers.manage'] });

  const profile = await service.getPublicProfile('user-1');

  assert.ok(profile.permissions.includes('manufacturer-customers.manage'));
  assert.ok(profile.permissions.includes('quotations.read'));
});

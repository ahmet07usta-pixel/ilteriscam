const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } = require('@nestjs/common');
const { Prisma, Role } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { AuthService } = require('./auth.service.ts');

const producer = {
  id: 'producer-user',
  email: 'producer@example.invalid',
  phone: null,
  fullName: 'Staging Producer',
  role: Role.PRODUCER,
  permissions: null,
  isActive: true,
  refreshTokenHash: null,
  createdAt: new Date('2026-08-10T00:00:00.000Z'),
  updatedAt: new Date('2026-08-10T00:00:00.000Z'),
};

async function createService() {
  const writes = { refreshTokenHashes: [], audits: [] };
  const user = { ...producer, passwordHash: await bcrypt.hash('temporary-password', 4) };
  const usersService = {
    findByIdentifier: async () => user,
    updateRefreshTokenHash: async (...args) => writes.refreshTokenHashes.push(args),
  };
  const jwtService = {
    signAsync: async (payload) => payload.tokenType,
  };
  const config = {
    get: (key) => key === 'app.panelOriginRoles'
      ? {
          'https://admin.example.invalid': [Role.ADMIN],
          'https://operations.example.invalid': [Role.PRODUCER],
        }
      : undefined,
    getOrThrow: (key) => ({
      'auth.accessSecret': 'access-secret',
      'auth.refreshSecret': 'refresh-secret',
      'auth.accessTtl': '15m',
      'auth.refreshTtl': '7d',
    })[key],
  };
  const rbac = { resolvePermissions: () => ['productions.read'] };
  const audit = { record: async (entry) => writes.audits.push(entry) };
  const prisma = { companyUserMembership: { findFirst: async () => null } };

  return { service: new AuthService(usersService, jwtService, config, rbac, audit, prisma), writes };
}

test('allows a staging account to log in only from its assigned panel origin', async () => {
  const { service, writes } = await createService();

  const result = await service.login('producer@example.invalid', 'temporary-password', {
    origin: 'https://operations.example.invalid',
  });

  assert.equal(result.accessToken, 'access');
  assert.equal(writes.refreshTokenHashes.length, 1);
  assert.equal(writes.audits.length, 1);
});

test('rejects cross-panel login before token persistence or audit writes', async () => {
  const { service, writes } = await createService();

  await assert.rejects(
    service.login('producer@example.invalid', 'temporary-password', {
      origin: 'https://admin.example.invalid',
    }),
    UnauthorizedException,
  );

  assert.equal(writes.refreshTokenHashes.length, 0);
  assert.equal(writes.audits.length, 0);
});

test('allows trusted local frontend requests when the origin header is absent', async () => {
  const writes = { refreshTokenHashes: [], audits: [] };
  const user = { ...producer, passwordHash: await bcrypt.hash('temporary-password', 4) };
  const usersService = {
    findByIdentifier: async () => user,
    updateRefreshTokenHash: async (...args) => writes.refreshTokenHashes.push(args),
  };
  const jwtService = {
    signAsync: async (payload) => payload.tokenType,
  };
  const config = {
    get: (key) => {
      if (key === 'app.panelOriginRoles') {
        return { 'http://127.0.0.1:4177': [Role.PRODUCER] };
      }
      if (key === 'app.frontendOrigins') {
        return ['http://127.0.0.1:4177'];
      }
      return undefined;
    },
    getOrThrow: (key) => ({
      'auth.accessSecret': 'access-secret',
      'auth.refreshSecret': 'refresh-secret',
      'auth.accessTtl': '15m',
      'auth.refreshTtl': '7d',
    })[key],
  };
  const service = new AuthService(usersService, jwtService, config, { resolvePermissions: () => ['productions.read'] }, { record: async (entry) => writes.audits.push(entry) }, { companyUserMembership: { findFirst: async () => null } });

  const result = await service.login('producer@example.invalid', 'temporary-password', {});

  assert.equal(result.accessToken, 'access');
  assert.equal(writes.refreshTokenHashes.length, 1);
  assert.equal(writes.audits.length, 1);
});

test('blocks login for a user whose company is not yet activated by an admin', async () => {
  const { service, writes } = await createService();
  service.prisma = { companyUserMembership: { findFirst: async () => ({ company: { status: 'INACTIVE' } }) } };

  await assert.rejects(
    service.login('producer@example.invalid', 'temporary-password', {
      origin: 'https://operations.example.invalid',
    }),
    ForbiddenException,
  );

  assert.equal(writes.refreshTokenHashes.length, 0);
  assert.equal(writes.audits.length, 0);
});

test('sanitizes public profile responses and strips sensitive fields', async () => {
  const { service } = await createService();
  const user = { ...producer, passwordHash: 'hashed-password', refreshTokenHash: 'refresh-hash-value' };

  const profile = service.sanitizeUser(user);

  assert.equal(profile.passwordHash, undefined);
  assert.equal(profile.refreshTokenHash, undefined);
  assert.equal(profile.email, 'producer@example.invalid');
  assert.equal(profile.role, Role.PRODUCER);
});

test('changes password securely and records an audit event without exposing secrets', async () => {
  const { writes } = await createService();
  const user = { ...producer, passwordHash: await bcrypt.hash('temporary-password', 4) };
  const usersService = {
    findById: async () => user,
    findByIdentifier: async () => user,
    updateRefreshTokenHash: async (...args) => writes.refreshTokenHashes.push(args),
    updatePasswordHash: async (targetId, nextHash) => {
      user.passwordHash = nextHash;
      writes.refreshTokenHashes.push(['updatePassword', targetId, nextHash]);
    },
  };
  const serviceWithUser = new AuthService(usersService, { signAsync: async (payload) => payload.tokenType }, { get: () => undefined, getOrThrow: () => 'value' }, { resolvePermissions: () => ['productions.read'] }, { record: async (entry) => writes.audits.push(entry) });

  const result = await serviceWithUser.changePassword('producer-user', 'temporary-password', 'NextPasswordStrong01', { userAgent: 'test-agent', ipAddress: '127.0.0.1' });

  assert.equal(result.success, true);
  assert.notEqual(user.passwordHash, 'hashed-password');
  assert.equal(writes.audits.length, 1);
  assert.equal(writes.audits[0].action, 'PASSWORD_CHANGE');
  assert.equal(writes.audits[0].metadata.currentPassword, undefined);
});

test('revokes a session and prevents refresh from the invalidated token', async () => {
  const { writes } = await createService();
  const user = { ...producer, refreshTokenHash: await bcrypt.hash('stale-refresh-token', 4) };
  const usersService = {
    findById: async (id) => (id === user.id ? user : null),
    updateRefreshTokenHash: async (id, hash) => {
      user.refreshTokenHash = hash;
      writes.refreshTokenHashes.push(['revoke', id, hash]);
    },
  };
  const serviceWithUser = new AuthService(usersService, { signAsync: async (payload) => payload.tokenType }, { get: () => undefined, getOrThrow: () => 'value' }, { resolvePermissions: () => ['productions.read'] }, { record: async (entry) => writes.audits.push(entry) });

  await serviceWithUser.revokeSession('producer-user', 'producer-user', 'stale-refresh-token', { userAgent: 'test-agent', ipAddress: '127.0.0.1' });

  assert.equal(user.refreshTokenHash, null);
  assert.equal(writes.audits[0].action, 'SESSION_REVOKE');
});

test('lets an admin rotate another user password and invalidates the refresh token', async () => {
  const writes = { refreshTokenHashes: [], audits: [] };
  const targetUser = { ...producer, id: 'target-user', passwordHash: await bcrypt.hash('CurrentPass001', 4), refreshTokenHash: await bcrypt.hash('stale-refresh-token', 4) };
  const actor = { ...producer, id: 'admin-user', role: Role.ADMIN };
  const usersService = {
    findById: async (id) => (id === actor.id ? actor : id === targetUser.id ? targetUser : null),
    updatePasswordHash: async (id, hash) => {
      targetUser.passwordHash = hash;
      writes.refreshTokenHashes.push(['password-rotate', id, hash]);
    },
    updateRefreshTokenHash: async (id, hash) => {
      targetUser.refreshTokenHash = hash;
      writes.refreshTokenHashes.push(['revoke', id, hash]);
    },
  };
  const service = new AuthService(usersService, { signAsync: async (payload) => payload.tokenType }, { get: () => undefined, getOrThrow: () => 'value' }, { resolvePermissions: () => ['productions.read'] }, { record: async (entry) => writes.audits.push(entry) });

  const result = await service.rotatePassword(actor.id, targetUser.id, 'NewStrongPass001', { userAgent: 'test-agent', ipAddress: '127.0.0.1' });

  assert.equal(result.success, true);
  assert.notEqual(targetUser.passwordHash, 'CurrentPass001');
  assert.equal(targetUser.refreshTokenHash, null);
  assert.equal(writes.audits[0].action, 'PASSWORD_ROTATION');
});

function createPrismaMock() {
  const state = { companies: [], users: [], memberships: [] };
  return {
    state,
    $transaction: async (fn) => {
      const snapshot = {
        companies: [...state.companies],
        users: [...state.users],
        memberships: [...state.memberships],
      };
      try {
        return await fn({
          company: {
            create: async ({ data }) => {
              const company = { id: `company-${state.companies.length + 1}`, ...data };
              state.companies.push(company);
              return company;
            },
          },
          user: {
            create: async ({ data }) => {
              if (state.users.some((existing) => existing.email === data.email)) {
                throw new Prisma.PrismaClientKnownRequestError('unique conflict', {
                  code: 'P2002',
                  clientVersion: '5.22.0',
                });
              }
              const user = {
                id: `user-${state.users.length + 1}`,
                ...data,
                isActive: true,
                refreshTokenHash: null,
                createdAt: new Date('2026-08-20T00:00:00.000Z'),
                updatedAt: new Date('2026-08-20T00:00:00.000Z'),
              };
              state.users.push(user);
              return user;
            },
          },
          companyUserMembership: {
            create: async ({ data }) => {
              const membership = { id: `membership-${state.memberships.length + 1}`, ...data };
              state.memberships.push(membership);
              return membership;
            },
          },
        });
      } catch (error) {
        state.companies = snapshot.companies;
        state.users = snapshot.users;
        state.memberships = snapshot.memberships;
        throw error;
      }
    },
  };
}

function createRegisterService(prisma, writes) {
  const usersService = {
    updateRefreshTokenHash: async (...args) => writes.refreshTokenHashes.push(args),
  };
  const jwtService = { signAsync: async (payload) => payload.tokenType };
  const config = { get: () => undefined, getOrThrow: () => 'value' };
  const rbac = { resolvePermissions: () => ['requests.read'] };
  const audit = { record: async (entry) => writes.audits.push(entry) };
  return new AuthService(usersService, jwtService, config, rbac, audit, prisma);
}

test('register creates a PENDING company, a SALES user, and an OWNER membership, then auto-issues a session', async () => {
  const writes = { refreshTokenHashes: [], audits: [] };
  const prisma = createPrismaMock();
  const service = createRegisterService(prisma, writes);

  const result = await service.register({
    companyLegalName: 'Ege Aluminyum Dograma Ltd.',
    businessDescription: 'Aluminyum Dograma Ustasi',
    fullName: 'Kemal Aydin',
    email: 'Kemal@Example.invalid',
    password: 'StrongPass123',
  }, {});

  assert.equal(result.accessToken, 'access');
  assert.equal(prisma.state.companies.length, 1);
  assert.equal(prisma.state.companies[0].verificationStatus, 'PENDING');
  assert.equal(prisma.state.companies[0].status, 'ACTIVE');
  assert.equal(prisma.state.companies[0].companyType, 'OTHER');
  assert.equal(prisma.state.companies[0].businessDescription, 'Aluminyum Dograma Ustasi');
  assert.equal(prisma.state.users[0].role, Role.SALES);
  assert.equal(prisma.state.users[0].email, 'kemal@example.invalid');
  assert.equal(prisma.state.memberships[0].role, 'OWNER');
  assert.equal(prisma.state.memberships[0].status, 'ACTIVE');
  assert.equal(writes.refreshTokenHashes.length, 1);
  assert.equal(writes.audits.length, 1);
  assert.equal(writes.audits[0].action, 'SELF_REGISTER');
  assert.equal(writes.audits[0].metadata.password, undefined);
});

test('register rejects weak passwords before creating any records', async () => {
  const writes = { refreshTokenHashes: [], audits: [] };
  const prisma = createPrismaMock();
  const service = createRegisterService(prisma, writes);

  await assert.rejects(
    service.register({
      companyLegalName: 'Ege Aluminyum Dograma Ltd.',
      businessDescription: 'Aluminyum Dograma Ustasi',
      fullName: 'Kemal Aydin',
      email: 'kemal@example.invalid',
      password: 'weak',
    }, {}),
    BadRequestException,
  );

  assert.equal(prisma.state.companies.length, 0);
  assert.equal(prisma.state.users.length, 0);
});

test('register reports a duplicate email as a conflict without issuing a session', async () => {
  const writes = { refreshTokenHashes: [], audits: [] };
  const prisma = createPrismaMock();
  const service = createRegisterService(prisma, writes);

  await service.register({
    companyLegalName: 'Ege Aluminyum Dograma Ltd.',
    businessDescription: 'Aluminyum Dograma Ustasi',
    fullName: 'Kemal Aydin',
    email: 'kemal@example.invalid',
    password: 'StrongPass123',
  }, {});

  await assert.rejects(
    service.register({
      companyLegalName: 'Baska Firma Ltd.',
      businessDescription: 'PVC Dogramaci',
      fullName: 'Baska Kisi',
      email: 'kemal@example.invalid',
      password: 'StrongPass123',
    }, {}),
    ConflictException,
  );

  assert.equal(prisma.state.companies.length, 1);
  assert.equal(prisma.state.users.length, 1);
  assert.equal(writes.refreshTokenHashes.length, 1);
});

function createPasswordResetService({ user, admins }) {
  const queued = [];
  const usersService = { findByIdentifier: async () => user };
  const jwtService = { signAsync: async (payload) => payload.tokenType };
  const config = { get: () => undefined, getOrThrow: () => 'value' };
  const rbac = { resolvePermissions: () => [] };
  const audit = { record: async () => {} };
  const prisma = { user: { findMany: async () => admins } };
  const notifications = { queue: async (event) => queued.push(event) };
  const service = new AuthService(usersService, jwtService, config, rbac, audit, prisma, notifications);
  return { service, queued };
}

test('requestPasswordReset notifies every active admin when a known active user is found', async () => {
  const user = { id: 'user-1', email: 'alici@example.invalid', fullName: 'Alici Kisi', isActive: true };
  const admins = [{ id: 'admin-1' }, { id: 'admin-2' }];
  const { service, queued } = createPasswordResetService({ user, admins });

  const result = await service.requestPasswordReset('alici@example.invalid');

  assert.equal(result.acknowledged, true);
  assert.equal(queued.length, 2);
  assert.equal(queued[0].userId, 'admin-1');
  assert.equal(queued[0].type, 'PASSWORD_RESET_REQUESTED');
  assert.match(queued[0].title, /alici@example\.invalid/);
  assert.equal(queued[0].payload.targetUserId, 'user-1');
  assert.equal(queued[1].userId, 'admin-2');
});

test('requestPasswordReset does not notify anyone for an unknown or inactive identifier', async () => {
  const { service, queued } = createPasswordResetService({ user: null, admins: [{ id: 'admin-1' }] });

  const result = await service.requestPasswordReset('nobody@example.invalid');

  assert.equal(result.acknowledged, true);
  assert.equal(queued.length, 0);
});
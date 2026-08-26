const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ForbiddenException, NotFoundException } = require('@nestjs/common');
const { CompanyMembershipStatus, CompanyStatus, CompanyType, RequestStatus, Role } = require('@prisma/client');
const { RequestsService } = require('./requests.service.ts');

const actor = {
  sub: 'buyer-user',
  email: 'buyer@example.invalid',
  role: Role.SALES,
  permissions: ['requests.read', 'requests.create', 'requests.update'],
  tokenType: 'access',
};

function requestFixture(overrides = {}) {
  return {
    id: 'request-1',
    companyId: 'buyer-company',
    regionId: null,
    title: 'Glass request',
    productType: 'LAMINATED_GLASS',
    quantity: 1,
    unit: 'PIECE',
    currency: 'TRY',
    budgetMin: null,
    budgetMax: null,
    status: RequestStatus.DRAFT,
    version: 1,
    company: { id: 'buyer-company', regionId: null },
    recipients: [],
    ...overrides,
  };
}

function createHarness(options = {}) {
  const request = options.request === undefined ? requestFixture() : options.request;
  const captured = { creates: [], updates: [], requestLists: [], companyLists: [] };
  const requestDelegate = {
    findFirst: async () => request,
    findMany: async (args) => {
      captured.requestLists.push(args);
      return request ? [request] : [];
    },
    updateMany: async (args) => {
      captured.updates.push(args);
      return { count: 1 };
    },
    findUniqueOrThrow: async () => request,
  };
  const transaction = { request: requestDelegate, requestRecipient: { createMany: async () => ({ count: 0 }) } };
  const prisma = {
    request: requestDelegate,
    requestRecipient: { createMany: async () => ({ count: 0 }) },
    company: {
      findFirst: async () => options.company ?? null,
      findMany: async (args) => {
        captured.companyLists.push(args);
        return options.companies ?? [];
      },
    },
    region: { findFirst: async () => null },
    $transaction: async (operation) => operation(transaction),
  };
  const audit = { record: async () => undefined };
  const notifications = options.notifications ?? {
    notifyCompany: async () => undefined,
  };
  return { service: new RequestsService(prisma, audit, notifications), captured, notifications };
}

test('Request read by known ID is hidden outside actor tenant scope', async () => {
  const harness = createHarness({ request: null });
  await assert.rejects(harness.service.get('request-1', actor), NotFoundException);
});

test('Request mutation by known ID is rejected before any write outside actor tenant scope', async () => {
  const harness = createHarness({ request: null });
  await assert.rejects(
    harness.service.update('request-1', { version: 1, title: 'Changed' }, actor),
    NotFoundException,
  );
  assert.equal(harness.captured.updates.length, 0);
});

test('client-selected Request company requires active actor membership', async () => {
  const harness = createHarness({ company: null });
  await assert.rejects(harness.service.create({
    companyId: 'foreign-company',
    title: 'Glass request',
    productType: 'LAMINATED_GLASS',
    quantity: 1,
    unit: 'PIECE',
  }, actor), ForbiddenException);
});

test('recipient company catalog exposes only active glass producers outside the actor memberships', async () => {
  const companies = [{ id: 'producer-company', legalName: 'Producer', tradeName: 'Producer' }];
  const harness = createHarness({ companies });

  assert.deepEqual(await harness.service.listRecipientCompanies(actor), companies);
  assert.deepEqual(harness.captured.companyLists[0], {
    where: {
      companyType: CompanyType.GLASS_PRODUCER,
      status: CompanyStatus.ACTIVE,
      memberships: {
        none: {
          userId: actor.sub,
          status: CompanyMembershipStatus.ACTIVE,
        },
      },
    },
    select: { id: true, legalName: true, tradeName: true, regionId: true },
    orderBy: [{ tradeName: 'asc' }, { legalName: 'asc' }],
  });
});

test('producer request list remains limited to owned or assigned non-draft requests while admin remains global', async () => {
  const producer = { ...actor, sub: 'producer-user', role: Role.PRODUCER };
  const producerHarness = createHarness();
  await producerHarness.service.list(producer);
  assert.deepEqual(producerHarness.captured.requestLists[0].where, {
    OR: [
      {
        company: {
          memberships: {
            some: { userId: producer.sub, status: CompanyMembershipStatus.ACTIVE },
          },
        },
      },
      {
        status: { not: RequestStatus.DRAFT },
        recipients: {
          some: {
            company: {
              memberships: {
                some: { userId: producer.sub, status: CompanyMembershipStatus.ACTIVE },
              },
            },
          },
        },
      },
    ],
  });

  const adminHarness = createHarness();
  await adminHarness.service.list({ ...actor, sub: 'admin-user', role: Role.ADMIN });
  assert.deepEqual(adminHarness.captured.requestLists[0].where, {});
});

test('submit notifies every recipient company once the Request is opened for quotation', async () => {
  const calls = [];
  const notifications = {
    notifyCompany: async (companyId, event) => {
      calls.push({ companyId, event });
    },
  };
  const request = requestFixture({
    requestNumber: 'REQ-TEST-1',
    status: RequestStatus.DRAFT,
    recipients: [{ companyId: 'producer-company-1' }, { companyId: 'producer-company-2' }],
  });
  const { service } = createHarness({ request, notifications });

  await service.submit(request.id, request.version, actor);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.companyId).sort(), ['producer-company-1', 'producer-company-2']);
  assert.ok(calls.every((call) => call.event.type === 'REQUEST_ASSIGNED'));
  assert.ok(calls.every((call) => call.event.title.includes(request.title)));
});
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ConflictException, ForbiddenException, NotFoundException } = require('@nestjs/common');
const {
  CalculationStatus,
  OrderStatus,
  Prisma,
  QuotationStatus,
  RequestStatus,
  Role,
} = require('@prisma/client');
const { QuotationsService: BaseQuotationsService } = require('./quotations.service.ts');

function createNotificationsMock() {
  const calls = [];
  return {
    calls,
    notifyCompany: async (companyId, event) => {
      calls.push({ companyId, event });
    },
  };
}

class QuotationsService extends BaseQuotationsService {
  constructor(prisma, audit, notifications = createNotificationsMock()) {
    super(prisma, audit, notifications);
  }
}

const actor = {
  sub: 'manufacturer-user',
  email: 'manufacturer@example.invalid',
  role: Role.PRODUCER,
  permissions: [
    'quotations.read',
    'quotations.create',
    'quotations.update',
    'quotations.send',
    'quotations.withdraw',
  ],
  tokenType: 'access',
};

function createAuditMock() {
  const records = [];
  return {
    records,
    record: async (payload) => {
      records.push(payload);
      return payload;
    },
  };
}

function quotationFixture(overrides = {}) {
  return {
    id: 'quotation-1',
    quotationNumber: 'QUO-TEST-1',
    requestId: 'request-1',
    companyId: 'buyer-company',
    manufacturerCompanyId: 'manufacturer-company',
    totalAmount: { toNumber: () => 1000 },
    currency: 'TRY',
    leadTimeDays: 5,
    validUntil: new Date(Date.now() + 86_400_000),
    notes: null,
    status: QuotationStatus.DRAFT,
    revisionNumber: 1,
    version: 1,
    activeCalculationId: null,
    request: {
      id: 'request-1',
      requestNumber: 'REQ-TEST-1',
      companyId: 'buyer-company',
      title: 'Test request',
      status: RequestStatus.OPEN_FOR_QUOTATION,
      version: 1,
    },
    company: { id: 'buyer-company' },
    manufacturerCompany: { id: 'manufacturer-company' },
    createdBy: null,
    ...overrides,
  };
}

test('create derives buyer company from Request and keeps manufacturer selection scoped', async () => {
  let createData;
  const created = quotationFixture();
  const prisma = {
    request: {
      findUnique: async () => ({
        id: 'request-1',
        companyId: 'buyer-company',
        currency: 'TRY',
        status: RequestStatus.OPEN_FOR_QUOTATION,
      }),
    },
    requestRecipient: { findFirst: async () => ({ id: 'recipient-1' }) },
    quotation: {
      findUnique: async () => null,
      create: async ({ data }) => {
        createData = data;
        return created;
      },
    },
  };
  const audit = createAuditMock();
  const service = new QuotationsService(prisma, audit);

  const result = await service.create(
    'request-1',
    {
      manufacturerCompanyId: 'manufacturer-company',
      totalAmount: 1000,
      leadTimeDays: 5,
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    },
    actor,
  );

  assert.equal(createData.companyId, 'buyer-company');
  assert.equal(createData.manufacturerCompanyId, 'manufacturer-company');
  assert.equal(createData.requestId, 'request-1');
  assert.equal(createData.status, QuotationStatus.DRAFT);
  assert.equal(createData.revisionNumber, 1);
  assert.equal(createData.version, 1);
  assert.equal(result.id, 'quotation-1');
  assert.equal(audit.records[0].action, 'CREATE');
});

test('create rejects a duplicate manufacturer quotation before insert', async () => {
  let createCalled = false;
  const prisma = {
    request: {
      findUnique: async () => ({
        id: 'request-1',
        companyId: 'buyer-company',
        currency: 'TRY',
        status: RequestStatus.OPEN_FOR_QUOTATION,
      }),
    },
    requestRecipient: { findFirst: async () => ({ id: 'recipient-1' }) },
    quotation: {
      findUnique: async () => ({ id: 'existing-quotation' }),
      create: async () => {
        createCalled = true;
      },
    },
  };
  const service = new QuotationsService(prisma, createAuditMock());

  await assert.rejects(
    service.create(
      'request-1',
      {
        manufacturerCompanyId: 'manufacturer-company',
        totalAmount: 1000,
        leadTimeDays: 5,
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      },
      actor,
    ),
    ConflictException,
  );
  assert.equal(createCalled, false);
});

test('manufacturer list scope only targets companies with the actor active membership', async () => {
  let capturedWhere;
  const prisma = {
    quotation: {
      findMany: async ({ where }) => {
        capturedWhere = where;
        return [];
      },
    },
  };
  const service = new QuotationsService(prisma, createAuditMock());

  await service.list(actor);

  const manufacturerScope = capturedWhere.OR[1].manufacturerCompany.memberships.some;
  assert.equal(manufacturerScope.userId, actor.sub);
  assert.equal(manufacturerScope.status, 'ACTIVE');
});

test('active finalized calculation blocks legacy totalAmount and currency updates', async () => {
  const draft = quotationFixture({ activeCalculationId: 'calculation-1' });
  let updateCalled = false;
  const prisma = {
    quotation: {
      findFirst: async () => draft,
      updateMany: async () => {
        updateCalled = true;
        return { count: 1 };
      },
    },
  };
  const service = new QuotationsService(prisma, createAuditMock());

  for (const input of [
    { version: 1, totalAmount: 2000 },
    { version: 1, currency: 'USD' },
  ]) {
    await assert.rejects(service.update(draft.id, input, actor), ConflictException);
  }
  assert.equal(updateCalled, false);
});

test('active finalized calculation still allows non-commercial legacy updates', async () => {
  const draft = quotationFixture({ activeCalculationId: 'calculation-1' });
  const updated = quotationFixture({
    activeCalculationId: 'calculation-1',
    notes: 'Updated note',
    version: 2,
  });
  let reads = 0;
  let updateArgs;
  const prisma = {
    quotation: {
      findFirst: async () => {
        reads += 1;
        return reads === 1 ? draft : updated;
      },
      updateMany: async (args) => {
        updateArgs = args;
        return { count: 1 };
      },
    },
  };
  const service = new QuotationsService(prisma, createAuditMock());

  const result = await service.update(draft.id, { version: 1, notes: 'Updated note' }, actor);
  assert.equal(result.notes, 'Updated note');
  assert.equal(updateArgs.data.activeCalculationId, undefined);
});

test('revise changes SENT to DRAFT and increments revisionNumber and version', async () => {
  const sent = quotationFixture({
    status: QuotationStatus.SENT,
    version: 3,
    revisionNumber: 2,
    activeCalculationId: 'calculation-2',
  });
  const revised = quotationFixture({ status: QuotationStatus.DRAFT, version: 4, revisionNumber: 3 });
  let updateArgs;
  let reads = 0;
  let snapshotDeleteCalled = false;
  const prisma = {
    quotation: {
      findFirst: async () => {
        reads += 1;
        return reads === 1 ? sent : revised;
      },
      updateMany: async (args) => {
        updateArgs = args;
        return { count: 1 };
      },
    },
    quotationCalculation: { deleteMany: async () => { snapshotDeleteCalled = true; } },
    quotationItem: { deleteMany: async () => { snapshotDeleteCalled = true; } },
  };
  const audit = createAuditMock();
  const service = new QuotationsService(prisma, audit);

  const result = await service.revise('quotation-1', 3, actor);

  assert.equal(updateArgs.where.version, 3);
  assert.equal(updateArgs.where.status, QuotationStatus.SENT);
  assert.deepEqual(updateArgs.data.revisionNumber, { increment: 1 });
  assert.deepEqual(updateArgs.data.version, { increment: 1 });
  assert.equal(updateArgs.data.activeCalculationId, null);
  assert.equal(snapshotDeleteCalled, false);
  assert.equal(result.status, QuotationStatus.DRAFT);
  assert.equal(result.revisionNumber, 3);
  assert.equal(audit.records[0].action, 'REVISE');
});

test('send changes DRAFT to SENT and marks the first quoted Request as QUOTED', async () => {
  const draft = quotationFixture();
  const sent = quotationFixture({ status: QuotationStatus.SENT, version: 2 });
  let reads = 0;
  let quotationUpdate;
  let requestUpdate;
  const transaction = {
    quotation: {
      updateMany: async (args) => {
        quotationUpdate = args;
        return { count: 1 };
      },
    },
    request: {
      updateMany: async (args) => {
        requestUpdate = args;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    quotation: {
      findFirst: async () => {
        reads += 1;
        return reads === 1 ? draft : sent;
      },
    },
    $transaction: async (operation) => operation(transaction),
  };
  const audit = createAuditMock();
  const service = new QuotationsService(prisma, audit);

  const result = await service.send('quotation-1', 1, actor);

  assert.equal(quotationUpdate.where.status, QuotationStatus.DRAFT);
  assert.equal(quotationUpdate.data.status, QuotationStatus.SENT);
  assert.equal(requestUpdate.where.status, RequestStatus.OPEN_FOR_QUOTATION);
  assert.equal(requestUpdate.data.status, RequestStatus.QUOTED);
  assert.deepEqual(requestUpdate.data.version, { increment: 1 });
  assert.equal(result.status, QuotationStatus.SENT);
  assert.deepEqual(audit.records.map((record) => record.action), ['SEND', 'STATUS_CHANGE']);
});

test('send rejects an active calculation from an earlier revision', async () => {
  const draft = quotationFixture({ revisionNumber: 3, activeCalculationId: 'calculation-2' });
  let quotationWrites = 0;
  const transaction = {
    quotationCalculation: {
      findFirst: async () => null,
    },
    quotation: {
      updateMany: async () => {
        quotationWrites += 1;
        return { count: 1 };
      },
    },
    request: { updateMany: async () => ({ count: 1 }) },
  };
  const prisma = {
    quotation: { findFirst: async () => draft },
    $transaction: async (operation) => operation(transaction),
  };
  const service = new QuotationsService(prisma, createAuditMock());

  await assert.rejects(service.send(draft.id, draft.version, actor), ConflictException);
  assert.equal(quotationWrites, 0);
});

test('send accepts a finalized active calculation for the current revision', async () => {
  const draft = quotationFixture({ revisionNumber: 3, activeCalculationId: 'calculation-3' });
  const sent = quotationFixture({
    status: QuotationStatus.SENT,
    version: 2,
    revisionNumber: 3,
    activeCalculationId: 'calculation-3',
  });
  let reads = 0;
  let calculationWhere;
  const transaction = {
    quotationCalculation: {
      findFirst: async ({ where }) => {
        calculationWhere = where;
        return { id: 'calculation-3' };
      },
    },
    quotation: { updateMany: async () => ({ count: 1 }) },
    request: { updateMany: async () => ({ count: 1 }) },
  };
  const prisma = {
    quotation: {
      findFirst: async () => {
        reads += 1;
        return reads === 1 ? draft : sent;
      },
    },
    $transaction: async (operation) => operation(transaction),
  };
  const service = new QuotationsService(prisma, createAuditMock());

  await service.send(draft.id, draft.version, actor);
  assert.deepEqual(calculationWhere, {
    id: 'calculation-3',
    quotationId: draft.id,
    quotationRevisionNumber: 3,
    status: CalculationStatus.FINALIZED,
  });
});

test('withdraw changes DRAFT or SENT to WITHDRAWN with version concurrency', async () => {
  const sent = quotationFixture({ status: QuotationStatus.SENT, version: 2 });
  const withdrawn = quotationFixture({ status: QuotationStatus.WITHDRAWN, version: 3 });
  let reads = 0;
  let updateArgs;
  const prisma = {
    quotation: {
      findFirst: async () => {
        reads += 1;
        return reads === 1 ? sent : withdrawn;
      },
      updateMany: async (args) => {
        updateArgs = args;
        return { count: 1 };
      },
    },
  };
  const audit = createAuditMock();
  const service = new QuotationsService(prisma, audit);

  const result = await service.withdraw('quotation-1', 2, actor);

  assert.equal(updateArgs.where.version, 2);
  assert.deepEqual(new Set(updateArgs.where.status.in), new Set([QuotationStatus.DRAFT, QuotationStatus.SENT]));
  assert.equal(updateArgs.data.status, QuotationStatus.WITHDRAWN);
  assert.deepEqual(updateArgs.data.version, { increment: 1 });
  assert.equal(result.status, QuotationStatus.WITHDRAWN);
  assert.equal(audit.records[0].action, 'WITHDRAW');
});

test('buyer rejects a SENT quotation with version CAS and no Request or Order mutation', async () => {
  const sent = acceptanceQuotation();
  const rejected = acceptanceQuotation({ status: QuotationStatus.REJECTED, version: 5 });
  let reads = 0;
  let updateArgs;
  const prisma = {
    quotation: {
      findFirst: async () => {
        reads += 1;
        return reads === 1 ? sent : rejected;
      },
      updateMany: async (args) => {
        updateArgs = args;
        return { count: 1 };
      },
    },
    requestRecipient: { findUnique: async () => ({ id: 'recipient-1' }) },
  };
  const audit = createAuditMock();
  const service = new QuotationsService(prisma, audit);

  const result = await service.reject(sent.id, sent.version, buyerActor());

  assert.equal(updateArgs.where.version, sent.version);
  assert.equal(updateArgs.where.status, QuotationStatus.SENT);
  assert.equal(updateArgs.where.companyId, sent.companyId);
  assert.equal(updateArgs.where.manufacturerCompanyId, sent.manufacturerCompanyId);
  assert.equal(updateArgs.data.status, QuotationStatus.REJECTED);
  assert.deepEqual(updateArgs.data.version, { increment: 1 });
  assert.equal(result.status, QuotationStatus.REJECTED);
  assert.equal(audit.records[0].action, 'REJECT');
  assert.equal(audit.records[0].metadata.reason, 'BUYER_REJECTED');
  assert.equal(Object.hasOwn(prisma, 'request'), false);
  assert.equal(Object.hasOwn(prisma, 'order'), false);
});

test('reject reports stale quotation version as a conflict and writes no audit', async () => {
  const sent = acceptanceQuotation();
  const prisma = {
    quotation: {
      findFirst: async () => sent,
      updateMany: async () => ({ count: 0 }),
    },
    requestRecipient: { findUnique: async () => ({ id: 'recipient-1' }) },
  };
  const audit = createAuditMock();
  const service = new QuotationsService(prisma, audit);

  await assert.rejects(service.reject(sent.id, sent.version - 1, buyerActor()), ConflictException);
  assert.equal(audit.records.length, 0);
});

test('manufacturer cannot reject a quotation', async () => {
  const service = new QuotationsService({}, createAuditMock());
  await assert.rejects(service.reject('quotation-1', 1, actor), ForbiddenException);
});

function buyerActor(overrides = {}) {
  return {
    sub: 'buyer-user',
    email: 'buyer@example.invalid',
    role: Role.SALES,
    permissions: ['quotations.read', 'quotations.decide'],
    tokenType: 'access',
    ...overrides,
  };
}

function acceptanceQuotation(overrides = {}) {
  return quotationFixture({
    status: QuotationStatus.SENT,
    version: 4,
    revisionNumber: 2,
    request: {
      id: 'request-1',
      requestNumber: 'REQ-TEST-1',
      companyId: 'buyer-company',
      title: 'Test request',
      status: RequestStatus.QUOTED,
      version: 3,
    },
    ...overrides,
  });
}

function acceptancePrisma(existing, options = {}) {
  const captured = {
    orderData: null,
    requestUpdate: null,
    quotationUpdate: null,
    rejectedUpdate: null,
    calculationWhere: null,
  };
  const accepted = acceptanceQuotation({ status: QuotationStatus.ACCEPTED, version: existing.version + 1 });
  const order = { id: 'order-1', orderNumber: 'ORD-TEST-1', status: OrderStatus.PENDING_CONFIRMATION };
  const transaction = {
    quotationCalculation: {
      findFirst: async ({ where }) => {
        captured.calculationWhere = where;
        return options.activeCalculation ?? null;
      },
    },
    request: {
      updateMany: async (args) => {
        captured.requestUpdate = args;
        return { count: options.requestCount ?? 1 };
      },
    },
    quotation: {
      updateMany: async (args) => {
        if (args.where.id === existing.id) {
          captured.quotationUpdate = args;
        } else {
          captured.rejectedUpdate = args;
        }
        return { count: 1 };
      },
      findMany: async () => options.competing ?? [],
      findUniqueOrThrow: async () => accepted,
    },
    order: {
      create: async ({ data }) => {
        captured.orderData = data;
        return { ...order, ...data };
      },
    },
  };
  const prisma = {
    quotation: { findFirst: async () => options.scopedQuotation === undefined ? existing : options.scopedQuotation },
    requestRecipient: { findUnique: async () => options.recipient === false ? null : { id: 'recipient-1' } },
    $transaction: async (operation) => operation(transaction),
  };
  return { prisma, captured };
}

test('accept atomically awards Request, rejects competing SENT quotations, and derives Order fields', async () => {
  const existing = acceptanceQuotation();
  const competing = [{ id: 'quotation-2', revisionNumber: 1, version: 6 }];
  const { prisma, captured } = acceptancePrisma(existing, { competing });
  const audit = createAuditMock();
  const service = new QuotationsService(prisma, audit);

  const result = await service.accept(existing.id, existing.version, buyerActor());

  assert.equal(captured.requestUpdate.where.status, RequestStatus.QUOTED);
  assert.equal(captured.requestUpdate.where.version, existing.request.version);
  assert.equal(captured.requestUpdate.data.status, RequestStatus.AWARDED);
  assert.equal(captured.quotationUpdate.where.status, QuotationStatus.SENT);
  assert.equal(captured.quotationUpdate.where.version, existing.version);
  assert.equal(captured.quotationUpdate.data.status, QuotationStatus.ACCEPTED);
  assert.equal(captured.rejectedUpdate.data.status, QuotationStatus.REJECTED);
  assert.equal(captured.orderData.requestId, existing.requestId);
  assert.equal(captured.orderData.quotationId, existing.id);
  assert.equal(captured.orderData.companyId, existing.companyId);
  assert.equal(captured.orderData.manufacturerCompanyId, existing.manufacturerCompanyId);
  assert.equal(captured.orderData.totalAmount, existing.totalAmount);
  assert.equal(captured.orderData.currency, existing.currency);
  assert.equal(captured.orderData.status, OrderStatus.PENDING_CONFIRMATION);
  assert.ok(captured.orderData.promisedDeliveryDate instanceof Date);
  assert.equal(result.quotation.status, QuotationStatus.ACCEPTED);
  assert.equal(result.order.quotationId, existing.id);
  assert.deepEqual(audit.records.map((record) => `${record.resource}:${record.action}`), [
    'quotation:ACCEPT',
    'quotation:REJECT',
    'request:STATUS_CHANGE',
    'order:CREATE',
  ]);
  assert.equal(Object.hasOwn(audit.records[0].metadata, 'totalAmount'), false);
  assert.equal(captured.calculationWhere, null);
});

test('accept rejects an active calculation from another revision before lifecycle writes', async () => {
  const existing = acceptanceQuotation({ activeCalculationId: 'calculation-1' });
  const { prisma, captured } = acceptancePrisma(existing, { activeCalculation: null });
  const service = new QuotationsService(prisma, createAuditMock());

  await assert.rejects(
    service.accept(existing.id, existing.version, buyerActor()),
    ConflictException,
  );
  assert.deepEqual(captured.calculationWhere, {
    id: 'calculation-1',
    quotationId: existing.id,
    quotationRevisionNumber: existing.revisionNumber,
    status: CalculationStatus.FINALIZED,
  });
  assert.equal(captured.requestUpdate, null);
  assert.equal(captured.quotationUpdate, null);
  assert.equal(captured.orderData, null);
});

test('accept uses Quotation totalAmount when the active finalized calculation is current', async () => {
  const existing = acceptanceQuotation({ activeCalculationId: 'calculation-2' });
  const { prisma, captured } = acceptancePrisma(existing, {
    activeCalculation: { id: 'calculation-2' },
  });
  const service = new QuotationsService(prisma, createAuditMock());

  await service.accept(existing.id, existing.version, buyerActor());

  assert.deepEqual(captured.calculationWhere, {
    id: 'calculation-2',
    quotationId: existing.id,
    quotationRevisionNumber: existing.revisionNumber,
    status: CalculationStatus.FINALIZED,
  });
  assert.equal(captured.orderData.totalAmount, existing.totalAmount);
});

test('accept rejects expired and non-SENT quotations before opening a transaction', async () => {
  for (const existing of [
    acceptanceQuotation({ validUntil: new Date(Date.now() - 1000) }),
    acceptanceQuotation({ status: QuotationStatus.DRAFT }),
  ]) {
    const { prisma } = acceptancePrisma(existing);
    let transactionCalled = false;
    prisma.$transaction = async () => {
      transactionCalled = true;
    };
    const service = new QuotationsService(prisma, createAuditMock());
    await assert.rejects(service.accept(existing.id, existing.version, buyerActor()), ConflictException);
    assert.equal(transactionCalled, false);
  }
});

test('manufacturer and another buyer company cannot accept a quotation', async () => {
  const existing = acceptanceQuotation();
  const { prisma } = acceptancePrisma(existing);
  const service = new QuotationsService(prisma, createAuditMock());

  await assert.rejects(service.accept(existing.id, existing.version, actor), ForbiddenException);

  const inaccessible = acceptancePrisma(existing, { scopedQuotation: null });
  const inaccessibleService = new QuotationsService(inaccessible.prisma, createAuditMock());
  await assert.rejects(
    inaccessibleService.accept(existing.id, existing.version, buyerActor({ sub: 'other-buyer' })),
    NotFoundException,
  );
});

test('second or concurrent acceptance loses the conditional Request update and creates no duplicate Order', async () => {
  const existing = acceptanceQuotation();
  let awarded = false;
  let orderCreates = 0;
  const { prisma } = acceptancePrisma(existing);
  prisma.$transaction = async (operation) => operation({
    request: {
      updateMany: async () => {
        if (awarded) return { count: 0 };
        awarded = true;
        return { count: 1 };
      },
    },
    quotation: {
      updateMany: async () => ({ count: 1 }),
      findMany: async () => [],
      findUniqueOrThrow: async () => acceptanceQuotation({ status: QuotationStatus.ACCEPTED, version: 5 }),
    },
    order: {
      create: async ({ data }) => {
        orderCreates += 1;
        return { id: 'order-1', ...data };
      },
    },
  });
  const service = new QuotationsService(prisma, createAuditMock());

  const results = await Promise.allSettled([
    service.accept(existing.id, existing.version, buyerActor()),
    service.accept(existing.id, existing.version, buyerActor()),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(orderCreates, 1);
});

test('Order quotation uniqueness errors are reported as acceptance conflicts', async () => {
  const existing = acceptanceQuotation();
  const { prisma } = acceptancePrisma(existing);
  prisma.$transaction = async () => {
    throw new Prisma.PrismaClientKnownRequestError('duplicate order', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['quotationId'] },
    });
  };
  const service = new QuotationsService(prisma, createAuditMock());

  await assert.rejects(service.accept(existing.id, existing.version, buyerActor()), ConflictException);
});

test('accepted quotation commercial fields are immutable through general update', async () => {
  const accepted = acceptanceQuotation({ status: QuotationStatus.ACCEPTED });
  const prisma = { quotation: { findFirst: async () => accepted } };
  const service = new QuotationsService(prisma, createAuditMock());

  await assert.rejects(
    service.update(accepted.id, { version: accepted.version, totalAmount: 2000 }, actor),
    ConflictException,
  );
});

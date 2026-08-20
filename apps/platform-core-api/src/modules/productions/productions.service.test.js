const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ConflictException, ForbiddenException } = require('@nestjs/common');
const { Prisma, ProductionStatus, Role } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CreateProductionDto } = require('./dto/create-production.dto.ts');
const { TransitionProductionDto } = require('./dto/transition-production.dto.ts');
const { ProductionsController } = require('./productions.controller.ts');
const { ProductionsService: BaseProductionsService } = require('./productions.service.ts');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../rbac/permissions.ts');

function createNotificationsMock() {
  const calls = [];
  return {
    calls,
    notifyCompany: async (companyId, event) => {
      calls.push({ companyId, event });
    },
  };
}

class ProductionsService extends BaseProductionsService {
  constructor(prisma, audit, notifications = createNotificationsMock()) {
    super(prisma, audit, notifications);
  }
}

const producerActor = {
  sub: 'producer-user',
  email: 'producer@example.invalid',
  role: Role.PRODUCER,
  permissions: [
    PERMISSIONS.PRODUCTIONS_READ,
    PERMISSIONS.PRODUCTIONS_CREATE,
    PERMISSIONS.PRODUCTIONS_TRANSITION,
  ],
  tokenType: 'access',
};

function productionFixture(overrides = {}) {
  return {
    id: 'production-1',
    productionNumber: 'PRD-ORD-TEST-1',
    orderId: 'order-1',
    manufacturerCompanyId: 'manufacturer-company',
    createdByUserId: producerActor.sub,
    status: ProductionStatus.PLANNED,
    version: 1,
    productionLine: 'Line 1',
    plannedStartDate: new Date('2026-08-20T00:00:00.000Z'),
    dueDate: new Date('2026-09-01T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    notes: null,
    statusReason: null,
    order: {
      id: 'order-1',
      companyId: 'buyer-company',
      request: { id: 'request-1', requestNumber: 'REQ-TEST-1', title: 'Test request' },
    },
    ...overrides,
  };
}

function createAuditMock() {
  const records = [];
  return {
    records,
    record: async (payload, client) => records.push({ ...payload, client }),
  };
}

function createPrisma(options = {}) {
  const captured = { orderWhere: null, createData: null, membershipWhere: null, isolationLevel: null };
  const transaction = {
    order: {
      findFirst: async ({ where }) => {
        captured.orderWhere = where;
        if (options.order === null) return null;
        return options.order ?? {
          id: 'order-1',
          orderNumber: 'ORD-TEST-1',
          manufacturerCompanyId: 'manufacturer-company',
          promisedDeliveryDate: new Date('2026-09-01T00:00:00.000Z'),
        };
      },
    },
    company: {
      findFirst: async ({ where }) => {
        captured.membershipWhere = where;
        return options.membership === false ? null : { id: where.id };
      },
    },
    production: {
      create: async ({ data }) => {
        captured.createData = data;
        if (options.createError) throw options.createError;
        return productionFixture({ ...data });
      },
    },
  };
  const prisma = {
    $transaction: async (operation, transactionOptions) => {
      captured.isolationLevel = transactionOptions.isolationLevel;
      return operation(transaction);
    },
  };
  return { prisma, transaction, captured };
}

function transitionPrisma(existing, options = {}) {
  const captured = { update: null, membershipWhere: null, isolationLevel: null, listWhere: null };
  const transaction = {
    production: {
      updateMany: async (args) => {
        captured.update = args;
        return { count: options.updateCount ?? 1 };
      },
      findUniqueOrThrow: async () => productionFixture({
        ...existing,
        ...captured.update.data,
        version: existing.version + 1,
      }),
    },
  };
  const prisma = {
    production: {
      findUnique: async () => existing,
      findMany: async ({ where }) => {
        captured.listWhere = where;
        return [];
      },
    },
    company: {
      findFirst: async ({ where }) => {
        captured.membershipWhere = where;
        return options.membership === false ? null : { id: where.id };
      },
    },
    $transaction: async (operation, transactionOptions) => {
      captured.isolationLevel = transactionOptions.isolationLevel;
      if (options.transactionError) throw options.transactionError;
      return operation(transaction);
    },
  };
  return { prisma, transaction, captured };
}

test('creates one planned Production from a current CONFIRMED Order', async () => {
  const { prisma, transaction, captured } = createPrisma();
  const audit = createAuditMock();
  const service = new ProductionsService(prisma, audit);

  const result = await service.create('order-1', {
    orderVersion: 3,
    productionLine: 'Line 1',
    plannedStartDate: '2026-08-20T00:00:00.000Z',
  }, producerActor);

  assert.equal(captured.orderWhere.status, 'CONFIRMED');
  assert.equal(captured.orderWhere.version, 3);
  assert.equal(captured.createData.productionNumber, 'PRD-ORD-TEST-1');
  assert.equal(captured.createData.orderId, 'order-1');
  assert.equal(captured.createData.manufacturerCompanyId, 'manufacturer-company');
  assert.equal(captured.createData.dueDate.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(result.status, ProductionStatus.PLANNED);
  assert.equal(audit.records[0].client, transaction);
  assert.equal(audit.records[0].resource, 'production');
  assert.equal(audit.records[0].action, 'CREATE');
});

test('rejects planning when Order is not confirmed, stale, or already has Production', async () => {
  const missing = createPrisma({ order: null });
  await assert.rejects(
    new ProductionsService(missing.prisma, createAuditMock()).create(
      'order-1',
      { orderVersion: 1 },
      producerActor,
    ),
    ConflictException,
  );

  const duplicateError = new Prisma.PrismaClientKnownRequestError('unique conflict', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
  const duplicate = createPrisma({ createError: duplicateError });
  await assert.rejects(
    new ProductionsService(duplicate.prisma, createAuditMock()).create(
      'order-1',
      { orderVersion: 1 },
      producerActor,
    ),
    ConflictException,
  );
});

test('requires active manufacturer scope for planning and transition', async () => {
  const createContext = createPrisma({ membership: false });
  await assert.rejects(
    new ProductionsService(createContext.prisma, createAuditMock()).create(
      'order-1',
      { orderVersion: 1 },
      producerActor,
    ),
    ForbiddenException,
  );

  const transitionContext = transitionPrisma(productionFixture(), { membership: false });
  await assert.rejects(
    new ProductionsService(transitionContext.prisma, createAuditMock()).transition(
      'production-1',
      { version: 1, toStatus: ProductionStatus.IN_PROGRESS },
      producerActor,
    ),
    ForbiddenException,
  );
});

test('read scope includes active buyer and manufacturer memberships', async () => {
  const { prisma, captured } = transitionPrisma(productionFixture());
  const service = new ProductionsService(prisma, createAuditMock());

  await service.list({ ...producerActor, role: Role.SALES });

  assert.equal(captured.listWhere.OR.length, 2);
  assert.equal(
    captured.listWhere.OR[0].order.company.memberships.some.userId,
    producerActor.sub,
  );
  assert.equal(
    captured.listWhere.OR[1].manufacturerCompany.memberships.some.userId,
    producerActor.sub,
  );
});

test('transitions lifecycle with CAS, timestamps, and transactional audit', async () => {
  const existing = productionFixture();
  const { prisma, transaction, captured } = transitionPrisma(existing);
  const audit = createAuditMock();
  const service = new ProductionsService(prisma, audit);

  const result = await service.transition(existing.id, {
    version: existing.version,
    toStatus: ProductionStatus.IN_PROGRESS,
  }, producerActor);

  assert.equal(captured.update.where.status, ProductionStatus.PLANNED);
  assert.equal(captured.update.where.version, existing.version);
  assert.equal(captured.update.data.status, ProductionStatus.IN_PROGRESS);
  assert.ok(captured.update.data.startedAt instanceof Date);
  assert.deepEqual(captured.update.data.version, { increment: 1 });
  assert.equal(result.status, ProductionStatus.IN_PROGRESS);
  assert.equal(audit.records[0].client, transaction);
  assert.equal(audit.records[0].metadata.fromStatus, ProductionStatus.PLANNED);
  assert.equal(audit.records[0].metadata.toStatus, ProductionStatus.IN_PROGRESS);
});

test('transitioning to COMPLETED notifies the buyer company', async () => {
  const existing = productionFixture({ status: ProductionStatus.IN_PROGRESS, startedAt: new Date('2026-08-21T00:00:00.000Z') });
  const { prisma } = transitionPrisma(existing);
  const notifications = createNotificationsMock();
  const service = new ProductionsService(prisma, createAuditMock(), notifications);

  const result = await service.transition(existing.id, {
    version: existing.version,
    toStatus: ProductionStatus.COMPLETED,
  }, producerActor);

  assert.equal(result.status, ProductionStatus.COMPLETED);
  assert.equal(notifications.calls.length, 1);
  assert.equal(notifications.calls[0].companyId, existing.order.companyId);
  assert.equal(notifications.calls[0].event.type, 'PRODUCTION_COMPLETED');
});

test('transitioning to IN_PROGRESS does not notify anyone', async () => {
  const existing = productionFixture();
  const { prisma } = transitionPrisma(existing);
  const notifications = createNotificationsMock();
  const service = new ProductionsService(prisma, createAuditMock(), notifications);

  await service.transition(existing.id, {
    version: existing.version,
    toStatus: ProductionStatus.IN_PROGRESS,
  }, producerActor);

  assert.equal(notifications.calls.length, 0);
});

test('rejects invalid transitions and requires reasons for hold or cancellation', async () => {
  const terminal = transitionPrisma(productionFixture({ status: ProductionStatus.COMPLETED }));
  await assert.rejects(
    new ProductionsService(terminal.prisma, createAuditMock()).transition(
      'production-1',
      { version: 1, toStatus: ProductionStatus.IN_PROGRESS },
      producerActor,
    ),
    ConflictException,
  );

  const hold = transitionPrisma(productionFixture({ status: ProductionStatus.IN_PROGRESS }));
  await assert.rejects(
    new ProductionsService(hold.prisma, createAuditMock()).transition(
      'production-1',
      { version: 1, toStatus: ProductionStatus.ON_HOLD },
      producerActor,
    ),
    ConflictException,
  );
});

test('version conflicts write no audit and P2034 maps to 409', async () => {
  const stale = transitionPrisma(productionFixture(), { updateCount: 0 });
  const staleAudit = createAuditMock();
  await assert.rejects(
    new ProductionsService(stale.prisma, staleAudit).transition(
      'production-1',
      { version: 99, toStatus: ProductionStatus.IN_PROGRESS },
      producerActor,
    ),
    ConflictException,
  );
  assert.equal(staleAudit.records.length, 0);

  const transactionError = new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: '5.22.0',
  });
  const conflict = transitionPrisma(productionFixture(), { transactionError });
  await assert.rejects(
    new ProductionsService(conflict.prisma, createAuditMock()).transition(
      'production-1',
      { version: 1, toStatus: ProductionStatus.IN_PROGRESS },
      producerActor,
    ),
    ConflictException,
  );
});

test('Production DTOs constrain schedule fields, versions, and reasons', async () => {
  const validCreate = plainToInstance(CreateProductionDto, {
    orderVersion: 1,
    productionLine: '  Line A  ',
    plannedStartDate: '2026-08-20T00:00:00.000Z',
  });
  assert.equal(validCreate.productionLine, 'Line A');
  assert.equal((await validate(validCreate)).length, 0);

  const invalidTransition = plainToInstance(TransitionProductionDto, {
    version: 0,
    toStatus: 'UNKNOWN',
    reason: 'x'.repeat(501),
  });
  assert.ok((await validate(invalidTransition)).length >= 3);
});

test('Production permissions follow read and manufacturer-operation boundaries', () => {
  for (const role of [Role.ADMIN, Role.MANAGER, Role.PRODUCER]) {
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.PRODUCTIONS_READ));
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.PRODUCTIONS_CREATE));
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.PRODUCTIONS_TRANSITION));
  }
  for (const role of [Role.SALES, Role.USER]) {
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.PRODUCTIONS_READ));
    assert.equal(ROLE_PERMISSIONS[role].includes(PERMISSIONS.PRODUCTIONS_CREATE), false);
    assert.equal(ROLE_PERMISSIONS[role].includes(PERMISSIONS.PRODUCTIONS_TRANSITION), false);
  }
});

test('controller delegates create and transition without hidden Order side effects', async () => {
  const calls = [];
  const service = {
    create: async (...args) => calls.push(['create', ...args]),
    transition: async (...args) => calls.push(['transition', ...args]),
  };
  const controller = new ProductionsController(service);
  const createBody = { orderVersion: 2 };
  const transitionBody = { version: 1, toStatus: ProductionStatus.IN_PROGRESS };

  await controller.create('order-1', createBody, producerActor);
  await controller.transition('production-1', transitionBody, producerActor);

  assert.deepEqual(calls, [
    ['create', 'order-1', createBody, producerActor],
    ['transition', 'production-1', transitionBody, producerActor],
  ]);
});

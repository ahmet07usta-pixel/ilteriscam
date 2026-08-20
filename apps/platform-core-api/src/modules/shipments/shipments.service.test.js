const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ConflictException, ForbiddenException, NotFoundException } = require('@nestjs/common');
const { Prisma, ProductionStatus, Role, ShipmentStatus } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CreateShipmentDto } = require('./dto/create-shipment.dto.ts');
const { TransitionShipmentDto } = require('./dto/transition-shipment.dto.ts');
const { ShipmentsController } = require('./shipments.controller.ts');
const { ShipmentsService: BaseShipmentsService } = require('./shipments.service.ts');
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

class ShipmentsService extends BaseShipmentsService {
  constructor(prisma, audit, notifications = createNotificationsMock()) {
    super(prisma, audit, notifications);
  }
}

const producerActor = {
  sub: 'producer-user',
  email: 'producer@example.invalid',
  role: Role.PRODUCER,
  permissions: [
    PERMISSIONS.SHIPMENTS_READ,
    PERMISSIONS.SHIPMENTS_CREATE,
    PERMISSIONS.SHIPMENTS_TRANSITION,
  ],
  tokenType: 'access',
};

function shipmentFixture(overrides = {}) {
  return {
    id: 'shipment-1',
    shipmentNumber: 'SHP-PRD-ORD-TEST-1',
    productionId: 'production-1',
    orderId: 'order-1',
    manufacturerCompanyId: 'manufacturer-company',
    createdByUserId: producerActor.sub,
    status: ShipmentStatus.PLANNED,
    version: 1,
    destinationAddress: 'Test delivery address',
    plannedDepartureAt: new Date('2026-09-02T08:00:00.000Z'),
    estimatedDeliveryAt: new Date('2026-09-03T16:00:00.000Z'),
    departedAt: null,
    deliveredAt: null,
    carrier: null,
    trackingNumber: null,
    notes: null,
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
  const captured = {
    productionWhere: null,
    createData: null,
    membershipWhere: null,
    isolationLevel: null,
  };
  const transaction = {
    production: {
      findFirst: async ({ where }) => {
        captured.productionWhere = where;
        if (options.production === null) return null;
        return options.production ?? {
          id: 'production-1',
          productionNumber: 'PRD-ORD-TEST-1',
          orderId: 'order-1',
          manufacturerCompanyId: 'manufacturer-company',
        };
      },
    },
    company: {
      findFirst: async ({ where }) => {
        captured.membershipWhere = where;
        return options.membership === false ? null : { id: where.id };
      },
    },
    shipment: {
      create: async ({ data }) => {
        captured.createData = data;
        if (options.createError) throw options.createError;
        return shipmentFixture({ ...data });
      },
    },
  };
  const prisma = {
    $transaction: async (operation, transactionOptions) => {
      captured.isolationLevel = transactionOptions.isolationLevel;
      if (options.transactionError) throw options.transactionError;
      return operation(transaction);
    },
  };
  return { prisma, transaction, captured };
}

function shipmentPrisma(existing = shipmentFixture(), options = {}) {
  const captured = {
    update: null,
    membershipWhere: null,
    isolationLevel: null,
    listWhere: null,
    detailWhere: null,
  };
  const transaction = {
    shipment: {
      updateMany: async (args) => {
        captured.update = args;
        return { count: options.updateCount ?? 1 };
      },
      findUniqueOrThrow: async () => shipmentFixture({
        ...existing,
        status: captured.update.data.status,
        departedAt: captured.update.data.departedAt ?? existing.departedAt,
        deliveredAt: captured.update.data.deliveredAt ?? existing.deliveredAt,
        version: existing.version + 1,
      }),
    },
  };
  const prisma = {
    shipment: {
      findUnique: async () => existing,
      findMany: async ({ where }) => {
        captured.listWhere = where;
        return [];
      },
      findFirst: async ({ where }) => {
        captured.detailWhere = where;
        return options.detailMissing ? null : existing;
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

const createInput = {
  productionVersion: 4,
  destinationAddress: 'Test delivery address',
  plannedDepartureAt: '2026-09-02T08:00:00.000Z',
  estimatedDeliveryAt: '2026-09-03T16:00:00.000Z',
};

test('plans one Shipment from a current COMPLETED Production with transactional audit', async () => {
  const { prisma, transaction, captured } = createPrisma();
  const audit = createAuditMock();
  const service = new ShipmentsService(prisma, audit);

  const result = await service.create('production-1', createInput, producerActor);

  assert.equal(captured.productionWhere.status, ProductionStatus.COMPLETED);
  assert.equal(captured.productionWhere.version, createInput.productionVersion);
  assert.equal(captured.createData.shipmentNumber, 'SHP-PRD-ORD-TEST-1');
  assert.equal(captured.createData.productionId, 'production-1');
  assert.equal(captured.createData.orderId, 'order-1');
  assert.equal(result.status, ShipmentStatus.PLANNED);
  assert.equal(captured.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.equal(audit.records[0].client, transaction);
  assert.equal(audit.records[0].resource, 'shipment');
  assert.equal(audit.records[0].action, 'CREATE');
});

test('rejects non-completed or stale Production, invalid schedule, and duplicate Shipment', async () => {
  const missing = createPrisma({ production: null });
  await assert.rejects(
    new ShipmentsService(missing.prisma, createAuditMock()).create(
      'production-1',
      createInput,
      producerActor,
    ),
    ConflictException,
  );

  const schedule = createPrisma();
  await assert.rejects(
    new ShipmentsService(schedule.prisma, createAuditMock()).create(
      'production-1',
      {
        ...createInput,
        estimatedDeliveryAt: '2026-09-01T08:00:00.000Z',
      },
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
    new ShipmentsService(duplicate.prisma, createAuditMock()).create(
      'production-1',
      createInput,
      producerActor,
    ),
    ConflictException,
  );
});

test('requires active manufacturer scope for create and transition', async () => {
  const createContext = createPrisma({ membership: false });
  await assert.rejects(
    new ShipmentsService(createContext.prisma, createAuditMock()).create(
      'production-1',
      createInput,
      producerActor,
    ),
    ForbiddenException,
  );

  const transitionContext = shipmentPrisma(shipmentFixture(), { membership: false });
  await assert.rejects(
    new ShipmentsService(transitionContext.prisma, createAuditMock()).transition(
      'shipment-1',
      { version: 1, toStatus: ShipmentStatus.IN_TRANSIT },
      producerActor,
    ),
    ForbiddenException,
  );

  const buyerActor = { ...producerActor, role: Role.USER };
  const buyerContext = createPrisma();
  await assert.rejects(
    new ShipmentsService(buyerContext.prisma, createAuditMock()).create(
      'production-1',
      createInput,
      buyerActor,
    ),
    ForbiddenException,
  );
});

test('read scope includes active buyer and manufacturer memberships', async () => {
  const { prisma, captured } = shipmentPrisma();
  const service = new ShipmentsService(prisma, createAuditMock());

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

test('returns 404 when a scoped Shipment detail is unavailable', async () => {
  const { prisma } = shipmentPrisma(shipmentFixture(), { detailMissing: true });
  await assert.rejects(
    new ShipmentsService(prisma, createAuditMock()).get('shipment-1', producerActor),
    NotFoundException,
  );
});

test('transitions PLANNED to IN_TRANSIT with CAS, timestamp, and transactional audit', async () => {
  const existing = shipmentFixture();
  const { prisma, transaction, captured } = shipmentPrisma(existing);
  const audit = createAuditMock();
  const notifications = createNotificationsMock();
  const service = new ShipmentsService(prisma, audit, notifications);

  const result = await service.transition(existing.id, {
    version: existing.version,
    toStatus: ShipmentStatus.IN_TRANSIT,
  }, producerActor);

  assert.equal(captured.update.where.status, ShipmentStatus.PLANNED);
  assert.equal(captured.update.where.version, existing.version);
  assert.equal(captured.update.data.status, ShipmentStatus.IN_TRANSIT);
  assert.ok(captured.update.data.departedAt instanceof Date);
  assert.deepEqual(captured.update.data.version, { increment: 1 });
  assert.equal(result.status, ShipmentStatus.IN_TRANSIT);
  assert.equal(audit.records[0].client, transaction);
  assert.equal(audit.records[0].metadata.fromStatus, ShipmentStatus.PLANNED);
  assert.equal(audit.records[0].metadata.toStatus, ShipmentStatus.IN_TRANSIT);
  assert.equal(notifications.calls.length, 1);
  assert.equal(notifications.calls[0].companyId, existing.order.companyId);
  assert.equal(notifications.calls[0].event.type, 'SHIPMENT_IN_TRANSIT');
});

test('transitions IN_TRANSIT to DELIVERED without Order or Production writes', async () => {
  const existing = shipmentFixture({
    status: ShipmentStatus.IN_TRANSIT,
    departedAt: new Date('2026-09-02T08:00:00.000Z'),
  });
  const { prisma, captured } = shipmentPrisma(existing);
  const notifications = createNotificationsMock();

  const result = await new ShipmentsService(prisma, createAuditMock(), notifications).transition(
    existing.id,
    { version: existing.version, toStatus: ShipmentStatus.DELIVERED },
    producerActor,
  );

  assert.ok(captured.update.data.deliveredAt instanceof Date);
  assert.equal(result.status, ShipmentStatus.DELIVERED);
  assert.equal(Object.hasOwn(captured.update.data, 'order'), false);
  assert.equal(Object.hasOwn(captured.update.data, 'production'), false);
  assert.equal(notifications.calls.length, 1);
  assert.equal(notifications.calls[0].event.type, 'SHIPMENT_DELIVERED');
});

test('rejects invalid transitions, stale versions, and P2034 without audit', async () => {
  const invalid = shipmentPrisma(shipmentFixture());
  await assert.rejects(
    new ShipmentsService(invalid.prisma, createAuditMock()).transition(
      'shipment-1',
      { version: 1, toStatus: ShipmentStatus.DELIVERED },
      producerActor,
    ),
    ConflictException,
  );

  const stale = shipmentPrisma(shipmentFixture(), { updateCount: 0 });
  const staleAudit = createAuditMock();
  await assert.rejects(
    new ShipmentsService(stale.prisma, staleAudit).transition(
      'shipment-1',
      { version: 99, toStatus: ShipmentStatus.IN_TRANSIT },
      producerActor,
    ),
    ConflictException,
  );
  assert.equal(staleAudit.records.length, 0);

  const transactionError = new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: '5.22.0',
  });
  const conflict = shipmentPrisma(shipmentFixture(), { transactionError });
  await assert.rejects(
    new ShipmentsService(conflict.prisma, createAuditMock()).transition(
      'shipment-1',
      { version: 1, toStatus: ShipmentStatus.IN_TRANSIT },
      producerActor,
    ),
    ConflictException,
  );
});

test('Shipment DTOs constrain versions, schedule fields, and optional metadata', async () => {
  const validCreate = plainToInstance(CreateShipmentDto, {
    ...createInput,
    destinationAddress: '  Test delivery address  ',
    carrier: '  Test Carrier  ',
  });
  assert.equal(validCreate.destinationAddress, 'Test delivery address');
  assert.equal(validCreate.carrier, 'Test Carrier');
  assert.equal((await validate(validCreate)).length, 0);

  const invalidTransition = plainToInstance(TransitionShipmentDto, {
    version: 0,
    toStatus: 'UNKNOWN',
  });
  assert.ok((await validate(invalidTransition)).length >= 2);
});

test('Shipment permissions follow read and manufacturer-operation boundaries', () => {
  for (const role of [Role.ADMIN, Role.MANAGER, Role.PRODUCER]) {
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.SHIPMENTS_READ));
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.SHIPMENTS_CREATE));
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.SHIPMENTS_TRANSITION));
  }
  for (const role of [Role.SALES, Role.USER]) {
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.SHIPMENTS_READ));
    assert.equal(ROLE_PERMISSIONS[role].includes(PERMISSIONS.SHIPMENTS_CREATE), false);
    assert.equal(ROLE_PERMISSIONS[role].includes(PERMISSIONS.SHIPMENTS_TRANSITION), false);
  }
});

test('controller delegates list, detail, create, and transition', async () => {
  const calls = [];
  const service = {
    list: async (...args) => calls.push(['list', ...args]),
    get: async (...args) => calls.push(['get', ...args]),
    create: async (...args) => calls.push(['create', ...args]),
    transition: async (...args) => calls.push(['transition', ...args]),
  };
  const controller = new ShipmentsController(service);
  const transitionBody = { version: 1, toStatus: ShipmentStatus.IN_TRANSIT };

  await controller.list(producerActor);
  await controller.get('shipment-1', producerActor);
  await controller.create('production-1', createInput, producerActor);
  await controller.transition('shipment-1', transitionBody, producerActor);

  assert.deepEqual(calls, [
    ['list', producerActor],
    ['get', 'shipment-1', producerActor],
    ['create', 'production-1', createInput, producerActor],
    ['transition', 'shipment-1', transitionBody, producerActor],
  ]);
});
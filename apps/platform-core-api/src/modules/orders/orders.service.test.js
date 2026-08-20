const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ConflictException, ForbiddenException } = require('@nestjs/common');
const { OrderStatus, Prisma, QuotationStatus, Role } = require('@prisma/client');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');
const { CancelOrderDto } = require('./dto/cancel-order.dto.ts');
const { OrdersService } = require('./orders.service.ts');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../rbac/permissions.ts');

const producerActor = {
  sub: 'producer-user',
  email: 'producer@example.invalid',
  role: Role.PRODUCER,
  permissions: ['orders.read', 'orders.confirm'],
  tokenType: 'access',
};

const buyerActor = {
  sub: 'buyer-user',
  email: 'buyer@example.invalid',
  role: Role.SALES,
  permissions: ['orders.read', 'orders.cancel'],
  tokenType: 'access',
};

function orderFixture(overrides = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-TEST-1',
    requestId: 'request-1',
    quotationId: 'quotation-1',
    companyId: 'buyer-company',
    manufacturerCompanyId: 'manufacturer-company',
    createdByUserId: 'buyer-user',
    status: OrderStatus.PENDING_CONFIRMATION,
    version: 2,
    confirmedAt: null,
    confirmedByUserId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    currency: 'TRY',
    totalAmount: { toString: () => '125000.5' },
    promisedDeliveryDate: new Date('2026-09-01T00:00:00.000Z'),
    request: {
      id: 'request-1',
      requestNumber: 'REQ-TEST-1',
      companyId: 'buyer-company',
      status: 'AWARDED',
    },
    quotation: {
      id: 'quotation-1',
      quotationNumber: 'QUO-TEST-1',
      requestId: 'request-1',
      companyId: 'buyer-company',
      manufacturerCompanyId: 'manufacturer-company',
      status: QuotationStatus.ACCEPTED,
    },
    company: { id: 'buyer-company' },
    manufacturerCompany: { id: 'manufacturer-company' },
    createdBy: null,
    confirmedBy: null,
    cancelledBy: null,
    ...overrides,
  };
}

function createAuditMock(options = {}) {
  const records = [];
  return {
    records,
    record: async (payload, client) => {
      records.push({ ...payload, client });
      if (options.error) throw options.error;
      return payload;
    },
  };
}

function createNotificationsMock() {
  const calls = [];
  return {
    calls,
    notifyCompany: async (companyId, event) => {
      calls.push({ companyId, event });
    },
  };
}

function transitionPrisma(existing, options = {}) {
  const captured = { update: null, membershipWhere: null, isolationLevel: null };
  const transaction = {
    order: {
      updateMany: async (args) => {
        captured.update = args;
        return { count: options.updateCount ?? 1 };
      },
      findUniqueOrThrow: async () => orderFixture({
        ...existing,
        ...captured.update?.data,
        version: existing.version + 1,
      }),
    },
  };
  const prisma = {
    order: { findUnique: async () => existing },
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

test('confirm transitions PENDING_CONFIRMATION to CONFIRMED with server-owned fields', async () => {
  const existing = orderFixture();
  const { prisma, transaction, captured } = transitionPrisma(existing);
  const audit = createAuditMock();
  const notifications = createNotificationsMock();
  const service = new OrdersService(prisma, audit, notifications);

  const result = await service.confirm(existing.id, existing.version, producerActor);

  assert.equal(captured.update.where.id, existing.id);
  assert.equal(captured.update.where.status, OrderStatus.PENDING_CONFIRMATION);
  assert.equal(captured.update.where.version, existing.version);
  assert.equal(captured.update.data.status, OrderStatus.CONFIRMED);
  assert.equal(captured.update.data.confirmedByUserId, producerActor.sub);
  assert.ok(captured.update.data.confirmedAt instanceof Date);
  assert.deepEqual(captured.update.data.version, { increment: 1 });
  assert.equal(result.status, OrderStatus.CONFIRMED);
  assert.equal(audit.records[0].client, transaction);
  assert.equal(notifications.calls.length, 1);
  assert.equal(notifications.calls[0].companyId, existing.companyId);
  assert.equal(notifications.calls[0].event.type, 'ORDER_CONFIRMED');
});

test('cancel transitions PENDING_CONFIRMATION to CANCELLED with reason and server-owned fields', async () => {
  const existing = orderFixture();
  const { prisma, transaction, captured } = transitionPrisma(existing);
  const audit = createAuditMock();
  const notifications = createNotificationsMock();
  const service = new OrdersService(prisma, audit, notifications);

  const result = await service.cancel(existing.id, existing.version, 'Buyer changed plans', buyerActor);

  assert.equal(captured.update.where.status, OrderStatus.PENDING_CONFIRMATION);
  assert.equal(captured.update.data.status, OrderStatus.CANCELLED);
  assert.equal(captured.update.data.cancelledByUserId, buyerActor.sub);
  assert.ok(captured.update.data.cancelledAt instanceof Date);
  assert.equal(captured.update.data.cancellationReason, 'Buyer changed plans');
  assert.equal(result.status, OrderStatus.CANCELLED);
  assert.equal(audit.records[0].client, transaction);
  assert.equal(notifications.calls.length, 1);
  assert.equal(notifications.calls[0].companyId, existing.manufacturerCompanyId);
  assert.equal(notifications.calls[0].event.type, 'ORDER_CANCELLED');
});

test('second confirm and CANCELLED to CONFIRMED are rejected', async () => {
  for (const status of [OrderStatus.CONFIRMED, OrderStatus.CANCELLED]) {
    const existing = orderFixture({ status });
    const { prisma } = transitionPrisma(existing);
    const service = new OrdersService(prisma, createAuditMock(), createNotificationsMock());
    await assert.rejects(service.confirm(existing.id, existing.version, producerActor), ConflictException);
  }
});

test('second cancel and CONFIRMED to CANCELLED are rejected', async () => {
  for (const status of [OrderStatus.CANCELLED, OrderStatus.CONFIRMED]) {
    const existing = orderFixture({ status });
    const { prisma } = transitionPrisma(existing);
    const service = new OrdersService(prisma, createAuditMock(), createNotificationsMock());
    await assert.rejects(service.cancel(existing.id, existing.version, undefined, buyerActor), ConflictException);
  }
});

test('another manufacturer cannot confirm an Order', async () => {
  const existing = orderFixture();
  const { prisma } = transitionPrisma(existing, { membership: false });
  const service = new OrdersService(prisma, createAuditMock(), createNotificationsMock());
  const otherProducer = { ...producerActor, sub: 'other-producer' };

  await assert.rejects(service.confirm(existing.id, existing.version, otherProducer), ForbiddenException);
});

test('another buyer company cannot cancel an Order', async () => {
  const existing = orderFixture();
  const { prisma } = transitionPrisma(existing, { membership: false });
  const service = new OrdersService(prisma, createAuditMock(), createNotificationsMock());
  const otherBuyer = { ...buyerActor, sub: 'other-buyer' };

  await assert.rejects(
    service.cancel(existing.id, existing.version, undefined, otherBuyer),
    ForbiddenException,
  );
});

test('inactive manufacturer or buyer membership is rejected', async () => {
  const existing = orderFixture();
  for (const [operation, actor] of [
    ['confirm', producerActor],
    ['cancel', buyerActor],
  ]) {
    const { prisma } = transitionPrisma(existing, { membership: false });
    const service = new OrdersService(prisma, createAuditMock(), createNotificationsMock());
    const promise = operation === 'confirm'
      ? service.confirm(existing.id, existing.version, actor)
      : service.cancel(existing.id, existing.version, undefined, actor);
    await assert.rejects(promise, ForbiddenException);
  }
});

test('Producer cannot cancel even with a custom cancel permission', async () => {
  const existing = orderFixture();
  const { prisma } = transitionPrisma(existing);
  const service = new OrdersService(prisma, createAuditMock(), createNotificationsMock());
  const producerWithCancel = { ...producerActor, permissions: [...producerActor.permissions, 'orders.cancel'] };

  await assert.rejects(
    service.cancel(existing.id, existing.version, undefined, producerWithCancel),
    ForbiddenException,
  );
});

test('version conflict rejects transition and writes no audit', async () => {
  const existing = orderFixture();
  const { prisma } = transitionPrisma(existing, { updateCount: 0 });
  const audit = createAuditMock();
  const service = new OrdersService(prisma, audit, createNotificationsMock());

  await assert.rejects(service.confirm(existing.id, 1, producerActor), ConflictException);
  assert.equal(audit.records.length, 0);
});

test('mutation does not include commercial, party, Request, or Quotation fields', async () => {
  const existing = orderFixture();
  const { prisma, captured } = transitionPrisma(existing);
  const service = new OrdersService(prisma, createAuditMock(), createNotificationsMock());

  await service.confirm(existing.id, existing.version, producerActor);

  for (const field of [
    'companyId',
    'manufacturerCompanyId',
    'requestId',
    'quotationId',
    'totalAmount',
    'currency',
    'promisedDeliveryDate',
  ]) {
    assert.equal(Object.hasOwn(captured.update.data, field), false, field);
  }
});

test('confirm and cancel audits contain transitions without commercial values', async () => {
  const cases = [
    {
      action: 'CONFIRM',
      toStatus: OrderStatus.CONFIRMED,
      actor: producerActor,
      execute: (service, existing) => service.confirm(existing.id, existing.version, producerActor),
    },
    {
      action: 'CANCEL',
      toStatus: OrderStatus.CANCELLED,
      actor: buyerActor,
      execute: (service, existing) => service.cancel(existing.id, existing.version, 'No longer needed', buyerActor),
    },
  ];

  for (const entry of cases) {
    const existing = orderFixture();
    const { prisma } = transitionPrisma(existing);
    const audit = createAuditMock();
    const service = new OrdersService(prisma, audit, createNotificationsMock());
    await entry.execute(service, existing);
    const record = audit.records[0];

    assert.equal(record.actorId, entry.actor.sub);
    assert.equal(record.resource, 'order');
    assert.equal(record.action, entry.action);
    assert.deepEqual(
      {
        orderId: record.metadata.orderId,
        requestId: record.metadata.requestId,
        quotationId: record.metadata.quotationId,
        fromStatus: record.metadata.fromStatus,
        toStatus: record.metadata.toStatus,
        version: record.metadata.version,
      },
      {
        orderId: existing.id,
        requestId: existing.requestId,
        quotationId: existing.quotationId,
        fromStatus: OrderStatus.PENDING_CONFIRMATION,
        toStatus: entry.toStatus,
        version: existing.version + 1,
      },
    );
    assert.equal(Object.hasOwn(record.metadata, 'totalAmount'), false);
    assert.equal(Object.hasOwn(record.metadata, 'currency'), false);
  }
});

test('P2034 transaction errors map to ConflictException', async () => {
  const existing = orderFixture();
  const transactionError = new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: '5.22.0',
  });
  const { prisma } = transitionPrisma(existing, { transactionError });
  const service = new OrdersService(prisma, createAuditMock(), createNotificationsMock());

  await assert.rejects(service.confirm(existing.id, existing.version, producerActor), ConflictException);
});

test('cancellationReason is optional, trimmed, and limited to 500 characters', async () => {
  const valid = plainToInstance(CancelOrderDto, { version: 1, cancellationReason: '  reason  ' });
  assert.equal(valid.cancellationReason, 'reason');
  assert.equal((await validate(valid)).length, 0);

  const tooLong = plainToInstance(CancelOrderDto, { version: 1, cancellationReason: 'x'.repeat(501) });
  assert.ok((await validate(tooLong)).length > 0);

  const empty = plainToInstance(CancelOrderDto, { version: 1, cancellationReason: '   ' });
  assert.ok((await validate(empty)).length > 0);
});

test('Order permissions follow the intended role matrix', () => {
  for (const role of [Role.ADMIN, Role.MANAGER]) {
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.ORDERS_READ));
    assert.ok(ROLE_PERMISSIONS[role].includes(PERMISSIONS.ORDERS_CANCEL));
    assert.equal(ROLE_PERMISSIONS[role].includes(PERMISSIONS.ORDERS_CONFIRM), false);
  }
  assert.ok(ROLE_PERMISSIONS[Role.SALES].includes(PERMISSIONS.ORDERS_READ));
  assert.ok(ROLE_PERMISSIONS[Role.SALES].includes(PERMISSIONS.ORDERS_CANCEL));
  assert.equal(ROLE_PERMISSIONS[Role.SALES].includes(PERMISSIONS.ORDERS_CONFIRM), false);
  assert.ok(ROLE_PERMISSIONS[Role.PRODUCER].includes(PERMISSIONS.ORDERS_READ));
  assert.ok(ROLE_PERMISSIONS[Role.PRODUCER].includes(PERMISSIONS.ORDERS_CONFIRM));
  assert.equal(ROLE_PERMISSIONS[Role.PRODUCER].includes(PERMISSIONS.ORDERS_CANCEL), false);
  assert.deepEqual(
    ROLE_PERMISSIONS[Role.USER].filter((permission) => permission.startsWith('orders.')),
    [PERMISSIONS.ORDERS_READ],
  );
});
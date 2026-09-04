const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ConflictException, NotFoundException } = require('@nestjs/common');
const {
  MeasurementSource,
  MeasurementStatus,
  MeasurementUnit,
  RequestStatus,
  Role,
} = require('@prisma/client');
const { RequestItemsService } = require('./request-items.service.ts');

const actor = {
  sub: 'buyer-user',
  email: 'buyer@example.invalid',
  role: Role.SALES,
  permissions: [
    'request-items.read',
    'request-items.create',
    'request-items.update',
    'request-items.delete',
  ],
  tokenType: 'access',
};

function requestFixture(overrides = {}) {
  return {
    id: 'request-1',
    companyId: 'buyer-company',
    productType: 'LAMINATED_GLASS',
    status: RequestStatus.DRAFT,
    ...overrides,
  };
}

function itemFixture(overrides = {}) {
  return {
    id: 'item-1',
    requestId: 'request-1',
    lineNumber: 1,
    description: 'Panel',
    productType: 'LAMINATED_GLASS',
    productCode: null,
    quantity: 2,
    unit: MeasurementUnit.PIECE,
    measurementSource: null,
    measurementStatus: MeasurementStatus.PENDING,
    widthMm: null,
    heightMm: null,
    lengthMm: null,
    depthMm: null,
    thicknessMm: null,
    calculatedAreaM2: null,
    calculatedLengthM: null,
    calculatedVolumeM3: null,
    version: 1,
    ...overrides,
  };
}

function createAuditMock() {
  const records = [];
  return {
    records,
    record: async (payload, client) => {
      records.push({ payload, client });
      return payload;
    },
  };
}

function createHarness(options = {}) {
  const request = options.request === undefined ? requestFixture() : options.request;
  const items = [...(options.items ?? [itemFixture()])];
  const captured = { creates: [], updates: [], deletes: [], transactionClients: [] };

  const requestDelegate = {
    findFirst: async () => request,
  };
  const requestItemDelegate = {
    findFirst: async (args) => {
      if (args.orderBy?.lineNumber === 'desc') {
        return [...items].sort((left, right) => right.lineNumber - left.lineNumber)[0] ?? null;
      }
      return items.find((item) => item.id === args.where.id && item.requestId === args.where.requestId) ?? null;
    },
    findMany: async () => [...items].sort((left, right) => left.lineNumber - right.lineNumber),
    create: async ({ data }) => {
      captured.creates.push(data);
      const created = itemFixture({
        ...data,
        id: `item-${items.length + 1}`,
        version: 1,
      });
      items.push(created);
      return created;
    },
    updateMany: async (args) => {
      captured.updates.push(args);
      if (options.updateCount === 0) {
        return { count: 0 };
      }
      const index = items.findIndex((item) => item.id === args.where.id
        && item.requestId === args.where.requestId
        && item.version === args.where.version);
      if (index < 0) {
        return { count: 0 };
      }
      const data = Object.fromEntries(Object.entries(args.data).filter(([, value]) => value !== undefined));
      items[index] = { ...items[index], ...data, version: items[index].version + 1 };
      return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }) => {
      const item = items.find((candidate) => candidate.id === where.id);
      if (!item) throw new Error('Item not found');
      return item;
    },
    deleteMany: async (args) => {
      captured.deletes.push(args);
      const index = items.findIndex((item) => item.id === args.where.id
        && item.requestId === args.where.requestId
        && item.version === args.where.version);
      if (index < 0) {
        return { count: 0 };
      }
      items.splice(index, 1);
      return { count: 1 };
    },
  };
  const transaction = { request: requestDelegate, requestItem: requestItemDelegate };
  const prisma = {
    request: requestDelegate,
    requestItem: requestItemDelegate,
    $transaction: async (operation) => {
      captured.transactionClients.push(transaction);
      return operation(transaction);
    },
  };
  const audit = createAuditMock();
  return { service: new RequestItemsService(prisma, audit), audit, captured, items, transaction };
}

const createInput = {
  description: 'New panel',
  quantity: 3,
  unit: MeasurementUnit.PIECE,
  width: 1200,
  height: 800,
};

test('creates an item on a DRAFT Request and audits in the transaction', async () => {
  const harness = createHarness({ items: [] });

  const result = await harness.service.create('request-1', createInput, actor);

  assert.equal(result.lineNumber, 1);
  assert.equal(result.measurementStatus, MeasurementStatus.APPROVED);
  assert.equal(result.measurementSource, MeasurementSource.USER);
  assert.equal(result.calculatedAreaM2.toString(), '0.96');
  assert.equal(harness.captured.creates[0].widthMm, 1200);
  assert.equal(harness.captured.creates[0].heightMm, 800);
  assert.equal(harness.audit.records[0].client, harness.transaction);
  assert.deepEqual(harness.audit.records[0].payload.metadata.changedFields.sort(), [
    'description', 'heightMm', 'productType', 'quantity', 'unit', 'widthMm',
  ].sort());
});

test('rejects RequestItem access for a Request outside the actor tenant scope', async () => {
  const harness = createHarness({ request: null });

  await assert.rejects(harness.service.list('request-1', actor), NotFoundException);
});

test('rejects create on a non-DRAFT Request', async () => {
  const harness = createHarness({ request: requestFixture({ status: RequestStatus.OPEN_FOR_QUOTATION }) });

  await assert.rejects(harness.service.create('request-1', createInput, actor), ConflictException);
  assert.equal(harness.captured.creates.length, 0);
});

test('rejects update on a non-DRAFT Request', async () => {
  const harness = createHarness({ request: requestFixture({ status: RequestStatus.QUOTED }) });

  await assert.rejects(
    harness.service.update('request-1', 'item-1', { version: 1, description: 'Changed' }, actor),
    ConflictException,
  );
  assert.equal(harness.captured.updates.length, 0);
});

test('rejects delete on a non-DRAFT Request', async () => {
  const harness = createHarness({ request: requestFixture({ status: RequestStatus.AWARDED }) });

  await assert.rejects(harness.service.delete('request-1', 'item-1', 1, actor), ConflictException);
  assert.equal(harness.captured.deletes.length, 0);
});

test('updates with the expected version and increments version', async () => {
  const harness = createHarness();

  const result = await harness.service.update(
    'request-1',
    'item-1',
    { version: 1, description: 'Updated panel', thickness: 8 },
    actor,
  );

  assert.deepEqual(harness.captured.updates[0].where, {
    id: 'item-1', requestId: 'request-1', version: 1,
  });
  assert.deepEqual(harness.captured.updates[0].data.version, { increment: 1 });
  assert.equal(result.version, 2);
  assert.equal(result.thicknessMm, 8);
  assert.equal(harness.audit.records[0].client, harness.transaction);
});

test('raises a concurrency conflict for an incorrect update version', async () => {
  const harness = createHarness();

  await assert.rejects(
    harness.service.update('request-1', 'item-1', { version: 9, description: 'Stale' }, actor),
    (error) => error instanceof ConflictException
      && error.message === 'Request item was modified by another operation',
  );
  assert.equal(harness.audit.records.length, 0);
});

test('allocates distinct sequential line numbers within a Request', async () => {
  const harness = createHarness({ items: [] });

  const first = await harness.service.create('request-1', createInput, actor);
  const second = await harness.service.create('request-1', createInput, actor);

  assert.equal(first.lineNumber, 1);
  assert.equal(second.lineNumber, 2);
  assert.equal(new Set(harness.items.map((item) => item.lineNumber)).size, 2);
});

test('derives productType from Request when the client omits it', async () => {
  const harness = createHarness({ items: [] });

  await harness.service.create('request-1', createInput, actor);

  assert.equal(harness.captured.creates[0].productType, 'LAMINATED_GLASS');
});

test('computes calculated fields from width/height/length/depth, ignoring any client-injected calculated values', async () => {
  const harness = createHarness({ items: [itemFixture({ widthMm: 1000, heightMm: 500 })] });

  await harness.service.update('request-1', 'item-1', {
    version: 1,
    calculatedAreaM2: 99,
    calculatedLengthM: 98,
    calculatedVolumeM3: 97,
  }, actor);

  const updateData = harness.captured.updates[0].data;
  // 1000mm x 500mm = 0.5 m2 - derived from the item's actual dimensions, not the injected 99.
  assert.equal(updateData.calculatedAreaM2.toString(), '0.5');
  assert.equal(updateData.calculatedLengthM, undefined);
  assert.equal(updateData.calculatedVolumeM3, undefined);
});

test('sets measurementStatus from the server\'s own approval rule, ignoring any client-injected value', async () => {
  const harness = createHarness({ items: [] });

  await harness.service.create('request-1', {
    ...createInput,
    measurementSource: MeasurementSource.USER,
    measurementStatus: MeasurementStatus.REJECTED,
  }, actor);

  assert.equal(harness.captured.creates[0].measurementStatus, MeasurementStatus.APPROVED);
  assert.equal(harness.items[0].measurementStatus, MeasurementStatus.APPROVED);

  await harness.service.update('request-1', harness.items[0].id, {
    version: 1,
    measurementStatus: MeasurementStatus.REJECTED,
  }, actor);
  assert.equal(harness.captured.updates[0].data.measurementStatus, MeasurementStatus.APPROVED);
  assert.equal(harness.items[0].measurementStatus, MeasurementStatus.APPROVED);
});
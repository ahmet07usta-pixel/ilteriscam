const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const {
  CalculationStatus,
  MeasurementStatus,
  MeasurementUnit,
  PriceCatalogStatus,
  Prisma,
  QuotationStatus,
  RequestStatus,
  Role,
} = require('@prisma/client');
const { PricingService } = require('../pricing/pricing.service.ts');
const { QuotationCalculationsService } = require('./quotation-calculations.service.ts');

const actor = {
  sub: 'manufacturer-user',
  email: 'manufacturer@example.invalid',
  role: Role.PRODUCER,
  permissions: [
    'quotation-calculations.read',
    'quotation-calculations.create',
    'quotation-calculations.finalize',
  ],
  tokenType: 'access',
};

function quotationFixture(overrides = {}) {
  return {
    id: 'quotation-1',
    requestId: 'request-1',
    companyId: 'buyer-company',
    manufacturerCompanyId: 'manufacturer-company',
    totalAmount: new Prisma.Decimal('1.00'),
    currency: 'TRY',
    status: QuotationStatus.DRAFT,
    revisionNumber: 1,
    version: 3,
    request: {
      id: 'request-1',
      companyId: 'buyer-company',
      regionId: 'region-1',
      status: RequestStatus.OPEN_FOR_QUOTATION,
    },
    ...overrides,
  };
}

function approvedItem(overrides = {}) {
  return {
    id: 'item-1',
    requestId: 'request-1',
    lineNumber: 1,
    description: 'Glass panel',
    productCode: 'GLASS-01',
    productType: 'LAMINATED_GLASS',
    quantity: new Prisma.Decimal('2'),
    unit: MeasurementUnit.PIECE,
    widthMm: new Prisma.Decimal('1200'),
    heightMm: new Prisma.Decimal('800'),
    lengthMm: null,
    depthMm: null,
    thicknessMm: new Prisma.Decimal('8'),
    calculatedAreaM2: new Prisma.Decimal('0.96'),
    calculatedLengthM: null,
    calculatedVolumeM3: null,
    measurementStatus: MeasurementStatus.APPROVED,
    version: 2,
    ...overrides,
  };
}

function catalogFixture(overrides = {}) {
  return {
    id: 'catalog-1',
    companyId: 'manufacturer-company',
    productCode: 'GLASS-01',
    productType: 'LAMINATED_GLASS',
    baseUnit: MeasurementUnit.M2,
    unitPrice: new Prisma.Decimal('100'),
    currency: 'TRY',
    minimumOrderAmount: null,
    defaultWasteRate: new Prisma.Decimal('0'),
    defaultDiscountRate: new Prisma.Decimal('0'),
    status: PriceCatalogStatus.ACTIVE,
    version: 1,
    validFrom: null,
    validUntil: null,
    regionalAdjustments: [],
    ...overrides,
  };
}

function createHarness(options = {}) {
  const quotation = options.quotation === undefined ? quotationFixture() : options.quotation;
  const items = options.items ?? [approvedItem()];
  const catalogs = options.catalogs ?? [catalogFixture()];
  const calculations = [...(options.calculations ?? [])];
  const quotationItems = [];
  const captured = {
    itemWhere: null,
    catalogWhere: null,
    quotationUpdates: [],
    calculationUpdates: [],
    orderWrites: 0,
    acceptanceWrites: 0,
  };

  const quotationDelegate = {
    findFirst: async () => quotation,
    updateMany: async (args) => {
      captured.quotationUpdates.push(args);
      if (options.quotationUpdateCount === 0
        || !quotation
        || args.where.version !== quotation.version
        || args.where.status !== quotation.status) return { count: 0 };
      Object.assign(quotation, args.data, { version: quotation.version + 1 });
      return { count: 1 };
    },
  };
  const requestItemDelegate = {
    findMany: async ({ where }) => {
      captured.itemWhere = where;
      return items.filter((item) => item.requestId === where.requestId
        && item.measurementStatus === where.measurementStatus);
    },
  };
  const catalogDelegate = {
    findMany: async ({ where }) => {
      captured.catalogWhere = where;
      return catalogs;
    },
  };
  const calculationDelegate = {
    findUnique: async ({ where }) => calculations.find((calculation) => (
      calculation.quotationId === where.quotationId_quotationRevisionNumber_inputHash.quotationId
      && calculation.quotationRevisionNumber === where.quotationId_quotationRevisionNumber_inputHash.quotationRevisionNumber
      && calculation.inputHash === where.quotationId_quotationRevisionNumber_inputHash.inputHash
    )) ?? null,
    findFirst: async ({ where, orderBy }) => {
      if (where.id) return calculations.find((calculation) => calculation.id === where.id && calculation.quotationId === where.quotationId) ?? null;
      const matches = calculations.filter((calculation) => calculation.quotationId === where.quotationId
        && calculation.quotationRevisionNumber === where.quotationRevisionNumber
        && (where.status === undefined || calculation.status === where.status));
      if (orderBy) return matches.sort((left, right) => right.calculationVersion - left.calculationVersion)[0] ?? null;
      return matches[0] ?? null;
    },
    create: async ({ data }) => {
      const calculation = { id: `calculation-${calculations.length + 1}`, createdAt: new Date(), ...data };
      calculations.push(calculation);
      return calculation;
    },
    findUniqueOrThrow: async ({ where }) => {
      const calculation = calculations.find((candidate) => candidate.id === where.id);
      return { ...calculation, items: quotationItems.filter((item) => item.quotationCalculationId === where.id) };
    },
    updateMany: async (args) => {
      captured.calculationUpdates.push(args);
      const calculation = calculations.find((candidate) => candidate.id === args.where.id
        && candidate.quotationId === args.where.quotationId
        && candidate.quotationRevisionNumber === args.where.quotationRevisionNumber
        && candidate.calculationVersion === args.where.calculationVersion
        && candidate.status === args.where.status);
      if (!calculation || options.calculationUpdateCount === 0) return { count: 0 };
      Object.assign(calculation, args.data);
      return { count: 1 };
    },
    findMany: async () => calculations,
  };
  const quotationItemDelegate = {
    createMany: async ({ data }) => {
      quotationItems.push(...data.map((item, index) => ({ id: `line-${index + 1}`, ...item })));
      return { count: data.length };
    },
  };
  const transaction = {
    quotation: quotationDelegate,
    requestItem: requestItemDelegate,
    priceCatalogItem: catalogDelegate,
    quotationCalculation: calculationDelegate,
    quotationItem: quotationItemDelegate,
  };
  const prisma = {
    ...transaction,
    order: { updateMany: async () => { captured.orderWrites += 1; } },
    request: { updateMany: async () => { captured.acceptanceWrites += 1; } },
    $transaction: async (operation) => operation(transaction),
  };
  const audit = {
    records: [],
    record: async (payload, client) => {
      audit.records.push({ payload, client });
      return payload;
    },
  };
  const pricing = new PricingService(prisma);
  return {
    service: new QuotationCalculationsService(prisma, pricing, audit),
    quotation,
    calculations,
    quotationItems,
    captured,
    audit,
    transaction,
  };
}

test('another tenant cannot generate a quotation calculation', async () => {
  const harness = createHarness({ quotation: null });
  await assert.rejects(harness.service.generate('quotation-1', actor), NotFoundException);
});

test('another tenant cannot list or read calculations even when IDs are known', async () => {
  const harness = createHarness({ quotation: null, calculations: [{
    id: 'calculation-1',
    quotationId: 'quotation-1',
    requestId: 'request-1',
    quotationRevisionNumber: 1,
    calculationVersion: 1,
    status: CalculationStatus.GENERATED,
  }] });

  await assert.rejects(harness.service.list('quotation-1', actor), NotFoundException);
  await assert.rejects(
    harness.service.get('quotation-1', 'calculation-1', actor),
    NotFoundException,
  );
});

test('manufacturer scope and APPROVED canonical items are server-derived', async () => {
  const harness = createHarness({ items: [
    approvedItem(),
    approvedItem({ id: 'pending', measurementStatus: MeasurementStatus.PENDING }),
    approvedItem({ id: 'rejected', measurementStatus: MeasurementStatus.REJECTED }),
  ] });
  await harness.service.generate('quotation-1', actor, { manufacturerCompanyId: 'attacker-company' });

  assert.equal(harness.captured.catalogWhere.companyId, 'manufacturer-company');
  assert.equal(harness.captured.itemWhere.measurementStatus, MeasurementStatus.APPROVED);
  assert.equal(harness.quotationItems.length, 1);
});

test('missing required canonical measurement produces an explicit validation error', async () => {
  const harness = createHarness({ items: [approvedItem({ calculatedAreaM2: null })] });
  await assert.rejects(harness.service.generate('quotation-1', actor), BadRequestException);
});

test('generate creates immutable calculation and line snapshots with deterministic hash', async () => {
  const harness = createHarness();
  const first = await harness.service.generate('quotation-1', actor);
  const second = await harness.service.generate('quotation-1', actor);

  assert.equal(first.id, second.id);
  assert.equal(harness.calculations.length, 1);
  assert.equal(harness.quotationItems.length, 1);
  assert.match(first.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(first.snapshotHash, first.inputHash);
  assert.equal(first.snapshotPayload.lines[0].requestItem.measurementStatus, MeasurementStatus.APPROVED);
  assert.equal(first.snapshotPayload.lines[0].pricing.catalog.unitPrice, '100');
  assert.equal(harness.audit.records[0].client, harness.transaction);
  assert.equal(harness.audit.records[0].payload.action, 'QUOTATION_CALCULATION_CREATED');
});

test('regional adjustment is applied and snapshotted', async () => {
  const harness = createHarness({ catalogs: [catalogFixture({ regionalAdjustments: [{
    id: 'adjustment-1',
    regionId: 'region-1',
    adjustmentType: 'RATE',
    adjustmentValue: new Prisma.Decimal('0.10'),
    currency: null,
    version: 1,
  }] })] });
  const result = await harness.service.generate('quotation-1', actor);

  assert.equal(result.regionalAdjustmentAmount.toFixed(2), '19.20');
  assert.equal(result.totalAmount.toFixed(2), '211.20');
  assert.equal(result.snapshotPayload.lines[0].pricing.regionalAdjustment.value, '0.1');
});

test('different input cannot replace an existing finalized calculation', async () => {
  const finalized = {
    id: 'old-finalized', quotationId: 'quotation-1', requestId: 'request-1',
    quotationRevisionNumber: 1, calculationVersion: 1, inputHash: 'old', snapshotHash: 'old',
    status: CalculationStatus.FINALIZED, totalAmount: new Prisma.Decimal('100'), currency: 'TRY',
  };
  const harness = createHarness({ calculations: [finalized] });
  const generated = await harness.service.generate('quotation-1', actor);

  assert.equal(finalized.status, CalculationStatus.FINALIZED);
  assert.equal(generated.calculationVersion, 2);
  await assert.rejects(
    harness.service.finalize('quotation-1', generated.id, 3, 2, actor),
    ConflictException,
  );
});

test('finalize CAS rejects stale versions', async () => {
  const staleQuotation = createHarness();
  const generated = await staleQuotation.service.generate('quotation-1', actor);
  await assert.rejects(
    staleQuotation.service.finalize('quotation-1', generated.id, 99, generated.calculationVersion, actor),
    ConflictException,
  );

  const staleCalculation = createHarness();
  const secondGenerated = await staleCalculation.service.generate('quotation-1', actor);
  await assert.rejects(
    staleCalculation.service.finalize('quotation-1', secondGenerated.id, 3, 99, actor),
    ConflictException,
  );
});

test('finalize atomically activates calculation and updates legacy totalAmount only then', async () => {
  const harness = createHarness();
  const originalTotal = harness.quotation.totalAmount.toFixed(2);
  const generated = await harness.service.generate('quotation-1', actor);
  assert.equal(harness.quotation.totalAmount.toFixed(2), originalTotal);

  const finalized = await harness.service.finalize(
    'quotation-1', generated.id, 3, generated.calculationVersion, actor,
  );
  assert.equal(finalized.status, CalculationStatus.FINALIZED);
  assert.equal(harness.captured.quotationUpdates[0].data.activeCalculationId, generated.id);
  assert.equal(harness.quotation.totalAmount.toFixed(2), generated.totalAmount.toFixed(2));
  assert.equal(harness.audit.records.at(-1).payload.action, 'QUOTATION_CALCULATION_FINALIZED');
  assert.equal(harness.audit.records.at(-1).client, harness.transaction);
});

test('the same calculation cannot be finalized twice', async () => {
  const harness = createHarness();
  const generated = await harness.service.generate('quotation-1', actor);
  await harness.service.finalize(
    'quotation-1', generated.id, 3, generated.calculationVersion, actor,
  );

  await assert.rejects(
    harness.service.finalize('quotation-1', generated.id, 4, generated.calculationVersion, actor),
    ConflictException,
  );
});

test('calculation does not execute quotation acceptance or Order lifecycle writes', async () => {
  const harness = createHarness();
  await harness.service.generate('quotation-1', actor);
  assert.equal(harness.captured.acceptanceWrites, 0);
  assert.equal(harness.captured.orderWrites, 0);
});

test('generate rejects a quotation whose buyer company does not own the Request', async () => {
  const harness = createHarness({ quotation: quotationFixture({ companyId: 'another-buyer' }) });
  await assert.rejects(harness.service.generate('quotation-1', actor), ConflictException);
  assert.equal(harness.calculations.length, 0);
  assert.equal(harness.quotationItems.length, 0);
});

test('finalize rejects a calculation linked to a different Request', async () => {
  const calculation = {
    id: 'calculation-foreign-request',
    quotationId: 'quotation-1',
    requestId: 'another-request',
    quotationRevisionNumber: 1,
    calculationVersion: 1,
    inputHash: 'foreign-request',
    snapshotHash: 'foreign-request',
    status: CalculationStatus.GENERATED,
    totalAmount: new Prisma.Decimal('100'),
    currency: 'TRY',
  };
  const harness = createHarness({ calculations: [calculation] });

  await assert.rejects(
    harness.service.finalize('quotation-1', calculation.id, 3, 1, actor),
    ConflictException,
  );
  assert.equal(harness.captured.calculationUpdates.length, 0);
  assert.equal(harness.captured.quotationUpdates.length, 0);
});
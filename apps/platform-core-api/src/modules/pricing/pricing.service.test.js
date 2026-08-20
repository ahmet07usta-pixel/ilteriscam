const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { BadRequestException, ConflictException } = require('@nestjs/common');
const {
  MeasurementUnit,
  PriceAdjustmentType,
  PriceCatalogStatus,
  Prisma,
} = require('@prisma/client');
const { PricingService } = require('./pricing.service.ts');

function catalog(overrides = {}) {
  return {
    id: 'catalog-1',
    companyId: 'manufacturer-1',
    productCode: 'GLASS-01',
    productType: 'LAMINATED_GLASS',
    baseUnit: MeasurementUnit.M2,
    unitPrice: new Prisma.Decimal('125.50'),
    currency: 'TRY',
    minimumOrderAmount: null,
    defaultWasteRate: new Prisma.Decimal('0.10'),
    defaultDiscountRate: new Prisma.Decimal('0.05'),
    status: PriceCatalogStatus.ACTIVE,
    version: 1,
    validFrom: null,
    validUntil: null,
    regionalAdjustments: [],
    ...overrides,
  };
}

function serviceWith(candidates) {
  let capturedWhere;
  const prisma = {
    priceCatalogItem: {
      findMany: async ({ where }) => {
        capturedWhere = where;
        return candidates;
      },
    },
  };
  return { service: new PricingService(prisma), getWhere: () => capturedWhere };
}

test('selects the highest valid version of one deterministic catalog identity', async () => {
  const { service, getWhere } = serviceWith([
    catalog({ id: 'catalog-v2', version: 2 }),
    catalog({ id: 'catalog-v1', version: 1 }),
  ]);
  const selected = await service.selectCatalog(
    'manufacturer-1',
    'region-1',
    'TRY',
    { productCode: 'GLASS-01', productType: 'LAMINATED_GLASS' },
  );

  assert.equal(selected.catalog.id, 'catalog-v2');
  assert.equal(getWhere().companyId, 'manufacturer-1');
  assert.equal(getWhere().productCode, 'GLASS-01');
});

test('rejects ambiguous catalog identities', async () => {
  const { service } = serviceWith([
    catalog(),
    catalog({ id: 'catalog-2', productCode: 'GLASS-02' }),
  ]);
  await assert.rejects(service.selectCatalog(
    'manufacturer-1', null, 'TRY', { productCode: null, productType: 'LAMINATED_GLASS' },
  ), ConflictException);
});

test('returns an explicit error when no catalog exists', async () => {
  const { service } = serviceWith([]);
  await assert.rejects(service.selectCatalog(
    'manufacturer-1', null, 'TRY', { productCode: 'MISSING', productType: 'LAMINATED_GLASS' },
  ), BadRequestException);
});

test('returns the single regional adjustment and rejects ambiguity', async () => {
  const adjustment = {
    id: 'adjustment-1',
    regionId: 'region-1',
    adjustmentType: PriceAdjustmentType.RATE,
    adjustmentValue: new Prisma.Decimal('0.15'),
    currency: null,
    version: 1,
  };
  const selected = serviceWith([catalog({ regionalAdjustments: [adjustment] })]);
  assert.equal((await selected.service.selectCatalog(
    'manufacturer-1', 'region-1', 'TRY', { productCode: 'GLASS-01', productType: 'LAMINATED_GLASS' },
  )).regionalAdjustment.id, 'adjustment-1');

  const ambiguous = serviceWith([catalog({ regionalAdjustments: [adjustment, { ...adjustment, id: 'adjustment-2' }] })]);
  await assert.rejects(ambiguous.service.selectCatalog(
    'manufacturer-1', 'region-1', 'TRY', { productCode: 'GLASS-01', productType: 'LAMINATED_GLASS' },
  ), ConflictException);
});

test('fixed adjustment currency must match quotation currency', async () => {
  const { service } = serviceWith([catalog({ regionalAdjustments: [{
    id: 'adjustment-1',
    regionId: 'region-1',
    adjustmentType: PriceAdjustmentType.FIXED_AMOUNT,
    adjustmentValue: new Prisma.Decimal('10'),
    currency: 'USD',
    version: 1,
  }] })]);
  await assert.rejects(service.selectCatalog(
    'manufacturer-1', 'region-1', 'TRY', { productCode: 'GLASS-01', productType: 'LAMINATED_GLASS' },
  ), BadRequestException);
});

test('does not crash when regionId is null and Prisma omits the regionalAdjustments relation', async () => {
  // Real Prisma returns `undefined` (not []) for a relation excluded via `include: { regionalAdjustments: false }`,
  // which is what happens whenever the caller passes a null regionId. This mimics that exact shape.
  const { regionalAdjustments: _omitted, ...catalogWithoutRelation } = catalog();
  const { service } = serviceWith([catalogWithoutRelation]);

  const selected = await service.selectCatalog(
    'manufacturer-1', null, 'TRY', { productCode: 'GLASS-01', productType: 'LAMINATED_GLASS' },
  );

  assert.equal(selected.regionalAdjustment, null);
  assert.equal(selected.catalog.id, 'catalog-1');
});
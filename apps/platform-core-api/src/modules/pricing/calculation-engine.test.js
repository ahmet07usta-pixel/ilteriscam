const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { BadRequestException } = require('@nestjs/common');
const { MeasurementUnit, PriceAdjustmentType } = require('@prisma/client');
const { calculatePricingLine, measurementBasis } = require('./calculation-engine.ts');

const measurement = {
  quantity: '2',
  lengthMm: '2500',
  calculatedAreaM2: '0.96',
  calculatedLengthM: '2.5',
  calculatedVolumeM3: '0.0096',
};

const basisCases = [
  [MeasurementUnit.PIECE, '2'],
  [MeasurementUnit.MM, '5000'],
  [MeasurementUnit.CM, '500'],
  [MeasurementUnit.M, '5'],
  [MeasurementUnit.M2, '1.92'],
  [MeasurementUnit.M3, '0.0192'],
];

for (const [unit, expected] of basisCases) {
  test(`calculates ${unit} canonical basis`, () => {
    assert.equal(measurementBasis(measurement, unit).toString(), expected);
  });
}

test('applies unit price, waste, rate adjustment, discount, and money rounding', () => {
  const result = calculatePricingLine({
    measurement: { quantity: '3' },
    baseUnit: MeasurementUnit.PIECE,
    unitPrice: '0.10',
    wasteRate: '0.10',
    discountRate: '0.05',
    regionalAdjustment: { type: PriceAdjustmentType.RATE, value: '0.20' },
    currency: 'TRY',
  });

  assert.equal(result.baseAmount.toFixed(2), '0.30');
  assert.equal(result.wasteAmount.toFixed(2), '0.03');
  assert.equal(result.regionalAdjustmentAmount.toFixed(2), '0.07');
  assert.equal(result.discountAmount.toFixed(2), '0.02');
  assert.equal(result.totalAmount.toFixed(2), '0.38');
});

test('fixed regional adjustment is deterministic', () => {
  const input = {
    measurement: { quantity: '2' },
    baseUnit: MeasurementUnit.PIECE,
    unitPrice: '10.00',
    regionalAdjustment: { type: PriceAdjustmentType.FIXED_AMOUNT, value: '3.25' },
    currency: 'TRY',
  };
  assert.equal(calculatePricingLine(input).totalAmount.toFixed(2), '23.25');
  assert.equal(calculatePricingLine(input).totalAmount.toFixed(2), '23.25');
});

test('zero unit price is valid and zero quantity is rejected', () => {
  assert.equal(calculatePricingLine({
    measurement: { quantity: '1' },
    baseUnit: MeasurementUnit.PIECE,
    unitPrice: '0',
    currency: 'TRY',
  }).totalAmount.toFixed(2), '0.00');
  assert.throws(() => measurementBasis({ quantity: '0' }, MeasurementUnit.PIECE), BadRequestException);
});

test('negative and missing measurements are rejected', () => {
  assert.throws(() => measurementBasis({ quantity: '-1' }, MeasurementUnit.PIECE), BadRequestException);
  assert.throws(() => measurementBasis({}, MeasurementUnit.M2), BadRequestException);
});

test('very large decimal inputs remain exact without JavaScript floating point', () => {
  const result = calculatePricingLine({
    measurement: { quantity: '999999999999.999999' },
    baseUnit: MeasurementUnit.PIECE,
    unitPrice: '999999.999999',
    currency: 'TRY',
  });
  assert.equal(result.totalAmount.toFixed(2), '999999999998999999.00');
});
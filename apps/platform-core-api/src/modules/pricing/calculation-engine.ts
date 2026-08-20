import { BadRequestException } from '@nestjs/common';
import { MeasurementUnit, PriceAdjustmentType, Prisma } from '@prisma/client';

type DecimalValue = Prisma.Decimal.Value;

export type ApprovedMeasurementSnapshot = {
  quantity?: DecimalValue | null;
  unit?: MeasurementUnit | null;
  widthMm?: DecimalValue | null;
  heightMm?: DecimalValue | null;
  lengthMm?: DecimalValue | null;
  depthMm?: DecimalValue | null;
  thicknessMm?: DecimalValue | null;
  calculatedAreaM2?: DecimalValue | null;
  calculatedLengthM?: DecimalValue | null;
  calculatedVolumeM3?: DecimalValue | null;
};

export type RegionalAdjustmentInput = {
  type: PriceAdjustmentType;
  value: DecimalValue;
};

export type CalculationLineInput = {
  measurement: ApprovedMeasurementSnapshot;
  baseUnit: MeasurementUnit;
  unitPrice: DecimalValue;
  wasteRate?: DecimalValue;
  discountRate?: DecimalValue;
  regionalAdjustment?: RegionalAdjustmentInput;
  currency: string;
};

export type CalculationLineResult = {
  quantity: Prisma.Decimal;
  unit: MeasurementUnit;
  unitPrice: Prisma.Decimal;
  wasteRate: Prisma.Decimal;
  wasteQuantity: Prisma.Decimal;
  baseAmount: Prisma.Decimal;
  wasteAmount: Prisma.Decimal;
  regionalAdjustmentRate: Prisma.Decimal;
  regionalAdjustmentAmount: Prisma.Decimal;
  discountRate: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  currency: string;
};

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

export function calculatePricingLine(input: CalculationLineInput): CalculationLineResult {
  const quantity = measurementBasis(input.measurement, input.baseUnit);
  const unitPrice = nonNegativeDecimal(input.unitPrice, 'unitPrice');
  const wasteRate = rate(input.wasteRate ?? 0, 'wasteRate');
  const discountRate = rate(input.discountRate ?? 0, 'discountRate');
  const wasteQuantity = quantity.mul(wasteRate).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  const baseAmount = money(quantity.mul(unitPrice));
  const wasteAmount = money(wasteQuantity.mul(unitPrice));
  const beforeAdjustment = baseAmount.add(wasteAmount);

  let regionalAdjustmentRate = ZERO;
  let regionalAdjustmentAmount = ZERO;
  if (input.regionalAdjustment) {
    const adjustmentValue = nonNegativeDecimal(input.regionalAdjustment.value, 'regionalAdjustment');
    if (input.regionalAdjustment.type === PriceAdjustmentType.RATE) {
      regionalAdjustmentRate = rate(adjustmentValue, 'regionalAdjustment');
      regionalAdjustmentAmount = money(beforeAdjustment.mul(regionalAdjustmentRate));
    } else {
      regionalAdjustmentAmount = money(adjustmentValue);
    }
  }

  const beforeDiscount = beforeAdjustment.add(regionalAdjustmentAmount);
  const discountAmount = money(beforeDiscount.mul(discountRate));
  const totalAmount = money(beforeDiscount.sub(discountAmount));

  return {
    quantity,
    unit: input.baseUnit,
    unitPrice,
    wasteRate,
    wasteQuantity,
    baseAmount,
    wasteAmount,
    regionalAdjustmentRate,
    regionalAdjustmentAmount,
    discountRate,
    discountAmount,
    subtotalAmount: baseAmount,
    totalAmount,
    currency: input.currency,
  };
}

export function measurementBasis(
  measurement: ApprovedMeasurementSnapshot,
  unit: MeasurementUnit,
): Prisma.Decimal {
  const multiplier = optionalNonNegativeDecimal(measurement.quantity, 'quantity') ?? ONE;
  let basis: Prisma.Decimal;

  switch (unit) {
    case MeasurementUnit.PIECE:
      basis = requiredPositiveDecimal(measurement.quantity, 'quantity');
      break;
    case MeasurementUnit.M2:
      basis = requiredPositiveDecimal(measurement.calculatedAreaM2, 'calculatedAreaM2').mul(multiplier);
      break;
    case MeasurementUnit.M3:
      basis = requiredPositiveDecimal(measurement.calculatedVolumeM3, 'calculatedVolumeM3').mul(multiplier);
      break;
    case MeasurementUnit.M:
      basis = requiredPositiveDecimal(measurement.calculatedLengthM, 'calculatedLengthM').mul(multiplier);
      break;
    case MeasurementUnit.MM:
      basis = requiredPositiveDecimal(measurement.lengthMm, 'lengthMm').mul(multiplier);
      break;
    case MeasurementUnit.CM:
      basis = requiredPositiveDecimal(measurement.lengthMm, 'lengthMm').div(10).mul(multiplier);
      break;
  }

  const rounded = basis.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  if (!rounded.isFinite() || rounded.isNegative()) {
    throw new BadRequestException('Calculated pricing basis is invalid');
  }
  return rounded;
}

function requiredPositiveDecimal(value: DecimalValue | null | undefined, field: string): Prisma.Decimal {
  if (value === null || value === undefined) {
    throw new BadRequestException(`${field} is required for pricing`);
  }
  const decimal = nonNegativeDecimal(value, field);
  if (decimal.isZero()) {
    throw new BadRequestException(`${field} must be greater than zero for pricing`);
  }
  return decimal;
}

function optionalNonNegativeDecimal(
  value: DecimalValue | null | undefined,
  field: string,
): Prisma.Decimal | undefined {
  return value === null || value === undefined ? undefined : nonNegativeDecimal(value, field);
}

function nonNegativeDecimal(value: DecimalValue, field: string): Prisma.Decimal {
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(value);
  } catch {
    throw new BadRequestException(`${field} is not a valid decimal`);
  }
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new BadRequestException(`${field} must be a finite non-negative decimal`);
  }
  return decimal;
}

function rate(value: DecimalValue, field: string): Prisma.Decimal {
  const decimal = nonNegativeDecimal(value, field);
  if (decimal.greaterThan(1)) {
    throw new BadRequestException(`${field} must be between 0 and 1`);
  }
  return decimal;
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
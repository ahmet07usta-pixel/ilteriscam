import type {
  ApiCalculationSnapshotLine,
  ApiUnpricedCalculationSnapshotLine,
  ApiQuotationCalculation,
  ApiQuotationItem,
  CalculationStatus,
  FinalizeQuotationCalculationInput,
  MeasurementStatus,
  MeasurementUnit,
} from './contracts'
import { apiRequest } from './http-client'

const calculationsPath = (quotationId: string) => (
  `/quotations/${encodeURIComponent(quotationId)}/calculations`
)

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function mapItem(value: unknown): ApiQuotationItem {
  const item = record(value)
  return {
    id: text(item.id),
    quotationId: text(item.quotationId),
    quotationCalculationId: text(item.quotationCalculationId),
    requestItemId: nullableText(item.requestItemId),
    priceCatalogItemId: nullableText(item.priceCatalogItemId),
    lineNumber: numberValue(item.lineNumber),
    description: text(item.description),
    quantity: text(item.quantity),
    unit: text(item.unit) as MeasurementUnit,
    unitPrice: text(item.unitPrice),
    wasteRate: text(item.wasteRate),
    wasteQuantity: text(item.wasteQuantity),
    regionalAdjustmentRate: text(item.regionalAdjustmentRate),
    regionalAdjustmentAmount: text(item.regionalAdjustmentAmount),
    discountRate: text(item.discountRate),
    discountAmount: text(item.discountAmount),
    taxRate: text(item.taxRate),
    taxAmount: text(item.taxAmount),
    subtotalAmount: text(item.subtotalAmount),
    totalAmount: text(item.totalAmount),
    currency: text(item.currency),
    createdAt: text(item.createdAt),
  }
}

function mapSnapshotLine(value: unknown): ApiCalculationSnapshotLine {
  const line = record(value)
  const requestItem = record(line.requestItem)
  const pricing = record(line.pricing)
  const catalog = record(pricing.catalog)
  const result = record(line.result)
  return {
    requestItemId: text(requestItem.id),
    lineNumber: numberValue(requestItem.lineNumber),
    description: text(requestItem.description),
    productType: text(requestItem.productType),
    productCode: nullableText(requestItem.productCode),
    measurementStatus: text(requestItem.measurementStatus) as MeasurementStatus,
    quantity: text(result.quantity),
    unit: text(result.unit) as MeasurementUnit,
    catalogProductCode: text(catalog.productCode),
    unitPrice: text(result.unitPrice),
    wasteRate: text(result.wasteRate),
    discountRate: text(result.discountRate),
    totalAmount: text(result.totalAmount),
    currency: text(result.currency),
  }
}

function mapUnpricedSnapshotLine(value: unknown): ApiUnpricedCalculationSnapshotLine {
  const line = record(value)
  const requestItem = record(line.requestItem)
  return {
    requestItemId: text(requestItem.id),
    lineNumber: numberValue(requestItem.lineNumber),
    description: text(requestItem.description),
    productType: text(requestItem.productType),
    productCode: nullableText(requestItem.productCode),
    reason: text(line.reason),
  }
}

function mapCalculation(value: unknown): ApiQuotationCalculation {
  const calculation = record(value)
  const snapshot = record(calculation.snapshotPayload)
  return {
    id: text(calculation.id),
    quotationId: text(calculation.quotationId),
    requestId: text(calculation.requestId),
    quotationRevisionNumber: numberValue(calculation.quotationRevisionNumber),
    calculationVersion: numberValue(calculation.calculationVersion),
    engineVersion: text(calculation.engineVersion),
    inputHash: text(calculation.inputHash),
    currency: text(calculation.currency),
    subtotalAmount: text(calculation.subtotalAmount),
    wasteAmount: text(calculation.wasteAmount),
    regionalAdjustmentAmount: text(calculation.regionalAdjustmentAmount),
    discountAmount: text(calculation.discountAmount),
    taxAmount: text(calculation.taxAmount),
    totalAmount: text(calculation.totalAmount),
    snapshotSchemaVersion: numberValue(calculation.snapshotSchemaVersion),
    snapshotHash: text(calculation.snapshotHash),
    status: text(calculation.status) as CalculationStatus,
    createdByUserId: nullableText(calculation.createdByUserId),
    finalizedAt: nullableText(calculation.finalizedAt),
    createdAt: text(calculation.createdAt),
    items: Array.isArray(calculation.items) ? calculation.items.map(mapItem) : [],
    snapshotLines: Array.isArray(snapshot.lines) ? snapshot.lines.map(mapSnapshotLine) : [],
    unpricedSnapshotLines: Array.isArray(snapshot.unpricedLines)
      ? snapshot.unpricedLines.map(mapUnpricedSnapshotLine)
      : [],
  }
}

export const quotationCalculationsApi = {
  list: async (quotationId: string) => (
    (await apiRequest<unknown[]>(calculationsPath(quotationId))).map(mapCalculation)
  ),
  get: async (quotationId: string, calculationId: string) => (
    mapCalculation(await apiRequest<unknown>(
      `${calculationsPath(quotationId)}/${encodeURIComponent(calculationId)}`,
    ))
  ),
  generate: async (quotationId: string) => (
    mapCalculation(await apiRequest<unknown>(calculationsPath(quotationId), { method: 'POST' }))
  ),
  finalize: async (
    quotationId: string,
    calculationId: string,
    input: FinalizeQuotationCalculationInput,
  ) => (
    mapCalculation(await apiRequest<unknown>(
      `${calculationsPath(quotationId)}/${encodeURIComponent(calculationId)}/finalize`,
      { method: 'POST', body: input },
    ))
  ),
}
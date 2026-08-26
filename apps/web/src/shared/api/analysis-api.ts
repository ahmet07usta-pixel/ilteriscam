import type {
  ApiAnalysisJob,
  ApiAnalysisResult,
  ApiDetectedMeasurement,
  AnalysisReviewStatus,
  GeometryType,
  MeasurementReviewAction,
  MeasurementUnit,
  ReviewMeasurementInput,
  ReviewMeasurementResult,
} from './contracts'
import { apiRequest } from './http-client'

type UnknownRecord = Record<string, unknown>

const analysisPath = (requestId: string, attachmentId: string) => (
  `/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(attachmentId)}/analysis`
)
const measurementsPath = (requestId: string, itemId: string) => (
  `/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(itemId)}/measurements`
)

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function toDetectedMeasurement(response: UnknownRecord): ApiDetectedMeasurement {
  const analysisResult = (response.analysisResult ?? {}) as UnknownRecord
  return {
    id: String(response.id),
    analysisResultId: String(response.analysisResultId),
    ordinal: Number(response.ordinal),
    label: stringOrNull(response.label),
    suggestedProductType: stringOrNull(response.suggestedProductType),
    geometryType: response.geometryType as GeometryType,
    widthMm: stringOrNull(response.widthMm),
    heightMm: stringOrNull(response.heightMm),
    lengthMm: stringOrNull(response.lengthMm),
    depthMm: stringOrNull(response.depthMm),
    thicknessMm: stringOrNull(response.thicknessMm),
    quantity: stringOrNull(response.quantity),
    unit: (response.unit as MeasurementUnit | null) ?? null,
    calculatedAreaM2: stringOrNull(response.calculatedAreaM2),
    calculatedLengthM: stringOrNull(response.calculatedLengthM),
    calculatedVolumeM3: stringOrNull(response.calculatedVolumeM3),
    confidence: stringOrNull(response.confidence),
    warnings: stringList(response.warnings),
    assumptions: stringList(response.assumptions),
    createdAt: String(response.createdAt),
    analysisResult: {
      id: String(analysisResult.id),
      resultVersion: Number(analysisResult.resultVersion),
      reviewStatus: analysisResult.reviewStatus as AnalysisReviewStatus,
      version: Number(analysisResult.version),
      createdAt: String(analysisResult.createdAt),
    },
  }
}

function toAnalysisResult(response: UnknownRecord): ApiAnalysisResult {
  return {
    id: String(response.id),
    resultVersion: Number(response.resultVersion),
    reviewStatus: response.reviewStatus as AnalysisReviewStatus,
    version: Number(response.version),
    confidence: stringOrNull(response.confidence),
    warnings: stringList(response.warnings),
    assumptions: stringList(response.assumptions),
    createdAt: String(response.createdAt),
    detectedMeasurements: Array.isArray(response.detectedMeasurements)
      ? response.detectedMeasurements.map((item) => toDetectedMeasurement(item as UnknownRecord))
      : [],
  }
}

function toAnalysisJob(response: UnknownRecord): ApiAnalysisJob {
  return {
    id: String(response.id),
    requestId: String(response.requestId),
    requestItemId: stringOrNull(response.requestItemId),
    attachmentId: String(response.attachmentId),
    status: response.status as ApiAnalysisJob['status'],
    attemptCount: Number(response.attemptCount),
    maxAttempts: Number(response.maxAttempts),
    startedAt: stringOrNull(response.startedAt),
    completedAt: stringOrNull(response.completedAt),
    version: Number(response.version),
    createdAt: String(response.createdAt),
    updatedAt: String(response.updatedAt),
    results: Array.isArray(response.results)
      ? response.results.map((item) => toAnalysisResult(item as UnknownRecord))
      : [],
  }
}

export const analysisApi = {
  start: async (requestId: string, attachmentId: string) => {
    const result = await apiRequest<UnknownRecord>(analysisPath(requestId, attachmentId), { method: 'POST' })
    return toAnalysisJob(result)
  },
  listByAttachment: async (requestId: string, attachmentId: string) => {
    const result = await apiRequest<UnknownRecord[]>(analysisPath(requestId, attachmentId))
    return result.map(toAnalysisJob)
  },
  listMeasurements: async (requestId: string, itemId: string) => {
    const result = await apiRequest<UnknownRecord[]>(measurementsPath(requestId, itemId))
    return result.map(toDetectedMeasurement)
  },
  reviewMeasurement: (requestId: string, itemId: string, input: ReviewMeasurementInput) => (
    apiRequest<ReviewMeasurementResult>(
      `/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(itemId)}/measurement-review`,
      { method: 'POST', body: input },
    )
  ),
}

export type { MeasurementReviewAction }
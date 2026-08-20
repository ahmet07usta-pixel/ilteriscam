import type {
  ApiProductionView,
  CreateProductionInput,
  OrderStatus,
  ProductionStatus,
  TransitionProductionInput,
} from './contracts'
import { apiRequest } from './http-client'

type JsonRecord = Record<string, unknown>

const productionPath = (productionId: string) => `/productions/${encodeURIComponent(productionId)}`

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

function companySummary(value: unknown): { legalName: string; tradeName: string | null } {
  const company = record(value)
  return {
    legalName: text(company.legalName),
    tradeName: nullableText(company.tradeName),
  }
}

function mapProduction(value: unknown): ApiProductionView {
  const production = record(value)
  const order = record(production.order)
  const request = record(order.request)
  const quotation = record(order.quotation)
  const createdBy = production.createdBy === null || production.createdBy === undefined
    ? null
    : record(production.createdBy)

  return {
    id: text(production.id),
    productionNumber: text(production.productionNumber),
    orderId: text(production.orderId),
    status: text(production.status) as ProductionStatus,
    version: numberValue(production.version),
    productionLine: nullableText(production.productionLine),
    plannedStartDate: nullableText(production.plannedStartDate),
    dueDate: nullableText(production.dueDate),
    startedAt: nullableText(production.startedAt),
    completedAt: nullableText(production.completedAt),
    notes: nullableText(production.notes),
    statusReason: nullableText(production.statusReason),
    createdAt: text(production.createdAt),
    updatedAt: text(production.updatedAt),
    order: {
      id: text(order.id),
      orderNumber: text(order.orderNumber),
      status: text(order.status) as OrderStatus,
      request: {
        requestNumber: text(request.requestNumber),
        title: text(request.title),
        productType: text(request.productType),
      },
      quotation: {
        quotationNumber: text(quotation.quotationNumber),
      },
      company: companySummary(order.company),
      manufacturerCompany: companySummary(order.manufacturerCompany),
    },
    manufacturerCompany: companySummary(production.manufacturerCompany),
    createdBy: createdBy
      ? { fullName: text(createdBy.fullName), email: text(createdBy.email) }
      : null,
  }
}

export const productionsApi = {
  list: async () => {
    const response = await apiRequest<unknown>('/productions')
    return Array.isArray(response) ? response.map(mapProduction) : []
  },
  get: async (productionId: string) => (
    mapProduction(await apiRequest<unknown>(productionPath(productionId)))
  ),
  create: async (orderId: string, input: CreateProductionInput) => (
    mapProduction(await apiRequest<unknown>(`/orders/${encodeURIComponent(orderId)}/production`, {
      method: 'POST',
      body: input,
    }))
  ),
  transition: async (productionId: string, input: TransitionProductionInput) => (
    mapProduction(await apiRequest<unknown>(`${productionPath(productionId)}/transition`, {
      method: 'POST',
      body: input,
    }))
  ),
}

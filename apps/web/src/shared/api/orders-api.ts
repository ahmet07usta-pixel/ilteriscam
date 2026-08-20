import type {
  ApiOrderView,
  CompanyStatus,
  OrderStatus,
  QuotationStatus,
  RequestStatus,
} from './contracts'
import { apiRequest } from './http-client'

const orderPath = (orderId: string) => `/orders/${encodeURIComponent(orderId)}`

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

function userSummary(value: unknown): ApiOrderView['createdBy'] {
  if (value === null || value === undefined) return null
  const user = record(value)
  return { id: text(user.id), fullName: text(user.fullName), email: text(user.email) }
}

function companySummary(value: unknown): ApiOrderView['company'] {
  const company = record(value)
  return {
    id: text(company.id),
    legalName: text(company.legalName),
    tradeName: nullableText(company.tradeName),
    status: text(company.status) as CompanyStatus,
  }
}

function mapOrder(value: unknown): ApiOrderView {
  const order = record(value)
  const request = record(order.request)
  const quotation = record(order.quotation)
  return {
    id: text(order.id),
    orderNumber: text(order.orderNumber),
    requestId: text(order.requestId),
    quotationId: text(order.quotationId),
    companyId: text(order.companyId),
    manufacturerCompanyId: text(order.manufacturerCompanyId),
    createdByUserId: nullableText(order.createdByUserId),
    status: text(order.status) as OrderStatus,
    version: numberValue(order.version),
    confirmedAt: nullableText(order.confirmedAt),
    confirmedByUserId: nullableText(order.confirmedByUserId),
    cancelledAt: nullableText(order.cancelledAt),
    cancelledByUserId: nullableText(order.cancelledByUserId),
    cancellationReason: nullableText(order.cancellationReason),
    currency: text(order.currency),
    totalAmount: text(order.totalAmount),
    promisedDeliveryDate: nullableText(order.promisedDeliveryDate),
    createdAt: text(order.createdAt),
    updatedAt: text(order.updatedAt),
    request: {
      id: text(request.id),
      requestNumber: text(request.requestNumber),
      companyId: text(request.companyId),
      status: text(request.status) as RequestStatus,
    },
    quotation: {
      id: text(quotation.id),
      quotationNumber: text(quotation.quotationNumber),
      requestId: text(quotation.requestId),
      companyId: text(quotation.companyId),
      manufacturerCompanyId: text(quotation.manufacturerCompanyId),
      status: text(quotation.status) as QuotationStatus,
    },
    company: companySummary(order.company),
    manufacturerCompany: companySummary(order.manufacturerCompany),
    createdBy: userSummary(order.createdBy),
    confirmedBy: userSummary(order.confirmedBy),
    cancelledBy: userSummary(order.cancelledBy),
  }
}

export const ordersApi = {
  list: async () => (await apiRequest<unknown[]>('/orders')).map(mapOrder),
  get: async (orderId: string) => mapOrder(await apiRequest<unknown>(orderPath(orderId))),
  confirm: async (orderId: string, version: number) => (
    mapOrder(await apiRequest<unknown>(`${orderPath(orderId)}/confirm`, { method: 'POST', body: { version } }))
  ),
  cancel: async (orderId: string, version: number, cancellationReason?: string) => (
    mapOrder(await apiRequest<unknown>(`${orderPath(orderId)}/cancel`, {
      method: 'POST',
      body: { version, cancellationReason },
    }))
  ),
}
import type {
  ApiShipmentView,
  CreateShipmentInput,
  OrderStatus,
  ProductionStatus,
  ShipmentStatus,
  TransitionShipmentInput,
} from './contracts'
import { apiRequest } from './http-client'

type JsonRecord = Record<string, unknown>

const shipmentPath = (shipmentId: string) => `/shipments/${encodeURIComponent(shipmentId)}`

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

function mapShipment(value: unknown): ApiShipmentView {
  const shipment = record(value)
  const production = record(shipment.production)
  const order = record(shipment.order)
  const request = record(order.request)

  return {
    id: text(shipment.id),
    shipmentNumber: text(shipment.shipmentNumber),
    productionId: text(shipment.productionId),
    orderId: text(shipment.orderId),
    status: text(shipment.status) as ShipmentStatus,
    version: numberValue(shipment.version),
    destinationAddress: text(shipment.destinationAddress),
    plannedDepartureAt: text(shipment.plannedDepartureAt),
    estimatedDeliveryAt: text(shipment.estimatedDeliveryAt),
    departedAt: nullableText(shipment.departedAt),
    deliveredAt: nullableText(shipment.deliveredAt),
    carrier: nullableText(shipment.carrier),
    trackingNumber: nullableText(shipment.trackingNumber),
    notes: nullableText(shipment.notes),
    createdAt: text(shipment.createdAt),
    updatedAt: text(shipment.updatedAt),
    production: {
      productionNumber: text(production.productionNumber),
      status: text(production.status) as ProductionStatus,
      completedAt: nullableText(production.completedAt),
    },
    order: {
      orderNumber: text(order.orderNumber),
      status: text(order.status) as OrderStatus,
      request: {
        requestNumber: text(request.requestNumber),
        title: text(request.title),
        productType: text(request.productType),
      },
      company: companySummary(order.company),
      manufacturerCompany: companySummary(order.manufacturerCompany),
    },
  }
}

export const shipmentsApi = {
  list: async () => {
    const response = await apiRequest<unknown>('/shipments')
    return Array.isArray(response) ? response.map(mapShipment) : []
  },
  get: async (shipmentId: string) => (
    mapShipment(await apiRequest<unknown>(shipmentPath(shipmentId)))
  ),
  create: async (productionId: string, input: CreateShipmentInput) => (
    mapShipment(await apiRequest<unknown>(`/productions/${encodeURIComponent(productionId)}/shipment`, {
      method: 'POST',
      body: input,
    }))
  ),
  transition: async (shipmentId: string, input: TransitionShipmentInput) => (
    mapShipment(await apiRequest<unknown>(`${shipmentPath(shipmentId)}/transition`, {
      method: 'POST',
      body: input,
    }))
  ),
}
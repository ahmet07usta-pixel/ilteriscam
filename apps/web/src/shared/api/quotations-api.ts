import type { ApiQuotation, CreateQuotationInput, UpdateQuotationInput } from './contracts'
import { apiRequest } from './http-client'

const quotationPath = (quotationId: string) => `/quotations/${encodeURIComponent(quotationId)}`

export const quotationsApi = {
  list: () => apiRequest<ApiQuotation[]>('/quotations'),
  listForRequest: (requestId: string) => (
    apiRequest<ApiQuotation[]>(`/requests/${encodeURIComponent(requestId)}/quotations`)
  ),
  get: (quotationId: string) => apiRequest<ApiQuotation>(quotationPath(quotationId)),
  create: (requestId: string, input: CreateQuotationInput) => (
    apiRequest<ApiQuotation>(`/requests/${encodeURIComponent(requestId)}/quotations`, {
      method: 'POST',
      body: input,
    })
  ),
  update: (quotationId: string, input: UpdateQuotationInput) => (
    apiRequest<ApiQuotation>(quotationPath(quotationId), { method: 'PATCH', body: input })
  ),
  send: (quotationId: string, version: number) => (
    apiRequest<ApiQuotation>(`${quotationPath(quotationId)}/send`, { method: 'POST', body: { version } })
  ),
  revise: (quotationId: string, version: number) => (
    apiRequest<ApiQuotation>(`${quotationPath(quotationId)}/revise`, { method: 'POST', body: { version } })
  ),
  withdraw: (quotationId: string, version: number) => (
    apiRequest<ApiQuotation>(`${quotationPath(quotationId)}/withdraw`, { method: 'POST', body: { version } })
  ),
  reject: (quotationId: string, version: number) => (
    apiRequest<ApiQuotation>(`${quotationPath(quotationId)}/reject`, { method: 'POST', body: { version } })
  ),
  accept: (quotationId: string, version: number) => (
    apiRequest<{ quotation: ApiQuotation; order: import('./contracts').ApiOrder }>(
      `${quotationPath(quotationId)}/accept`,
      { method: 'POST', body: { version } },
    )
  ),
}
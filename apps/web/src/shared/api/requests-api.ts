import type { ApiRequest, ApiRequestRecipientCompany, CreateRequestInput, UpdateRequestInput } from './contracts'
import { apiRequest } from './http-client'

const requestPath = (requestId: string) => `/requests/${encodeURIComponent(requestId)}`

export const requestsApi = {
  list: () => apiRequest<ApiRequest[]>('/requests'),
  listRecipientCompanies: () => apiRequest<ApiRequestRecipientCompany[]>('/requests/recipient-companies'),
  get: (requestId: string) => apiRequest<ApiRequest>(requestPath(requestId)),
  create: (input: CreateRequestInput) => apiRequest<ApiRequest>('/requests', { method: 'POST', body: input }),
  update: (requestId: string, input: UpdateRequestInput) => (
    apiRequest<ApiRequest>(requestPath(requestId), { method: 'PATCH', body: input })
  ),
  submit: (requestId: string, version: number) => (
    apiRequest<ApiRequest>(`${requestPath(requestId)}/submit`, { method: 'POST', body: { version } })
  ),
  cancel: (requestId: string, version: number) => (
    apiRequest<ApiRequest>(`${requestPath(requestId)}/cancel`, { method: 'POST', body: { version } })
  ),
  listRecipients: (requestId: string) => apiRequest<unknown[]>(`${requestPath(requestId)}/recipients`),
  replaceRecipients: (requestId: string, version: number, companyIds: string[]) => (
    apiRequest<unknown[]>(`${requestPath(requestId)}/recipients`, {
      method: 'PUT',
      body: { version, companyIds },
    })
  ),
}
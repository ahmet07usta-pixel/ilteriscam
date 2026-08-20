import type {
  ApiRequestItem,
  CreateRequestItemInput,
  UpdateRequestItemInput,
} from './contracts'
import { apiRequest } from './http-client'

const itemsPath = (requestId: string) => `/requests/${encodeURIComponent(requestId)}/items`
const itemPath = (requestId: string, itemId: string) => (
  `${itemsPath(requestId)}/${encodeURIComponent(itemId)}`
)

export const requestItemsApi = {
  listRequestItems: (requestId: string) => apiRequest<ApiRequestItem[]>(itemsPath(requestId)),
  getRequestItem: (requestId: string, itemId: string) => (
    apiRequest<ApiRequestItem>(itemPath(requestId, itemId))
  ),
  createRequestItem: (requestId: string, input: CreateRequestItemInput) => (
    apiRequest<ApiRequestItem>(itemsPath(requestId), { method: 'POST', body: input })
  ),
  updateRequestItem: (
    requestId: string,
    itemId: string,
    input: UpdateRequestItemInput,
  ) => apiRequest<ApiRequestItem>(itemPath(requestId, itemId), {
    method: 'PATCH',
    body: input,
  }),
  deleteRequestItem: (requestId: string, itemId: string, version: number) => (
    apiRequest<{ id: string; deleted: true }>(itemPath(requestId, itemId), {
      method: 'DELETE',
      body: { version },
    })
  ),
}
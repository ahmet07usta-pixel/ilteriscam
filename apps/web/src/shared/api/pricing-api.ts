import type { ApiPriceCatalogItem, CreatePriceCatalogItemInput, UpdatePriceCatalogItemInput } from './contracts'
import { apiRequest } from './http-client'

const catalogItemPath = (id: string) => `/pricing/catalog-items/${encodeURIComponent(id)}`

export const pricingApi = {
  list: () => apiRequest<ApiPriceCatalogItem[]>('/pricing/catalog-items'),
  create: (input: CreatePriceCatalogItemInput) => (
    apiRequest<ApiPriceCatalogItem>('/pricing/catalog-items', { method: 'POST', body: input })
  ),
  update: (id: string, input: UpdatePriceCatalogItemInput) => (
    apiRequest<ApiPriceCatalogItem>(catalogItemPath(id), { method: 'PATCH', body: input })
  ),
}

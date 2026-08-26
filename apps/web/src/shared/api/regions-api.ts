import type { ApiRegion } from './contracts'
import { apiRequest } from './http-client'

export const regionsApi = {
  list: () => apiRequest<ApiRegion[]>('/regions'),
}

import type {
  ApiManufacturerCustomer,
  CreateManufacturerCustomerInput,
  UpdateManufacturerCustomerInput,
} from './contracts'
import { apiRequest } from './http-client'

const customerPath = (id: string) => `/manufacturer-customers/${encodeURIComponent(id)}`

export const manufacturerCustomersApi = {
  list: () => apiRequest<ApiManufacturerCustomer[]>('/manufacturer-customers'),
  create: (input: CreateManufacturerCustomerInput) => (
    apiRequest<ApiManufacturerCustomer>('/manufacturer-customers', { method: 'POST', body: input })
  ),
  update: (id: string, input: UpdateManufacturerCustomerInput) => (
    apiRequest<ApiManufacturerCustomer>(customerPath(id), { method: 'PATCH', body: input })
  ),
  remove: (id: string) => apiRequest<{ id: string }>(customerPath(id), { method: 'DELETE' }),
  prepareInvite: (id: string) => (
    apiRequest<ApiManufacturerCustomer>(`${customerPath(id)}/prepare-invite`, { method: 'POST' })
  ),
}

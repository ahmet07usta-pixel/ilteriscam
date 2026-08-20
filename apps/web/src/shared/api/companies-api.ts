import type { ApiCompany, CreateCompanyInput, UpdateCompanyInput } from './contracts'
import { apiRequest } from './http-client'

const companyPath = (companyId: string) => `/companies/${encodeURIComponent(companyId)}`

export const companiesApi = {
  list: () => apiRequest<ApiCompany[]>('/companies'),
  get: (companyId: string) => apiRequest<ApiCompany>(companyPath(companyId)),
  create: (input: CreateCompanyInput) => apiRequest<ApiCompany>('/companies', { method: 'POST', body: input }),
  update: (companyId: string, input: UpdateCompanyInput) => (
    apiRequest<ApiCompany>(companyPath(companyId), { method: 'PATCH', body: input })
  ),
  addMembership: (companyId: string, userId: string, role = 'MEMBER') => (
    apiRequest<unknown>(`${companyPath(companyId)}/memberships`, { method: 'POST', body: { userId, role } })
  ),
}

import type { ApiUser, CreateUserInput } from './contracts'
import { apiRequest } from './http-client'

export const usersApi = {
  list: () => apiRequest<ApiUser[]>('/users'),
  create: (input: CreateUserInput) => apiRequest<ApiUser>('/users', { method: 'POST', body: input }),
}

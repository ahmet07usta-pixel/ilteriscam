import type { ApiConversation, ApiMessage, CreateMessageInput } from './contracts'
import { apiRequest } from './http-client'

export const messagesApi = {
  listConversations: () => apiRequest<ApiConversation[]>('/messages/conversations'),
  listThread: (requestId: string, counterpartyCompanyId: string) => (
    apiRequest<ApiMessage[]>(`/requests/${encodeURIComponent(requestId)}/messages?counterpartyCompanyId=${encodeURIComponent(counterpartyCompanyId)}`)
  ),
  send: (requestId: string, input: CreateMessageInput) => (
    apiRequest<ApiMessage>(`/requests/${encodeURIComponent(requestId)}/messages`, { method: 'POST', body: input })
  ),
}

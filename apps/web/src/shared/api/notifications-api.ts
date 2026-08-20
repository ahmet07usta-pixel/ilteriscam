import type { ApiNotification } from './contracts'
import { apiRequest } from './http-client'

export const notificationsApi = {
  list: () => apiRequest<ApiNotification[]>('/notifications'),
  markAsRead: (id: string) => (
    apiRequest<ApiNotification>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })
  ),
  markAllAsRead: () => apiRequest<{ success: true }>('/notifications/read-all', { method: 'POST' }),
}

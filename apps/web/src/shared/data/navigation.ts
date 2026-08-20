import type { UserRole } from '../../entities/domain'

export type ViewKey =
  | 'dashboard'
  | 'requests'
  | 'offers'
  | 'orders'
  | 'pricing'
  | 'production'
  | 'shipment'
  | 'messages'
  | 'alerts'
  | 'companies'
  | 'reports'
  | 'settings'

export interface ViewDef {
  key: ViewKey
  label: string
}

export interface ViewPermission {
  read: boolean
  write: boolean
}

export const allViews: ViewKey[] = [
  'dashboard',
  'requests',
  'offers',
  'orders',
  'pricing',
  'production',
  'shipment',
  'messages',
  'alerts',
  'companies',
  'reports',
  'settings',
]

export const viewLabelByKey: Record<ViewKey, string> = {
  dashboard: 'Kontrol Paneli',
  requests: 'Talepler',
  offers: 'Teklifler',
  orders: 'Siparisler',
  pricing: 'Fiyat ve Urun Yonetimi',
  production: 'Uretim Takibi',
  shipment: 'Sevkiyat',
  messages: 'Mesajlar',
  alerts: 'Bildirimler',
  companies: 'Firmalar',
  reports: 'Raporlar',
  settings: 'Ayarlar',
}

export const viewPathByKey: Record<ViewKey, string> = {
  dashboard: 'kontrol-paneli',
  requests: 'talepler',
  offers: 'teklifler',
  orders: 'siparisler',
  pricing: 'fiyat-urun-yonetimi',
  production: 'uretim-takibi',
  shipment: 'sevkiyat',
  messages: 'mesajlar',
  alerts: 'bildirimler',
  companies: 'firmalar',
  reports: 'raporlar',
  settings: 'ayarlar',
}

export const viewKeyByPath: Record<string, ViewKey> = Object.fromEntries(
  allViews.map((key) => [viewPathByKey[key], key]),
) as Record<string, ViewKey>

export function toAppPath(view: ViewKey): string {
  return `/app/${viewPathByKey[view]}`
}

export const navByRole: Record<UserRole, ViewDef[]> = {
  BUYER: [
    { key: 'dashboard', label: 'Kontrol Paneli' },
    { key: 'requests', label: 'Taleplerim' },
    { key: 'offers', label: 'Tekliflerim' },
    { key: 'orders', label: 'Siparislerim' },
    { key: 'production', label: 'Uretim Durumu' },
    { key: 'shipment', label: 'Sevkiyat Takibi' },
    { key: 'messages', label: 'Mesajlar' },
    { key: 'alerts', label: 'Bildirimler' },
    { key: 'settings', label: 'Profilim' },
  ],
  MANUFACTURER: [
    { key: 'dashboard', label: 'Kontrol Paneli' },
    { key: 'requests', label: 'Talepler' },
    { key: 'offers', label: 'Teklifler' },
    { key: 'orders', label: 'Siparisler' },
    { key: 'pricing', label: 'Fiyat ve Urun Yonetimi' },
    { key: 'production', label: 'Uretim Takibi' },
    { key: 'shipment', label: 'Sevkiyat' },
    { key: 'messages', label: 'Mesajlar' },
    { key: 'alerts', label: 'Bildirimler' },
    { key: 'companies', label: 'Firma Bilgileri' },
    { key: 'reports', label: 'Raporlar' },
    { key: 'settings', label: 'Ayarlar' },
  ],
  ADMIN: [
    { key: 'dashboard', label: 'Kontrol Paneli' },
    { key: 'requests', label: 'Talepler' },
    { key: 'offers', label: 'Teklifler' },
    { key: 'orders', label: 'Siparisler' },
    { key: 'pricing', label: 'Fiyat ve Urun Yonetimi' },
    { key: 'production', label: 'Uretim Takibi' },
    { key: 'shipment', label: 'Sevkiyat' },
    { key: 'messages', label: 'Mesajlar' },
    { key: 'alerts', label: 'Bildirimler' },
    { key: 'companies', label: 'Firmalar' },
    { key: 'reports', label: 'Raporlar' },
    { key: 'settings', label: 'Ayarlar' },
  ],
}

// Override table for splitting screen (read) from action (write) rights; a missing entry falls back to navByRole.
export const viewPermissionsByRole: Partial<Record<UserRole, Partial<Record<ViewKey, ViewPermission>>>> = {
  // The platform operator observes manufacturer-owned commercial data instead of editing it.
  ADMIN: {
    pricing: { read: true, write: false },
  },
  MANUFACTURER: {},
  BUYER: {
    production: { read: true, write: false },
    shipment: { read: true, write: false },
  },
}

function findViewPermission(role: UserRole, view: ViewKey): ViewPermission | undefined {
  return viewPermissionsByRole[role]?.[view]
}

function isViewInRoleNav(role: UserRole, view: ViewKey): boolean {
  return navByRole[role].some((item) => item.key === view)
}

export function isViewAllowedForRole(role: UserRole, view: ViewKey): boolean {
  const permission = findViewPermission(role, view)
  if (permission) {
    return permission.read
  }

  return isViewInRoleNav(role, view)
}

export function canWriteView(role: UserRole, view: ViewKey): boolean {  const permission = findViewPermission(role, view)
  if (permission) {
    return permission.write
  }

  return isViewAllowedForRole(role, view)
}

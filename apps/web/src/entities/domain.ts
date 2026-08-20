export type UserRole = 'BUYER' | 'MANUFACTURER' | 'ADMIN'

export type BackendUserRole = 'ADMIN' | 'MANAGER' | 'SALES' | 'PRODUCER' | 'USER'

export interface AuthenticatedMembership {
  id: string
  companyId: string
  role: string
  status: 'ACTIVE' | 'INACTIVE'
  company: {
    id: string
    legalName: string
    tradeName: string | null
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  }
}

export interface AuthenticatedUser {
  id: string
  role: UserRole
  backendRole?: BackendUserRole
  permissions?: string[]
  email: string
  phone: string
  fullName: string
  company: string
  companyId?: string
  memberships?: AuthenticatedMembership[]
}

export type ScreenState = 'steady' | 'loading' | 'empty' | 'error' | 'success'

export type OrderStage =
  | 'TALEP_ALINDI'
  | 'TEKLIF_HAZIRLANIYOR'
  | 'SIPARIS_ONAYLANDI'
  | 'URETIME_ALINDI'
  | 'KESIM'
  | 'ISLEME'
  | 'TEMPER'
  | 'LAMINASYON'
  | 'KALITE_KONTROL'
  | 'PAKETLEME'
  | 'SEVKE_HAZIR'
  | 'YOLDA'
  | 'TESLIM_EDILDI'

export interface Stat {
  label: string
  value: string
  trend: string
}

export interface Demand {
  id: string
  title: string
  glassType: string
  quantity: string
  dueDate: string
  status: 'open' | 'quoting' | 'closed'
}

export interface Quote {
  id: string
  supplier: string
  amount: string
  leadTime: string
  validity: string
  status: 'submitted' | 'revised' | 'accepted' | 'rejected'
}

export interface Order {
  id: string
  product: string
  buyer: string
  manufacturer: string
  eta: string
  stage: OrderStage
}

export interface TimelineEvent {
  stage: OrderStage
  timestamp: string
  actor: string
  note: string
}

export const ORDER_STAGES: OrderStage[] = [
  'TALEP_ALINDI',
  'TEKLIF_HAZIRLANIYOR',
  'SIPARIS_ONAYLANDI',
  'URETIME_ALINDI',
  'KESIM',
  'ISLEME',
  'TEMPER',
  'LAMINASYON',
  'KALITE_KONTROL',
  'PAKETLEME',
  'SEVKE_HAZIR',
  'YOLDA',
  'TESLIM_EDILDI',
]

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  TALEP_ALINDI: 'Talep Alindi',
  TEKLIF_HAZIRLANIYOR: 'Teklif Hazirlaniyor',
  SIPARIS_ONAYLANDI: 'Siparis Onaylandi',
  URETIME_ALINDI: 'Uretime Alindi',
  KESIM: 'Kesim',
  ISLEME: 'Isleme',
  TEMPER: 'Temper',
  LAMINASYON: 'Laminasyon',
  KALITE_KONTROL: 'Kalite Kontrol',
  PAKETLEME: 'Paketleme',
  SEVKE_HAZIR: 'Sevke Hazir',
  YOLDA: 'Yolda',
  TESLIM_EDILDI: 'Teslim Edildi',
}

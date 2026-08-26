import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AuthenticatedUser, ScreenState, UserRole } from '../entities/domain'
import type {
  ApiRequest,
  ApiRequestItem,
  ApiRequestRecipientCompany,
  ApiQuotation,
  ApiQuotationCalculation,
  ApiCalculationSnapshotLine,
  ApiOrderView,
  ApiProductionView,
  ApiShipmentView,
  ApiAttachment,
  ApiAnalysisJob,
  ApiDetectedMeasurement,
  ApiUser,
  ApiCompany,
  ApiPriceCatalogItem,
  PriceCatalogStatus,
  ApiManufacturerCustomer,
  ApiNotification,
  ApiRegion,
  AttachmentStatus,
  CreateRequestItemInput,
  MeasurementSource,
  MeasurementUnit,
  QuotationStatus as ApiQuotationStatus,
  OrderStatus as ApiOrderStatus,
  ProductionStatus as ApiProductionStatus,
  ShipmentStatus as ApiShipmentStatus,
  RequestStatus as ApiRequestStatus,
} from '../shared/api/contracts'
import { ORDER_STATUS_LABELS, PRODUCTION_STATUS_LABELS, QUOTATION_STATUS_LABELS, REQUEST_STATUS_LABELS, SHIPMENT_STATUS_LABELS } from '../shared/api/contracts'
import { analysisApi } from '../shared/api/analysis-api'
import { attachmentsApi, uploadAttachmentBinary } from '../shared/api/attachments-api'
import { companiesApi } from '../shared/api/companies-api'
import { regionsApi } from '../shared/api/regions-api'
import { usersApi } from '../shared/api/users-api'
import { pricingApi } from '../shared/api/pricing-api'
import { manufacturerCustomersApi } from '../shared/api/manufacturer-customers-api'
import { ApiError, resolveApiCapabilityUrl } from '../shared/api/http-client'
import { requestItemsApi } from '../shared/api/request-items-api'
import { requestsApi } from '../shared/api/requests-api'
import { quotationsApi } from '../shared/api/quotations-api'
import { quotationCalculationsApi } from '../shared/api/quotation-calculations-api'
import { ordersApi } from '../shared/api/orders-api'
import { productionsApi } from '../shared/api/productions-api'
import { shipmentsApi } from '../shared/api/shipments-api'
import type { ViewKey } from '../shared/data/navigation'
import { canWriteView } from '../shared/data/navigation'
import { DeleteConfirmationModal, Pagination } from '../shared/ui/global-components'
import { ScreenStateGate } from '../shared/ui/states'

export interface WorkspacePageProps {
  currentUser: AuthenticatedUser | null
  role: UserRole
  state: ScreenState
  onRetry: () => void
  onNavigate: (view: ViewKey) => void
  workflow: WorkflowStore
  activityReadIds: string[]
  onMarkActivityRead: (activityId: string) => void
  onMarkAllActivitiesRead: (channel: 'notification' | 'message') => void
  apiNotifications: ApiNotification[]
  onMarkApiNotificationRead: (notificationId: string) => void
  onMarkAllApiNotificationsRead: () => void
  workflowActions: WorkflowActions
}

const quickActions: Array<{
  title: string
  description: string
  icon: 'request' | 'offers' | 'orders' | 'production' | 'shipment'
  target: ViewKey
  tone: 'blue' | 'teal' | 'amber'
  roles: UserRole[]
}> = [
  { title: 'Yeni Talep', description: 'Yeni ihtiyaci kaydet ve teklif surecini baslat.', icon: 'request', target: 'requests', tone: 'blue', roles: ['BUYER'] },
  { title: 'Teklifleri Incele', description: 'Gelen teklifleri karsilastir ve onceliklendir.', icon: 'offers', target: 'offers', tone: 'teal', roles: ['MANUFACTURER', 'BUYER'] },
  { title: 'Teklif Ver', description: 'Secili talep icin yeni teklif hazirla.', icon: 'offers', target: 'offers', tone: 'amber', roles: ['MANUFACTURER'] },
  { title: 'Siparis Olustur', description: 'Onaylanan tekliften yeni siparis ac.', icon: 'orders', target: 'orders', tone: 'blue', roles: ['MANUFACTURER'] },
  { title: 'Uretim Takibi', description: 'Uretim asamalarini anlik olarak izle.', icon: 'production', target: 'production', tone: 'teal', roles: ['MANUFACTURER', 'BUYER'] },
  { title: 'Sevkiyat Planla', description: 'Teslimat rotasini ve cikis saatini ayarla.', icon: 'shipment', target: 'shipment', tone: 'amber', roles: ['MANUFACTURER'] },
  { title: 'Sevkiyat Takibi', description: 'Teslimat durumunu ve varis saatini izle.', icon: 'shipment', target: 'shipment', tone: 'amber', roles: ['BUYER'] },
  { title: 'Firma Yonetimi', description: 'Platformdaki firmalari ve durumlarini yonet.', icon: 'orders', target: 'companies', tone: 'teal', roles: ['ADMIN'] },
]

const dashboardOfferStatuses: OfferStatus[] = ['Hazirlaniyor', 'Gonderildi', 'Onaylandi', 'Reddedildi']
const dashboardOrderStatuses: OrderStatus[] = ['Bekliyor', 'Uretimde', 'Sevkiyata Hazir', 'Teslim Edildi']

// Bars are rendered as CSS percentages, so counts are normalised against the busiest bucket.
function toDistribution(buckets: Array<{ label: string; count: number }>): Array<{ label: string; count: number; ratio: number }> {
  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0)
  return buckets.map((bucket) => ({
    ...bucket,
    ratio: peak === 0 ? 4 : Math.max(4, Math.round((bucket.count / peak) * 100)),
  }))
}

function parseTurkishAmount(value: string): number {
  const numeric = Number(value.replaceAll('TRY', '').replaceAll('.', '').replaceAll(',', '.').trim())
  return Number.isFinite(numeric) ? numeric : 0
}

type RequestPriority = 'Dusuk' | 'Orta' | 'Yuksek' | 'Kritik'
export type RequestStatus = 'Bekleyen' | 'Teklif Hazirlaniyor' | 'Teklif Gonderildi' | 'Onaylanan' | 'Reddedilen'
export type OfferStatus = 'Hazirlaniyor' | 'Gonderildi' | 'Onaylandi' | 'Reddedildi'
export type OrderStatus = 'Bekliyor' | 'Uretimde' | 'Sevkiyata Hazir' | 'Teslim Edildi'
export type ProductionStatus = 'Planlandi' | 'Kesim' | 'Montaj' | 'Tamamlandi' | 'Beklemede'
export type ShipmentStatus = 'Planlandi' | 'Yukleniyor' | 'Yolda' | 'Teslim Edildi' | 'Gecikti'
export type PricingStatus = 'Aktif' | 'Pasif'
type CompanyStatus = 'Aktif' | 'Pasif' | 'Askida'
type CustomerInviteStatus = 'Hazir' | 'Davet Hazirlandi' | 'Gonderim Bekliyor'
type ReportStatus = 'Hazir' | 'Hazirlaniyor' | 'Planlandi' | 'Arsivlendi'
type ReportType = 'Uretim' | 'Satis' | 'Sevkiyat' | 'Finans' | 'Operasyon'
type SettingStatus = 'Aktif' | 'Pasif' | 'Guncellendi' | 'Beklemede'
type SettingCategory = 'Genel' | 'Guvenlik' | 'Bildirim' | 'Sistem' | 'Kullanici'

export interface RequestRow {
  id: string
  apiId?: string
  version?: number
  backendStatus?: ApiRequestStatus
  companyId?: string
  company: string
  region: string
  regionId?: string
  requestType: string
  product: string
  title: string
  description: string
  owner: string
  assignedManufacturers: string[]
  priority: RequestPriority
  status: RequestStatus
  createdAt: string
  deliveryDate: string
}

interface RequestItemFormState {
  itemId?: string
  version?: number
  description: string
  productType: string
  productCode: string
  quantity: string
  unit: MeasurementUnit
  measurementSource: '' | MeasurementSource
  width: string
  height: string
  length: string
  depth: string
  thickness: string
}

interface MeasurementReviewFormState {
  action: 'CORRECT' | 'REJECT'
  item: ApiRequestItem
  measurement: ApiDetectedMeasurement
  reason: string
  quantity: string
  unit: '' | MeasurementUnit
  width: string
  height: string
  length: string
  depth: string
  thickness: string
}

interface QuotationView {
  id: string
  quotationNumber: string
  requestId: string
  manufacturerCompanyId: string
  status: ApiQuotationStatus
  revisionNumber: number
  version: number
  totalAmount: string
  currency: string
  leadTimeDays: number
  validUntil: string
  notes: string | null
  activeCalculationId: string | null
  request: ApiQuotation['request']
  company: ApiQuotation['company']
  manufacturerCompany: ApiQuotation['manufacturerCompany']
  createdBy: ApiQuotation['createdBy']
  createdAt: string
  updatedAt: string
}

interface QuotationFormState {
  quotationId?: string
  version?: number
  requestId: string
  manufacturerCompanyId: string
  totalAmount: string
  currency: string
  leadTimeDays: string
  validUntil: string
  notes: string
}

export interface OfferRow {
  id: string
  requestId?: string
  company: string
  manufacturerCompany?: string
  title: string
  amount: string
  owner: string
  status: OfferStatus
  type: string
  createdAt: string
  updatedAt: string
}

export interface OrderRow {
  id: string
  sourceOfferId?: string
  company: string
  manufacturerCompany?: string
  type: string
  title: string
  dueDate: string
  owner: string
  status: OrderStatus
  createdAt: string
}

export interface ProductionRow {
  id: string
  orderId?: string
  company: string
  product: string
  line: string
  startedAt: string
  dueDate: string
  owner: string
  priority: RequestPriority
  status: ProductionStatus
  description: string
}

export interface ShipmentRow {
  id: string
  company: string
  manufacturerCompany?: string
  orderNo: string
  vehicle: string
  driver: string
  plate: string
  departureDate: string
  estimatedDelivery: string
  status: ShipmentStatus
  description: string
}

export interface PriceCatalogRow {
  id: string
  company: string
  glassGroup: string
  glassType: string
  pricePerSquareMeter: number
  thicknessOptions: string[]
  colorOptions: string[]
  featureOptions: string[]
  minimumOrderAmount: number
  regionalAdjustment: Array<{ region: string; deltaPercent: number }>
  discountRate: number
  status: PricingStatus
  updatedAt: string
}

export interface WorkflowStore {
  requests: RequestRow[]
  offers: OfferRow[]
  orders: OrderRow[]
  productions: ProductionRow[]
  shipments: ShipmentRow[]
  manufacturerCustomers: CompanyRow[]
  priceCatalogs: PriceCatalogRow[]
  activityLog: WorkflowActivity[]
  activityReadKeys: string[]
}

export interface WorkflowActivity {
  id: string
  audience: 'ADMIN' | 'MANUFACTURER' | 'BUYER' | 'ALL'
  audienceCompany?: string
  channel: 'notification' | 'message' | 'report'
  title: string
  description: string
  eventKey?: string
  senderName?: string
  senderRole?: UserRole
  createdAt: string
}

export interface WorkflowActions {
  saveRequest: (row: RequestRow) => void
  deleteRequest: (id: string) => void
  createOfferFromRequest: (requestId: string) => void
  saveOffer: (row: OfferRow) => void
  deleteOffer: (id: string) => void
  saveOrder: (row: OrderRow) => void
  deleteOrder: (id: string) => void
  saveProduction: (row: ProductionRow) => void
  deleteProduction: (id: string) => void
  saveShipment: (row: ShipmentRow) => void
  deleteShipment: (id: string) => void
  saveManufacturerCustomer: (row: CompanyRow) => void
  deleteManufacturerCustomer: (code: string) => void
  prepareCustomerInvite: (code: string) => void
  savePriceCatalog: (row: PriceCatalogRow) => void
  deletePriceCatalog: (id: string) => void
  sendMessage: (message: { audience: 'ADMIN' | 'MANUFACTURER' | 'BUYER'; title: string; description: string }) => void
}

interface CompanyRow {
  code: string
  manufacturerCompany: string
  name: string
  contact: string
  phone: string
  email: string
  taxOffice: string
  taxNo: string
  address: string
  city: string
  region: string
  status: CompanyStatus
  inviteStatus: CustomerInviteStatus
  inviteToken?: string
  invitePreparedAt?: string
  invitePreparedBy?: string
  description: string
  createdAt: string
}

interface ReportRow {
  id: string
  name: string
  type: ReportType
  owner: string
  createdAt: string
  updatedAt: string
  status: ReportStatus
}

interface SettingRow {
  code: string
  name: string
  category: SettingCategory
  value: string
  updatedBy: string
  updatedAt: string
  status: SettingStatus
}

interface SettingFormState {
  code: string
  name: string
  category: SettingCategory
  value: string
  updatedBy: string
  updatedAt: string
  status: SettingStatus
}

export const requestRows: RequestRow[] = []

const requestStatuses: Array<'Tum Durumlar' | RequestStatus> = ['Tum Durumlar', 'Bekleyen', 'Teklif Hazirlaniyor', 'Teklif Gonderildi', 'Onaylanan', 'Reddedilen']
const requestRegions = ['Marmara', 'Istanbul', 'Ege', 'Anadolu', 'Akdeniz']
const requestPriorities: Array<'Tum Oncelikler' | RequestPriority> = ['Tum Oncelikler', 'Kritik', 'Yuksek', 'Orta', 'Dusuk']
const requestTypes = ['Mimari Cam', 'Isicam', 'Lamine Cam', 'Cam Balkon', 'Numune', 'Bolme Cami', 'Dograma Camlari', 'Otel Projesi']
const REQUEST_PAGE_SIZE = 50

export const offerRows: OfferRow[] = [
  { id: 'TK-8821', company: 'Marmara Cam', title: 'Temperli cam cephe teklifi', amount: 'TRY 1.240.000', owner: 'Selin Kaya', status: 'Gonderildi', type: 'Standart Teklif', createdAt: '06.08.2026', updatedAt: '06.08.2026' },
  { id: 'TK-8819', company: 'Nova Cephe Sistemleri', title: 'Isicam toplu satin alma teklifi', amount: 'TRY 860.000', owner: 'Emre Tunalı', status: 'Onaylandi', type: 'Fiyat Revizyonu', createdAt: '06.08.2026', updatedAt: '07.08.2026' },
  { id: 'TK-8817', company: 'Atlas Yapi', title: 'Lamine cam ofis projesi', amount: 'TRY 530.000', owner: 'Mert Gulen', status: 'Hazirlaniyor', type: 'Standart Teklif', createdAt: '05.08.2026', updatedAt: '05.08.2026' },
  { id: 'TK-8813', company: 'Pera Sistem', title: 'Cam balkon seri teklif calismasi', amount: 'TRY 410.000', owner: 'Ipek Batur', status: 'Reddedildi', type: 'Alternatif Teklif', createdAt: '05.08.2026', updatedAt: '06.08.2026' },
  { id: 'TK-8809', company: 'Eksen Cam Sanayi', title: 'Mimari cephe cam paketi', amount: 'TRY 1.980.000', owner: 'Deniz Akca', status: 'Gonderildi', type: 'Proje Teklifi', createdAt: '04.08.2026', updatedAt: '05.08.2026' },
  { id: 'TK-8806', company: 'Yildiz Mimarlik', title: 'Acil teslim lobi cami', amount: 'TRY 274.000', owner: 'Ceren Yalcin', status: 'Hazirlaniyor', type: 'Hizli Teklif', createdAt: '04.08.2026', updatedAt: '04.08.2026' },
  { id: 'TK-8802', company: 'Artemis Yapi', title: 'Otel giris camlari teklif paketi', amount: 'TRY 692.000', owner: 'Burak Demir', status: 'Onaylandi', type: 'Proje Teklifi', createdAt: '03.08.2026', updatedAt: '04.08.2026' },
  { id: 'TK-8798', company: 'Ege Aluminyum', title: 'Dograma uzeri cam tedarigi', amount: 'TRY 318.000', owner: 'Asli Donmez', status: 'Reddedildi', type: 'Standart Teklif', createdAt: '03.08.2026', updatedAt: '03.08.2026' },
  { id: 'TK-8795', company: 'Marmara Cam', title: 'Kis bahcesi proje teklif guncellemesi', amount: 'TRY 448.000', owner: 'Hakan Sumer', status: 'Gonderildi', type: 'Fiyat Revizyonu', createdAt: '02.08.2026', updatedAt: '03.08.2026' },
  { id: 'TK-8791', company: 'Nova Cephe Sistemleri', title: 'Ofis bolme cami alternatif teklifi', amount: 'TRY 229.000', owner: 'Melis Koc', status: 'Hazirlaniyor', type: 'Alternatif Teklif', createdAt: '02.08.2026', updatedAt: '02.08.2026' },
]

const offerStatuses: Array<'Tum Durumlar' | OfferStatus> = ['Tum Durumlar', 'Hazirlaniyor', 'Gonderildi', 'Onaylandi', 'Reddedildi']
const offerTypes = ['Tum Teklif Turleri', ...new Set(offerRows.map((row) => row.type))]

export const orderRows: OrderRow[] = [
  { id: 'SP-9021', company: 'Eksen Cam Sanayi', manufacturerCompany: 'Nova Cephe Sistemleri', type: 'Standart Siparis', title: 'Temperli cephe siparisi', dueDate: '08.08.2026', owner: 'Selin Kaya', status: 'Bekliyor', createdAt: '06.08.2026' },
  { id: 'SP-9022', company: 'Nova Cephe Sistemleri', manufacturerCompany: 'Nova Cephe Sistemleri', type: 'Proje Siparisi', title: 'Isicam seri uretim siparisi', dueDate: '09.08.2026', owner: 'Emre Tunalı', status: 'Uretimde', createdAt: '06.08.2026' },
  { id: 'SP-9023', company: 'Marmara Cam', manufacturerCompany: 'Nova Cephe Sistemleri', type: 'Numune Siparisi', title: 'Cam balkon panel siparisi', dueDate: '10.08.2026', owner: 'Ipek Batur', status: 'Sevkiyata Hazir', createdAt: '05.08.2026' },
  { id: 'SP-9024', company: 'Atlas Yapi', manufacturerCompany: 'Nova Cephe Sistemleri', type: 'Acil Siparis', title: 'Lamine cam proje siparisi', dueDate: '12.08.2026', owner: 'Mert Gulen', status: 'Sevkiyata Hazir', createdAt: '05.08.2026' },
  { id: 'SP-9025', company: 'Pera Sistem', manufacturerCompany: 'Marmara Cam', type: 'Standart Siparis', title: 'Ofis bolme cami siparisi', dueDate: '13.08.2026', owner: 'Deniz Akca', status: 'Bekliyor', createdAt: '04.08.2026' },
  { id: 'SP-9026', company: 'Yildiz Mimarlik', manufacturerCompany: 'Nova Cephe Sistemleri', type: 'Acil Siparis', title: 'Acil teslim lobi camlari', dueDate: '07.08.2026', owner: 'Ceren Yalcin', status: 'Uretimde', createdAt: '04.08.2026' },
  { id: 'SP-9027', company: 'Artemis Yapi', manufacturerCompany: 'Nova Cephe Sistemleri', type: 'Proje Siparisi', title: 'Otel giris sistemi siparisi', dueDate: '15.08.2026', owner: 'Burak Demir', status: 'Teslim Edildi', createdAt: '03.08.2026' },
  { id: 'SP-9028', company: 'Ege Aluminyum', manufacturerCompany: 'Nova Cephe Sistemleri', type: 'Standart Siparis', title: 'Dograma ustu cam tedarigi', dueDate: '14.08.2026', owner: 'Asli Donmez', status: 'Sevkiyata Hazir', createdAt: '03.08.2026' },
  { id: 'SP-9029', company: 'Nova Cephe Sistemleri', manufacturerCompany: 'Nova Cephe Sistemleri', type: 'Proje Siparisi', title: 'Revize cephe paketi siparisi', dueDate: '16.08.2026', owner: 'Melis Koc', status: 'Sevkiyata Hazir', createdAt: '02.08.2026' },
  { id: 'SP-9030', company: 'Marmara Cam', manufacturerCompany: 'Marmara Cam', type: 'Numune Siparisi', title: 'Showroom numune siparisi', dueDate: '11.08.2026', owner: 'Hakan Sumer', status: 'Teslim Edildi', createdAt: '02.08.2026' },
]

const orderStatuses: Array<'Tum Durumlar' | OrderStatus> = ['Tum Durumlar', 'Bekliyor', 'Uretimde', 'Sevkiyata Hazir', 'Teslim Edildi']
const orderTypes = ['Tum Siparis Turleri', ...new Set(orderRows.map((row) => row.type))]
const orderPriorities: Array<'Tum Oncelikler' | RequestPriority> = ['Tum Oncelikler', 'Kritik', 'Yuksek', 'Orta', 'Dusuk']

export const productionRows: ProductionRow[] = [
  { id: 'UE-4401', company: 'Eksen Cam Sanayi', product: 'Temperli Cephe Camlari', line: 'Kesim Hatti', startedAt: '06.08.2026', dueDate: '08.08.2026', owner: 'Selin Kaya', priority: 'Kritik', status: 'Kesim', description: '8 mm cephe camlari icin kesim ve kenar isleme sureci baslatildi.' },
  { id: 'UE-4402', company: 'Nova Cephe Sistemleri', product: 'Isicam Panel Serisi', line: 'Montaj Hatti', startedAt: '06.08.2026', dueDate: '09.08.2026', owner: 'Emre Tunalı', priority: 'Yuksek', status: 'Montaj', description: 'Panel ara bosluklari argon dolumuna uygun sekilde montajlaniyor.' },
  { id: 'UE-4403', company: 'Marmara Cam', product: 'Cam Balkon Kanat Seti', line: 'Montaj Hatti', startedAt: '05.08.2026', dueDate: '10.08.2026', owner: 'Ipek Batur', priority: 'Orta', status: 'Tamamlandi', description: 'Kanat setleri kalite kontrolden gecirilerek paketlemeye alindi.' },
  { id: 'UE-4404', company: 'Atlas Yapi', product: 'Lamine Ofis Bolme Camlari', line: 'Kesim Hatti', startedAt: '05.08.2026', dueDate: '12.08.2026', owner: 'Mert Gulen', priority: 'Yuksek', status: 'Planlandi', description: 'Kesim optimizasyon plani onayi bekleniyor.' },
  { id: 'UE-4405', company: 'Pera Sistem', product: 'Vitrin Cam Paneli', line: 'Temper Hatti', startedAt: '04.08.2026', dueDate: '13.08.2026', owner: 'Deniz Akca', priority: 'Dusuk', status: 'Beklemede', description: 'Temper firini kapasite dolulugu nedeniyle sonraki vardiyaya alindi.' },
  { id: 'UE-4406', company: 'Yildiz Mimarlik', product: 'Lobi Giris Cam Takimi', line: 'Temper Hatti', startedAt: '04.08.2026', dueDate: '07.08.2026', owner: 'Ceren Yalcin', priority: 'Kritik', status: 'Kesim', description: 'Acil teslimat icin kritik kalemler one alinarak kesim yapiliyor.' },
  { id: 'UE-4407', company: 'Artemis Yapi', product: 'Otel Cephe Cam Modulu', line: 'Laminasyon Hatti', startedAt: '03.08.2026', dueDate: '15.08.2026', owner: 'Burak Demir', priority: 'Orta', status: 'Montaj', description: 'Cephe modulleri icin laminasyon sonrasi montaj adimlari ilerliyor.' },
  { id: 'UE-4408', company: 'Ege Aluminyum', product: 'Dograma Ustu Cam Serisi', line: 'Laminasyon Hatti', startedAt: '03.08.2026', dueDate: '14.08.2026', owner: 'Asli Donmez', priority: 'Yuksek', status: 'Planlandi', description: 'Dograma olculerine gore laminasyon setleri vardiya planina eklendi.' },
  { id: 'UE-4409', company: 'Nova Cephe Sistemleri', product: 'Revize Cephe Kiti', line: 'Kesim Hatti', startedAt: '02.08.2026', dueDate: '16.08.2026', owner: 'Melis Koc', priority: 'Orta', status: 'Beklemede', description: 'Revize teknik cizim onayi bekleniyor.' },
  { id: 'UE-4410', company: 'Marmara Cam', product: 'Showroom Numune Seti', line: 'Montaj Hatti', startedAt: '02.08.2026', dueDate: '11.08.2026', owner: 'Hakan Sumer', priority: 'Dusuk', status: 'Tamamlandi', description: 'Numune setleri sevk oncesi etiketlenerek tamamlandi.' },
]

const productionStatuses: Array<'Tum Durumlar' | ProductionStatus> = ['Tum Durumlar', 'Planlandi', 'Kesim', 'Montaj', 'Tamamlandi', 'Beklemede']

export const shipmentRows: ShipmentRow[] = [
  { id: 'SV-2201', company: 'Eksen Cam Sanayi', manufacturerCompany: 'Nova Cephe Sistemleri', orderNo: 'SP-9101', vehicle: 'Ford Transit Cam Van', driver: 'Mehmet Kurt', plate: '34 DC 1458', departureDate: '06.08.2026', estimatedDelivery: '07.08.2026', status: 'Planlandi', description: 'Istanbul Avrupa yakasi dagitim sevkiyati, sabah cikis planlandi.' },
  { id: 'SV-2202', company: 'Nova Cephe Sistemleri', manufacturerCompany: 'Nova Cephe Sistemleri', orderNo: 'SP-9102', vehicle: 'Mercedes Atego 10T', driver: 'Ali Yilmaz', plate: '41 KZ 889', departureDate: '06.08.2026', estimatedDelivery: '07.08.2026', status: 'Yukleniyor', description: 'Gebze OSB sevkiyati icin yukleme ve palet sabitleme devam ediyor.' },
  { id: 'SV-2203', company: 'Marmara Cam', manufacturerCompany: 'Nova Cephe Sistemleri', orderNo: 'SP-9103', vehicle: 'Iveco Daily', driver: 'Murat Acar', plate: '16 AC 274', departureDate: '05.08.2026', estimatedDelivery: '06.08.2026', status: 'Yolda', description: 'Bursa ici dagitim rotasinda ikinci teslimat noktasina gecildi.' },
  { id: 'SV-2204', company: 'Atlas Yapi', manufacturerCompany: 'Nova Cephe Sistemleri', orderNo: 'SP-9104', vehicle: 'Renault Master', driver: 'Kemal Isik', plate: '06 PT 532', departureDate: '05.08.2026', estimatedDelivery: '07.08.2026', status: 'Planlandi', description: 'Ankara sevkiyatinda cikis slotu saat 14:30 icin rezerve edildi.' },
  { id: 'SV-2205', company: 'Pera Sistem', manufacturerCompany: 'Marmara Cam', orderNo: 'SP-9105', vehicle: 'Fiat Ducato', driver: 'Gokhan Yuce', plate: '35 BK 440', departureDate: '04.08.2026', estimatedDelivery: '05.08.2026', status: 'Teslim Edildi', description: 'Izmir Bornova teslimati tamamlandi ve teslim belgesi yansitildi.' },
  { id: 'SV-2206', company: 'Yildiz Mimarlik', manufacturerCompany: 'Nova Cephe Sistemleri', orderNo: 'SP-9106', vehicle: 'MAN TGL 12T', driver: 'Suat Cakir', plate: '20 YA 127', departureDate: '04.08.2026', estimatedDelivery: '06.08.2026', status: 'Gecikti', description: 'Yol calismasi nedeniyle varis saati revize edildi, musteri bilgilendirildi.' },
  { id: 'SV-2207', company: 'Artemis Yapi', manufacturerCompany: 'Nova Cephe Sistemleri', orderNo: 'SP-9107', vehicle: 'Isuzu NPR', driver: 'Tolga Karahan', plate: '07 AR 903', departureDate: '03.08.2026', estimatedDelivery: '05.08.2026', status: 'Teslim Edildi', description: 'Antalya rota teslimati sorunsuz tamamlandi.' },
  { id: 'SV-2208', company: 'Ege Aluminyum', manufacturerCompany: 'Nova Cephe Sistemleri', orderNo: 'SP-9108', vehicle: 'Volkswagen Crafter', driver: 'Onur Koc', plate: '45 EM 761', departureDate: '03.08.2026', estimatedDelivery: '04.08.2026', status: 'Gecikti', description: 'Depo cikisi sonrasi arac arizasi nedeniyle teknik destek beklendi.' },
  { id: 'SV-2209', company: 'Nova Cephe Sistemleri', manufacturerCompany: 'Nova Cephe Sistemleri', orderNo: 'SP-9109', vehicle: 'Ford Cargo 13T', driver: 'Serkan Efe', plate: '34 NZ 118', departureDate: '02.08.2026', estimatedDelivery: '03.08.2026', status: 'Yolda', description: 'Istanbul Anadolu yakasinda son teslim noktasina ilerliyor.' },
  { id: 'SV-2210', company: 'Marmara Cam', manufacturerCompany: 'Marmara Cam', orderNo: 'SP-9110', vehicle: 'Citroen Jumper', driver: 'Yasin Uslu', plate: '26 MC 602', departureDate: '02.08.2026', estimatedDelivery: '03.08.2026', status: 'Teslim Edildi', description: 'Eskisehir teslimatiyla sevkiyat kaydi kapatildi.' },
]

const shipmentStatuses: Array<'Tum Durumlar' | ShipmentStatus> = ['Tum Durumlar', 'Planlandi', 'Yukleniyor', 'Yolda', 'Teslim Edildi', 'Gecikti']

export const priceCatalogRows: PriceCatalogRow[] = [
  {
    id: 'FY-3101',
    company: 'Nova Cephe Sistemleri',
    glassGroup: 'Temperli Cam',
    glassType: 'Cephe Cami',
    pricePerSquareMeter: 1280,
    thicknessOptions: ['6 mm', '8 mm', '10 mm'],
    colorOptions: ['Seffaf', 'Fume'],
    featureOptions: ['Low-E', 'Rodaj'],
    minimumOrderAmount: 150000,
    regionalAdjustment: [
      { region: 'Marmara', deltaPercent: 0 },
      { region: 'Ege', deltaPercent: 4 },
      { region: 'Anadolu', deltaPercent: 7 },
    ],
    discountRate: 4,
    status: 'Aktif',
    updatedAt: '07.08.2026',
  },
  {
    id: 'FY-3102',
    company: 'Marmara Cam',
    glassGroup: 'Lamine Cam',
    glassType: 'Guvenlik Cami',
    pricePerSquareMeter: 1540,
    thicknessOptions: ['4+4 mm', '5+5 mm', '6+6 mm'],
    colorOptions: ['Seffaf', 'Bronz'],
    featureOptions: ['Guvenlik Filmi', 'Akustik Katman'],
    minimumOrderAmount: 90000,
    regionalAdjustment: [
      { region: 'Marmara', deltaPercent: 0 },
      { region: 'Akdeniz', deltaPercent: 6 },
    ],
    discountRate: 3,
    status: 'Aktif',
    updatedAt: '06.08.2026',
  },
  {
    id: 'FY-3103',
    company: 'Nova Cephe Sistemleri',
    glassGroup: 'Isicam',
    glassType: 'Yalitim Cami',
    pricePerSquareMeter: 1020,
    thicknessOptions: ['4+12+4', '4+16+4'],
    colorOptions: ['Seffaf'],
    featureOptions: ['Argon Dolum', 'Solar Kontrol'],
    minimumOrderAmount: 120000,
    regionalAdjustment: [
      { region: 'Istanbul', deltaPercent: 2 },
      { region: 'Anadolu', deltaPercent: 5 },
    ],
    discountRate: 2,
    status: 'Pasif',
    updatedAt: '07.08.2026',
  },
]

export const companyRows: CompanyRow[] = [
  {
    code: 'FRM-1001',
    manufacturerCompany: 'Nova Cephe Sistemleri',
    name: 'Eksen Cam Sanayi',
    contact: 'Selin Kaya',
    phone: '+90 212 555 10 10',
    email: 'selin.kaya@eksencam.com',
    taxOffice: 'Basaksehir',
    taxNo: '1254789630',
    address: 'Ikitelli OSB Mah. Esenler Cad. No:18 Basaksehir / Istanbul',
    city: 'Istanbul',
    region: 'Marmara',
    status: 'Aktif',
    inviteStatus: 'Hazir',
    description: 'Mimari cephe camlari ve isicam uretiminde ana tedarikci.',
    createdAt: '02.08.2026',
  },
  {
    code: 'FRM-1002',
    manufacturerCompany: 'Nova Cephe Sistemleri',
    name: 'Nova Cephe Sistemleri',
    contact: 'Emre Tunalı',
    phone: '+90 262 555 22 18',
    email: 'emre.tunali@novacephe.com',
    taxOffice: 'Gebze',
    taxNo: '4589632174',
    address: 'Gebze Organize Sanayi 4. Cad. No:27 Gebze / Kocaeli',
    city: 'Kocaeli',
    region: 'Marmara',
    status: 'Aktif',
    inviteStatus: 'Davet Hazirlandi',
    inviteToken: 'INV-FRM-1002',
    invitePreparedAt: '07.08.2026',
    invitePreparedBy: 'Platform Admin',
    description: 'Cephe sistemleri montaji icin periyodik satin alma yapan kurumsal musteri.',
    createdAt: '03.08.2026',
  },
  {
    code: 'FRM-1003',
    manufacturerCompany: 'Marmara Cam',
    name: 'Marmara Cam',
    contact: 'Ipek Batur',
    phone: '+90 224 555 13 90',
    email: 'ipek.batur@marmaracam.com',
    taxOffice: 'Nilufer',
    taxNo: '8527419635',
    address: 'Nilufer Sanayi Bolgesi 2. Sok. No:44 Nilufer / Bursa',
    city: 'Bursa',
    region: 'Marmara',
    status: 'Aktif',
    inviteStatus: 'Hazir',
    description: 'Cam balkon ve showroom numune projelerinde uzun sureli is ortagi.',
    createdAt: '04.08.2026',
  },
  {
    code: 'FRM-1004',
    manufacturerCompany: 'Marmara Cam',
    name: 'Atlas Yapi',
    contact: 'Mert Gulen',
    phone: '+90 312 555 48 20',
    email: 'mert.gulen@atlasyapi.com',
    taxOffice: 'Sincan',
    taxNo: '9632587410',
    address: 'Sincan 1. OSB 1035. Cad. No:12 Sincan / Ankara',
    city: 'Ankara',
    region: 'Anadolu',
    status: 'Askida',
    inviteStatus: 'Gonderim Bekliyor',
    description: 'Teminat guncellemesi beklenen ve gecici askida tutulan musteri.',
    createdAt: '04.08.2026',
  },
  {
    code: 'FRM-1005',
    manufacturerCompany: 'Nova Cephe Sistemleri',
    name: 'Pera Sistem',
    contact: 'Deniz Akca',
    phone: '+90 232 555 78 14',
    email: 'deniz.akca@perasistem.com',
    taxOffice: 'Bornova',
    taxNo: '7418529630',
    address: 'Bornova Sanayi Sitesi 7. Blok No:6 Bornova / Izmir',
    city: 'Izmir',
    region: 'Ege',
    status: 'Pasif',
    inviteStatus: 'Hazir',
    description: 'Fiyat revizyonu sonrasinda yeni sozlesme bekleyen pasif kayit.',
    createdAt: '05.08.2026',
  },
  {
    code: 'FRM-1006',
    manufacturerCompany: 'Nova Cephe Sistemleri',
    name: 'Yildiz Mimarlik',
    contact: 'Ceren Yalcin',
    phone: '+90 258 555 41 76',
    email: 'ceren.yalcin@yildizmimarlik.com',
    taxOffice: 'Merkezefendi',
    taxNo: '3571594862',
    address: 'Merkezefendi Mah. 1207 Sok. No:9 Merkezefendi / Denizli',
    city: 'Denizli',
    region: 'Ege',
    status: 'Aktif',
    inviteStatus: 'Hazir',
    description: 'Acil lobi projelerinde hizli teklif ve siparis gecisi yapan firma.',
    createdAt: '05.08.2026',
  },
  {
    code: 'FRM-1007',
    manufacturerCompany: 'Nova Cephe Sistemleri',
    name: 'Artemis Yapi',
    contact: 'Burak Demir',
    phone: '+90 242 555 09 33',
    email: 'burak.demir@artemisyapi.com',
    taxOffice: 'Konyaalti',
    taxNo: '6549873210',
    address: 'Konyaalti Cevre Yolu Uzeri No:58 Konyaalti / Antalya',
    city: 'Antalya',
    region: 'Akdeniz',
    status: 'Aktif',
    inviteStatus: 'Davet Hazirlandi',
    inviteToken: 'INV-FRM-1007',
    invitePreparedAt: '06.08.2026',
    invitePreparedBy: 'Emre Tunali',
    description: 'Otel cephe cam modullerinde surekli proje akisina sahip.',
    createdAt: '06.08.2026',
  },
  {
    code: 'FRM-1008',
    manufacturerCompany: 'Marmara Cam',
    name: 'Ege Aluminyum',
    contact: 'Asli Donmez',
    phone: '+90 236 555 64 87',
    email: 'asli.donmez@egealuminyum.com',
    taxOffice: 'Yunusemre',
    taxNo: '2587413690',
    address: 'Yunusemre Organize Sanayi 5. Cad. No:14 Yunusemre / Manisa',
    city: 'Manisa',
    region: 'Ege',
    status: 'Askida',
    inviteStatus: 'Hazir',
    description: 'Odeme vadesi mutabakati beklenen kayit, siparis acilisi sinirli.',
    createdAt: '06.08.2026',
  },
  {
    code: 'FRM-1009',
    manufacturerCompany: 'Nova Cephe Sistemleri',
    name: 'Doga Cam Cozumleri',
    contact: 'Hakan Sumer',
    phone: '+90 216 555 31 25',
    email: 'hakan.sumer@dogacam.com',
    taxOffice: 'Kadikoy',
    taxNo: '7413692584',
    address: 'Kozyatagi Mah. Sogutlu Cesme Cad. No:77 Kadikoy / Istanbul',
    city: 'Istanbul',
    region: 'Marmara',
    status: 'Aktif',
    inviteStatus: 'Hazir',
    description: 'Showroom ve numune set taleplerinde bolgesel bayi operasyonu yurutur.',
    createdAt: '07.08.2026',
  },
  {
    code: 'FRM-1010',
    manufacturerCompany: 'Marmara Cam',
    name: 'Lima Endustri',
    contact: 'Melis Koc',
    phone: '+90 352 555 99 02',
    email: 'melis.koc@limaendustri.com',
    taxOffice: 'Kocasinan',
    taxNo: '1593574862',
    address: 'Kocasinan Sanayi Bolgesi 22. Sok. No:3 Kocasinan / Kayseri',
    city: 'Kayseri',
    region: 'Anadolu',
    status: 'Pasif',
    inviteStatus: 'Hazir',
    description: 'Bakim doneminde oldugu icin yeni tedarik talepleri gecici olarak durduruldu.',
    createdAt: '07.08.2026',
  },
]

const companyStatuses: Array<'Tum Durumlar' | CompanyStatus> = ['Tum Durumlar', 'Aktif', 'Pasif', 'Askida']
const companyRegions = ['Tum Bolgeler', 'Marmara', 'Istanbul', 'Ege', 'Anadolu', 'Akdeniz']

const reportRows: ReportRow[] = []

const reportTypes: Array<'Tum Rapor Turleri' | ReportType> = ['Tum Rapor Turleri', 'Uretim', 'Satis', 'Sevkiyat', 'Finans', 'Operasyon']
const reportStatuses: Array<'Tum Durumlar' | ReportStatus> = ['Tum Durumlar', 'Hazir', 'Hazirlaniyor', 'Planlandi', 'Arsivlendi']

const settingRows: SettingRow[] = [
  { code: 'AYR-5001', name: 'Varsayilan Para Birimi', category: 'Genel', value: 'TRY', updatedBy: 'Selin Kaya', updatedAt: '07.08.2026', status: 'Aktif' },
  { code: 'AYR-5002', name: 'Iki Adimli Dogrulama', category: 'Guvenlik', value: 'Zorunlu', updatedBy: 'Emre Tunalı', updatedAt: '07.08.2026', status: 'Guncellendi' },
  { code: 'AYR-5003', name: 'E-posta Bildirim Frekansi', category: 'Bildirim', value: 'Anlik', updatedBy: 'Ipek Batur', updatedAt: '06.08.2026', status: 'Aktif' },
  { code: 'AYR-5004', name: 'Entegrasyon Baglanti Modu', category: 'Sistem', value: 'Canli Ortam', updatedBy: 'Mert Gulen', updatedAt: '06.08.2026', status: 'Beklemede' },
  { code: 'AYR-5005', name: 'Kullanici Rol Sabitleri', category: 'Kullanici', value: '3 Rol Tanimli', updatedBy: 'Deniz Akca', updatedAt: '05.08.2026', status: 'Aktif' },
  { code: 'AYR-5006', name: 'Oturum Suresi', category: 'Guvenlik', value: '30 Dakika', updatedBy: 'Ceren Yalcin', updatedAt: '05.08.2026', status: 'Pasif' },
  { code: 'AYR-5007', name: 'Haftalik Rapor Dagitimi', category: 'Bildirim', value: 'Pazartesi 09:00', updatedBy: 'Burak Demir', updatedAt: '04.08.2026', status: 'Guncellendi' },
  { code: 'AYR-5008', name: 'Yedekleme Takvimi', category: 'Sistem', value: 'Gunluk 02:00', updatedBy: 'Asli Donmez', updatedAt: '04.08.2026', status: 'Aktif' },
  { code: 'AYR-5009', name: 'Platform Dili', category: 'Genel', value: 'Turkce', updatedBy: 'Hakan Sumer', updatedAt: '03.08.2026', status: 'Aktif' },
  { code: 'AYR-5010', name: 'Yeni Kullanici Onayi', category: 'Kullanici', value: 'Manuel Onay', updatedBy: 'Melis Koc', updatedAt: '03.08.2026', status: 'Beklemede' },
  { code: 'AYR-5011', name: 'Platform Saat Dilimi', category: 'Genel', value: 'Europe/Istanbul', updatedBy: 'Platform Admin', updatedAt: '07.08.2026', status: 'Aktif' },
  { code: 'AYR-5012', name: 'Bolgesel Format', category: 'Sistem', value: 'tr-TR', updatedBy: 'Platform Admin', updatedAt: '07.08.2026', status: 'Aktif' },
  { code: 'AYR-5013', name: 'Dil Destegi Altyapisi', category: 'Sistem', value: 'tr-TR,en-US,de-DE', updatedBy: 'Platform Admin', updatedAt: '07.08.2026', status: 'Aktif' },
  { code: 'AYR-5014', name: 'Platform Unvani', category: 'Genel', value: 'Dijital Cam Platformu', updatedBy: 'Platform Admin', updatedAt: '07.08.2026', status: 'Aktif' },
]

const settingCategories: Array<'Tum Kategoriler' | SettingCategory> = ['Tum Kategoriler', 'Genel', 'Guvenlik', 'Bildirim', 'Sistem', 'Kullanici']
const settingStatuses: Array<'Tum Durumlar' | SettingStatus> = ['Tum Durumlar', 'Aktif', 'Pasif', 'Guncellendi', 'Beklemede']

function toComparable(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
}

function belongsToCurrentUser(owner: string, currentUser: AuthenticatedUser | null): boolean {
  if (!currentUser) {
    return false
  }

  return toComparable(owner) === toComparable(currentUser.fullName)
}

// Local rows only carry a display name, so identity is matched on companyId first and normalised name second.
function belongsToCurrentCompany(
  row: { company: string; companyId?: string },
  currentUser: AuthenticatedUser | null,
): boolean {
  if (!currentUser) {
    return false
  }

  if (row.companyId && currentUser.companyId) {
    return row.companyId === currentUser.companyId
  }

  return toComparable(row.company) === toComparable(currentUser.company)
}

function scopeRowsByCompany<T extends { company: string; companyId?: string; manufacturerCompany?: string }>(rows: T[], currentUser: AuthenticatedUser | null): T[] {
  if (!currentUser || currentUser.role === 'ADMIN') {
    return rows
  }

  if (currentUser.role === 'MANUFACTURER') {
    return rows.filter((row) => toComparable(row.manufacturerCompany ?? row.company) === toComparable(currentUser.company))
  }

  return rows.filter((row) => belongsToCurrentCompany(row, currentUser))
}

function scopeRequests(rows: RequestRow[], currentUser: AuthenticatedUser | null): RequestRow[] {
  if (!currentUser || currentUser.role === 'ADMIN') {
    return rows
  }

  if (currentUser.role === 'BUYER') {
    return rows.filter((row) => belongsToCurrentCompany(row, currentUser) || belongsToCurrentUser(row.owner, currentUser))
  }

  return rows.filter((row) => row.assignedManufacturers?.includes(currentUser.company) ?? toComparable(row.company) === toComparable(currentUser.company))
}

function scopeOffers(rows: OfferRow[], requests: RequestRow[], currentUser: AuthenticatedUser | null): OfferRow[] {
  if (!currentUser || currentUser.role !== 'BUYER') {
    return scopeRowsByCompany(rows, currentUser)
  }

  // A converted offer carries the requesting party's company, so fall back to the linked request's visibility.
  const visibleRequestIds = new Set(scopeRequests(requests, currentUser).map((request) => request.id))

  return rows.filter((row) => belongsToCurrentCompany(row, currentUser) || (row.requestId ? visibleRequestIds.has(row.requestId) : false))
}

function scopeReports(rows: ReportRow[], currentUser: AuthenticatedUser | null): ReportRow[] {
  if (!currentUser || currentUser.role === 'ADMIN') {
    return rows
  }

  return rows.filter((row) => belongsToCurrentUser(row.owner, currentUser))
}

function scopeCompanies(rows: CompanyRow[], currentUser: AuthenticatedUser | null): CompanyRow[] {
  if (!currentUser || currentUser.role === 'ADMIN') {
    return rows
  }

  if (currentUser.role === 'MANUFACTURER') {
    return rows.filter((row) => toComparable(row.manufacturerCompany) === toComparable(currentUser.company))
  }

  return []
}

function scopeSettings(rows: SettingRow[], currentUser: AuthenticatedUser | null): SettingRow[] {
  if (!currentUser || currentUser.role === 'ADMIN') {
    return rows
  }

  return rows.filter((row) => belongsToCurrentUser(row.updatedBy, currentUser))
}

function enforceCompanyAndOwner<T extends { company: string; owner: string }>(row: T, currentUser: AuthenticatedUser | null): T {
  if (!currentUser || currentUser.role === 'ADMIN') {
    return row
  }

  if (currentUser.role === 'MANUFACTURER') {
    return {
      ...row,
      owner: currentUser.fullName,
    }
  }

  return {
    ...row,
    company: currentUser.company,
    owner: currentUser.fullName,
  }
}

function getNextSettingCode(rows: SettingRow[]): string {
  const maxId = rows.reduce((currentMax, row) => {
    const numeric = Number(row.code.replace('AYR-', ''))
    return Number.isNaN(numeric) ? currentMax : Math.max(currentMax, numeric)
  }, 5000)

  return `AYR-${maxId + 1}`
}

function buildSettingForm(rows: SettingRow[], row?: SettingRow): SettingFormState {
  if (row) {
    return { ...row }
  }

  const now = new Date()
  const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

  return {
    code: getNextSettingCode(rows),
    name: '',
    category: 'Genel',
    value: '',
    updatedBy: '',
    updatedAt: today,
    status: 'Aktif',
  }
}

function QuickActionIcon({ name }: { name: 'request' | 'offers' | 'orders' | 'production' | 'shipment' }) {
  if (name === 'request') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 4h12v16H6z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9h6M9 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'offers') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16v10H4z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 11h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'orders') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 10h10M7 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'production') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="8" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11 12h2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7h12v8H3zM15 10h4l2 2v3h-6z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function AccessDeniedPage({ state, onRetry }: Pick<WorkspacePageProps, 'state' | 'onRetry'>) {
  return (
    <section className="workspace-main dashboard-main">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <header className="workspace-header glass-card dashboard-hero">
          <div>
            <p className="eyebrow">Yetki Kontrolu</p>
            <h2>Erisim Reddedildi</h2>
            <p>Bu sayfaya erişim yetkiniz bulunmamaktadır.</p>
          </div>
        </header>
      </ScreenStateGate>
    </section>
  )
}

function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`request-badge status-${status.toLowerCase()}`}>{status}</span>
}

function RequestPriorityBadge({ priority }: { priority: RequestPriority }) {
  return <span className={`request-badge priority-${priority.toLowerCase()}`}>{priority}</span>
}

type RequestFormState = RequestRow

interface OfferFormState {
  id: string
  company: string
  manufacturerCompany?: string
  title: string
  amount: string
  owner: string
  status: OfferStatus
  type: string
  createdAt: string
  updatedAt: string
}

interface OrderFormState {
  id: string
  company: string
  manufacturerCompany?: string
  type: string
  title: string
  dueDate: string
  owner: string
  status: OrderStatus
  createdAt: string
}

interface ProductionFormState {
  id: string
  company: string
  product: string
  line: string
  startedAt: string
  dueDate: string
  owner: string
  priority: RequestPriority
  status: ProductionStatus
  description: string
}

interface ShipmentFormState {
  id: string
  company: string
  manufacturerCompany?: string
  orderNo: string
  vehicle: string
  driver: string
  plate: string
  departureDate: string
  estimatedDelivery: string
  status: ShipmentStatus
  description: string
}

function toInputDate(value: string): string {
  const [day, month, year] = value.split('.')
  return `${year}-${month}-${day}`
}

function toDisplayDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

function parseDisplayDate(value: string): Date | null {
  const parts = value.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [day, month, year] = parts
  if (!day || !month || !year) {
    return null
  }

  const parsed = new Date(`${year}-${month}-${day}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function validateSettingForm(form: SettingFormState): string | null {
  if (!form.name.trim() || !form.value.trim() || !form.updatedBy.trim()) {
    return 'Lutfen zorunlu alanlari doldurun.'
  }

  if (form.name.trim().length > 80) {
    return 'Ayar adi en fazla 80 karakter olabilir.'
  }

  if (form.value.trim().length > 120) {
    return 'Ayar degeri en fazla 120 karakter olabilir.'
  }

  if (form.updatedBy.trim().length > 80) {
    return 'Son guncelleyen alani en fazla 80 karakter olabilir.'
  }

  const updatedAtDate = parseDisplayDate(form.updatedAt)
  if (!updatedAtDate) {
    return 'Guncelleme tarihi gecersiz.'
  }

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  if (updatedAtDate.getTime() > today.getTime()) {
    return 'Guncelleme tarihi bugunden ileri olamaz.'
  }

  if (form.name === 'Varsayilan Para Birimi' && !/^[A-Z]{3}$/.test(form.value.trim())) {
    return 'Para birimi ISO-4217 formatinda 3 buyuk harf olmalidir (ornek: TRY).'
  }

  if (form.name === 'Platform Saat Dilimi' && !/^[A-Za-z_]+\/[A-Za-z_]+$/.test(form.value.trim())) {
    return 'Saat dilimi Area/Location formatinda olmalidir (ornek: Europe/Istanbul).'
  }

  if (form.name === 'Bolgesel Format' && !/^[a-z]{2}-[A-Z]{2}$/.test(form.value.trim())) {
    return 'Bolgesel format xx-YY formatinda olmalidir (ornek: tr-TR).'
  }

  if (form.name === 'Dil Destegi Altyapisi') {
    const isValid = form.value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .every((item) => /^[a-z]{2}-[A-Z]{2}$/.test(item))
    if (!isValid) {
      return 'Dil listesi virgulle ayrilmis locale kodlari icermelidir (ornek: tr-TR,en-US).'
    }
  }

  return null
}

function getNextRequestId(rows: RequestRow[]): string {
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  let maxSequence = 0

  rows.forEach((row) => {
    const canonicalMatch = row.id.match(/^REQ-(\d{8})-(\d+)$/)
    if (canonicalMatch) {
      const [, canonicalDate, sequence] = canonicalMatch
      if (canonicalDate === dateStamp) {
        maxSequence = Math.max(maxSequence, Number(sequence))
      }
      return
    }

    const legacyNumeric = Number(row.id.replace('TL-', ''))
    if (!Number.isNaN(legacyNumeric)) {
      maxSequence = Math.max(maxSequence, legacyNumeric)
    }
  })

  return `REQ-${dateStamp}-${String(maxSequence + 1).padStart(4, '0')}`
}

function buildRequestForm(rows: RequestRow[], row?: RequestRow, defaultCompany = ''): RequestFormState {
  if (row) {
    return { ...row }
  }

  const now = new Date()
  const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
  return {
    id: getNextRequestId(rows),
    company: rows[0]?.company ?? defaultCompany,
    region: requestRegions[0],
    requestType: requestTypes[0],
    product: '',
    title: '',
    description: '',
    owner: '',
    assignedManufacturers: rows[0]?.assignedManufacturers ?? ['Nova Cephe Sistemleri'],
    priority: 'Orta',
    status: 'Bekleyen',
    createdAt: today,
    deliveryDate: today,
  }
}

const measurementUnits: MeasurementUnit[] = ['PIECE', 'MM', 'CM', 'M', 'M2', 'M3']
const measurementSources: MeasurementSource[] = ['USER', 'AI', 'AI_CORRECTED', 'MANUAL_CORRECTION']
const attachmentMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'] as const
const attachmentMaxFileSizeBytes = 26_214_400

function buildRequestItemForm(item?: ApiRequestItem): RequestItemFormState {
  return {
    itemId: item?.id,
    version: item?.version,
    description: item?.description ?? '',
    productType: item?.productType ?? '',
    productCode: item?.productCode ?? '',
    quantity: item?.quantity ?? '',
    unit: item?.unit ?? 'PIECE',
    measurementSource: item?.measurementSource ?? '',
    width: item?.widthMm ?? '',
    height: item?.heightMm ?? '',
    length: item?.lengthMm ?? '',
    depth: item?.depthMm ?? '',
    thickness: item?.thicknessMm ?? '',
  }
}

function optionalText(value: string): string | undefined {
  const normalized = value.trim()
  return normalized || undefined
}

function optionalNumber(value: string): number | undefined {
  const normalized = value.trim()
  return normalized ? Number(normalized) : undefined
}

function requestItemPayload(form: RequestItemFormState): CreateRequestItemInput {
  return {
    description: form.description.trim(),
    productType: optionalText(form.productType),
    productCode: optionalText(form.productCode),
    quantity: Number(form.quantity),
    unit: form.unit,
    measurementSource: form.measurementSource || undefined,
    width: optionalNumber(form.width),
    height: optionalNumber(form.height),
    length: optionalNumber(form.length),
    depth: optionalNumber(form.depth),
    thickness: optionalNumber(form.thickness),
  }
}

function hasPermission(user: AuthenticatedUser | null, permission: string): boolean {
  return user?.permissions?.includes(permission) ?? false
}

function measurementStatusLabel(status: ApiRequestItem['measurementStatus']): string {
  const labels: Record<ApiRequestItem['measurementStatus'], string> = {
    PENDING: 'Bekliyor',
    PENDING_REVIEW: 'Inceleme Bekliyor',
    APPROVED: 'Onaylandi',
    REJECTED: 'Reddedildi',
  }
  return labels[status]
}

function measurementSummary(item: ApiRequestItem): string {
  const values = [
    item.widthMm && `W ${item.widthMm} mm`,
    item.heightMm && `H ${item.heightMm} mm`,
    item.lengthMm && `L ${item.lengthMm} mm`,
    item.depthMm && `D ${item.depthMm} mm`,
    item.thicknessMm && `T ${item.thicknessMm} mm`,
  ].filter(Boolean)
  return values.length > 0 ? values.join(' / ') : '-'
}

function attachmentStatusLabel(status: AttachmentStatus): string {
  const labels: Record<AttachmentStatus, string> = {
    PENDING_UPLOAD: 'Yukleme Bekliyor',
    AVAILABLE: 'Kullanilabilir',
    QUARANTINED: 'Dogrulama Nedeniyle Kullanilamiyor',
    DELETED: 'Silindi',
  }
  return labels[status]
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateAttachmentFile(file: File): string | null {
  if (!attachmentMimeTypes.includes(file.type as typeof attachmentMimeTypes[number])) {
    return 'Yalniz PDF, JPEG ve PNG dosyalari yuklenebilir.'
  }
  if (file.size < 1 || file.size > attachmentMaxFileSizeBytes) {
    return `Dosya boyutu 1 byte ile ${formatFileSize(attachmentMaxFileSizeBytes)} arasinda olmalidir.`
  }
  const normalizedName = file.name.normalize('NFKC').trim()
  const hasUnsafeCharacter = Array.from(normalizedName).some((character) => {
    const characterCode = character.charCodeAt(0)
    return characterCode <= 31 || characterCode === 127 || '<>:"/\\|?*'.includes(character)
  })
  if (!normalizedName || normalizedName === '.' || normalizedName === '..' || hasUnsafeCharacter) {
    return 'Dosya adi gecersiz karakterler iceriyor.'
  }
  return null
}

function attachmentErrorMessage(error: unknown, operation: 'upload' | 'binary' | 'complete' | 'download' | 'delete'): string {
  if (!(error instanceof ApiError)) {
    return operation === 'upload' || operation === 'binary'
      ? 'Dosya aktarimi ag hatasi nedeniyle tamamlanamadi.'
      : 'Dosya islemi tamamlanamadi. Lutfen yeniden deneyin.'
  }
  if (error.status === 400) return 'Dosya bilgileri veya icerigi backend dogrulamasindan gecemedi.'
  if (error.status === 401) return 'Oturum suresi doldu. Lutfen yeniden giris yapin.'
  if (error.status === 403) return 'Bu dosya islemi icin yetkiniz bulunmuyor.'
  if (error.status === 404) return 'Dosya veya bagli talep artik bulunamiyor.'
  if (error.status === 409) return 'Dosya baska bir islem nedeniyle degisti. Guncel liste yeniden yuklendi.'
  if (error.status === 413) return 'Dosya backend boyut sinirini asiyor.'
  if (error.status === 503) return operation === 'complete'
    ? 'Dosya aktarildi ancak storage dogrulamasi tamamlanamadi.'
    : 'Dosya depolama servisi gecici olarak kullanilamiyor.'
  return 'Dosya islemi tamamlanamadi. Lutfen yeniden deneyin.'
}

function formatApiDate(value: string | null): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

function toRequestRow(request: ApiRequest): RequestRow {
  const displayRequestId = request.requestNumber ?? request.id

  return {
    id: displayRequestId,
    apiId: request.id,
    version: request.version,
    backendStatus: request.status,
    companyId: request.companyId,
    company: request.company?.tradeName ?? request.company?.legalName ?? request.companyId,
    region: request.region?.name ?? '-',
    regionId: request.regionId ?? undefined,
    requestType: request.productType,
    product: request.productType,
    title: request.title,
    description: request.description ?? '-',
    owner: request.createdBy?.fullName ?? '-',
    assignedManufacturers: (request.recipients ?? []).map((recipient) => (
      recipient.company.tradeName ?? recipient.company.legalName
    )),
    priority: 'Orta',
    status: REQUEST_STATUS_LABELS[request.status] as RequestStatus,
    createdAt: formatApiDate(request.createdAt),
    deliveryDate: formatApiDate(request.targetDeliveryDate),
  }
}

function requestApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403 || error.status === 404) {
      return 'Bu talep icin erisim yetkiniz bulunmuyor.'
    }
    if (error.status === 409) {
      return 'Talep baska bir islem tarafindan degistirildi. Listeyi yenileyin.'
    }
  }

  return 'Talep islemi tamamlanamadi. Backend baglantisini kontrol edip yeniden deneyin.'
}

function toQuotationView(quotation: ApiQuotation): QuotationView {
  return {
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    requestId: quotation.requestId,
    manufacturerCompanyId: quotation.manufacturerCompanyId,
    status: quotation.status,
    revisionNumber: quotation.revisionNumber,
    version: quotation.version,
    totalAmount: quotation.totalAmount,
    currency: quotation.currency,
    leadTimeDays: quotation.leadTimeDays,
    validUntil: quotation.validUntil,
    notes: quotation.notes,
    activeCalculationId: quotation.activeCalculationId,
    request: { ...quotation.request },
    company: { ...quotation.company },
    manufacturerCompany: { ...quotation.manufacturerCompany },
    createdBy: quotation.createdBy ? { ...quotation.createdBy } : null,
    createdAt: quotation.createdAt,
    updatedAt: quotation.updatedAt,
  }
}

function buildQuotationForm(requestId: string, quotation?: QuotationView, manufacturerCompanyId = ''): QuotationFormState {
  return {
    quotationId: quotation?.id,
    version: quotation?.version,
    requestId,
    manufacturerCompanyId: quotation?.manufacturerCompanyId ?? manufacturerCompanyId,
    totalAmount: quotation?.totalAmount ?? '',
    currency: quotation?.currency ?? 'TRY',
    leadTimeDays: quotation ? String(quotation.leadTimeDays) : '',
    validUntil: quotation ? quotation.validUntil.slice(0, 10) : '',
    notes: quotation?.notes ?? '',
  }
}

function quotationCompanyName(company: QuotationView['company']): string {
  return company.tradeName ?? company.legalName
}

function getNextOfferId(rows: OfferRow[]): string {
  const maxId = rows.reduce((currentMax, row) => {
    const numeric = Number(row.id.replace('TK-', ''))
    return Number.isNaN(numeric) ? currentMax : Math.max(currentMax, numeric)
  }, 8700)

  return `TK-${maxId + 1}`
}

function buildOfferForm(rows: OfferRow[], row?: OfferRow): OfferFormState {
  if (row) {
    return { ...row }
  }

  const now = new Date()
  const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

  return {
    id: getNextOfferId(rows),
    company: rows[0]?.company ?? '',
    manufacturerCompany: rows[0]?.manufacturerCompany,
    title: '',
    amount: '',
    owner: '',
    status: 'Hazirlaniyor',
    type: offerTypes[1] ?? 'Standart Teklif',
    createdAt: today,
    updatedAt: today,
  }
}

function getNextOrderId(rows: OrderRow[]): string {
  const maxId = rows.reduce((currentMax, row) => {
    const numeric = Number(row.id.replace('SP-', ''))
    return Number.isNaN(numeric) ? currentMax : Math.max(currentMax, numeric)
  }, 9000)

  return `SP-${maxId + 1}`
}

function buildOrderForm(rows: OrderRow[], row?: OrderRow): OrderFormState {
  if (row) {
    return { ...row }
  }

  const now = new Date()
  const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

  return {
    id: getNextOrderId(rows),
    company: rows[0]?.company ?? '',
    manufacturerCompany: rows[0]?.manufacturerCompany,
    type: orderTypes[1] ?? 'Standart Siparis',
    title: '',
    dueDate: today,
    owner: '',
    status: 'Bekliyor',
    createdAt: today,
  }
}

function getNextProductionId(rows: ProductionRow[]): string {
  const maxId = rows.reduce((currentMax, row) => {
    const numeric = Number(row.id.replace('UE-', ''))
    return Number.isNaN(numeric) ? currentMax : Math.max(currentMax, numeric)
  }, 4400)

  return `UE-${maxId + 1}`
}

function buildProductionForm(rows: ProductionRow[], row?: ProductionRow): ProductionFormState {
  if (row) {
    return { ...row }
  }

  const now = new Date()
  const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
  const lineOptions = [...new Set(rows.map((item) => item.line))]

  return {
    id: getNextProductionId(rows),
    company: rows[0]?.company ?? '',
    product: '',
    line: lineOptions[0] ?? 'Kesim Hatti',
    startedAt: today,
    dueDate: today,
    owner: '',
    priority: 'Orta',
    status: 'Planlandi',
    description: '',
  }
}

function getNextShipmentId(rows: ShipmentRow[]): string {
  const maxId = rows.reduce((currentMax, row) => {
    const numeric = Number(row.id.replace('SV-', ''))
    return Number.isNaN(numeric) ? currentMax : Math.max(currentMax, numeric)
  }, 2200)

  return `SV-${maxId + 1}`
}

function buildShipmentForm(rows: ShipmentRow[], row?: ShipmentRow): ShipmentFormState {
  if (row) {
    return { ...row }
  }

  const now = new Date()
  const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

  return {
    id: getNextShipmentId(rows),
    company: rows[0]?.company ?? '',
    manufacturerCompany: rows[0]?.manufacturerCompany,
    orderNo: rows[0]?.orderNo ?? '',
    vehicle: '',
    driver: '',
    plate: '',
    departureDate: today,
    estimatedDelivery: today,
    status: 'Planlandi',
    description: '',
  }
}

function RequestModal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  useEffect(() => {
    if (!open) {
      return
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [onClose, open])

  if (!open) {
    return null
  }

  return createPortal(
    <div className="dialog-overlay" onClick={onClose}>
      <section className="dialog-card request-modal-card" onClick={(event) => event.stopPropagation()} aria-label={title}>
        <header className="request-modal-head">
          <div>
            <h3>{title}</h3>
          </div>
          <button type="button" className="ghost-btn request-modal-close" onClick={onClose}>
            Kapat
          </button>
        </header>
        {children}
        <div className="dialog-actions request-modal-actions">{footer}</div>
      </section>
    </div>,
    document.body,
  )
}

function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return <span className={`request-badge offer-status-${status.toLowerCase()}`}>{status}</span>
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`request-badge order-status-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
}

function ProductionStatusBadge({ status }: { status: ProductionStatus }) {
  return <span className={`request-badge production-status-${status.toLowerCase()}`}>{status}</span>
}

function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <span className={`request-badge shipment-status-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
}

function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  return <span className={`request-badge company-status-${status.toLowerCase()}`}>{status}</span>
}

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`request-badge report-status-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
}

function ReportTypeBadge({ type }: { type: ReportType }) {
  return <span className={`request-badge report-type-${type.toLowerCase()}`}>{type}</span>
}

function SettingStatusBadge({ status }: { status: SettingStatus }) {
  return <span className={`request-badge setting-status-${status.toLowerCase()}`}>{status}</span>
}

function SettingCategoryBadge({ category }: { category: SettingCategory }) {
  return <span className={`request-badge setting-category-${category.toLowerCase()}`}>{category}</span>
}

export function DashboardPage({ state, onRetry, onNavigate, role, currentUser, workflow }: WorkspacePageProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)
  const scopedQuickActions = useMemo(() => quickActions.filter((item) => item.roles.includes(role)), [role])

  const [adminStats, setAdminStats] = useState<{
    requestCount: number
    quotationCount: number
    orderCount: number
    completedOrderCount: number
    activeCompanyCount: number
    pendingWorkCount: number
  } | null>(null)

  useEffect(() => {
    if (!apiEnabled || role !== 'ADMIN') {
      return
    }

    let active = true
    void (async () => {
      try {
        const [requests, quotations, orders, companies] = await Promise.all([
          requestsApi.list(),
          quotationsApi.list(),
          ordersApi.list(),
          companiesApi.list(),
        ])
        if (!active) {
          return
        }
        const pendingWorkCount = requests.filter((row) => row.status === 'OPEN_FOR_QUOTATION').length
          + orders.filter((row) => row.status === 'PENDING_CONFIRMATION').length
        setAdminStats({
          requestCount: requests.length,
          quotationCount: quotations.length,
          orderCount: orders.length,
          completedOrderCount: orders.filter((row) => row.status === 'CONFIRMED').length,
          activeCompanyCount: companies.filter((row) => row.status === 'ACTIVE').length,
          pendingWorkCount,
        })
      } catch {
        if (active) {
          setAdminStats(null)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [apiEnabled, role])

  // The dashboard aggregates the same rows the list screens show, so it must reuse their scoping.
  const scoped = useMemo(() => {
    const requests = scopeRequests(workflow.requests, currentUser)
    return {
      requests,
      offers: scopeOffers(workflow.offers, workflow.requests, currentUser),
      orders: scopeRowsByCompany(workflow.orders, currentUser),
      productions: scopeRowsByCompany(workflow.productions, currentUser),
      shipments: scopeRowsByCompany(workflow.shipments, currentUser),
      companies: workflow.manufacturerCustomers,
    }
  }, [currentUser, workflow.manufacturerCustomers, workflow.offers, workflow.orders, workflow.productions, workflow.requests, workflow.shipments])

  const pendingJobs = useMemo(() => {
    if (role === 'ADMIN') {
      return []
    }

    const waitingRequests = scoped.requests.filter((row) => row.status === 'Bekleyen').length
    const waitingOffers = scoped.offers.filter((row) => row.status === 'Gonderildi').length
    const waitingOrders = scoped.orders.filter((row) => row.status === 'Bekliyor').length
    const activeProductions = scoped.productions.filter((row) => row.status !== 'Tamamlandi').length
    const movingShipments = scoped.shipments.filter((row) => row.status === 'Yolda' || row.status === 'Yukleniyor').length
    const lateShipments = scoped.shipments.filter((row) => row.status === 'Gecikti').length

    if (role === 'BUYER') {
      return [
        { title: 'Teklif Bekleyen Taleplerim', value: waitingRequests, detail: 'Uretici yanitini bekliyor', target: 'requests' as ViewKey, priority: 'mid' as const },
        { title: 'Karar Bekleyen Teklifler', value: waitingOffers, detail: 'Onayinizi bekleyen teklifler', target: 'offers' as ViewKey, priority: 'high' as const },
        { title: 'Devam Eden Uretimler', value: activeProductions, detail: 'Siparislerinizin uretim durumu', target: 'production' as ViewKey, priority: 'low' as const },
        { title: 'Yoldaki Sevkiyatlar', value: movingShipments, detail: 'Teslimat bekleyen gonderiler', target: 'shipment' as ViewKey, priority: 'low' as const },
      ]
    }

    return [
      { title: 'Teklif Bekleyen Talepler', value: waitingRequests, detail: 'Teklif hazirlanmasi bekleniyor', target: 'requests' as ViewKey, priority: 'mid' as const },
      { title: 'Onay Bekleyen Siparisler', value: waitingOrders, detail: 'Uretime alinmayi bekliyor', target: 'orders' as ViewKey, priority: 'mid' as const },
      { title: 'Devam Eden Uretimler', value: activeProductions, detail: 'Tamamlanmamis is emirleri', target: 'production' as ViewKey, priority: 'high' as const },
      { title: 'Geciken Sevkiyatlar', value: lateShipments, detail: 'Termin disina cikan gonderiler', target: 'shipment' as ViewKey, priority: 'low' as const },
    ]
  }, [role, scoped])

  const perfCards = useMemo(() => {
    const completedOrders = scoped.orders.filter((row) => row.status === 'Teslim Edildi').length
    const activeProductions = scoped.productions.filter((row) => row.status !== 'Tamamlandi').length
    const movingShipments = scoped.shipments.filter((row) => row.status === 'Yolda' || row.status === 'Yukleniyor').length
    const approvedValue = scoped.offers
      .filter((row) => row.status === 'Onaylandi')
      .reduce((sum, row) => sum + parseTurkishAmount(row.amount), 0)
    const formattedValue = `TRY ${Math.round(approvedValue).toLocaleString('tr-TR')}`

    if (role === 'ADMIN') {
      if (apiEnabled && adminStats) {
        return [
          { label: 'Toplam Talep', value: String(adminStats.requestCount), trend: 'Platform geneli (gercek veri)' },
          { label: 'Toplam Teklif', value: String(adminStats.quotationCount), trend: 'Platform geneli (gercek veri)' },
          { label: 'Toplam Siparis', value: String(adminStats.orderCount), trend: 'Platform geneli (gercek veri)' },
          { label: 'Aktif Firma', value: String(adminStats.activeCompanyCount), trend: 'Islem goren firmalar' },
          { label: 'Bekleyen Isler', value: String(adminStats.pendingWorkCount), trend: 'Mudahale gerekebilir' },
          { label: 'Onaylanan Siparisler', value: String(adminStats.completedOrderCount), trend: 'Uretime alinabilir' },
        ]
      }

      const activeCompanies = new Set(
        [
          ...scoped.companies.filter((row) => row.status === 'Aktif').map((row) => toComparable(row.name)),
          ...scoped.requests.map((row) => toComparable(row.company)),
          ...scoped.orders.map((row) => toComparable(row.company)),
        ].filter(Boolean),
      ).size
      const pendingWork = scoped.requests.filter((row) => row.status === 'Bekleyen').length
        + scoped.orders.filter((row) => row.status === 'Bekliyor').length
        + activeProductions

      return [
        { label: 'Toplam Talep', value: String(scoped.requests.length), trend: 'Platform geneli' },
        { label: 'Toplam Teklif', value: String(scoped.offers.length), trend: 'Platform geneli' },
        { label: 'Toplam Siparis', value: String(scoped.orders.length), trend: 'Platform geneli' },
        { label: 'Aktif Firma', value: String(activeCompanies), trend: 'Islem goren firmalar' },
        { label: 'Bekleyen Isler', value: String(pendingWork), trend: 'Mudahale gerekebilir' },
        { label: 'Tamamlanan Siparisler', value: String(completedOrders), trend: 'Teslim edilenler' },
      ]
    }

    if (role === 'MANUFACTURER') {
      return [
        { label: 'Gelen Talepler', value: String(scoped.requests.length), trend: 'Firmaniza yonlendirilen' },
        { label: 'Acik Teklifler', value: String(scoped.offers.filter((row) => row.status !== 'Reddedildi').length), trend: 'Surecteki teklifler' },
        { label: 'Aktif Siparisler', value: String(scoped.orders.filter((row) => row.status !== 'Teslim Edildi').length), trend: 'Teslim edilmemis' },
        { label: 'Devam Eden Uretimler', value: String(activeProductions), trend: 'Hatlardaki is emirleri' },
        { label: 'Yoldaki Sevkiyatlar', value: String(movingShipments), trend: 'Dagitimda olanlar' },
        { label: 'Tamamlanan Siparisler', value: String(completedOrders), trend: 'Teslim edilenler' },
      ]
    }

    return [
      { label: 'Taleplerim', value: String(scoped.requests.length), trend: 'Acilan talep sayisi' },
      { label: 'Gelen Teklifler', value: String(scoped.offers.length), trend: 'Firmaniza sunulanlar' },
      { label: 'Aktif Siparislerim', value: String(scoped.orders.filter((row) => row.status !== 'Teslim Edildi').length), trend: 'Devam eden siparisler' },
      { label: 'Devam Eden Uretimler', value: String(activeProductions), trend: 'Uretimdeki isler' },
      { label: 'Yoldaki Sevkiyatlar', value: String(movingShipments), trend: 'Teslimat bekleyenler' },
      { label: 'Onayladigim Teklif Tutari', value: formattedValue, trend: 'Toplam onayli tutar' },
    ]
  }, [role, scoped, apiEnabled, adminStats])

  const offerDistribution = useMemo(
    () => toDistribution(dashboardOfferStatuses.map((status) => ({
      label: status,
      count: scoped.offers.filter((row) => row.status === status).length,
    }))),
    [scoped.offers],
  )

  const orderDistribution = useMemo(
    () => toDistribution(dashboardOrderStatuses.map((status) => ({
      label: status,
      count: scoped.orders.filter((row) => row.status === status).length,
    }))),
    [scoped.orders],
  )

  const regionDistribution = useMemo(() => {
    const totals = new Map<string, number>()
    scoped.requests.forEach((row) => {
      const key = row.region?.trim() || 'Belirtilmedi'
      totals.set(key, (totals.get(key) ?? 0) + 1)
    })
    const total = scoped.requests.length

    return [...totals.entries()]
      .map(([city, count]) => ({ city, ratio: total === 0 ? 0 : Math.round((count / total) * 100) }))
      .sort((left, right) => right.ratio - left.ratio)
      .slice(0, 5)
  }, [scoped.requests])

  return (
    <section className="workspace-main dashboard-main">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <header className="workspace-header glass-card dashboard-hero">
          <div>
            <p className="eyebrow">{role === 'ADMIN' ? 'Platform Merkezi' : role === 'MANUFACTURER' ? 'Uretim Operasyonu' : 'Satin Alma Merkezi'}</p>
            <h2>{role === 'ADMIN' ? 'Platform bugun nasil calisiyor?' : 'Bugun ne yapmaniz gerekiyor?'}</h2>
            <p>
              {role === 'ADMIN'
                ? 'Platform genelindeki talep, teklif, siparis ve firma hareketleri tek ekranda ozetlenir.'
                : role === 'MANUFACTURER'
                  ? 'Gelen taleplerden sevkiyata kadar tum operasyon adimlariniz oncelik sirasiyla listelenir.'
                  : 'Taleplerinizin teklif, siparis, uretim ve teslimat durumu tek ekranda izlenir.'}
            </p>
          </div>
        </header>

        <section className="dashboard-actions glass-card panel operation-actions-top">
          <header className="panel-header">
            <h3>Hizli Islem</h3>
          </header>
          <div className="action-grid action-grid-six">
            {scopedQuickActions.map((item) => (
              <button key={item.title} type="button" className={`quick-action-card tone-${item.tone}`} onClick={() => onNavigate(item.target)}>
                <span className="qa-icon">
                  <QuickActionIcon name={item.icon} />
                </span>
                <span className="qa-content">
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="pending-jobs-grid">
          {pendingJobs.map((item) => (
            <button key={item.title} type="button" className={`glass-card pending-job ${item.priority}`} onClick={() => onNavigate(item.target)}>
              <span>{item.title}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </section>

        <section className="dashboard-metrics">
          {perfCards.map((item) => (
            <button key={item.label} type="button" className="glass-card metric-kpi simple-kpi" onClick={() => onNavigate('dashboard')}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.trend}</small>
            </button>
          ))}
        </section>

        {role === 'ADMIN' && apiEnabled ? (
          <section className="dashboard-bottom-charts">
            <article className="glass-card panel chart-panel">
              <header className="panel-header">
                <h3>Bolgesel ve Durumsal Kirilimlar</h3>
              </header>
              <p>Teklif/siparis durum dagilimi ve bolgelere gore detayli istatistikler artik gercek verilerle <strong>Raporlar</strong> sayfasinda.</p>
              <button type="button" className="solid-btn" onClick={() => onNavigate('reports')}>Raporlari Ac</button>
            </article>
          </section>
        ) : (
        <section className="dashboard-bottom-charts">
          <article className="glass-card panel chart-panel">
            <header className="panel-header">
              <h3>Teklif Durum Dagilimi</h3>
            </header>
            <div className="bar-chart">
              {offerDistribution.map((item) => (
                <span key={`offer-${item.label}`} style={{ height: `${item.ratio}%` }} title={`${item.label}: ${item.count}`} />
              ))}
            </div>
          </article>

          <article className="glass-card panel chart-panel">
            <header className="panel-header">
              <h3>Siparis Durum Dagilimi</h3>
            </header>
            <div className="bar-chart order">
              {orderDistribution.map((item) => (
                <span key={`order-${item.label}`} style={{ height: `${item.ratio}%` }} title={`${item.label}: ${item.count}`} />
              ))}
            </div>
          </article>

          <article className="glass-card panel chart-panel">
            <header className="panel-header">
              <h3>Bolgesel Yogunluk</h3>
            </header>
            <ul className="region-list">
              {regionDistribution.length === 0 ? <li><span>Veri yok</span><strong>0%</strong></li> : null}
              {regionDistribution.map((item) => (
                <li key={item.city}>
                  <span>{item.city}</span>
                  <strong>{item.ratio}%</strong>
                </li>
              ))}
            </ul>
          </article>
        </section>
        )}
      </ScreenStateGate>
    </section>
  )
}

interface CalculationTypeSummary {
  productType: string
  lineCount: number
  totalQuantity: number
  totalAmount: number
  currency: string
}

function summarizeSnapshotLinesByType(lines: ApiCalculationSnapshotLine[]): CalculationTypeSummary[] {
  const groups = new Map<string, CalculationTypeSummary>()
  lines.forEach((line) => {
    const label = line.productType.trim() || 'Diger'
    const key = label.toLowerCase()
    const quantity = Number(line.quantity) || 0
    const amount = Number(line.totalAmount) || 0
    const existing = groups.get(key)
    if (existing) {
      existing.lineCount += 1
      existing.totalQuantity += quantity
      existing.totalAmount += amount
    } else {
      groups.set(key, { productType: label, lineCount: 1, totalQuantity: quantity, totalAmount: amount, currency: line.currency })
    }
  })
  return Array.from(groups.values()).sort((a, b) => b.totalAmount - a.totalAmount)
}

interface RequestItemTypeSummary {
  productType: string
  itemCount: number
  totalQuantity: number
  totalAreaM2: number
}

function summarizeRequestItemsByType(items: ApiRequestItem[]): RequestItemTypeSummary[] {
  const groups = new Map<string, RequestItemTypeSummary>()
  items.forEach((item) => {
    const label = item.productType.trim() || 'Diger'
    const key = label.toLowerCase()
    const quantity = Number(item.quantity) || 0
    const areaM2 = Number(item.calculatedAreaM2) || 0
    const existing = groups.get(key)
    if (existing) {
      existing.itemCount += 1
      existing.totalQuantity += quantity
      existing.totalAreaM2 += areaM2
    } else {
      groups.set(key, { productType: label, itemCount: 1, totalQuantity: quantity, totalAreaM2: areaM2 })
    }
  })
  return Array.from(groups.values()).sort((a, b) => b.totalAreaM2 - a.totalAreaM2)
}

export function TaleplerPage({ state, onRetry, currentUser, role, workflow, workflowActions }: WorkspacePageProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)
  const canWriteRequests = canWriteView(role, 'requests')
  const [apiRows, setApiRows] = useState<RequestRow[]>([])
  const [recipientCompanies, setRecipientCompanies] = useState<ApiRequestRecipientCompany[]>([])
  const [recipientCompaniesState, setRecipientCompaniesState] = useState<'loading' | 'steady' | 'error'>('steady')
  const [selectedRecipientCompanyId, setSelectedRecipientCompanyId] = useState('')
  const [recipientFeedback, setRecipientFeedback] = useState('')
  const [regions, setRegions] = useState<ApiRegion[]>([])
  const [apiState, setApiState] = useState<ScreenState>('steady')
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState('Tum Firmalar')
  const [status, setStatus] = useState<'Tum Durumlar' | RequestStatus>('Tum Durumlar')
  const [priority, setPriority] = useState<'Tum Oncelikler' | RequestPriority>('Tum Oncelikler')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeForm, setActiveForm] = useState<RequestFormState | null>(null)
  const [viewRow, setViewRow] = useState<RequestRow | null>(null)
  const [viewRequest, setViewRequest] = useState<ApiRequest | null>(null)
  const [detailState, setDetailState] = useState<'steady' | 'loading' | 'error'>('steady')
  const [requestItems, setRequestItems] = useState<ApiRequestItem[]>([])
  const [itemsState, setItemsState] = useState<'steady' | 'loading' | 'error'>('steady')
  const [itemForm, setItemForm] = useState<RequestItemFormState | null>(null)
  const [itemToDelete, setItemToDelete] = useState<ApiRequestItem | null>(null)
  const [itemMutationPending, setItemMutationPending] = useState(false)
  const [itemFeedback, setItemFeedback] = useState('')
  const [attachments, setAttachments] = useState<ApiAttachment[]>([])
  const [attachmentsState, setAttachmentsState] = useState<'steady' | 'loading' | 'error'>('steady')
  const [attachmentsListError, setAttachmentsListError] = useState('')
  const [attachmentOperation, setAttachmentOperation] = useState<string | null>(null)
  const [attachmentUploadStage, setAttachmentUploadStage] = useState('')
  const [attachmentFeedback, setAttachmentFeedback] = useState('')
  const [attachmentToDelete, setAttachmentToDelete] = useState<ApiAttachment | null>(null)
  const [attachmentRequestItemId, setAttachmentRequestItemId] = useState('')
  const [analysisJobs, setAnalysisJobs] = useState<Record<string, ApiAnalysisJob[]>>({})
  const [analysisState, setAnalysisState] = useState<'loading' | 'steady'>('steady')
  const [measurements, setMeasurements] = useState<Record<string, ApiDetectedMeasurement[]>>({})
  const [analysisOperation, setAnalysisOperation] = useState<string | null>(null)
  const [analysisFeedback, setAnalysisFeedback] = useState('')
  const [reviewForm, setReviewForm] = useState<MeasurementReviewFormState | null>(null)
  const completedAnalysisJobs = useRef(new Set<string>())
  const [deleteRow, setDeleteRow] = useState<RequestRow | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [page, setPage] = useState(1)
  const rows = apiEnabled ? apiRows : workflow.requests
  const canReadItems = hasPermission(currentUser, 'request-items.read')
  const canCreateItems = hasPermission(currentUser, 'request-items.create')
  const canUpdateItems = hasPermission(currentUser, 'request-items.update')
  const canDeleteItems = hasPermission(currentUser, 'request-items.delete')
  const canReadAttachments = hasPermission(currentUser, 'attachments.read')
  const canCreateAttachments = hasPermission(currentUser, 'attachments.create')
  const canDeleteAttachments = hasPermission(currentUser, 'attachments.delete')
  const canReadAnalysis = hasPermission(currentUser, 'analysis.read')
  const canCreateAnalysis = hasPermission(currentUser, 'analysis.create')
  const canReviewAnalysis = hasPermission(currentUser, 'analysis.review')
  const canCreateQuotation = hasPermission(currentUser, 'quotations.create')
  const requiresRecipientSelection = apiEnabled && role === 'BUYER'
  const scopedRows = useMemo(
    () => apiEnabled ? rows : scopeRequests(rows, currentUser),
    [apiEnabled, currentUser, rows],
  )
  const itemTypeSummary = useMemo(() => summarizeRequestItemsByType(requestItems), [requestItems])

  const loadApiRequests = useCallback(async () => {
    if (!apiEnabled) {
      return
    }

    setApiState('loading')
    try {
      const requests = await requestsApi.list()
      setApiRows(requests.map(toRequestRow))
      setApiState('steady')
    } catch {
      setApiRows([])
      setApiState('error')
    }
  }, [apiEnabled])

  const loadRequestItems = useCallback(async (requestId: string) => {
    setItemsState('loading')
    try {
      const loaded = await requestItemsApi.listRequestItems(requestId)
      setRequestItems(loaded)
      setItemsState('steady')
      return loaded
    } catch {
      setRequestItems([])
      setItemsState('error')
      return []
    }
  }, [])

  const loadAttachments = useCallback(async (requestId: string) => {
    setAttachmentsState('loading')
    setAttachmentsListError('')
    try {
      const loaded = (await attachmentsApi.list(requestId)).filter((attachment) => attachment.status !== 'DELETED')
      setAttachments(loaded)
      setAttachmentsState('steady')
      return loaded
    } catch (error) {
      setAttachments([])
      setAttachmentsState('error')
      setAttachmentsListError(attachmentErrorMessage(error, 'download'))
      return []
    }
  }, [])

  const loadAnalysisJobs = useCallback(async (requestId: string, requestAttachments: ApiAttachment[]) => {
    const entries = await Promise.all(requestAttachments.filter((attachment) => attachment.status === 'AVAILABLE').map(async (attachment) => {
      try {
        return [attachment.id, await analysisApi.listByAttachment(requestId, attachment.id)] as const
      } catch {
        return [attachment.id, []] as const
      }
    }))
    const jobs = Object.fromEntries(entries) as Record<string, ApiAnalysisJob[]>
    setAnalysisJobs(jobs)
    setAnalysisState('steady')
    return jobs
  }, [])

  const loadMeasurements = useCallback(async (requestId: string, items: ApiRequestItem[]) => {
    const entries = await Promise.all(items.map(async (item) => {
      try {
        return [item.id, await analysisApi.listMeasurements(requestId, item.id)] as const
      } catch {
        return [item.id, []] as const
      }
    }))
    setMeasurements(Object.fromEntries(entries))
  }, [])

  useEffect(() => {
    void loadApiRequests()
  }, [loadApiRequests])

  useEffect(() => {
    if (!apiEnabled) {
      setRegions([])
      return
    }

    void regionsApi.list().then(setRegions).catch(() => setRegions([]))
  }, [apiEnabled])

  const isCreateFormOpen = Boolean(activeForm)

  useEffect(() => {
    if (!requiresRecipientSelection || !isCreateFormOpen) {
      setRecipientCompanies([])
      return
    }

    setRecipientCompaniesState('loading')
    void requestsApi.listRecipientCompanies(activeForm?.regionId)
      .then((companies) => {
        setRecipientCompanies(companies)
        setRecipientCompaniesState('steady')
      })
      .catch(() => {
        setRecipientCompanies([])
        setRecipientCompaniesState('error')
      })
  }, [requiresRecipientSelection, isCreateFormOpen, activeForm?.regionId])

  useEffect(() => {
    setSelectedRecipientCompanyId('')
  }, [activeForm?.regionId])

  const requestCompanies = useMemo(() => [
    'Tum Firmalar',
    ...new Set([
      ...(apiEnabled && currentUser?.company ? [currentUser.company] : []),
      ...scopedRows.map((row) => row.company),
    ]),
  ], [apiEnabled, currentUser?.company, scopedRows])

  const filteredRows = useMemo(() => {
    return scopedRows.filter((row) => {
      const matchesQuery = !query.trim() || `${row.id} ${row.company} ${row.region} ${row.requestType} ${row.product} ${row.title} ${row.owner}`.toLowerCase().includes(query.toLowerCase())
      const matchesCompany = company === 'Tum Firmalar' || row.company === company
      const matchesStatus = status === 'Tum Durumlar' || row.status === status
      const matchesPriority = priority === 'Tum Oncelikler' || row.priority === priority
      const rowTime = new Date(row.createdAt.split('.').reverse().join('-')).getTime()
      const matchesStart = !startDate || rowTime >= new Date(startDate).getTime()
      const matchesEnd = !endDate || rowTime <= new Date(endDate).getTime()
      return matchesQuery && matchesCompany && matchesStatus && matchesPriority && matchesStart && matchesEnd
    })
  }, [company, endDate, priority, query, scopedRows, startDate, status])

  const totalCount = filteredRows.length
  const waitingCount = filteredRows.filter((row) => row.status === 'Bekleyen').length
  const approvedCount = filteredRows.filter((row) => row.status === 'Onaylanan').length
  const rejectedCount = filteredRows.filter((row) => row.status === 'Reddedilen').length
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / REQUEST_PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * REQUEST_PAGE_SIZE
    return filteredRows.slice(start, start + REQUEST_PAGE_SIZE)
  }, [filteredRows, safePage])

  const handleSaveRequest = async () => {
    if (!activeForm) {
      return
    }

    if (!activeForm.company.trim() || !activeForm.requestType.trim() || !activeForm.product.trim() || !activeForm.title.trim() || !activeForm.description.trim() || !activeForm.owner.trim()) {
      return
    }

    if (apiEnabled) {
      const existing = activeForm.apiId
        ? apiRows.find((row) => row.apiId === activeForm.apiId)
        : undefined
      const desiredStatus = activeForm.status

      if (!currentUser?.companyId) {
        setFeedbackMessage('Aktif sirket uyeligi bulunamadigi icin talep kaydedilemedi.')
        return
      }

      if (!existing && requiresRecipientSelection && recipientCompanies.length === 0) {
        setRecipientFeedback('Henuz aktif uretici firma yok. Talep olusturabilmeniz icin once en az bir uretici firma kayitli ve aktif olmali.')
        return
      }

      if (!existing && requiresRecipientSelection && !selectedRecipientCompanyId) {
        setRecipientFeedback('Uretici firma secimi zorunludur, lutfen listeden bir firma secin.')
        return
      }

      if (existing) {
        const currentStatus = REQUEST_STATUS_LABELS[existing.backendStatus ?? 'DRAFT']
        const canSubmit = existing.backendStatus === 'DRAFT'
          && desiredStatus === REQUEST_STATUS_LABELS.OPEN_FOR_QUOTATION
        const canCancel = ['DRAFT', 'OPEN_FOR_QUOTATION', 'QUOTED'].includes(existing.backendStatus ?? '')
          && desiredStatus === REQUEST_STATUS_LABELS.CANCELLED

        if (desiredStatus !== currentStatus && !canSubmit && !canCancel) {
          setFeedbackMessage('Secilen durum gecisi backend Request akisinda desteklenmiyor.')
          return
        }
      }

      try {
        let saved: ApiRequest
        if (existing?.apiId && existing.version) {
          if (existing.backendStatus === 'DRAFT') {
            saved = await requestsApi.update(existing.apiId, {
              version: existing.version,
              title: activeForm.title.trim(),
              description: activeForm.description.trim(),
              productType: activeForm.product.trim(),
              targetDeliveryDate: activeForm.deliveryDate === '-'
                ? undefined
                : toInputDate(activeForm.deliveryDate),
            })
          } else {
            saved = await requestsApi.get(existing.apiId)
          }

          if (desiredStatus === REQUEST_STATUS_LABELS.OPEN_FOR_QUOTATION && saved.status === 'DRAFT') {
            saved = await requestsApi.submit(saved.id, saved.version)
          } else if (desiredStatus === REQUEST_STATUS_LABELS.CANCELLED && saved.status !== 'CANCELLED') {
            saved = await requestsApi.cancel(saved.id, saved.version)
          }
        } else {
          const createPayload = {
            companyId: currentUser.companyId,
            regionId: activeForm.regionId,
            title: activeForm.title.trim(),
            description: activeForm.description.trim(),
            productType: activeForm.product.trim(),
            targetDeliveryDate: toInputDate(activeForm.deliveryDate),
            currency: 'TRY',
            ...(requiresRecipientSelection
              ? { recipientCompanyIds: [selectedRecipientCompanyId] }
              : {}),
          }
          saved = await requestsApi.create(createPayload)
        }

        const mapped = toRequestRow(saved)
        setApiRows((currentRows) => {
          const exists = currentRows.some((row) => row.apiId === mapped.apiId)
          return exists
            ? currentRows.map((row) => row.apiId === mapped.apiId ? mapped : row)
            : [mapped, ...currentRows]
        })
        setFeedbackMessage(existing ? 'Talep guncellendi.' : 'Talep taslak olarak olusturuldu. Cam kalemlerini (olcu/fotograf) ekleyin, hazir oldugunuzda "Ureticiye Gonder" butonuna basin.')
        setRecipientFeedback('')
        setSelectedRecipientCompanyId('')
        setActiveForm(null)
        if (!existing) {
          void handleViewRequest(mapped)
        }
      } catch (error) {
        setFeedbackMessage(requestApiErrorMessage(error))
      }
      return
    }

    const nextRow: RequestRow = enforceCompanyAndOwner({
      ...activeForm,
      deliveryDate: activeForm.deliveryDate,
    }, currentUser)

    const exists = rows.some((row) => row.id === nextRow.id)
    workflowActions.saveRequest(nextRow)
    setFeedbackMessage(exists ? 'Talep guncellendi.' : 'Yeni talep kaydedildi.')
    setActiveForm(null)
  }

  const handleViewRequest = async (row: RequestRow) => {
    if (!apiEnabled) {
      setViewRow(row)
      setViewRequest(null)
      setRequestItems([])
      return
    }

    if (!row.apiId) {
      setFeedbackMessage('Talep detayi icin backend kimligi bulunamadi.')
      return
    }

    setViewRow(row)
    setViewRequest(null)
    setDetailState('loading')
    setRequestItems([])
    setItemsState(canReadItems ? 'loading' : 'steady')
    setItemFeedback('')
    setAttachments([])
    setAttachmentsState(canReadAttachments ? 'loading' : 'steady')
    setAttachmentsListError('')
    setAttachmentFeedback('')
    setAttachmentRequestItemId('')
    setAnalysisJobs({})
    setAnalysisState(canReadAnalysis ? 'loading' : 'steady')
    setMeasurements({})
    setAnalysisFeedback('')
    completedAnalysisJobs.current.clear()

    const detailResult = await requestsApi.get(row.apiId)
      .then((request) => ({ request }))
      .catch((error: unknown) => ({ error }))

    if ('error' in detailResult) {
      setDetailState('error')
      setFeedbackMessage(requestApiErrorMessage(detailResult.error))
    } else {
      setViewRequest(detailResult.request)
      setViewRow(toRequestRow(detailResult.request))
      setDetailState('steady')
    }

    const [loadedItems, loadedAttachments] = await Promise.all([
      canReadItems ? loadRequestItems(row.apiId) : Promise.resolve(),
      canReadAttachments ? loadAttachments(row.apiId) : Promise.resolve(),
    ])
    if (canReadAnalysis) {
      await Promise.all([
        loadAnalysisJobs(row.apiId, loadedAttachments ?? []),
        canReadItems ? loadMeasurements(row.apiId, loadedItems ?? []) : Promise.resolve(),
      ])
    }
  }

  const closeRequestDetail = () => {
    setViewRow(null)
    setViewRequest(null)
    setRequestItems([])
    setItemForm(null)
    setItemToDelete(null)
    setItemFeedback('')
    setAttachments([])
    setAttachmentsListError('')
    setAttachmentToDelete(null)
    setAttachmentFeedback('')
    setAttachmentUploadStage('')
    setAttachmentRequestItemId('')
    setAnalysisJobs({})
    setAnalysisState('steady')
    setMeasurements({})
    setAnalysisFeedback('')
    setReviewForm(null)
  }

  const isDraftOwner = apiEnabled
    && viewRequest?.status === 'DRAFT'
    && Boolean(currentUser?.companyId)
    && viewRequest?.companyId === currentUser?.companyId

  const handleSubmitRequest = async () => {
    if (!viewRequest) {
      return
    }

    setItemFeedback('')
    try {
      const submitted = await requestsApi.submit(viewRequest.id, viewRequest.version)
      const mapped = toRequestRow(submitted)
      setViewRequest(submitted)
      setViewRow(mapped)
      setApiRows((currentRows) => currentRows.map((row) => row.apiId === mapped.apiId ? mapped : row))
      setFeedbackMessage('Talep ureticiye gonderildi.')
    } catch (error) {
      setItemFeedback(requestApiErrorMessage(error))
    }
  }

  const handleSaveRequestItem = async () => {
    if (!viewRequest || !itemForm || itemMutationPending) {
      return
    }

    const quantity = Number(itemForm.quantity)
    const dimensions = [itemForm.width, itemForm.height, itemForm.length, itemForm.depth, itemForm.thickness]
      .filter((value) => value.trim())
      .map(Number)
    if (!itemForm.description.trim() || !itemForm.quantity.trim() || !Number.isFinite(quantity) || quantity < 0 || dimensions.some((value) => !Number.isFinite(value) || value < 0)) {
      setItemFeedback('Aciklama ile sifir veya daha buyuk gecerli sayisal degerler girilmelidir.')
      return
    }

    setItemMutationPending(true)
    try {
      const payload = requestItemPayload(itemForm)
      if (itemForm.itemId && itemForm.version !== undefined) {
        await requestItemsApi.updateRequestItem(viewRequest.id, itemForm.itemId, {
          ...payload,
          version: itemForm.version,
        })
        setItemFeedback('Kalem guncellendi.')
      } else {
        await requestItemsApi.createRequestItem(viewRequest.id, payload)
        setItemFeedback('Yeni kalem eklendi.')
      }
      setItemForm(null)
      await loadRequestItems(viewRequest.id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setItemForm(null)
        setItemFeedback('Kalem baska bir islemle guncellendi. Guncel veri yeniden yuklendi.')
        await loadRequestItems(viewRequest.id)
      } else {
        setItemFeedback('Kalem kaydedilemedi. Lutfen yeniden deneyin.')
      }
    } finally {
      setItemMutationPending(false)
    }
  }

  const handleDeleteRequestItem = async () => {
    if (!viewRequest || !itemToDelete || itemMutationPending) {
      return
    }

    setItemMutationPending(true)
    try {
      await requestItemsApi.deleteRequestItem(viewRequest.id, itemToDelete.id, itemToDelete.version)
      setItemToDelete(null)
      setItemFeedback('Kalem silindi.')
      await loadRequestItems(viewRequest.id)
    } catch (error) {
      setItemToDelete(null)
      if (error instanceof ApiError && error.status === 409) {
        setItemFeedback('Kalem baska bir islemle guncellendi. Guncel veri yeniden yuklendi.')
        await loadRequestItems(viewRequest.id)
      } else {
        setItemFeedback('Kalem silinemedi. Lutfen yeniden deneyin.')
      }
    } finally {
      setItemMutationPending(false)
    }
  }

  const handleAttachmentFile = async (file: File, input: HTMLInputElement) => {
    if (!viewRequest || attachmentOperation) return
    const validationError = validateAttachmentFile(file)
    if (validationError) {
      setAttachmentFeedback(validationError)
      input.value = ''
      return
    }

    setAttachmentOperation('upload')
    setAttachmentFeedback('')
    setAttachmentUploadStage(`${file.name} icin yukleme hazirlaniyor...`)
    let uploadInitiated = false
    let uploadPhase: 'upload' | 'binary' | 'complete' = 'upload'
    try {
      const initiated = await attachmentsApi.initiateUpload(viewRequest.id, {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        ...(attachmentRequestItemId ? { requestItemId: attachmentRequestItemId } : {}),
      })
      uploadInitiated = true
      setAttachments((current) => [...current.filter((item) => item.id !== initiated.attachment.id), initiated.attachment])
      setAttachmentUploadStage(`${file.name} aktariliyor...`)
      uploadPhase = 'binary'
      await uploadAttachmentBinary(initiated.upload.url, file)
      setAttachmentUploadStage(`${file.name} dogrulaniyor...`)
      uploadPhase = 'complete'
      await attachmentsApi.completeUpload(viewRequest.id, initiated.attachment.id, initiated.attachment.version)
      setAttachmentFeedback('Dosya yuklendi, olcu analizi otomatik baslatildi.')
      const refreshedAttachments = await loadAttachments(viewRequest.id)
      if (canReadAnalysis) {
        await loadAnalysisJobs(viewRequest.id, refreshedAttachments ?? [])
      }
    } catch (error) {
      setAttachmentFeedback(attachmentErrorMessage(error, uploadPhase))
      if (uploadInitiated) await loadAttachments(viewRequest.id)
    } finally {
      setAttachmentOperation(null)
      setAttachmentUploadStage('')
      input.value = ''
    }
  }

  const handleDownloadAttachment = async (attachment: ApiAttachment) => {
    if (!viewRequest || attachmentOperation || attachment.status !== 'AVAILABLE') return
    setAttachmentOperation(`download:${attachment.id}`)
    setAttachmentFeedback('')
    try {
      const capability = await attachmentsApi.getDownload(viewRequest.id, attachment.id)
      const link = document.createElement('a')
      link.href = resolveApiCapabilityUrl(capability.url)
      link.download = attachment.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setAttachmentFeedback(attachmentErrorMessage(error, 'download'))
    } finally {
      setAttachmentOperation(null)
    }
  }

  const handleDeleteAttachment = async () => {
    if (!viewRequest || !attachmentToDelete || attachmentOperation) return
    setAttachmentOperation(`delete:${attachmentToDelete.id}`)
    setAttachmentFeedback('')
    try {
      await attachmentsApi.delete(viewRequest.id, attachmentToDelete.id, attachmentToDelete.version)
      setAttachmentFeedback('Dosya silindi.')
      setAttachmentToDelete(null)
      await loadAttachments(viewRequest.id)
    } catch (error) {
      setAttachmentFeedback(attachmentErrorMessage(error, 'delete'))
      setAttachmentToDelete(null)
      await loadAttachments(viewRequest.id)
    } finally {
      setAttachmentOperation(null)
    }
  }

  const handleStartAnalysis = async (attachment: ApiAttachment) => {
    if (!viewRequest || analysisOperation || attachment.status !== 'AVAILABLE') return
    setAnalysisOperation(`start:${attachment.id}`)
    setAnalysisFeedback('')
    try {
      const job = await analysisApi.start(viewRequest.id, attachment.id)
      setAnalysisJobs((current) => ({ ...current, [attachment.id]: [job, ...(current[attachment.id] ?? [])] }))
    } catch (error) {
      setAnalysisFeedback(error instanceof ApiError && error.status === 409
        ? 'Analiz durumu guncellendi. Guncel veri yeniden yuklendi.'
        : 'Analiz baslatilamadi.')
      await loadAnalysisJobs(viewRequest.id, attachments)
    } finally {
      setAnalysisOperation(null)
    }
  }

  const submitMeasurementReview = async (
    item: ApiRequestItem,
    measurement: ApiDetectedMeasurement,
    action: 'APPROVE' | 'CORRECT' | 'REJECT',
    form?: MeasurementReviewFormState,
  ) => {
    if (!viewRequest || analysisOperation) return
    const correctedFields = form ? (['quantity', 'width', 'height', 'length', 'depth', 'thickness'] as const)
      .filter((field) => form[field].trim()) : []
    if (action === 'CORRECT' && correctedFields.length === 0 && !form?.unit) {
      setAnalysisFeedback('En az bir duzeltilmis olcu veya birim girilmelidir.')
      return
    }
    setAnalysisOperation(`review:${measurement.id}`)
    setAnalysisFeedback('')
    try {
      await analysisApi.reviewMeasurement(viewRequest.id, item.id, {
        detectedMeasurementId: measurement.id,
        action,
        requestItemVersion: item.version,
        analysisResultVersion: measurement.analysisResult.version,
        ...(form?.reason.trim() ? { reason: form.reason.trim() } : {}),
        ...(form?.unit ? { unit: form.unit } : {}),
        ...Object.fromEntries(correctedFields.map((field) => [field, Number(form?.[field])])),
      })
      setReviewForm(null)
      const currentItems = await loadRequestItems(viewRequest.id)
      await loadMeasurements(viewRequest.id, currentItems)
      setAnalysisFeedback(action === 'REJECT' ? 'Olcu reddedildi.' : 'Olcu incelemesi kaydedildi.')
    } catch (error) {
      setReviewForm(null)
      if (error instanceof ApiError && error.status === 409) {
        const currentItems = await loadRequestItems(viewRequest.id)
        await loadMeasurements(viewRequest.id, currentItems)
        setAnalysisFeedback('Veriler guncellendi, yeniden yuklendi.')
      } else {
        setAnalysisFeedback('Olcu incelemesi kaydedilemedi.')
      }
    } finally {
      setAnalysisOperation(null)
    }
  }

  useEffect(() => {
    if (!viewRequest || !canReadAnalysis) return
    const activeAttachments = attachments.filter((attachment) => (
      analysisJobs[attachment.id]?.some((job) => job.status === 'QUEUED' || job.status === 'RUNNING')
    ))
    if (activeAttachments.length === 0) return

    let cancelled = false
    let timeoutId: number | undefined
    const poll = async () => {
      if (cancelled) return
      if (document.visibilityState !== 'visible') {
        timeoutId = window.setTimeout(() => void poll(), 2500)
        return
      }
      try {
        const updates = await Promise.all(activeAttachments.map(async (attachment) => (
          [attachment.id, await analysisApi.listByAttachment(viewRequest.id, attachment.id)] as const
        )))
        if (cancelled) return
        const newlyCompleted = updates.flatMap(([, jobs]) => jobs)
          .filter((job) => job.status === 'COMPLETED' && !completedAnalysisJobs.current.has(job.id))
        newlyCompleted.forEach((job) => completedAnalysisJobs.current.add(job.id))
        setAnalysisJobs((current) => ({ ...current, ...Object.fromEntries(updates) }))
        if (newlyCompleted.length > 0) {
          const currentItems = await loadRequestItems(viewRequest.id)
          await loadMeasurements(viewRequest.id, currentItems)
        }
        const stillActive = updates.some(([, jobs]) => jobs.some((job) => job.status === 'QUEUED' || job.status === 'RUNNING'))
        if (!cancelled && stillActive) timeoutId = window.setTimeout(() => void poll(), 2500)
      } catch {
        if (!cancelled) timeoutId = window.setTimeout(() => void poll(), 2500)
      }
    }
    timeoutId = window.setTimeout(() => void poll(), 2500)
    return () => {
      cancelled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [analysisJobs, attachments, canReadAnalysis, loadMeasurements, loadRequestItems, viewRequest])

  const handleCancelRequest = async () => {
    if (!deleteRow) {
      return
    }

    if (!apiEnabled) {
      workflowActions.deleteRequest(deleteRow.id)
      setDeleteRow(null)
      setFeedbackMessage('Talep silindi.')
      return
    }

    if (!deleteRow.apiId || !deleteRow.version) {
      setDeleteRow(null)
      setFeedbackMessage('Talep iptali icin backend kimligi bulunamadi.')
      return
    }

    try {
      const cancelled = await requestsApi.cancel(deleteRow.apiId, deleteRow.version)
      const mapped = toRequestRow(cancelled)
      setApiRows((currentRows) => currentRows.map((row) => row.apiId === mapped.apiId ? mapped : row))
      setDeleteRow(null)
      setFeedbackMessage('Talep iptal edildi.')
    } catch (error) {
      setDeleteRow(null)
      setFeedbackMessage(requestApiErrorMessage(error))
    }
  }

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  useEffect(() => {
    setPage(1)
  }, [company, endDate, priority, query, startDate, status])

  return (
    <section className="workspace-main dashboard-main requests-page">
      <ScreenStateGate
        state={apiEnabled ? apiState : state}
        onRetry={apiEnabled ? () => void loadApiRequests() : onRetry}
      >
        <section className="requests-header-row">
          <header className="workspace-header glass-card dashboard-hero requests-hero">
            <div>
              <p className="eyebrow">Talep Yonetimi</p>
              <h2>Talepler</h2>
              <p>Gelen talepleri filtreleyin, onceliklendirin ve operasyon akisina uygun sekilde yonetin.</p>
            </div>
          </header>

          {canWriteRequests ? (
            <button
              type="button"
              className="solid-btn request-create-btn"
              onClick={() => {
                setSelectedRecipientCompanyId('')
                setRecipientFeedback('')
                setActiveForm(buildRequestForm(scopedRows, undefined, currentUser?.company ?? ''))
              }}
            >
              + Yeni Talep Olustur
            </button>
          ) : null}
        </section>

        <section className="stat-grid requests-stats-grid">
          <article className="glass-card stat-card request-stat-card">
            <span>Toplam Talep</span>
            <strong>{totalCount}</strong>
            <small>Aktif kayit havuzu</small>
          </article>
          <article className="glass-card stat-card request-stat-card">
            <span>Bekleyen</span>
            <strong>{waitingCount}</strong>
            <small>Islem sirasinda</small>
          </article>
          <article className="glass-card stat-card request-stat-card">
            <span>Onaylanan</span>
            <strong>{approvedCount}</strong>
            <small>Onay sureci tamamlandi</small>
          </article>
          <article className="glass-card stat-card request-stat-card">
            <span>Reddedilen</span>
            <strong>{rejectedCount}</strong>
            <small>Revize bekleyen kayitlar</small>
          </article>
        </section>

        <section className="glass-card panel requests-filter-panel">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="requests-filter-grid">
            <label className="requests-filter-field requests-filter-search">
              <span>Global Arama</span>
              <input type="search" value={query} placeholder="Talep, firma veya olusturan ara" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="requests-filter-field">
              <span>Firma Secimi</span>
              <select value={company} onChange={(event) => setCompany(event.target.value)}>
                {requestCompanies.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="requests-filter-field">
              <span>Durum Filtresi</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | RequestStatus)}>
                {requestStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="requests-filter-field">
              <span>Oncelik</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as 'Tum Oncelikler' | RequestPriority)}>
                {requestPriorities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="requests-filter-field requests-date-range">
              <span>Tarih Araligi</span>
              <div className="requests-date-inputs">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card panel requests-table-panel">
          <header className="panel-header requests-table-head">
            <div>
              <h3>Talep Listesi</h3>
              <p>{filteredRows.length} kayit gosteriliyor</p>
            </div>
          </header>

          {feedbackMessage && <p className="ui-feedback-message settings-feedback-message">{feedbackMessage}</p>}

          <div className="table-wrap requests-table-wrap">
            <table className="requests-table">
              <thead>
                <tr>
                  <th>Talep No</th>
                  <th>Firma</th>
                  <th>Talep Basligi</th>
                  <th>Olusturan</th>
                  <th>Oncelik</th>
                  <th>Durum</th>
                  <th>Olusturulma Tarihi</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Talep No">{row.id}</td>
                    <td data-label="Firma">{row.company}</td>
                    <td data-label="Talep Basligi">{row.title}</td>
                    <td data-label="Olusturan">{row.owner}</td>
                    <td data-label="Oncelik">
                      <RequestPriorityBadge priority={row.priority} />
                    </td>
                    <td data-label="Durum">
                      <RequestStatusBadge status={row.status} />
                    </td>
                    <td data-label="Olusturulma Tarihi">{row.createdAt}</td>
                    <td data-label="Islemler">
                      <div className="request-row-actions">
                        {(apiEnabled ? canCreateQuotation : role !== 'BUYER') ? (
                          <button
                            type="button"
                            className="ghost-btn request-action-btn"
                            onClick={() => {
                              if (apiEnabled) {
                                void handleViewRequest(row)
                                setFeedbackMessage('Teklif olusturmak icin talep detayi acildi.')
                              } else {
                                workflowActions.createOfferFromRequest(row.id)
                                setFeedbackMessage('Talep teklif surecine alindi.')
                              }
                            }}
                            aria-label="Teklife Donustur"
                          >
                            <span className="request-action-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none">
                                <path d="M4 8h16M4 12h10M4 16h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="m14 14 3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          </button>
                        ) : null}
                        <button type="button" className="ghost-btn request-action-btn" onClick={() => void handleViewRequest(row)} aria-label="Goruntule">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        {canWriteRequests ? (
                          <>
                            <button
                              type="button"
                              className="ghost-btn request-action-btn"
                              onClick={() => {
                                setActiveForm(buildRequestForm(scopedRows, row))
                              }}
                              aria-label="Duzenle"
                            >
                              <span className="request-action-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                  <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                  <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" />
                                </svg>
                              </span>
                            </button>
                            <button type="button" className="ghost-btn request-action-btn request-action-danger" onClick={() => setDeleteRow(row)} aria-label="Sil">
                              <span className="request-action-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                  <path d="M9 5h6M5 8h14M9 10v6M15 10v6M7 8l1 11h8l1-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
        </section>

        <RequestModal
          open={Boolean(activeForm)}
          title={scopedRows.some((row) => row.id === activeForm?.id) ? 'Talep Duzenle' : 'Yeni Talep'}
          onClose={() => {
            setActiveForm(null)
          }}
          footer={
            <>
              <button type="button" className="ghost-btn" onClick={() => setActiveForm(null)}>
                Iptal
              </button>
              <button
                type="button"
                className="solid-btn"
                disabled={requiresRecipientSelection && !activeForm?.apiId && (!selectedRecipientCompanyId || recipientCompanies.length === 0)}
                title={
                  requiresRecipientSelection && !activeForm?.apiId && recipientCompanies.length === 0
                    ? 'Henuz aktif uretici firma bulunmadigi icin talep olusturulamiyor.'
                    : requiresRecipientSelection && !activeForm?.apiId && !selectedRecipientCompanyId
                      ? 'Devam etmek icin bir uretici firma secin.'
                      : undefined
                }
                onClick={() => void handleSaveRequest()}
              >
                {scopedRows.some((row) => row.id === activeForm?.id) ? 'Guncelle' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeForm && (
            <div className="request-form-grid">
              <label>
                Talep No
                <input type="text" value={activeForm.id} readOnly />
              </label>
              <label>
                Firma
                <select value={activeForm.company} onChange={(event) => setActiveForm((current) => (current ? { ...current, company: event.target.value } : current))}>
                  {requestCompanies.filter((item) => item !== 'Tum Firmalar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              {apiEnabled ? (
                <label>
                  Bolge
                  <select
                    value={activeForm.regionId ?? ''}
                    onChange={(event) => {
                      const nextRegionId = event.target.value || undefined
                      const nextRegionName = regions.find((region) => region.id === nextRegionId)?.name ?? '-'
                      setActiveForm((current) => (current ? { ...current, regionId: nextRegionId, region: nextRegionName } : current))
                    }}
                  >
                    <option value="">Tum bolgeler</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Bolge
                  <select value={activeForm.region} onChange={(event) => setActiveForm((current) => (current ? { ...current, region: event.target.value } : current))}>
                    {requestRegions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {requiresRecipientSelection && !activeForm.apiId && (
                <label>
                  Uretici Firma (zorunlu)
                  <select
                    required
                    value={selectedRecipientCompanyId}
                    disabled={recipientCompaniesState === 'loading' || recipientCompanies.length === 0}
                    onChange={(event) => {
                      setSelectedRecipientCompanyId(event.target.value)
                      setRecipientFeedback('')
                    }}
                  >
                    <option value="">Uretici secin</option>
                    {recipientCompanies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.tradeName ?? company.legalName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {requiresRecipientSelection && recipientCompaniesState === 'error' && (
                <p className="ui-feedback-message request-item-feedback full-width">Uretici firmalar yuklenemedi.</p>
              )}
              {requiresRecipientSelection && recipientCompaniesState === 'steady' && recipientCompanies.length === 0 && (
                <p className="ui-feedback-message request-item-feedback full-width">
                  {activeForm.regionId
                    ? 'Bu bolgede henuz aktif uretici firma yok. Baska bir bolge secin veya bolge filtresini kaldirin.'
                    : 'Henuz aktif uretici firma yok. Talep olusturabilmeniz icin once en az bir uretici firma kayitli ve aktif olmali.'}
                </p>
              )}
              {recipientFeedback && (
                <div className="full-width" role="alert" aria-live="polite">
                  <p className="ui-feedback-message request-item-feedback">{recipientFeedback}</p>
                </div>
              )}
              <label>
                Talep Turu
                <select value={activeForm.requestType} onChange={(event) => setActiveForm((current) => (current ? { ...current, requestType: event.target.value } : current))}>
                  {requestTypes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Urun
                <input type="text" value={activeForm.product} onChange={(event) => setActiveForm((current) => (current ? { ...current, product: event.target.value } : current))} />
              </label>
              <label className="full-width">
                Talep Basligi
                <input type="text" value={activeForm.title} onChange={(event) => setActiveForm((current) => (current ? { ...current, title: event.target.value } : current))} />
              </label>
              <label className="full-width">
                Aciklama
                <textarea rows={4} value={activeForm.description} onChange={(event) => setActiveForm((current) => (current ? { ...current, description: event.target.value } : current))} />
              </label>
              <label>
                Oncelik
                <select value={activeForm.priority} onChange={(event) => setActiveForm((current) => (current ? { ...current, priority: event.target.value as RequestPriority } : current))}>
                  {requestPriorities.filter((item) => item !== 'Tum Oncelikler').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Teslim Tarihi
                <input
                  type="date"
                  value={toInputDate(activeForm.deliveryDate)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, deliveryDate: toDisplayDate(event.target.value) } : current))}
                />
              </label>
              <label>
                Sorumlu
                <input type="text" value={activeForm.owner} onChange={(event) => setActiveForm((current) => (current ? { ...current, owner: event.target.value } : current))} />
              </label>
              <label>
                Durum
                <select value={activeForm.status} onChange={(event) => setActiveForm((current) => (current ? { ...current, status: event.target.value as RequestStatus } : current))}>
                  {requestStatuses.filter((item) => item !== 'Tum Durumlar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(viewRow)}
          title="Talep Detayi"
          onClose={closeRequestDetail}
          footer={
            <>
              {isDraftOwner && (
                <button
                  type="button"
                  className="solid-btn"
                  onClick={() => {
                    if (requestItems.length === 0 && !window.confirm('Henuz hic cam kalemi eklemediniz. Yine de ureticiye gondermek istiyor musunuz?')) {
                      return
                    }
                    void handleSubmitRequest()
                  }}
                >
                  Ureticiye Gonder
                </button>
              )}
              <button type="button" className="ghost-btn" onClick={closeRequestDetail}>
                Kapat
              </button>
            </>
          }
        >
          {detailState === 'loading' && <div className="request-detail-state">Talep detayi yukleniyor...</div>}
          {detailState === 'error' && <div className="request-detail-state error">Talep detayi yuklenemedi.</div>}
          {isDraftOwner && (
            <p className="ui-feedback-message request-item-feedback full-width">
              Bu talep henuz taslak halinde, sadece siz gorebilirsiniz. Cam kalemlerini (olcu/fotograf) ekleyip hazir oldugunuzda "Ureticiye Gonder" butonuna basin.
            </p>
          )}
          {viewRow && detailState !== 'loading' && (
            <div className="request-detail-grid">
              <article className="request-detail-card">
                <span>Talep No</span>
                <strong>{viewRow.id}</strong>
              </article>
              <article className="request-detail-card">
                <span>Firma</span>
                <strong>{viewRow.company}</strong>
              </article>
              <article className="request-detail-card">
                <span>Bolge</span>
                <strong>{viewRow.region}</strong>
              </article>
              <article className="request-detail-card">
                <span>Talep Turu</span>
                <strong>{viewRow.requestType}</strong>
              </article>
              <article className="request-detail-card">
                <span>Urun</span>
                <strong>{viewRow.product}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Talep Basligi</span>
                <strong>{viewRow.title}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Aciklama</span>
                <p>{viewRow.description}</p>
              </article>
              <article className="request-detail-card">
                <span>Oncelik</span>
                <RequestPriorityBadge priority={viewRow.priority} />
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <RequestStatusBadge status={viewRow.status} />
              </article>
              <article className="request-detail-card">
                <span>Teslim Tarihi</span>
                <strong>{viewRow.deliveryDate}</strong>
              </article>
              <article className="request-detail-card">
                <span>Sorumlu</span>
                <strong>{viewRow.owner}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Yonlendirilen Ureticiler</span>
                <strong>{viewRow.assignedManufacturers.join(', ')}</strong>
              </article>
              {apiEnabled && viewRequest && (
                <QuotationApiWorkspace
                  embedded
                  currentUser={currentUser}
                  requestId={viewRequest.id}
                  request={viewRequest}
                  onRequestRefreshed={(refreshed) => {
                    const mapped = toRequestRow(refreshed)
                    setViewRequest(refreshed)
                    setViewRow(mapped)
                    setApiRows((currentRows) => currentRows.map((row) => row.apiId === mapped.apiId ? mapped : row))
                  }}
                />
              )}
              {apiEnabled && (
                <section className="request-items-section full-width" aria-label="Talep Kalemleri">
                  <header className="request-items-head">
                    <div>
                      <h4>Kalemler</h4>
                      <p>Talebe bagli urun ve olcu kayitlari</p>
                    </div>
                    {viewRequest?.status === 'DRAFT' && canCreateItems && (
                      <button type="button" className="solid-btn" onClick={() => setItemForm(buildRequestItemForm())}>
                        + Yeni Kalem
                      </button>
                    )}
                  </header>

                  {canReadItems && itemTypeSummary.length > 0 && (
                    <section className="request-overview-grid calculation-type-summary" aria-label="Cam Turune Gore Ozet">
                      {itemTypeSummary.map((group) => (
                        <article key={group.productType} className="request-detail-card">
                          <span>{group.productType}</span>
                          <strong>{group.itemCount} kalem</strong>
                          <small>Toplam miktar: {group.totalQuantity} | Toplam alan: {group.totalAreaM2.toFixed(2)} m2</small>
                        </article>
                      ))}
                    </section>
                  )}

                  {!canReadItems && <div className="request-items-empty">Kalemleri goruntuleme yetkiniz bulunmuyor.</div>}
                  {canReadItems && itemsState === 'loading' && <div className="request-items-empty">Kalemler yukleniyor...</div>}
                  {canReadItems && itemsState === 'error' && (
                    <div className="request-items-empty error">
                      <span>Kalemler yuklenemedi.</span>
                      {viewRequest && (
                        <button type="button" className="ghost-btn" onClick={() => void loadRequestItems(viewRequest.id)}>
                          Yeniden dene
                        </button>
                      )}
                    </div>
                  )}
                  {canReadItems && itemsState === 'steady' && requestItems.length === 0 && (
                    <div className="request-items-empty">Bu talep icin henuz kalem bulunmuyor.</div>
                  )}
                  {itemFeedback && <p className="ui-feedback-message request-item-feedback">{itemFeedback}</p>}
                  {analysisFeedback && <p className="ui-feedback-message request-item-feedback">{analysisFeedback}</p>}
                  {canReadItems && requestItems.length > 0 && (
                    <div className="table-wrap request-items-table-wrap">
                      <table className="request-items-table">
                        <thead>
                          <tr>
                            <th>No</th>
                            <th>Aciklama</th>
                            <th>Urun</th>
                            <th>Miktar</th>
                            <th>Olculer</th>
                            <th>Durum</th>
                            <th>Hesaplanan</th>
                            <th>Islem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {requestItems.map((item) => (
                            <Fragment key={item.id}>
                            <tr>
                              <td>{item.lineNumber}</td>
                              <td>{item.description}</td>
                              <td>
                                {item.productType}
                                {(item.measurementSource === 'AI' || item.measurementSource === 'AI_CORRECTED') && (
                                  <span className="request-badge" title="AI ile otomatik olusturuldu">AI</span>
                                )}
                                <small>{item.productCode ?? '-'}</small>
                              </td>
                              <td>{item.quantity ?? '-'} {item.unit ?? ''}</td>
                              <td>{measurementSummary(item)}</td>
                              <td><span className="request-badge">{measurementStatusLabel(item.measurementStatus)}</span></td>
                              <td>
                                <small>Alan: {item.calculatedAreaM2 ?? '-'}</small>
                                <small>Uzunluk: {item.calculatedLengthM ?? '-'}</small>
                                <small>Hacim: {item.calculatedVolumeM3 ?? '-'}</small>
                              </td>
                              <td>
                                <div className="request-row-actions">
                                  {viewRequest?.status === 'DRAFT' && canUpdateItems && (
                                    <button type="button" className="ghost-btn request-action-btn" aria-label={`Kalem ${item.lineNumber} Duzenle`} onClick={() => setItemForm(buildRequestItemForm(item))}>
                                      Duzenle
                                    </button>
                                  )}
                                  {viewRequest?.status === 'DRAFT' && canDeleteItems && (
                                    <button type="button" className="ghost-btn request-action-btn request-action-danger" aria-label={`Kalem ${item.lineNumber} Sil`} onClick={() => setItemToDelete(item)}>
                                      Sil
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {(measurements[item.id]?.length ?? 0) > 0 && (
                              <tr className="measurement-detail-row">
                                <td colSpan={8}>
                                  <div className="measurement-results">
                                    {measurements[item.id].map((measurement) => (
                                      <article key={measurement.id} className="measurement-result">
                                        <header><strong>{measurement.label ?? `Olcu ${measurement.ordinal}`}</strong><span>{measurement.geometryType}</span></header>
                                        <div className="measurement-values">
                                          <span>Genislik: {measurement.widthMm ?? '-'}</span>
                                          <span>Yukseklik: {measurement.heightMm ?? '-'}</span>
                                          <span>Uzunluk: {measurement.lengthMm ?? '-'}</span>
                                          <span>Derinlik: {measurement.depthMm ?? '-'}</span>
                                          <span>Kalinlik: {measurement.thicknessMm ?? '-'}</span>
                                          <span>Miktar: {measurement.quantity ?? '-'} {measurement.unit ?? ''}</span>
                                          <span>Alan: {measurement.calculatedAreaM2 ?? '-'}</span>
                                          <span>Hesaplanan uzunluk: {measurement.calculatedLengthM ?? '-'}</span>
                                          <span>Hacim: {measurement.calculatedVolumeM3 ?? '-'}</span>
                                          <span>Guven: {measurement.confidence ?? '-'}</span>
                                        </div>
                                        {measurement.warnings.map((warning) => <small key={warning}>Uyari: {warning}</small>)}
                                        {measurement.assumptions.map((assumption) => <small key={assumption}>Varsayim: {assumption}</small>)}
                                        {canReviewAnalysis && viewRequest?.status === 'DRAFT' && measurement.analysisResult.reviewStatus === 'PENDING' && (
                                          <div className="request-row-actions measurement-review-actions">
                                            <button type="button" className="solid-btn request-action-btn" disabled={Boolean(analysisOperation)} onClick={() => void submitMeasurementReview(item, measurement, 'APPROVE')}>Olcuyu Onayla</button>
                                            <button type="button" className="ghost-btn request-action-btn" disabled={Boolean(analysisOperation)} onClick={() => setReviewForm({ action: 'CORRECT', item, measurement, reason: '', quantity: '', unit: '', width: '', height: '', length: '', depth: '', thickness: '' })}>Olcuyu Duzelt</button>
                                            <button type="button" className="ghost-btn request-action-btn request-action-danger" disabled={Boolean(analysisOperation)} onClick={() => setReviewForm({ action: 'REJECT', item, measurement, reason: '', quantity: '', unit: '', width: '', height: '', length: '', depth: '', thickness: '' })}>Olcuyu Reddet</button>
                                          </div>
                                        )}
                                      </article>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {viewRequest?.status !== 'DRAFT' && canReadItems && (
                    <p className="request-items-lock-note">Talep taslak olmadigi icin kalemler salt okunur.</p>
                  )}
                </section>
              )}
              {apiEnabled && (
                <section className="request-attachments-section full-width" aria-label="Talep Dosyalari">
                  <header className="request-items-head">
                    <div>
                      <h4>Dosyalar / Ekler</h4>
                      <p>PDF, JPEG veya PNG; en fazla {formatFileSize(attachmentMaxFileSizeBytes)}</p>
                    </div>
                    {viewRequest && ['DRAFT', 'OPEN_FOR_QUOTATION'].includes(viewRequest.status) && canCreateAttachments && (
                      <div className="attachment-upload-controls">
                      {canReadItems && requestItems.length > 0 && (
                        <label>
                          Bagli Kalem
                          <select aria-label="Dosyanin bagli oldugu kalem" value={attachmentRequestItemId} disabled={Boolean(attachmentOperation)} onChange={(event) => setAttachmentRequestItemId(event.target.value)}>
                            <option value="">Talep geneli</option>
                            {requestItems.map((item) => <option key={item.id} value={item.id}>{item.lineNumber} - {item.description}</option>)}
                          </select>
                        </label>
                      )}
                      <label className={`solid-btn attachment-upload-label${attachmentOperation ? ' disabled' : ''}`}>
                        {attachmentOperation === 'upload' ? 'Yukleniyor...' : '+ Dosya Yukle'}
                        <input
                          type="file"
                          accept={attachmentMimeTypes.join(',')}
                          disabled={Boolean(attachmentOperation)}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0]
                            if (file) void handleAttachmentFile(file, event.currentTarget)
                          }}
                        />
                      </label>
                      </div>
                    )}
                  </header>

                  {!canReadAttachments && <div className="request-items-empty">Dosyalari goruntuleme yetkiniz bulunmuyor.</div>}
                  {canReadAttachments && attachmentsState === 'loading' && <div className="request-items-empty">Dosyalar yukleniyor...</div>}
                  {canReadAttachments && attachmentsState === 'error' && (
                    <div className="request-items-empty error">
                      <span>Dosyalar yuklenemedi. {attachmentsListError}</span>
                      {viewRequest && (
                        <button type="button" className="ghost-btn" disabled={Boolean(attachmentOperation)} onClick={() => void loadAttachments(viewRequest.id)}>
                          Yeniden dene
                        </button>
                      )}
                    </div>
                  )}
                  {attachmentUploadStage && <div className="attachment-upload-progress" role="status">{attachmentUploadStage}</div>}
                  {attachmentFeedback && <p className="ui-feedback-message request-item-feedback">{attachmentFeedback}</p>}
                  {canReadAttachments && attachmentsState === 'steady' && attachments.length === 0 && (
                    <div className="request-items-empty">Bu talep icin henuz dosya bulunmuyor.</div>
                  )}
                  {canReadAttachments && attachments.length > 0 && (
                    <div className="table-wrap request-attachments-table-wrap">
                      <table className="request-attachments-table">
                        <thead>
                          <tr><th>Dosya</th><th>Bagli Kalem</th><th>Tip</th><th>Boyut</th><th>Durum</th><th>Analiz</th><th>Eklenme</th><th>Islem</th></tr>
                        </thead>
                        <tbody>
                          {attachments.map((attachment) => (
                            <tr key={attachment.id}>
                              <td>{attachment.fileName}</td>
                              <td>{attachment.requestItemId ? requestItems.find((item) => item.id === attachment.requestItemId)?.description ?? '-' : 'Talep geneli'}</td>
                              <td>{attachment.mimeType}</td>
                              <td>{formatFileSize(attachment.sizeBytes)}</td>
                              <td>
                                <span className={`attachment-status attachment-status-${attachment.status.toLowerCase()}`}>
                                  {attachmentStatusLabel(attachment.status)}
                                </span>
                              </td>
                              <td>
                                {(() => {
                                  const latestJob = analysisJobs[attachment.id]?.[0]
                                  if (!canReadAnalysis) return '-'
                                  if (latestJob?.status === 'QUEUED') return <span className="analysis-status analysis-status-active">Analiz hazirlaniyor</span>
                                  if (latestJob?.status === 'RUNNING') return <span className="analysis-status analysis-status-active">Analiz calisiyor</span>
                                  if (latestJob?.status === 'COMPLETED') return <span className="analysis-status analysis-status-completed">Analiz tamamlandi</span>
                                  if (latestJob?.status === 'FAILED') return <span className="analysis-status analysis-status-failed">Analiz tamamlanamadi</span>
                                  return <span className="analysis-status">Analiz yok</span>
                                })()}
                              </td>
                              <td>{formatApiDate(attachment.createdAt)}</td>
                              <td>
                                <div className="request-row-actions">
                                  {attachment.status === 'AVAILABLE' && (
                                    <button type="button" className="ghost-btn request-action-btn" disabled={Boolean(attachmentOperation)} onClick={() => void handleDownloadAttachment(attachment)}>
                                      Indir
                                    </button>
                                  )}
                                  {viewRequest?.status === 'DRAFT' && attachment.status === 'AVAILABLE' && canDeleteAttachments && (
                                    <button type="button" className="ghost-btn request-action-btn request-action-danger" disabled={Boolean(attachmentOperation)} onClick={() => setAttachmentToDelete(attachment)}>
                                      Sil
                                    </button>
                                  )}
                                  {attachment.status === 'AVAILABLE' && canCreateAnalysis && analysisState === 'steady' && (analysisJobs[attachment.id]?.length ?? 0) === 0 && (
                                    <button type="button" className="ghost-btn request-action-btn" disabled={Boolean(analysisOperation)} onClick={() => void handleStartAnalysis(attachment)}>Analiz Baslat</button>
                                  )}
                                  {attachment.requestItemId === null && canReadAnalysis && <small>Olcu incelemesi icin bir talep kalemine bagli degil</small>}
                                  {attachment.status === 'PENDING_UPLOAD' && <small>Yukleme tamamlanmadi</small>}
                                  {attachment.status === 'QUARANTINED' && <small>Dosya kullanima kapali</small>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {viewRequest && !['DRAFT', 'OPEN_FOR_QUOTATION'].includes(viewRequest.status) && canCreateAttachments && (
                    <p className="request-items-lock-note">Talebin mevcut durumunda yeni dosya eklenemez.</p>
                  )}
                </section>
              )}
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(itemForm)}
          title={itemForm?.itemId ? 'Kalem Duzenle' : 'Yeni Kalem'}
          onClose={() => !itemMutationPending && setItemForm(null)}
          footer={
            <>
              <button type="button" className="ghost-btn" disabled={itemMutationPending} onClick={() => setItemForm(null)}>
                Iptal
              </button>
              <button type="button" className="solid-btn" disabled={itemMutationPending} onClick={() => void handleSaveRequestItem()}>
                {itemMutationPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          }
        >
          {itemForm && (
            <div className="request-form-grid request-item-form-grid">
              <label className="full-width">
                Aciklama
                <input value={itemForm.description} onChange={(event) => setItemForm((current) => current && ({ ...current, description: event.target.value }))} />
              </label>
              <label>
                Urun Turu
                <input value={itemForm.productType} onChange={(event) => setItemForm((current) => current && ({ ...current, productType: event.target.value }))} />
              </label>
              <label>
                Urun Kodu
                <input value={itemForm.productCode} onChange={(event) => setItemForm((current) => current && ({ ...current, productCode: event.target.value }))} />
              </label>
              <label>
                Miktar
                <input type="number" min="0" step="any" value={itemForm.quantity} onChange={(event) => setItemForm((current) => current && ({ ...current, quantity: event.target.value }))} />
              </label>
              <label>
                Birim
                <select value={itemForm.unit} onChange={(event) => setItemForm((current) => current && ({ ...current, unit: event.target.value as MeasurementUnit }))}>
                  {measurementUnits.map((unit) => <option key={unit}>{unit}</option>)}
                </select>
              </label>
              <label>
                Olcu Kaynagi
                <select value={itemForm.measurementSource} onChange={(event) => setItemForm((current) => current && ({ ...current, measurementSource: event.target.value as '' | MeasurementSource }))}>
                  <option value="">Secilmedi</option>
                  {measurementSources.map((source) => <option key={source}>{source}</option>)}
                </select>
              </label>
              {(['width', 'height', 'length', 'depth', 'thickness'] as const).map((field) => (
                <label key={field}>
                  {field[0].toUpperCase() + field.slice(1)} (mm)
                  <input type="number" min="0" step="any" value={itemForm[field]} onChange={(event) => setItemForm((current) => current && ({ ...current, [field]: event.target.value }))} />
                </label>
              ))}
              {itemForm.itemId && (
                <p className="request-items-lock-note full-width">
                  Versiyon {itemForm.version}. Hesaplanan alanlar ve olcu durumu server tarafindan yonetilir.
                </p>
              )}
            </div>
          )}
        </RequestModal>

        <DeleteConfirmationModal
          open={Boolean(itemToDelete)}
          onClose={() => !itemMutationPending && setItemToDelete(null)}
          onConfirm={() => void handleDeleteRequestItem()}
        />

        <RequestModal
          open={Boolean(reviewForm)}
          title={reviewForm?.action === 'CORRECT' ? 'Olcuyu Duzelt' : 'Olcuyu Reddet'}
          onClose={() => !analysisOperation && setReviewForm(null)}
          footer={reviewForm && (
            <>
              <button type="button" className="ghost-btn" disabled={Boolean(analysisOperation)} onClick={() => setReviewForm(null)}>Iptal</button>
              <button type="button" className={reviewForm.action === 'REJECT' ? 'solid-btn danger-btn' : 'solid-btn'} disabled={Boolean(analysisOperation)} onClick={() => void submitMeasurementReview(reviewForm.item, reviewForm.measurement, reviewForm.action, reviewForm)}>
                {reviewForm.action === 'CORRECT' ? 'Duzeltmeyi Kaydet' : 'Reddet'}
              </button>
            </>
          )}
        >
          {reviewForm && (
            <div className="request-form-grid">
              {reviewForm.action === 'CORRECT' && (
                <>
                  {(['quantity', 'width', 'height', 'length', 'depth', 'thickness'] as const).map((field) => (
                    <label key={field}>
                      {{ quantity: 'Miktar', width: 'Genislik (mm)', height: 'Yukseklik (mm)', length: 'Uzunluk (mm)', depth: 'Derinlik (mm)', thickness: 'Kalinlik (mm)' }[field]}
                      <input type="number" min="0" step="any" value={reviewForm[field]} onChange={(event) => setReviewForm((current) => current && ({ ...current, [field]: event.target.value }))} />
                    </label>
                  ))}
                  <label>
                    Birim
                    <select value={reviewForm.unit} onChange={(event) => setReviewForm((current) => current && ({ ...current, unit: event.target.value as '' | MeasurementUnit }))}>
                      <option value="">Degistirme</option>
                      {measurementUnits.map((unit) => <option key={unit}>{unit}</option>)}
                    </select>
                  </label>
                </>
              )}
              <label className="full-width">
                Neden
                <textarea value={reviewForm.reason} onChange={(event) => setReviewForm((current) => current && ({ ...current, reason: event.target.value }))} />
              </label>
            </div>
          )}
        </RequestModal>

        <DeleteConfirmationModal
          open={Boolean(attachmentToDelete)}
          onClose={() => !attachmentOperation && setAttachmentToDelete(null)}
          onConfirm={() => void handleDeleteAttachment()}
        />

        <DeleteConfirmationModal
          open={Boolean(deleteRow)}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => {
            void handleCancelRequest()
          }}
        />
      </ScreenStateGate>
    </section>
  )
}

interface QuotationApiWorkspaceProps {
  currentUser: AuthenticatedUser | null
  requestId?: string
  request?: ApiRequest
  embedded?: boolean
  onRequestRefreshed?: (request: ApiRequest) => void
}

function QuotationApiWorkspace({ currentUser, requestId, request, embedded = false, onRequestRefreshed }: QuotationApiWorkspaceProps) {
  const [quotations, setQuotations] = useState<QuotationView[]>([])
  const [listState, setListState] = useState<ScreenState>('loading')
  const [detail, setDetail] = useState<QuotationView | null>(null)
  const [detailState, setDetailState] = useState<'steady' | 'loading' | 'error'>('steady')
  const [calculations, setCalculations] = useState<ApiQuotationCalculation[]>([])
  const [calculationDetail, setCalculationDetail] = useState<ApiQuotationCalculation | null>(null)
  const [calculationState, setCalculationState] = useState<'steady' | 'loading' | 'error'>('steady')
  const [calculationOperation, setCalculationOperation] = useState<string | null>(null)
  const [form, setForm] = useState<QuotationFormState | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const canRead = hasPermission(currentUser, 'quotations.read')
  const canCreate = hasPermission(currentUser, 'quotations.create')
  const canUpdate = hasPermission(currentUser, 'quotations.update')
  const canSend = hasPermission(currentUser, 'quotations.send')
  const canWithdraw = hasPermission(currentUser, 'quotations.withdraw')
  const canDecide = hasPermission(currentUser, 'quotations.decide')
  const canReadCalculations = hasPermission(currentUser, 'quotation-calculations.read')
  const canCreateCalculations = hasPermission(currentUser, 'quotation-calculations.create')
  const canFinalizeCalculations = hasPermission(currentUser, 'quotation-calculations.finalize')

  const loadQuotations = useCallback(async () => {
    if (!canRead) {
      setQuotations([])
      setListState('steady')
      return []
    }
    setListState('loading')
    try {
      const response = requestId
        ? await quotationsApi.listForRequest(requestId)
        : await quotationsApi.list()
      const mapped = response.map(toQuotationView)
      setQuotations(mapped)
      setListState(mapped.length === 0 ? 'empty' : 'steady')
      return mapped
    } catch {
      setQuotations([])
      setListState('error')
      return []
    }
  }, [canRead, requestId])

  useEffect(() => {
    void loadQuotations()
  }, [loadQuotations])

  const refreshRequest = useCallback(async (quotationRequestId: string) => {
    try {
      const refreshed = await requestsApi.get(quotationRequestId)
      onRequestRefreshed?.(refreshed)
    } catch {
      // Quotation remains authoritative even when the adjacent Request refresh is unavailable.
    }
  }, [onRequestRefreshed])

  const loadCalculations = async (quotationId: string) => {
    if (!canReadCalculations) {
      setCalculations([])
      setCalculationDetail(null)
      setCalculationState('steady')
      return []
    }
    setCalculationState('loading')
    setCalculationDetail(null)
    try {
      const loaded = await quotationCalculationsApi.list(quotationId)
      setCalculations(loaded)
      setCalculationState('steady')
      return loaded
    } catch {
      setCalculations([])
      setCalculationState('error')
      return []
    }
  }

  const loadDetail = async (quotationId: string) => {
    setDetailState('loading')
    setDetail(null)
    try {
      const loaded = toQuotationView(await quotationsApi.get(quotationId))
      setDetail(loaded)
      setDetailState('steady')
      await loadCalculations(quotationId)
      return loaded
    } catch (error) {
      setDetailState('error')
      setFeedback(quotationErrorMessage(error))
      return null
    }
  }

  const refreshAuthoritative = async (quotation: QuotationView) => {
    await Promise.all([
      loadQuotations(),
      detail?.id === quotation.id ? loadDetail(quotation.id) : Promise.resolve(null),
      refreshRequest(quotation.requestId),
    ])
  }

  const loadCalculationDetail = async (quotationId: string, calculationId: string) => {
    setCalculationOperation(`detail:${calculationId}`)
    try {
      const loaded = await quotationCalculationsApi.get(quotationId, calculationId)
      setCalculationDetail(loaded)
    } catch (error) {
      setFeedback(calculationErrorMessage(error))
    } finally {
      setCalculationOperation(null)
    }
  }

  const refreshCalculationAuthority = async (quotation: QuotationView) => {
    await Promise.all([
      loadQuotations(),
      loadDetail(quotation.id),
      refreshRequest(quotation.requestId),
    ])
  }

  const handleGenerateCalculation = async (quotation: QuotationView) => {
    if (calculationOperation) return
    setCalculationOperation('generate')
    try {
      await quotationCalculationsApi.generate(quotation.id)
      setFeedback('Hesaplama backend tarafinda olusturuldu.')
      await refreshCalculationAuthority(quotation)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('Hesaplama baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        await refreshCalculationAuthority(quotation)
      } else {
        setFeedback(calculationErrorMessage(error))
      }
    } finally {
      setCalculationOperation(null)
    }
  }

  const handleFinalizeCalculation = async (
    quotation: QuotationView,
    calculation: ApiQuotationCalculation,
  ) => {
    if (calculationOperation) return
    setCalculationOperation(`finalize:${calculation.id}`)
    try {
      await quotationCalculationsApi.finalize(quotation.id, calculation.id, {
        quotationVersion: quotation.version,
        calculationVersion: calculation.calculationVersion,
      })
      setFeedback('Hesaplama finalize edildi ve teklif backend verisiyle yenilendi.')
      await refreshCalculationAuthority(quotation)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('Hesaplama baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        await refreshCalculationAuthority(quotation)
      } else {
        setFeedback(calculationErrorMessage(error))
      }
    } finally {
      setCalculationOperation(null)
    }
  }

  const handleSave = async () => {
    if (!form || operation) return
    const totalAmount = Number(form.totalAmount)
    const leadTimeDays = Number(form.leadTimeDays)
    if (
      !form.requestId
      || !form.manufacturerCompanyId
      || !Number.isFinite(totalAmount)
      || totalAmount < 0
      || !Number.isInteger(leadTimeDays)
      || leadTimeDays < 1
      || !/^[A-Z]{3}$/.test(form.currency)
      || !form.validUntil
    ) {
      setFeedback('Teklif alanlarini backend kurallarina uygun doldurun.')
      return
    }

    setOperation(form.quotationId ? `update:${form.quotationId}` : 'create')
    try {
      if (form.quotationId && form.version !== undefined) {
        await quotationsApi.update(form.quotationId, {
          version: form.version,
          totalAmount,
          currency: form.currency,
          leadTimeDays,
          validUntil: new Date(`${form.validUntil}T23:59:59.999Z`).toISOString(),
          notes: optionalText(form.notes),
        })
        setFeedback('Teklif guncellendi.')
      } else {
        const created = await quotationsApi.create(form.requestId, {
          manufacturerCompanyId: form.manufacturerCompanyId,
          totalAmount,
          currency: form.currency,
          leadTimeDays,
          validUntil: new Date(`${form.validUntil}T23:59:59.999Z`).toISOString(),
          notes: optionalText(form.notes),
        })
        if (canCreateCalculations && canFinalizeCalculations) {
          try {
            const generated = await quotationCalculationsApi.generate(created.id)
            await quotationCalculationsApi.finalize(created.id, generated.id, {
              quotationVersion: created.version,
              calculationVersion: generated.calculationVersion,
            })
            setFeedback('Teklif olusturuldu; fiyat, fiyat listenize gore otomatik hesaplandi.')
          } catch (calculationError) {
            // Best effort: producer can still generate/finalize manually from the quotation detail view below.
            setFeedback(`Teklif olusturuldu. Otomatik fiyat hesaplanamadi: ${calculationErrorMessage(calculationError)}`)
          }
        } else {
          setFeedback('Teklif olusturuldu.')
        }
        await loadDetail(created.id)
      }
      setForm(null)
      await loadQuotations()
      await refreshRequest(form.requestId)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setForm(null)
        setFeedback('Teklif baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        await Promise.all([loadQuotations(), refreshRequest(form.requestId)])
      } else {
        setFeedback(quotationErrorMessage(error))
      }
    } finally {
      setOperation(null)
    }
  }

  const handleAction = async (
    quotation: QuotationView,
    action: 'send' | 'revise' | 'withdraw' | 'accept' | 'reject',
  ) => {
    if (operation) return
    setOperation(`${action}:${quotation.id}`)
    try {
      if (action === 'send') await quotationsApi.send(quotation.id, quotation.version)
      if (action === 'revise') await quotationsApi.revise(quotation.id, quotation.version)
      if (action === 'withdraw') await quotationsApi.withdraw(quotation.id, quotation.version)
      if (action === 'accept') await quotationsApi.accept(quotation.id, quotation.version)
      if (action === 'reject') await quotationsApi.reject(quotation.id, quotation.version)
      setFeedback({
        send: 'Teklif gonderildi.',
        revise: 'Teklif revizyona alindi.',
        withdraw: 'Teklif geri cekildi.',
        accept: 'Teklif kabul edildi.',
        reject: 'Teklif reddedildi.',
      }[action])
      await refreshAuthoritative(quotation)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('Teklif baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        await refreshAuthoritative(quotation)
      } else {
        setFeedback(quotationErrorMessage(error))
      }
    } finally {
      setOperation(null)
    }
  }

  const manufacturerOptions = request?.recipients ?? []
  const defaultManufacturerId = currentUser?.companyId
    ?? manufacturerOptions[0]?.companyId
    ?? ''

  const content = (
    <>
      {!canRead && <div className="request-items-empty">Teklifleri goruntuleme yetkiniz bulunmuyor.</div>}
      {canRead && (
        <ScreenStateGate state={listState} onRetry={() => void loadQuotations()}>
          {feedback && <p className="ui-feedback-message request-item-feedback" role="status">{feedback}</p>}
          <div className="table-wrap offers-table-wrap">
            <table className="offers-table quotation-api-table">
              <thead>
                <tr><th>Teklif No</th><th>Talep</th><th>Uretici</th><th>Tutar</th><th>Termin</th><th>Durum</th><th>Versiyon</th><th>Islemler</th></tr>
              </thead>
              <tbody>
                {quotations.map((quotation) => (
                  <tr key={quotation.id}>
                    <td>{quotation.quotationNumber}</td>
                    <td>{quotation.request.requestNumber}<small>{quotation.request.title}</small></td>
                    <td>{quotationCompanyName(quotation.manufacturerCompany)}</td>
                    <td>{quotation.currency} {quotation.totalAmount}</td>
                    <td>{quotation.leadTimeDays} gun</td>
                    <td><span className={`request-badge quotation-status-${quotation.status.toLowerCase()}`}>{QUOTATION_STATUS_LABELS[quotation.status]}</span></td>
                    <td>{quotation.version}</td>
                    <td>
                      <div className="request-row-actions quotation-actions">
                        <button type="button" className="ghost-btn request-action-btn" onClick={() => void loadDetail(quotation.id)}>Goruntule</button>
                        {quotation.status === 'DRAFT' && canUpdate && <button type="button" className="ghost-btn request-action-btn" onClick={() => setForm(buildQuotationForm(quotation.requestId, quotation))}>Duzenle</button>}
                        {quotation.status === 'DRAFT' && canSend && <button type="button" className="solid-btn request-action-btn" disabled={Boolean(operation)} onClick={() => void handleAction(quotation, 'send')}>Gonder</button>}
                        {quotation.status === 'SENT' && canUpdate && <button type="button" className="ghost-btn request-action-btn" disabled={Boolean(operation)} onClick={() => void handleAction(quotation, 'revise')}>Revize Et</button>}
                        {(quotation.status === 'DRAFT' || quotation.status === 'SENT') && canWithdraw && <button type="button" className="ghost-btn request-action-btn" disabled={Boolean(operation)} onClick={() => void handleAction(quotation, 'withdraw')}>Geri Cek</button>}
                        {quotation.status === 'SENT' && canDecide && <button type="button" className="solid-btn request-action-btn" disabled={Boolean(operation)} onClick={() => void handleAction(quotation, 'accept')}>Kabul Et</button>}
                        {quotation.status === 'SENT' && canDecide && <button type="button" className="ghost-btn request-action-btn request-action-danger" disabled={Boolean(operation)} onClick={() => void handleAction(quotation, 'reject')}>Reddet</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScreenStateGate>
      )}

      <RequestModal
        open={detailState === 'loading' || detailState === 'error' || Boolean(detail)}
        title="Teklif Detayi"
        onClose={() => { setDetail(null); setDetailState('steady'); setCalculations([]); setCalculationDetail(null) }}
        footer={<button type="button" className="solid-btn" onClick={() => { setDetail(null); setDetailState('steady'); setCalculations([]); setCalculationDetail(null) }}>Kapat</button>}
      >
        {detailState === 'loading' && <div className="request-detail-state">Teklif detayi yukleniyor...</div>}
        {detailState === 'error' && <div className="request-detail-state error">Teklif detayi yuklenemedi.</div>}
        {detail && detailState === 'steady' && (
          <div className="request-detail-grid quotation-detail-grid">
            <article className="request-detail-card"><span>Teklif No</span><strong>{detail.quotationNumber}</strong></article>
            <article className="request-detail-card"><span>Durum</span><strong>{QUOTATION_STATUS_LABELS[detail.status]}</strong></article>
            <article className="request-detail-card"><span>Alici</span><strong>{quotationCompanyName(detail.company)}</strong></article>
            <article className="request-detail-card"><span>Uretici</span><strong>{quotationCompanyName(detail.manufacturerCompany)}</strong></article>
            <article className="request-detail-card"><span>Toplam</span><strong>{detail.currency} {detail.totalAmount}</strong></article>
            <article className="request-detail-card"><span>Termin</span><strong>{detail.leadTimeDays} gun</strong></article>
            <article className="request-detail-card"><span>Gecerlilik</span><strong>{formatApiDate(detail.validUntil)}</strong></article>
            <article className="request-detail-card"><span>Versiyon</span><strong>{detail.version}</strong></article>
            <article className="request-detail-card"><span>Revizyon</span><strong>{detail.revisionNumber}</strong></article>
            <article className="request-detail-card"><span>Hesaplama</span><strong>{detail.activeCalculationId ? 'Finalize edildi' : 'Legacy / hesaplamasiz'}</strong></article>
            <article className="request-detail-card"><span>Hazirlayan</span><strong>{detail.createdBy?.fullName ?? '-'}</strong></article>
            <article className="request-detail-card full-width"><span>Notlar</span><p>{detail.notes ?? '-'}</p></article>
            <section className="quotation-calculations full-width" aria-label="Teklif Hesaplamalari">
              <header className="request-items-head">
                <div><h4>Hesaplamalar</h4><p>Backend snapshot ve fiyatlandirma kayitlari</p></div>
                {detail.status === 'DRAFT' && canCreateCalculations && (
                  <button type="button" className="solid-btn" disabled={Boolean(calculationOperation)} onClick={() => void handleGenerateCalculation(detail)}>
                    {calculationOperation === 'generate' ? 'Olusturuluyor...' : 'Hesaplama Olustur'}
                  </button>
                )}
              </header>
              {!canReadCalculations && <div className="request-items-empty">Hesaplamalari goruntuleme yetkiniz bulunmuyor.</div>}
              {canReadCalculations && calculationState === 'loading' && <div className="request-items-empty">Hesaplamalar yukleniyor...</div>}
              {canReadCalculations && calculationState === 'error' && (
                <div className="request-items-empty error">
                  <span>Hesaplamalar yuklenemedi.</span>
                  <button type="button" className="ghost-btn" onClick={() => void loadCalculations(detail.id)}>Yeniden dene</button>
                </div>
              )}
              {canReadCalculations && calculationState === 'steady' && calculations.length === 0 && (
                <div className="request-items-empty">Bu teklif icin henuz hesaplama bulunmuyor.</div>
              )}
              {canReadCalculations && calculations.length > 0 && (
                <div className="table-wrap">
                  <table className="calculation-table">
                    <thead><tr><th>Surum</th><th>Revizyon</th><th>Durum</th><th>Toplam</th><th>Olusturulma</th><th>Finalize</th><th>Islem</th></tr></thead>
                    <tbody>
                      {calculations.map((calculation) => {
                        const isCurrentRevision = calculation.quotationRevisionNumber === detail.revisionNumber
                        const isActive = calculation.id === detail.activeCalculationId
                        return (
                          <tr key={calculation.id}>
                            <td>v{calculation.calculationVersion}{isActive ? <small>Aktif</small> : null}</td>
                            <td>R{calculation.quotationRevisionNumber}<small>{isCurrentRevision ? 'Guncel revizyon' : 'Onceki revizyon'}</small></td>
                            <td>{calculation.status}</td>
                            <td>{calculation.currency} {calculation.totalAmount}</td>
                            <td>{formatApiDate(calculation.createdAt)}</td>
                            <td>{formatApiDate(calculation.finalizedAt)}</td>
                            <td>
                              <div className="request-row-actions">
                                <button type="button" className="ghost-btn request-action-btn" disabled={Boolean(calculationOperation)} onClick={() => void loadCalculationDetail(detail.id, calculation.id)}>Snapshot</button>
                                {detail.status === 'DRAFT' && isCurrentRevision && calculation.status === 'GENERATED' && canFinalizeCalculations && (
                                  <button type="button" className="solid-btn request-action-btn" disabled={Boolean(calculationOperation)} onClick={() => void handleFinalizeCalculation(detail, calculation)}>Finalize Et</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {calculationDetail && (
                <section className="calculation-snapshot" aria-label="Hesaplama Snapshot">
                  <header><h4>Snapshot v{calculationDetail.calculationVersion}</h4><span>Engine {calculationDetail.engineVersion} / Schema {calculationDetail.snapshotSchemaVersion}</span></header>
                  {calculationDetail.snapshotLines.length === 0 ? (
                    <div className="request-items-empty">Snapshot satiri bulunmuyor.</div>
                  ) : (
                    <>
                      <section className="request-overview-grid calculation-type-summary" aria-label="Cam Turune Gore Ozet">
                        {summarizeSnapshotLinesByType(calculationDetail.snapshotLines).map((group) => (
                          <article key={group.productType} className="request-overview-card glass-card">
                            <span>{group.productType}</span>
                            <strong>{group.currency} {group.totalAmount.toFixed(2)}</strong>
                            <p>{group.lineCount} kalem &middot; {group.totalQuantity.toFixed(2)} toplam miktar</p>
                          </article>
                        ))}
                      </section>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>No</th><th>Kalem</th><th>Katalog</th><th>Miktar</th><th>Birim Fiyat</th><th>Fire</th><th>Iskonto</th><th>Toplam</th></tr></thead>
                          <tbody>
                            {calculationDetail.snapshotLines.map((line) => (
                              <tr key={`${line.requestItemId}:${line.lineNumber}`}>
                                <td>{line.lineNumber}</td>
                                <td>{line.description}<small>{line.productCode ?? '-'} / {line.measurementStatus}</small></td>
                                <td>{line.catalogProductCode}</td>
                                <td>{line.quantity} {line.unit}</td>
                                <td>{line.currency} {line.unitPrice}</td>
                                <td>{line.wasteRate}</td>
                                <td>{line.discountRate}</td>
                                <td>{line.currency} {line.totalAmount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              )}
            </section>
          </div>
        )}
      </RequestModal>

      <RequestModal
        open={Boolean(form)}
        title={form?.quotationId ? 'Teklif Duzenle' : 'Yeni Teklif'}
        onClose={() => !operation && setForm(null)}
        footer={(
          <>
            <button type="button" className="ghost-btn" disabled={Boolean(operation)} onClick={() => setForm(null)}>Iptal</button>
            <button type="button" className="solid-btn" disabled={Boolean(operation)} onClick={() => void handleSave()}>{operation ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </>
        )}
      >
        {form && (
          <div className="request-form-grid quotation-form-grid">
            <label className="full-width">Talep<input value={form.requestId} readOnly /></label>
            <label className="full-width">
              Uretici Firma
              <select value={form.manufacturerCompanyId} disabled={Boolean(form.quotationId)} onChange={(event) => setForm((current) => current && ({ ...current, manufacturerCompanyId: event.target.value }))}>
                {!manufacturerOptions.some((item) => item.companyId === form.manufacturerCompanyId) && form.manufacturerCompanyId && <option value={form.manufacturerCompanyId}>{form.manufacturerCompanyId}</option>}
                {manufacturerOptions.map((recipient) => <option key={recipient.companyId} value={recipient.companyId}>{recipient.company.tradeName ?? recipient.company.legalName}</option>)}
              </select>
            </label>
            <label>Toplam Tutar<input type="number" min="0" step="0.01" value={form.totalAmount} disabled={Boolean(form.quotationId && quotations.find((quotation) => quotation.id === form.quotationId)?.activeCalculationId)} onChange={(event) => setForm((current) => current && ({ ...current, totalAmount: event.target.value }))} /></label>
            <label>Para Birimi<input maxLength={3} value={form.currency} disabled={Boolean(form.quotationId && quotations.find((quotation) => quotation.id === form.quotationId)?.activeCalculationId)} onChange={(event) => setForm((current) => current && ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
            <label>Termin (Gun)<input type="number" min="1" step="1" value={form.leadTimeDays} onChange={(event) => setForm((current) => current && ({ ...current, leadTimeDays: event.target.value }))} /></label>
            <label>Gecerlilik Tarihi<input type="date" value={form.validUntil} onChange={(event) => setForm((current) => current && ({ ...current, validUntil: event.target.value }))} /></label>
            <label className="full-width">Notlar<textarea rows={4} maxLength={5000} value={form.notes} onChange={(event) => setForm((current) => current && ({ ...current, notes: event.target.value }))} /></label>
            {form.version !== undefined && <p className="request-items-lock-note full-width">Authoritative versiyon: {form.version}</p>}
          </div>
        )}
      </RequestModal>
    </>
  )

  if (embedded) {
    return (
      <section className="request-items-section quotation-request-section full-width" aria-label="Talep Teklifleri">
        <header className="request-items-head">
          <div><h4>Teklifler</h4><p>Backend Quotation lifecycle kayitlari</p></div>
          {canCreate && requestId && <button type="button" className="solid-btn" onClick={() => setForm(buildQuotationForm(requestId, undefined, defaultManufacturerId))}>+ Teklif Olustur</button>}
        </header>
        {content}
      </section>
    )
  }

  return (
    <section className="workspace-main dashboard-main offers-page quotation-api-page">
      <section className="offers-header-row">
        <header className="workspace-header glass-card dashboard-hero offers-hero">
          <div><p className="eyebrow">Teklif Yonetimi</p><h2>Teklif Yonetimi</h2><p>Backend tarafindan yonetilen guncel teklif lifecycle kayitlari.</p></div>
        </header>
      </section>
      <section className="glass-card panel offers-table-panel">
        <header className="panel-header offers-table-head"><div><h3>Teklif Listesi</h3><p>{quotations.length} authoritative kayit</p></div></header>
        {content}
      </section>
    </section>
  )
}

function quotationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bu teklif islemi icin yetkiniz bulunmuyor.'
    if (error.status === 404) return 'Teklif bulunamadi veya erisim kapsaminizin disinda.'
    if (error.status === 409) return 'Teklif baska bir islem nedeniyle degisti.'
  }
  return 'Teklif islemi tamamlanamadi. Backend baglantisini kontrol edin.'
}

function calculationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      if (error.message.includes('At least one approved request item')) {
        return 'Hesaplama icin en az bir onayli talep kalemi gereklidir.'
      }
      return `Hesaplama yapilamadi: ${error.message}`
    }
    if (error.status === 403) return 'Bu hesaplama islemi icin yetkiniz bulunmuyor.'
    if (error.status === 404) return 'Hesaplama bulunamadi veya erisim kapsaminizin disinda.'
    if (error.status === 409) return 'Hesaplama baska bir islem nedeniyle degisti.'
  }
  return 'Hesaplama islemi tamamlanamadi. Backend baglantisini kontrol edin.'
}

export function TekliflerPage(props: WorkspacePageProps) {
  if (props.currentUser?.backendRole) {
    return <QuotationApiWorkspace currentUser={props.currentUser} />
  }
  return <LegacyTekliflerPage {...props} />
}

function LegacyTekliflerPage({ state, onRetry, currentUser, workflow, workflowActions }: WorkspacePageProps) {
  const rows = workflow.offers
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState('Tum Firmalar')
  const [status, setStatus] = useState<'Tum Durumlar' | OfferStatus>('Tum Durumlar')
  const [offerType, setOfferType] = useState('Tum Teklif Turleri')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeForm, setActiveForm] = useState<OfferFormState | null>(null)
  const [viewRow, setViewRow] = useState<OfferRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<OfferRow | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const scopedRows = useMemo(() => scopeOffers(rows, workflow.requests, currentUser), [rows, workflow.requests, currentUser])
  const offerCompanyOptions = useMemo(() => ['Tum Firmalar', ...new Set(scopedRows.map((row) => row.company))], [scopedRows])

  const filteredRows = useMemo(() => {
    return scopedRows.filter((row) => {
      const matchesQuery = !query.trim() || `${row.id} ${row.company} ${row.title} ${row.owner}`.toLowerCase().includes(query.toLowerCase())
      const matchesCompany = company === 'Tum Firmalar' || row.company === company
      const matchesStatus = status === 'Tum Durumlar' || row.status === status
      const matchesType = offerType === 'Tum Teklif Turleri' || row.type === offerType
      const rowTime = new Date(row.createdAt.split('.').reverse().join('-')).getTime()
      const matchesStart = !startDate || rowTime >= new Date(startDate).getTime()
      const matchesEnd = !endDate || rowTime <= new Date(endDate).getTime()
      return matchesQuery && matchesCompany && matchesStatus && matchesType && matchesStart && matchesEnd
    })
  }, [company, endDate, offerType, query, scopedRows, startDate, status])

  const totalCount = filteredRows.length
  const waitingCount = filteredRows.filter((row) => row.status === 'Hazirlaniyor' || row.status === 'Gonderildi').length
  const approvedCount = filteredRows.filter((row) => row.status === 'Onaylandi').length
  const rejectedCount = filteredRows.filter((row) => row.status === 'Reddedildi').length

  const handleSaveOffer = () => {
    if (!activeForm) {
      return
    }

    if (!activeForm.company.trim() || !activeForm.title.trim() || !activeForm.amount.trim() || !activeForm.owner.trim() || !activeForm.type.trim()) {
      return
    }

    const now = new Date()
    const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`

    const nextBaseRow: OfferRow = {
      ...activeForm,
      updatedAt: today,
      createdAt: rows.some((row) => row.id === activeForm.id) ? activeForm.createdAt : today,
    }

    const nextRow: OfferRow =
      currentUser?.role === 'BUYER'
        ? { ...nextBaseRow, company: currentUser.company, owner: currentUser.fullName }
        : currentUser?.role === 'MANUFACTURER'
          ? { ...nextBaseRow, manufacturerCompany: currentUser.company, owner: currentUser.fullName }
          : nextBaseRow

    const exists = rows.some((row) => row.id === nextRow.id)
    workflowActions.saveOffer(nextRow)
    setFeedbackMessage(exists ? 'Teklif guncellendi.' : 'Yeni teklif kaydedildi.')

    setActiveForm(null)
  }

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  return (
    <section className="workspace-main dashboard-main offers-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="offers-header-row">
          <header className="workspace-header glass-card dashboard-hero offers-hero">
            <div>
              <p className="eyebrow">Teklif Yonetimi</p>
              <h2>Teklif Yonetimi</h2>
              <p>Hazirlanan teklifleri takip edin, filtreleyin ve musteri durumuna gore hizla aksiyon alin.</p>
            </div>
          </header>

          <button type="button" className="solid-btn offer-create-btn" onClick={() => setActiveForm(buildOfferForm(scopedRows))}>
            + Yeni Teklif Olustur
          </button>
        </section>

        <section className="stat-grid offers-stats-grid">
          <article className="glass-card stat-card offer-stat-card">
            <span>Toplam Teklif</span>
            <strong>{totalCount}</strong>
            <small>Aktif teklif havuzu</small>
          </article>
          <article className="glass-card stat-card offer-stat-card">
            <span>Bekleyen Teklif</span>
            <strong>{waitingCount}</strong>
            <small>Hazirlama ve gonderim surecinde</small>
          </article>
          <article className="glass-card stat-card offer-stat-card">
            <span>Onaylanan</span>
            <strong>{approvedCount}</strong>
            <small>Onaya donusen teklifler</small>
          </article>
          <article className="glass-card stat-card offer-stat-card">
            <span>Reddedilen</span>
            <strong>{rejectedCount}</strong>
            <small>Revize ihtiyaci olanlar</small>
          </article>
        </section>

        <section className="glass-card panel offers-filter-panel">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="offers-filter-grid">
            <label className="offers-filter-field offers-filter-search">
              <span>Global Arama</span>
              <input type="search" value={query} placeholder="Teklif, firma veya hazirlayan ara" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="offers-filter-field">
              <span>Firma</span>
              <select value={company} onChange={(event) => setCompany(event.target.value)}>
                {offerCompanyOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="offers-filter-field">
              <span>Teklif Durumu</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | OfferStatus)}>
                {offerStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="offers-filter-field">
              <span>Teklif Turu</span>
              <select value={offerType} onChange={(event) => setOfferType(event.target.value)}>
                {offerTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="offers-filter-field offers-date-range">
              <span>Tarih Araligi</span>
              <div className="offers-date-inputs">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card panel offers-table-panel">
          <header className="panel-header offers-table-head">
            <div>
              <h3>Teklif Listesi</h3>
              <p>{filteredRows.length} kayit gosteriliyor</p>
            </div>
          </header>

          {feedbackMessage && <p className="ui-feedback-message settings-feedback-message">{feedbackMessage}</p>}

          <div className="table-wrap offers-table-wrap">
            <table className="offers-table">
              <thead>
                <tr>
                  <th>Teklif No</th>
                  <th>Firma</th>
                  <th>Teklif Basligi</th>
                  <th>Toplam Tutar</th>
                  <th>Hazirlayan</th>
                  <th>Durum</th>
                  <th>Olusturma Tarihi</th>
                  <th>Son Guncelleme</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Teklif No">{row.id}</td>
                    <td data-label="Firma">{row.company}</td>
                    <td data-label="Teklif Basligi">{row.title}</td>
                    <td data-label="Toplam Tutar">{row.amount}</td>
                    <td data-label="Hazirlayan">{row.owner}</td>
                    <td data-label="Durum">
                      <OfferStatusBadge status={row.status} />
                    </td>
                    <td data-label="Olusturma Tarihi">{row.createdAt}</td>
                    <td data-label="Son Guncelleme">{row.updatedAt}</td>
                    <td data-label="Islemler">
                      <div className="offer-row-actions">
                        <button type="button" className="ghost-btn offer-action-btn" onClick={() => setViewRow(row)} aria-label="Goruntule">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        <button type="button" className="ghost-btn offer-action-btn" onClick={() => setActiveForm(buildOfferForm(scopedRows, row))} aria-label="Duzenle">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                              <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        <button type="button" className="ghost-btn offer-action-btn offer-action-danger" onClick={() => setDeleteRow(row)} aria-label="Sil">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M9 5h6M5 8h14M9 10v6M15 10v6M7 8l1 11h8l1-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <RequestModal
          open={Boolean(activeForm)}
          title={scopedRows.some((row) => row.id === activeForm?.id) ? 'Teklif Duzenle' : 'Yeni Teklif'}
          onClose={() => setActiveForm(null)}
          footer={
            <>
              <button type="button" className="ghost-btn" onClick={() => setActiveForm(null)}>
                Iptal
              </button>
              <button type="button" className="solid-btn" onClick={handleSaveOffer}>
                {scopedRows.some((row) => row.id === activeForm?.id) ? 'Guncelle' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeForm && (
            <div className="request-form-grid">
              <label>
                Teklif No
                <input type="text" value={activeForm.id} readOnly />
              </label>
              <label>
                Firma
                <select value={activeForm.company} onChange={(event) => setActiveForm((current) => (current ? { ...current, company: event.target.value } : current))}>
                  {['Tum Firmalar', ...new Set(scopedRows.map((row) => row.company))].filter((item) => item !== 'Tum Firmalar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-width">
                Teklif Basligi
                <input type="text" value={activeForm.title} onChange={(event) => setActiveForm((current) => (current ? { ...current, title: event.target.value } : current))} />
              </label>
              <label>
                Toplam Tutar
                <input type="text" value={activeForm.amount} onChange={(event) => setActiveForm((current) => (current ? { ...current, amount: event.target.value } : current))} />
              </label>
              <label>
                Hazirlayan
                <input type="text" value={activeForm.owner} onChange={(event) => setActiveForm((current) => (current ? { ...current, owner: event.target.value } : current))} />
              </label>
              <label>
                Teklif Turu
                <select value={activeForm.type} onChange={(event) => setActiveForm((current) => (current ? { ...current, type: event.target.value } : current))}>
                  {offerTypes.filter((item) => item !== 'Tum Teklif Turleri').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Durum
                <select value={activeForm.status} onChange={(event) => setActiveForm((current) => (current ? { ...current, status: event.target.value as OfferStatus } : current))}>
                  {offerStatuses.filter((item) => item !== 'Tum Durumlar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Olusturma Tarihi
                <input
                  type="date"
                  value={toInputDate(activeForm.createdAt)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, createdAt: toDisplayDate(event.target.value) } : current))}
                />
              </label>
              <label>
                Son Guncelleme
                <input type="text" value={activeForm.updatedAt} readOnly />
              </label>
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(viewRow)}
          title="Teklif Detayi"
          onClose={() => setViewRow(null)}
          footer={
            <button type="button" className="solid-btn" onClick={() => setViewRow(null)}>
              Kapat
            </button>
          }
        >
          {viewRow && (
            <div className="request-detail-grid">
              <article className="request-detail-card">
                <span>Teklif No</span>
                <strong>{viewRow.id}</strong>
              </article>
              <article className="request-detail-card">
                <span>Firma</span>
                <strong>{viewRow.company}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Teklif Basligi</span>
                <strong>{viewRow.title}</strong>
              </article>
              <article className="request-detail-card">
                <span>Toplam Tutar</span>
                <strong>{viewRow.amount}</strong>
              </article>
              <article className="request-detail-card">
                <span>Hazirlayan</span>
                <strong>{viewRow.owner}</strong>
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <OfferStatusBadge status={viewRow.status} />
              </article>
              <article className="request-detail-card">
                <span>Teklif Turu</span>
                <strong>{viewRow.type}</strong>
              </article>
              <article className="request-detail-card">
                <span>Olusturma Tarihi</span>
                <strong>{viewRow.createdAt}</strong>
              </article>
              <article className="request-detail-card">
                <span>Son Guncelleme</span>
                <strong>{viewRow.updatedAt}</strong>
              </article>
            </div>
          )}
        </RequestModal>

        <DeleteConfirmationModal
          open={Boolean(deleteRow)}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => {
            if (!deleteRow) {
              return
            }

            workflowActions.deleteOffer(deleteRow.id)
            setDeleteRow(null)
            setFeedbackMessage('Teklif silindi.')
          }}
        />
      </ScreenStateGate>
    </section>
  )
}

interface OrderApiWorkspaceProps {
  currentUser: AuthenticatedUser | null
}

interface ProductionPlanForm {
  productionLine: string
  plannedStartDate: string
  dueDate: string
  notes: string
}

function OrderApiWorkspace({ currentUser }: OrderApiWorkspaceProps) {
  const [orders, setOrders] = useState<ApiOrderView[]>([])
  const [listState, setListState] = useState<ScreenState>('loading')
  const [detail, setDetail] = useState<ApiOrderView | null>(null)
  const [detailState, setDetailState] = useState<'steady' | 'loading' | 'error'>('steady')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | ApiOrderStatus>('ALL')
  const [operation, setOperation] = useState<string | null>(null)
  const [cancelOrder, setCancelOrder] = useState<ApiOrderView | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [planningOrder, setPlanningOrder] = useState<ApiOrderView | null>(null)
  const [planForm, setPlanForm] = useState<ProductionPlanForm>({ productionLine: '', plannedStartDate: '', dueDate: '', notes: '' })
  const [plannedOrderIds, setPlannedOrderIds] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState('')
  const canRead = hasPermission(currentUser, 'orders.read')
  const canConfirm = hasPermission(currentUser, 'orders.confirm')
  const canCancel = hasPermission(currentUser, 'orders.cancel')
  const canReadProductions = hasPermission(currentUser, 'productions.read')
  const canPlanProduction = hasPermission(currentUser, 'productions.create')
    && canWriteView(currentUser?.role ?? 'BUYER', 'production')

  const loadOrders = useCallback(async () => {
    if (!canRead) {
      setOrders([])
      setListState('steady')
      return []
    }
    setListState('loading')
    try {
      const loaded = await ordersApi.list()
      setOrders(loaded)
      setListState(loaded.length === 0 ? 'empty' : 'steady')
      return loaded
    } catch {
      setOrders([])
      setListState('error')
      return []
    }
  }, [canRead])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  const loadPlannedOrderIds = useCallback(async () => {
    if (!canReadProductions) {
      setPlannedOrderIds(new Set())
      return []
    }
    try {
      const loaded = await productionsApi.list()
      setPlannedOrderIds(new Set(loaded.map((production) => production.orderId)))
      return loaded
    } catch {
      return []
    }
  }, [canReadProductions])

  useEffect(() => {
    void loadPlannedOrderIds()
  }, [loadPlannedOrderIds])

  const loadDetail = async (orderId: string) => {
    setDetailState('loading')
    setDetail(null)
    try {
      const loaded = await ordersApi.get(orderId)
      setDetail(loaded)
      setDetailState('steady')
      return loaded
    } catch (error) {
      setDetailState('error')
      setFeedback(orderErrorMessage(error))
      return null
    }
  }

  const refreshAuthority = async (order: ApiOrderView) => {
    await Promise.all([
      loadOrders(),
      detail?.id === order.id ? loadDetail(order.id) : Promise.resolve(null),
      requestsApi.get(order.requestId).catch(() => null),
      quotationsApi.get(order.quotationId).catch(() => null),
    ])
  }

  const handleConfirm = async (order: ApiOrderView) => {
    if (operation) return
    setOperation(`confirm:${order.id}`)
    try {
      await ordersApi.confirm(order.id, order.version)
      setFeedback('Siparis onaylandi.')
      await refreshAuthority(order)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('Siparis baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        await refreshAuthority(order)
      } else {
        setFeedback(orderErrorMessage(error))
      }
    } finally {
      setOperation(null)
    }
  }

  const handleCancel = async () => {
    if (!cancelOrder || operation) return
    const reason = cancellationReason.trim()
    setOperation(`cancel:${cancelOrder.id}`)
    try {
      await ordersApi.cancel(cancelOrder.id, cancelOrder.version, reason || undefined)
      setFeedback('Siparis iptal edildi.')
      setCancelOrder(null)
      setCancellationReason('')
      await refreshAuthority(cancelOrder)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('Siparis baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        setCancelOrder(null)
        setCancellationReason('')
        await refreshAuthority(cancelOrder)
      } else {
        setFeedback(orderErrorMessage(error))
      }
    } finally {
      setOperation(null)
    }
  }

  const openProductionPlan = (order: ApiOrderView) => {
    setPlanningOrder(order)
    setPlanForm({
      productionLine: '',
      plannedStartDate: '',
      dueDate: order.promisedDeliveryDate?.slice(0, 10) ?? '',
      notes: '',
    })
  }

  const refreshProductionPlanAuthority = async (order: ApiOrderView, productionId?: string) => {
    await Promise.all([
      loadOrders(),
      ordersApi.get(order.id).then((loaded) => {
        if (detail?.id === loaded.id) setDetail(loaded)
      }).catch(() => null),
      loadPlannedOrderIds(),
      productionId ? productionsApi.get(productionId).catch(() => null) : Promise.resolve(null),
    ])
  }

  const handlePlanProduction = async () => {
    if (!planningOrder || operation) return
    setOperation(`plan:${planningOrder.id}`)
    try {
      const created = await productionsApi.create(planningOrder.id, {
        orderVersion: planningOrder.version,
        productionLine: planForm.productionLine.trim() || undefined,
        plannedStartDate: planForm.plannedStartDate || undefined,
        dueDate: planForm.dueDate || undefined,
        notes: planForm.notes.trim() || undefined,
      })
      setFeedback('Uretim plani olusturuldu.')
      setPlanningOrder(null)
      await refreshProductionPlanAuthority(planningOrder, created.id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('Uretim plani baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        setPlanningOrder(null)
        await refreshProductionPlanAuthority(planningOrder)
      } else {
        setFeedback(productionErrorMessage(error))
      }
    } finally {
      setOperation(null)
    }
  }

  const filteredOrders = orders.filter((order) => {
    const search = `${order.orderNumber} ${order.request.requestNumber} ${order.quotation.quotationNumber} ${order.company.legalName} ${order.company.tradeName ?? ''} ${order.manufacturerCompany.legalName} ${order.manufacturerCompany.tradeName ?? ''}`.toLowerCase()
    return (!query.trim() || search.includes(query.trim().toLowerCase()))
      && (status === 'ALL' || order.status === status)
  })

  return (
    <section className="workspace-main dashboard-main orders-page order-api-page">
      <section className="orders-header-row">
        <header className="workspace-header glass-card dashboard-hero orders-hero">
          <div><p className="eyebrow">Siparis Yonetimi</p><h2>Siparisler</h2><p>Kabul edilen tekliflerden olusan guncel siparis kayitlari.</p></div>
        </header>
      </section>

      {!canRead && <div className="request-items-empty">Siparisleri goruntuleme yetkiniz bulunmuyor.</div>}
      {canRead && (
        <ScreenStateGate state={listState} onRetry={() => void loadOrders()}>
          <section className="stat-grid orders-stats-grid">
            <article className="glass-card stat-card"><span>Toplam</span><strong>{orders.length}</strong><small>Tum siparisler</small></article>
            <article className="glass-card stat-card"><span>Onay Bekleyen</span><strong>{orders.filter((order) => order.status === 'PENDING_CONFIRMATION').length}</strong><small>Uretici onayi bekliyor</small></article>
            <article className="glass-card stat-card"><span>Onaylanan</span><strong>{orders.filter((order) => order.status === 'CONFIRMED').length}</strong><small>Onayi tamamlanan</small></article>
            <article className="glass-card stat-card"><span>Iptal Edilen</span><strong>{orders.filter((order) => order.status === 'CANCELLED').length}</strong><small>Iptal kayitlari</small></article>
          </section>

          <section className="glass-card panel orders-filter-panel">
            <header className="panel-header"><h3>Filtreler</h3></header>
            <div className="orders-filter-grid order-api-filters">
              <label className="orders-filter-field orders-filter-search"><span>Arama</span><input type="search" value={query} placeholder="Siparis, talep, teklif veya firma ara" onChange={(event) => setQuery(event.target.value)} /></label>
              <label className="orders-filter-field"><span>Durum</span><select value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | ApiOrderStatus)}><option value="ALL">Tum Durumlar</option>{(Object.keys(ORDER_STATUS_LABELS) as ApiOrderStatus[]).map((item) => <option key={item} value={item}>{ORDER_STATUS_LABELS[item]}</option>)}</select></label>
            </div>
          </section>

          <section className="glass-card panel orders-table-panel">
            <header className="panel-header orders-table-head"><div><h3>Siparis Listesi</h3><p>{filteredOrders.length} kayit gosteriliyor</p></div></header>
            {feedback && <p className="ui-feedback-message settings-feedback-message" role="status">{feedback}</p>}
            <div className="table-wrap orders-table-wrap">
              <table className="orders-table order-api-table">
                <thead><tr><th>Siparis No</th><th>Alici</th><th>Uretici</th><th>Tutar</th><th>Termin</th><th>Durum</th><th>Islem</th></tr></thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderNumber}<small>{order.request.requestNumber}</small></td>
                      <td>{order.company.tradeName ?? order.company.legalName}</td>
                      <td>{order.manufacturerCompany.tradeName ?? order.manufacturerCompany.legalName}</td>
                      <td>{order.currency} {order.totalAmount}</td>
                      <td>{formatApiDate(order.promisedDeliveryDate)}</td>
                      <td><span className={`request-badge order-status-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                      <td><div className="request-row-actions"><button type="button" className="ghost-btn request-action-btn" onClick={() => void loadDetail(order.id)}>Goruntule</button>{order.status === 'PENDING_CONFIRMATION' && canConfirm && <button type="button" className="solid-btn request-action-btn" disabled={Boolean(operation)} onClick={() => void handleConfirm(order)}>Onayla</button>}{order.status === 'PENDING_CONFIRMATION' && canCancel && <button type="button" className="ghost-btn request-action-btn request-action-danger" disabled={Boolean(operation)} onClick={() => { setCancelOrder(order); setCancellationReason('') }}>Iptal Et</button>}{order.status === 'CONFIRMED' && canPlanProduction && !plannedOrderIds.has(order.id) && <button type="button" className="solid-btn request-action-btn" disabled={Boolean(operation)} onClick={() => openProductionPlan(order)}>Uretim Planla</button>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </ScreenStateGate>
      )}

      <RequestModal
        open={detailState === 'loading' || detailState === 'error' || Boolean(detail)}
        title="Siparis Detayi"
        onClose={() => { setDetail(null); setDetailState('steady') }}
        footer={(
          <>
            {detail?.status === 'PENDING_CONFIRMATION' && canConfirm && <button type="button" className="solid-btn" disabled={Boolean(operation)} onClick={() => void handleConfirm(detail)}>Onayla</button>}
            {detail?.status === 'PENDING_CONFIRMATION' && canCancel && <button type="button" className="ghost-btn request-action-danger" disabled={Boolean(operation)} onClick={() => { setCancelOrder(detail); setCancellationReason('') }}>Iptal Et</button>}
            {detail?.status === 'CONFIRMED' && canPlanProduction && !plannedOrderIds.has(detail.id) && <button type="button" className="solid-btn" disabled={Boolean(operation)} onClick={() => openProductionPlan(detail)}>Uretim Planla</button>}
            <button type="button" className="ghost-btn" onClick={() => { setDetail(null); setDetailState('steady') }}>Kapat</button>
          </>
        )}
      >
        {detailState === 'loading' && <div className="request-detail-state">Siparis detayi yukleniyor...</div>}
        {detailState === 'error' && <div className="request-detail-state error">Siparis detayi yuklenemedi.</div>}
        {detail && detailState === 'steady' && (
          <div className="request-detail-grid">
            <article className="request-detail-card"><span>Siparis No</span><strong>{detail.orderNumber}</strong></article>
            <article className="request-detail-card"><span>Durum</span><strong>{ORDER_STATUS_LABELS[detail.status]}</strong></article>
            <article className="request-detail-card"><span>Talep</span><strong>{detail.request.requestNumber}</strong></article>
            <article className="request-detail-card"><span>Teklif</span><strong>{detail.quotation.quotationNumber}</strong></article>
            <article className="request-detail-card"><span>Alici</span><strong>{detail.company.tradeName ?? detail.company.legalName}</strong></article>
            <article className="request-detail-card"><span>Uretici</span><strong>{detail.manufacturerCompany.tradeName ?? detail.manufacturerCompany.legalName}</strong></article>
            <article className="request-detail-card"><span>Toplam</span><strong>{detail.currency} {detail.totalAmount}</strong></article>
            <article className="request-detail-card"><span>Termin</span><strong>{formatApiDate(detail.promisedDeliveryDate)}</strong></article>
            <article className="request-detail-card"><span>Olusturulma</span><strong>{formatApiDate(detail.createdAt)}</strong></article>
            <article className="request-detail-card"><span>Onaylanma</span><strong>{formatApiDate(detail.confirmedAt)}</strong></article>
            <article className="request-detail-card"><span>Iptal</span><strong>{formatApiDate(detail.cancelledAt)}</strong></article>
            {detail.cancellationReason && <article className="request-detail-card full-width"><span>Iptal Nedeni</span><p>{detail.cancellationReason}</p></article>}
          </div>
        )}
      </RequestModal>

      <RequestModal open={Boolean(cancelOrder)} title="Siparisi Iptal Et" onClose={() => !operation && setCancelOrder(null)} footer={<><button type="button" className="ghost-btn" disabled={Boolean(operation)} onClick={() => setCancelOrder(null)}>Vazgec</button><button type="button" className="solid-btn danger-btn" disabled={Boolean(operation)} onClick={() => void handleCancel()}>{operation ? 'Iptal ediliyor...' : 'Siparisi Iptal Et'}</button></>}>
        <div className="request-form-grid"><label className="full-width">Iptal Nedeni (istege bagli)<textarea rows={4} maxLength={500} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></label></div>
      </RequestModal>

      <RequestModal open={Boolean(planningOrder)} title="Uretim Planla" onClose={() => !operation && setPlanningOrder(null)} footer={<><button type="button" className="ghost-btn" disabled={Boolean(operation)} onClick={() => setPlanningOrder(null)}>Vazgec</button><button type="button" className="solid-btn" disabled={Boolean(operation)} onClick={() => void handlePlanProduction()}>{operation ? 'Planlaniyor...' : 'Uretimi Planla'}</button></>}>
        <div className="request-form-grid">
          <label>Uretim Hatti<input value={planForm.productionLine} maxLength={100} onChange={(event) => setPlanForm((current) => ({ ...current, productionLine: event.target.value }))} /></label>
          <label>Planlanan Baslangic<input type="date" value={planForm.plannedStartDate} onChange={(event) => setPlanForm((current) => ({ ...current, plannedStartDate: event.target.value }))} /></label>
          <label>Termin<input type="date" value={planForm.dueDate} onChange={(event) => setPlanForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
          <label className="full-width">Not<textarea rows={4} maxLength={1000} value={planForm.notes} onChange={(event) => setPlanForm((current) => ({ ...current, notes: event.target.value }))} /></label>
        </div>
      </RequestModal>
    </section>
  )
}

function orderErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bu siparis islemi icin yetkiniz bulunmuyor.'
    if (error.status === 404) return 'Siparis bulunamadi veya erisim kapsaminizin disinda.'
    if (error.status === 409) return 'Siparis baska bir islem nedeniyle degisti.'
  }
  return 'Siparis islemi tamamlanamadi. Backend baglantisini kontrol edin.'
}

export function SiparislerPage(props: WorkspacePageProps) {
  if (props.currentUser?.backendRole) {
    return <OrderApiWorkspace currentUser={props.currentUser} />
  }
  return <LegacySiparislerPage {...props} />
}

function LegacySiparislerPage({ state, onRetry, currentUser, workflow, workflowActions }: WorkspacePageProps) {
  const rows = workflow.orders
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState('Tum Firmalar')
  const [status, setStatus] = useState<'Tum Durumlar' | OrderStatus>('Tum Durumlar')
  const [orderType, setOrderType] = useState('Tum Siparis Turleri')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeForm, setActiveForm] = useState<OrderFormState | null>(null)
  const [viewRow, setViewRow] = useState<OrderRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<OrderRow | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const scopedRows = useMemo(() => scopeRowsByCompany(rows, currentUser), [rows, currentUser])
  const orderCompanyOptions = useMemo(() => ['Tum Firmalar', ...new Set(scopedRows.map((row) => row.company))], [scopedRows])

  const filteredRows = useMemo(() => {
    return scopedRows.filter((row) => {
      const matchesQuery = !query.trim() || `${row.id} ${row.company} ${row.type} ${row.title} ${row.owner}`.toLowerCase().includes(query.toLowerCase())
      const matchesCompany = company === 'Tum Firmalar' || row.company === company
      const matchesStatus = status === 'Tum Durumlar' || row.status === status
      const matchesType = orderType === 'Tum Siparis Turleri' || row.type === orderType
      const rowTime = new Date(row.createdAt.split('.').reverse().join('-')).getTime()
      const matchesStart = !startDate || rowTime >= new Date(startDate).getTime()
      const matchesEnd = !endDate || rowTime <= new Date(endDate).getTime()
      return matchesQuery && matchesCompany && matchesStatus && matchesType && matchesStart && matchesEnd
    })
  }, [company, endDate, orderType, query, scopedRows, startDate, status])

  const totalCount = filteredRows.length
  const preparingCount = filteredRows.filter((row) => row.status === 'Bekliyor' || row.status === 'Sevkiyata Hazir').length
  const shippedCount = filteredRows.filter((row) => row.status === 'Uretimde').length
  const completedCount = filteredRows.filter((row) => row.status === 'Teslim Edildi').length

  const handleSaveOrder = () => {
    if (!activeForm) {
      return
    }

    if (!activeForm.company.trim() || !activeForm.type.trim() || !activeForm.title.trim() || !activeForm.owner.trim()) {
      return
    }

    const nextBaseRow: OrderRow = {
      ...activeForm,
    }

    const nextRow: OrderRow =
      currentUser?.role === 'BUYER'
        ? { ...nextBaseRow, company: currentUser.company, owner: currentUser.fullName }
        : currentUser?.role === 'MANUFACTURER'
          ? { ...nextBaseRow, manufacturerCompany: currentUser.company, owner: currentUser.fullName }
          : nextBaseRow

    const exists = rows.some((row) => row.id === nextRow.id)
    workflowActions.saveOrder(nextRow)
    setFeedbackMessage(exists ? 'Siparis guncellendi.' : 'Yeni siparis kaydedildi.')

    setActiveForm(null)
  }

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  return (
    <section className="workspace-main dashboard-main orders-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="orders-header-row">
          <header className="workspace-header glass-card dashboard-hero orders-hero">
            <div>
              <p className="eyebrow">Siparis Yonetimi</p>
              <h2>Siparis Yonetimi</h2>
              <p>Onaylanan siparisleri uretim ve sevkiyat sureclerine hazirlayin.</p>
            </div>
          </header>

          <button type="button" className="solid-btn order-create-btn" onClick={() => setActiveForm(buildOrderForm(scopedRows))}>
            + Yeni Siparis Olustur
          </button>
        </section>

        <section className="stat-grid orders-stats-grid">
          <article className="glass-card stat-card order-stat-card">
            <span>Toplam Siparis</span>
            <strong>{totalCount}</strong>
            <small>Aktif siparis havuzu</small>
          </article>
          <article className="glass-card stat-card order-stat-card">
            <span>Hazirlanan</span>
            <strong>{preparingCount}</strong>
            <small>Hazirlama ve sevk oncesi surecte</small>
          </article>
          <article className="glass-card stat-card order-stat-card">
            <span>Sevk Edilen</span>
            <strong>{shippedCount}</strong>
            <small>Lojistige devredilen siparisler</small>
          </article>
          <article className="glass-card stat-card order-stat-card">
            <span>Tamamlanan</span>
            <strong>{completedCount}</strong>
            <small>Sevkiyata hazir siparisler</small>
          </article>
        </section>

        <section className="glass-card panel orders-filter-panel">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="orders-filter-grid">
            <label className="orders-filter-field orders-filter-search">
              <span>Global Arama</span>
              <input type="search" value={query} placeholder="Siparis, firma veya sorumlu ara" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="orders-filter-field">
              <span>Firma</span>
              <select value={company} onChange={(event) => setCompany(event.target.value)}>
                {orderCompanyOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="orders-filter-field">
              <span>Siparis Durumu</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | OrderStatus)}>
                {orderStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="orders-filter-field">
              <span>Siparis Turu</span>
              <select value={orderType} onChange={(event) => setOrderType(event.target.value)}>
                {orderTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="orders-filter-field orders-date-range">
              <span>Tarih Araligi</span>
              <div className="orders-date-inputs">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card panel orders-table-panel">
          <header className="panel-header orders-table-head">
            <div>
              <h3>Siparis Listesi</h3>
              <p>{filteredRows.length} kayit gosteriliyor</p>
            </div>
          </header>

          {feedbackMessage && <p className="ui-feedback-message settings-feedback-message">{feedbackMessage}</p>}

          <div className="table-wrap orders-table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Siparis No</th>
                  <th>Firma</th>
                  <th>Siparis Turu</th>
                  <th>Siparis Basligi</th>
                  <th>Termin Tarihi</th>
                  <th>Sorumlu</th>
                  <th>Durum</th>
                  <th>Olusturma Tarihi</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Siparis No">{row.id}</td>
                    <td data-label="Firma">{row.company}</td>
                    <td data-label="Siparis Turu">{row.type}</td>
                    <td data-label="Siparis Basligi">{row.title}</td>
                    <td data-label="Termin Tarihi">{row.dueDate}</td>
                    <td data-label="Sorumlu">{row.owner}</td>
                    <td data-label="Durum">
                      <OrderStatusBadge status={row.status} />
                    </td>
                    <td data-label="Olusturma Tarihi">{row.createdAt}</td>
                    <td data-label="Islemler">
                      <div className="order-row-actions">
                        <button type="button" className="ghost-btn order-action-btn" onClick={() => setViewRow(row)} aria-label="Goruntule">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        <button type="button" className="ghost-btn order-action-btn" onClick={() => setActiveForm(buildOrderForm(scopedRows, row))} aria-label="Duzenle">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                              <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        <button type="button" className="ghost-btn order-action-btn order-action-danger" onClick={() => setDeleteRow(row)} aria-label="Sil">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M9 5h6M5 8h14M9 10v6M15 10v6M7 8l1 11h8l1-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <RequestModal
          open={Boolean(activeForm)}
          title={scopedRows.some((row) => row.id === activeForm?.id) ? 'Siparis Duzenle' : 'Yeni Siparis'}
          onClose={() => setActiveForm(null)}
          footer={
            <>
              <button type="button" className="ghost-btn" onClick={() => setActiveForm(null)}>
                Iptal
              </button>
              <button type="button" className="solid-btn" onClick={handleSaveOrder}>
                {scopedRows.some((row) => row.id === activeForm?.id) ? 'Guncelle' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeForm && (
            <div className="request-form-grid">
              <label>
                Siparis No
                <input type="text" value={activeForm.id} readOnly />
              </label>
              <label>
                Firma
                <select value={activeForm.company} onChange={(event) => setActiveForm((current) => (current ? { ...current, company: event.target.value } : current))}>
                  {['Tum Firmalar', ...new Set(scopedRows.map((row) => row.company))].filter((item) => item !== 'Tum Firmalar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Siparis Turu
                <select value={activeForm.type} onChange={(event) => setActiveForm((current) => (current ? { ...current, type: event.target.value } : current))}>
                  {orderTypes.filter((item) => item !== 'Tum Siparis Turleri').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Durum
                <select value={activeForm.status} onChange={(event) => setActiveForm((current) => (current ? { ...current, status: event.target.value as OrderStatus } : current))}>
                  {orderStatuses.filter((item) => item !== 'Tum Durumlar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-width">
                Siparis Basligi
                <input type="text" value={activeForm.title} onChange={(event) => setActiveForm((current) => (current ? { ...current, title: event.target.value } : current))} />
              </label>
              <label>
                Sorumlu
                <input type="text" value={activeForm.owner} onChange={(event) => setActiveForm((current) => (current ? { ...current, owner: event.target.value } : current))} />
              </label>
              <label>
                Termin Tarihi
                <input
                  type="date"
                  value={toInputDate(activeForm.dueDate)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, dueDate: toDisplayDate(event.target.value) } : current))}
                />
              </label>
              <label>
                Olusturma Tarihi
                <input
                  type="date"
                  value={toInputDate(activeForm.createdAt)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, createdAt: toDisplayDate(event.target.value) } : current))}
                />
              </label>
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(viewRow)}
          title="Siparis Detayi"
          onClose={() => setViewRow(null)}
          footer={
            <button type="button" className="solid-btn" onClick={() => setViewRow(null)}>
              Kapat
            </button>
          }
        >
          {viewRow && (
            <div className="request-detail-grid">
              <article className="request-detail-card">
                <span>Siparis No</span>
                <strong>{viewRow.id}</strong>
              </article>
              <article className="request-detail-card">
                <span>Firma</span>
                <strong>{viewRow.company}</strong>
              </article>
              <article className="request-detail-card">
                <span>Siparis Turu</span>
                <strong>{viewRow.type}</strong>
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <OrderStatusBadge status={viewRow.status} />
              </article>
              <article className="request-detail-card full-width">
                <span>Siparis Basligi</span>
                <strong>{viewRow.title}</strong>
              </article>
              <article className="request-detail-card">
                <span>Sorumlu</span>
                <strong>{viewRow.owner}</strong>
              </article>
              <article className="request-detail-card">
                <span>Termin Tarihi</span>
                <strong>{viewRow.dueDate}</strong>
              </article>
              <article className="request-detail-card">
                <span>Olusturma Tarihi</span>
                <strong>{viewRow.createdAt}</strong>
              </article>
            </div>
          )}
        </RequestModal>

        <DeleteConfirmationModal
          open={Boolean(deleteRow)}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => {
            if (!deleteRow) {
              return
            }

            workflowActions.deleteOrder(deleteRow.id)
            setDeleteRow(null)
            setFeedbackMessage('Siparis silindi.')
          }}
        />
      </ScreenStateGate>
    </section>
  )
}

function productionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bu uretim islemi icin yetkiniz bulunmuyor.'
    if (error.status === 404) return 'Uretim kaydi bulunamadi veya erisim kapsaminizin disinda.'
    if (error.status === 409) return 'Uretim kaydi baska bir islem nedeniyle degisti.'
  }
  return 'Uretim islemi tamamlanamadi. Lutfen yeniden deneyin.'
}

function productionCompanyName(company: { legalName: string; tradeName: string | null }): string {
  return company.tradeName ?? company.legalName
}

interface ProductionApiWorkspaceProps {
  currentUser: AuthenticatedUser | null
}

function ProductionApiWorkspace({ currentUser }: ProductionApiWorkspaceProps) {
  const [productions, setProductions] = useState<ApiProductionView[]>([])
  const [listState, setListState] = useState<ScreenState>('loading')
  const [detail, setDetail] = useState<ApiProductionView | null>(null)
  const [detailState, setDetailState] = useState<'steady' | 'loading' | 'error'>('steady')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | ApiProductionStatus>('ALL')
  const [operation, setOperation] = useState<string | null>(null)
  const [reasonAction, setReasonAction] = useState<{
    production: ApiProductionView
    toStatus: 'ON_HOLD' | 'CANCELLED'
  } | null>(null)
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const canRead = hasPermission(currentUser, 'productions.read')
  const canWrite = canWriteView(currentUser?.role ?? 'BUYER', 'production')
  const canTransition = hasPermission(currentUser, 'productions.transition') && canWrite

  const loadProductions = useCallback(async () => {
    if (!canRead) {
      setProductions([])
      setListState('steady')
      return []
    }
    setListState('loading')
    try {
      const loaded = await productionsApi.list()
      setProductions(loaded)
      setListState(loaded.length === 0 ? 'empty' : 'steady')
      return loaded
    } catch {
      setProductions([])
      setListState('error')
      return []
    }
  }, [canRead])

  useEffect(() => {
    void loadProductions()
  }, [loadProductions])

  const loadDetail = async (productionId: string) => {
    setDetailState('loading')
    try {
      const loaded = await productionsApi.get(productionId)
      setDetail(loaded)
      setDetailState('steady')
      return loaded
    } catch (error) {
      setDetail(null)
      setDetailState('error')
      setFeedback(productionErrorMessage(error))
      return null
    }
  }

  const refreshAuthority = async (production: ApiProductionView) => {
    await Promise.all([
      loadProductions(),
      loadDetail(production.id),
      ordersApi.get(production.orderId).catch(() => null),
    ])
  }

  const handleTransition = async (
    production: ApiProductionView,
    toStatus: ApiProductionStatus,
    transitionReason?: string,
  ) => {
    if (operation) return
    setOperation(`transition:${production.id}`)
    try {
      const updated = await productionsApi.transition(production.id, {
        version: production.version,
        toStatus,
        reason: transitionReason,
      })
      setFeedback('Uretim durumu guncellendi.')
      setReasonAction(null)
      setReason('')
      await refreshAuthority(updated)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('Uretim kaydi baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        setReasonAction(null)
        setReason('')
        await refreshAuthority(production)
      } else {
        setFeedback(productionErrorMessage(error))
      }
    } finally {
      setOperation(null)
    }
  }

  const openReasonAction = (
    production: ApiProductionView,
    toStatus: 'ON_HOLD' | 'CANCELLED',
  ) => {
    setReason('')
    setReasonAction({ production, toStatus })
  }

  const filteredProductions = productions.filter((production) => {
    const search = `${production.order.orderNumber} ${production.productionNumber} ${production.order.request.requestNumber} ${production.order.request.title} ${production.order.request.productType} ${productionCompanyName(production.order.company)} ${production.productionLine ?? ''}`.toLowerCase()
    return (!query.trim() || search.includes(query.trim().toLowerCase()))
      && (status === 'ALL' || production.status === status)
  })

  const renderActions = (production: ApiProductionView) => {
    if (!canTransition) return null
    return (
      <>
        {production.status === 'PLANNED' && <button type="button" className="solid-btn production-action-btn" disabled={Boolean(operation)} onClick={() => void handleTransition(production, 'IN_PROGRESS')}>Uretimi Baslat</button>}
        {production.status === 'IN_PROGRESS' && <button type="button" className="ghost-btn production-action-btn" disabled={Boolean(operation)} onClick={() => openReasonAction(production, 'ON_HOLD')}>Beklemeye Al</button>}
        {production.status === 'ON_HOLD' && <button type="button" className="solid-btn production-action-btn" disabled={Boolean(operation)} onClick={() => void handleTransition(production, 'IN_PROGRESS')}>Devam Et</button>}
        {production.status === 'IN_PROGRESS' && <button type="button" className="solid-btn production-action-btn" disabled={Boolean(operation)} onClick={() => void handleTransition(production, 'COMPLETED')}>Tamamla</button>}
        {(production.status === 'PLANNED' || production.status === 'IN_PROGRESS' || production.status === 'ON_HOLD') && <button type="button" className="ghost-btn production-action-btn production-action-danger" disabled={Boolean(operation)} onClick={() => openReasonAction(production, 'CANCELLED')}>Iptal Et</button>}
      </>
    )
  }

  return (
    <section className="workspace-main dashboard-main production-page production-api-page">
      <section className="production-header-row">
        <header className="workspace-header glass-card dashboard-hero production-hero">
          <div><p className="eyebrow">Uretim Operasyonu</p><h2>Uretim Takibi</h2><p>Onaylanan siparislerin planlama ve uretim durumlarini takip edin.</p></div>
        </header>
      </section>

      {!canRead && <div className="request-items-empty">Uretimleri goruntuleme yetkiniz bulunmuyor.</div>}
      {canRead && (
        <ScreenStateGate state={listState} onRetry={() => void loadProductions()}>
          <section className="stat-grid production-stats-grid">
            <article className="glass-card stat-card"><span>Toplam</span><strong>{productions.length}</strong><small>Tum uretim kayitlari</small></article>
            <article className="glass-card stat-card"><span>Planlanan</span><strong>{productions.filter((item) => item.status === 'PLANNED').length}</strong><small>Baslamayi bekleyen</small></article>
            <article className="glass-card stat-card"><span>Devam Eden</span><strong>{productions.filter((item) => item.status === 'IN_PROGRESS' || item.status === 'ON_HOLD').length}</strong><small>Aktif ve bekleyen</small></article>
            <article className="glass-card stat-card"><span>Tamamlanan</span><strong>{productions.filter((item) => item.status === 'COMPLETED').length}</strong><small>Uretimi biten</small></article>
          </section>

          <section className="glass-card panel production-filter-panel">
            <header className="panel-header"><h3>Filtreler</h3></header>
            <div className="production-filter-grid production-api-filters">
              <label className="production-filter-field production-filter-search"><span>Arama</span><input type="search" value={query} placeholder="Siparis, firma veya urun ara" onChange={(event) => setQuery(event.target.value)} /></label>
              <label className="production-filter-field"><span>Durum</span><select value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | ApiProductionStatus)}><option value="ALL">Tum Durumlar</option>{(Object.keys(PRODUCTION_STATUS_LABELS) as ApiProductionStatus[]).map((item) => <option key={item} value={item}>{PRODUCTION_STATUS_LABELS[item]}</option>)}</select></label>
            </div>
          </section>

          {feedback && <p className="ui-feedback-message settings-feedback-message" role="status">{feedback}</p>}

          <section className="glass-card panel production-table-panel">
            <header className="panel-header production-table-head"><div><h3>Uretim Listesi</h3><p>{filteredProductions.length} kayit gosteriliyor</p></div></header>
            <div className="table-wrap production-table-wrap">
              <table className="production-table production-api-table">
                <thead><tr><th>Siparis No</th><th>Firma</th><th>Urun</th><th>Durum</th><th>Planlanan Baslangic</th><th>Termin</th><th>Son Guncelleme</th><th>Islem</th></tr></thead>
                <tbody>
                  {filteredProductions.map((production) => (
                    <tr key={production.id}>
                      <td>{production.order.orderNumber}<small>{production.productionNumber}</small></td>
                      <td>{productionCompanyName(production.order.company)}</td>
                      <td>{production.order.request.title || production.order.request.productType || '-'}</td>
                      <td><span className={`request-badge production-status-${production.status.toLowerCase()}`}>{PRODUCTION_STATUS_LABELS[production.status]}</span></td>
                      <td>{formatApiDate(production.plannedStartDate)}</td>
                      <td>{formatApiDate(production.dueDate)}</td>
                      <td>{formatApiDate(production.updatedAt)}</td>
                      <td><div className="production-row-actions"><button type="button" className="ghost-btn production-action-btn" onClick={() => void loadDetail(production.id)}>Goruntule</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </ScreenStateGate>
      )}

      <RequestModal
        open={detailState === 'loading' || detailState === 'error' || Boolean(detail)}
        title="Uretim Detayi"
        onClose={() => { setDetail(null); setDetailState('steady') }}
        footer={<>{detail && renderActions(detail)}<button type="button" className="ghost-btn" onClick={() => { setDetail(null); setDetailState('steady') }}>Kapat</button></>}
      >
        {detailState === 'loading' && <div className="request-detail-state">Uretim detayi yukleniyor...</div>}
        {detailState === 'error' && <div className="request-detail-state error">Uretim detayi yuklenemedi.</div>}
        {detail && detailState === 'steady' && (
          <div className="request-detail-grid">
            <article className="request-detail-card"><span>Siparis No</span><strong>{detail.order.orderNumber}</strong></article>
            <article className="request-detail-card"><span>Durum</span><strong>{PRODUCTION_STATUS_LABELS[detail.status]}</strong></article>
            <article className="request-detail-card"><span>Talep</span><strong>{detail.order.request.requestNumber}</strong></article>
            <article className="request-detail-card"><span>Urun</span><strong>{detail.order.request.title || detail.order.request.productType || '-'}</strong></article>
            <article className="request-detail-card"><span>Alici Firma</span><strong>{productionCompanyName(detail.order.company)}</strong></article>
            <article className="request-detail-card"><span>Uretici</span><strong>{productionCompanyName(detail.order.manufacturerCompany)}</strong></article>
            <article className="request-detail-card"><span>Uretim Hatti</span><strong>{detail.productionLine ?? '-'}</strong></article>
            <article className="request-detail-card"><span>Planlanan Baslangic</span><strong>{formatApiDate(detail.plannedStartDate)}</strong></article>
            <article className="request-detail-card"><span>Baslangic</span><strong>{formatApiDate(detail.startedAt)}</strong></article>
            <article className="request-detail-card"><span>Termin</span><strong>{formatApiDate(detail.dueDate)}</strong></article>
            <article className="request-detail-card"><span>Ilgili</span><strong>{detail.createdBy?.fullName ?? '-'}</strong></article>
            <article className="request-detail-card"><span>Son Guncelleme</span><strong>{formatApiDate(detail.updatedAt)}</strong></article>
            {detail.notes && <article className="request-detail-card full-width"><span>Not</span><p>{detail.notes}</p></article>}
            {detail.statusReason && <article className="request-detail-card full-width"><span>Durum Nedeni</span><p>{detail.statusReason}</p></article>}
          </div>
        )}
      </RequestModal>

      <RequestModal
        open={Boolean(reasonAction)}
        title={reasonAction?.toStatus === 'ON_HOLD' ? 'Uretimi Beklemeye Al' : 'Uretimi Iptal Et'}
        onClose={() => !operation && setReasonAction(null)}
        footer={<><button type="button" className="ghost-btn" disabled={Boolean(operation)} onClick={() => setReasonAction(null)}>Vazgec</button><button type="button" className="solid-btn" disabled={Boolean(operation) || !reason.trim()} onClick={() => reasonAction && void handleTransition(reasonAction.production, reasonAction.toStatus, reason.trim())}>{reasonAction?.toStatus === 'ON_HOLD' ? 'Beklemeye Al' : 'Uretimi Iptal Et'}</button></>}
      >
        <div className="request-form-grid"><label className="full-width">Neden<textarea rows={4} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label></div>
      </RequestModal>
    </section>
  )
}

export function UretimTakibiPage(props: WorkspacePageProps) {
  if (props.currentUser?.backendRole) {
    return <ProductionApiWorkspace currentUser={props.currentUser} />
  }
  return <LegacyUretimTakibiPage {...props} />
}

function LegacyUretimTakibiPage({ state, onRetry, currentUser, role, workflow, workflowActions }: WorkspacePageProps) {
  const rows = workflow.productions
  const canWrite = canWriteView(role, 'production')
  const [query, setQuery] = useState('')
  const [line, setLine] = useState('Tum Hatlar')
  const [status, setStatus] = useState<'Tum Durumlar' | ProductionStatus>('Tum Durumlar')
  const [priority, setPriority] = useState<'Tum Oncelikler' | RequestPriority>('Tum Oncelikler')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeForm, setActiveForm] = useState<ProductionFormState | null>(null)
  const [viewRow, setViewRow] = useState<ProductionRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<ProductionRow | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const scopedRows = useMemo(() => scopeRowsByCompany(rows, currentUser), [rows, currentUser])

  const productionLineOptions = useMemo(() => ['Tum Hatlar', ...new Set(scopedRows.map((row) => row.line))], [scopedRows])
  const productionCompanies = useMemo(() => [...new Set(scopedRows.map((row) => row.company))], [scopedRows])

  const filteredRows = useMemo(() => {
    return scopedRows.filter((row) => {
      const matchesQuery = !query.trim() || `${row.id} ${row.company} ${row.product} ${row.owner} ${row.description}`.toLowerCase().includes(query.toLowerCase())
      const matchesLine = line === 'Tum Hatlar' || row.line === line
      const matchesStatus = status === 'Tum Durumlar' || row.status === status
      const matchesPriority = priority === 'Tum Oncelikler' || row.priority === priority
      const rowTime = new Date(row.startedAt.split('.').reverse().join('-')).getTime()
      const matchesStart = !startDate || rowTime >= new Date(startDate).getTime()
      const matchesEnd = !endDate || rowTime <= new Date(endDate).getTime()
      return matchesQuery && matchesLine && matchesStatus && matchesPriority && matchesStart && matchesEnd
    })
  }, [endDate, line, priority, query, scopedRows, startDate, status])

  const totalCount = filteredRows.length
  const inProgressCount = filteredRows.filter((row) => row.status === 'Kesim' || row.status === 'Montaj').length
  const completedCount = filteredRows.filter((row) => row.status === 'Tamamlandi').length
  const riskCount = filteredRows.filter((row) => row.priority === 'Kritik' || row.dueDate === '07.08.2026' || row.dueDate === '08.08.2026').length

  const handleSaveProduction = () => {
    if (!activeForm) {
      return
    }

    if (!activeForm.company.trim() || !activeForm.product.trim() || !activeForm.line.trim() || !activeForm.owner.trim() || !activeForm.description.trim()) {
      return
    }

    const nextRow: ProductionRow = enforceCompanyAndOwner({
      ...activeForm,
    }, currentUser)

    const exists = rows.some((row) => row.id === nextRow.id)
    workflowActions.saveProduction(nextRow)
    setFeedbackMessage(exists ? 'Is emri guncellendi.' : 'Yeni is emri kaydedildi.')

    setActiveForm(null)
  }

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  return (
    <section className="workspace-main dashboard-main production-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="production-header-row">
          <header className="workspace-header glass-card dashboard-hero production-hero">
            <div>
              <p className="eyebrow">Uretim Operasyonu</p>
              <h2>Uretim Takibi</h2>
              <p>Uretimdeki tum is emirlerini, istasyon durumlarini ve termin sureclerini takip edin.</p>
            </div>
          </header>

          {canWrite ? (
            <button type="button" className="solid-btn production-create-btn" onClick={() => setActiveForm(buildProductionForm(scopedRows))}>
              + Yeni Is Emri
            </button>
          ) : null}
        </section>

        <section className="stat-grid production-stats-grid">
          <article className="glass-card stat-card production-stat-card">
            <span>Toplam Is Emri</span>
            <strong>{totalCount}</strong>
            <small>Aktif uretim havuzu</small>
          </article>
          <article className="glass-card stat-card production-stat-card">
            <span>Devam Eden</span>
            <strong>{inProgressCount}</strong>
            <small>Kesim ve montaj asamasindaki isler</small>
          </article>
          <article className="glass-card stat-card production-stat-card">
            <span>Tamamlanan</span>
            <strong>{completedCount}</strong>
            <small>Bitirilmis uretim emirleri</small>
          </article>
          <article className="glass-card stat-card production-stat-card">
            <span>Termin Riski</span>
            <strong>{riskCount}</strong>
            <small>Kritik oncelik veya yakin termin</small>
          </article>
        </section>

        <section className="glass-card panel production-filter-panel">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="production-filter-grid">
            <label className="production-filter-field production-filter-search">
              <span>Global Arama</span>
              <input type="search" value={query} placeholder="Is emri, firma veya sorumlu ara" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="production-filter-field">
              <span>Uretim Hatti</span>
              <select value={line} onChange={(event) => setLine(event.target.value)}>
                {productionLineOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-filter-field">
              <span>Durum</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | ProductionStatus)}>
                {productionStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-filter-field">
              <span>Oncelik</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as 'Tum Oncelikler' | RequestPriority)}>
                {orderPriorities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="production-filter-field production-date-range">
              <span>Tarih Araligi</span>
              <div className="production-date-inputs">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card panel production-table-panel">
          <header className="panel-header production-table-head">
            <div>
              <h3>Uretim Listesi</h3>
              <p>{filteredRows.length} kayit gosteriliyor</p>
            </div>
          </header>

          {feedbackMessage && <p className="ui-feedback-message settings-feedback-message">{feedbackMessage}</p>}

          <div className="table-wrap production-table-wrap">
            <table className="production-table">
              <thead>
                <tr>
                  <th>Is Emri No</th>
                  <th>Firma</th>
                  <th>Urun</th>
                  <th>Uretim Hatti</th>
                  <th>Baslangic</th>
                  <th>Termin</th>
                  <th>Sorumlu</th>
                  <th>Oncelik</th>
                  <th>Durum</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Is Emri No">{row.id}</td>
                    <td data-label="Firma">{row.company}</td>
                    <td data-label="Urun">{row.product}</td>
                    <td data-label="Uretim Hatti">{row.line}</td>
                    <td data-label="Baslangic">{row.startedAt}</td>
                    <td data-label="Termin">{row.dueDate}</td>
                    <td data-label="Sorumlu">{row.owner}</td>
                    <td data-label="Oncelik">
                      <RequestPriorityBadge priority={row.priority} />
                    </td>
                    <td data-label="Durum">
                      <ProductionStatusBadge status={row.status} />
                    </td>
                    <td data-label="Islemler">
                      <div className="production-row-actions">
                        <button type="button" className="ghost-btn production-action-btn" onClick={() => setViewRow(row)} aria-label="Goruntule">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        {canWrite ? (
                          <>
                            <button type="button" className="ghost-btn production-action-btn" onClick={() => setActiveForm(buildProductionForm(scopedRows, row))} aria-label="Duzenle">
                              <span className="request-action-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                  <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                  <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" />
                                </svg>
                              </span>
                            </button>
                            <button type="button" className="ghost-btn production-action-btn production-action-danger" onClick={() => setDeleteRow(row)} aria-label="Sil">
                              <span className="request-action-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                  <path d="M9 5h6M5 8h14M9 10v6M15 10v6M7 8l1 11h8l1-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <RequestModal
          open={Boolean(activeForm)}
          title={scopedRows.some((row) => row.id === activeForm?.id) ? 'Is Emri Duzenle' : 'Yeni Is Emri'}
          onClose={() => setActiveForm(null)}
          footer={
            <>
              <button type="button" className="ghost-btn" onClick={() => setActiveForm(null)}>
                Iptal
              </button>
              <button type="button" className="solid-btn" onClick={handleSaveProduction}>
                {scopedRows.some((row) => row.id === activeForm?.id) ? 'Guncelle' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeForm && (
            <div className="request-form-grid">
              <label>
                Is Emri No
                <input type="text" value={activeForm.id} readOnly />
              </label>
              <label>
                Firma
                <select value={activeForm.company} onChange={(event) => setActiveForm((current) => (current ? { ...current, company: event.target.value } : current))}>
                  {productionCompanies.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-width">
                Urun
                <input type="text" value={activeForm.product} onChange={(event) => setActiveForm((current) => (current ? { ...current, product: event.target.value } : current))} />
              </label>
              <label>
                Uretim Hatti
                <select value={activeForm.line} onChange={(event) => setActiveForm((current) => (current ? { ...current, line: event.target.value } : current))}>
                  {productionLineOptions.filter((item) => item !== 'Tum Hatlar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Baslangic Tarihi
                <input
                  type="date"
                  value={toInputDate(activeForm.startedAt)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, startedAt: toDisplayDate(event.target.value) } : current))}
                />
              </label>
              <label>
                Termin Tarihi
                <input
                  type="date"
                  value={toInputDate(activeForm.dueDate)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, dueDate: toDisplayDate(event.target.value) } : current))}
                />
              </label>
              <label>
                Sorumlu
                <input type="text" value={activeForm.owner} onChange={(event) => setActiveForm((current) => (current ? { ...current, owner: event.target.value } : current))} />
              </label>
              <label>
                Oncelik
                <select value={activeForm.priority} onChange={(event) => setActiveForm((current) => (current ? { ...current, priority: event.target.value as RequestPriority } : current))}>
                  {orderPriorities.filter((item) => item !== 'Tum Oncelikler').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Durum
                <select value={activeForm.status} onChange={(event) => setActiveForm((current) => (current ? { ...current, status: event.target.value as ProductionStatus } : current))}>
                  {productionStatuses.filter((item) => item !== 'Tum Durumlar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-width">
                Aciklama
                <textarea rows={4} value={activeForm.description} onChange={(event) => setActiveForm((current) => (current ? { ...current, description: event.target.value } : current))} />
              </label>
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(viewRow)}
          title="Is Emri Detayi"
          onClose={() => setViewRow(null)}
          footer={
            <button type="button" className="solid-btn" onClick={() => setViewRow(null)}>
              Kapat
            </button>
          }
        >
          {viewRow && (
            <div className="request-detail-grid">
              <article className="request-detail-card">
                <span>Is Emri No</span>
                <strong>{viewRow.id}</strong>
              </article>
              <article className="request-detail-card">
                <span>Firma</span>
                <strong>{viewRow.company}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Urun</span>
                <strong>{viewRow.product}</strong>
              </article>
              <article className="request-detail-card">
                <span>Uretim Hatti</span>
                <strong>{viewRow.line}</strong>
              </article>
              <article className="request-detail-card">
                <span>Baslangic Tarihi</span>
                <strong>{viewRow.startedAt}</strong>
              </article>
              <article className="request-detail-card">
                <span>Termin Tarihi</span>
                <strong>{viewRow.dueDate}</strong>
              </article>
              <article className="request-detail-card">
                <span>Sorumlu</span>
                <strong>{viewRow.owner}</strong>
              </article>
              <article className="request-detail-card">
                <span>Oncelik</span>
                <RequestPriorityBadge priority={viewRow.priority} />
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <ProductionStatusBadge status={viewRow.status} />
              </article>
              <article className="request-detail-card full-width">
                <span>Aciklama</span>
                <strong>{viewRow.description}</strong>
              </article>
            </div>
          )}
        </RequestModal>

        <DeleteConfirmationModal
          open={Boolean(deleteRow)}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => {
            if (!deleteRow) {
              return
            }

            workflowActions.deleteProduction(deleteRow.id)
            setDeleteRow(null)
            setFeedbackMessage('Is emri silindi.')
          }}
        />
      </ScreenStateGate>
    </section>
  )
}

function shipmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bu sevkiyat islemi icin yetkiniz bulunmuyor.'
    if (error.status === 404) return 'Sevkiyat kaydi bulunamadi veya erisim kapsaminizin disinda.'
    if (error.status === 409) return 'Sevkiyat kaydi baska bir islem nedeniyle degisti.'
  }
  return 'Sevkiyat islemi tamamlanamadi. Lutfen yeniden deneyin.'
}

interface ShipmentPlanForm {
  productionId: string
  plannedDepartureAt: string
  estimatedDeliveryAt: string
  destinationAddress: string
  carrier: string
  trackingNumber: string
  notes: string
}

function emptyShipmentPlan(productionId = ''): ShipmentPlanForm {
  return {
    productionId,
    plannedDepartureAt: '',
    estimatedDeliveryAt: '',
    destinationAddress: '',
    carrier: '',
    trackingNumber: '',
    notes: '',
  }
}

function ShipmentApiWorkspace({ currentUser }: { currentUser: AuthenticatedUser | null }) {
  const [shipments, setShipments] = useState<ApiShipmentView[]>([])
  const [productions, setProductions] = useState<ApiProductionView[]>([])
  const [listState, setListState] = useState<ScreenState>('loading')
  const [detail, setDetail] = useState<ApiShipmentView | null>(null)
  const [detailState, setDetailState] = useState<'steady' | 'loading' | 'error'>('steady')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | ApiShipmentStatus>('ALL')
  const [planForm, setPlanForm] = useState<ShipmentPlanForm | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const canRead = hasPermission(currentUser, 'shipments.read')
  const canReadProductions = hasPermission(currentUser, 'productions.read')
  const canWrite = canWriteView(currentUser?.role ?? 'BUYER', 'shipment')
  const canCreate = hasPermission(currentUser, 'shipments.create') && canReadProductions && canWrite
  const canTransition = hasPermission(currentUser, 'shipments.transition') && canWrite

  const loadShipments = useCallback(async () => {
    if (!canRead) {
      setShipments([])
      setListState('steady')
      return []
    }
    setListState('loading')
    try {
      const loaded = await shipmentsApi.list()
      setShipments(loaded)
      setListState(loaded.length === 0 ? 'empty' : 'steady')
      return loaded
    } catch {
      setShipments([])
      setListState('error')
      return []
    }
  }, [canRead])

  const loadProductions = useCallback(async () => {
    if (!canReadProductions) {
      setProductions([])
      return []
    }
    try {
      const loaded = await productionsApi.list()
      setProductions(loaded)
      return loaded
    } catch {
      setProductions([])
      return []
    }
  }, [canReadProductions])

  useEffect(() => {
    void loadShipments()
    void loadProductions()
  }, [loadProductions, loadShipments])

  const loadDetail = async (shipmentId: string) => {
    setDetailState('loading')
    try {
      const loaded = await shipmentsApi.get(shipmentId)
      setDetail(loaded)
      setDetailState('steady')
      return loaded
    } catch (error) {
      setDetail(null)
      setDetailState('error')
      setFeedback(shipmentErrorMessage(error))
      return null
    }
  }

  const refreshShipmentAuthority = async (shipment: ApiShipmentView) => {
    await Promise.all([
      loadShipments(),
      loadDetail(shipment.id),
      productionsApi.get(shipment.productionId).catch(() => null),
      ordersApi.get(shipment.orderId).catch(() => null),
    ])
  }

  const refreshCreateAuthority = async (production: ApiProductionView) => {
    const loadedShipments = await loadShipments()
    const relatedShipment = loadedShipments.find((item) => item.productionId === production.id)
    await Promise.all([
      loadProductions(),
      productionsApi.get(production.id).catch(() => null),
      ordersApi.get(production.orderId).catch(() => null),
      relatedShipment ? shipmentsApi.get(relatedShipment.id).catch(() => null) : Promise.resolve(null),
    ])
  }

  const eligibleProductions = useMemo(() => {
    const plannedProductionIds = new Set(shipments.map((shipment) => shipment.productionId))
    return productions.filter((production) => production.status === 'COMPLETED' && !plannedProductionIds.has(production.id))
  }, [productions, shipments])

  const openPlan = () => {
    setPlanForm(emptyShipmentPlan(eligibleProductions[0]?.id ?? ''))
  }

  const handleCreate = async () => {
    if (!planForm || operation) return
    const production = eligibleProductions.find((item) => item.id === planForm.productionId)
    if (!production) {
      setFeedback('Sevkiyat planlamak icin tamamlanmis bir uretim secin.')
      return
    }
    if (!planForm.plannedDepartureAt || !planForm.estimatedDeliveryAt || !planForm.destinationAddress.trim()) {
      setFeedback('Planlanan cikis, tahmini teslim ve teslimat adresi zorunludur.')
      return
    }

    setOperation(`create:${production.id}`)
    try {
      await shipmentsApi.create(production.id, {
        productionVersion: production.version,
        destinationAddress: planForm.destinationAddress.trim(),
        plannedDepartureAt: planForm.plannedDepartureAt,
        estimatedDeliveryAt: planForm.estimatedDeliveryAt,
        ...(planForm.carrier.trim() ? { carrier: planForm.carrier.trim() } : {}),
        ...(planForm.trackingNumber.trim() ? { trackingNumber: planForm.trackingNumber.trim() } : {}),
        ...(planForm.notes.trim() ? { notes: planForm.notes.trim() } : {}),
      })
      setPlanForm(null)
      setFeedback('Sevkiyat planlandi.')
      await Promise.all([loadShipments(), loadProductions()])
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setPlanForm(null)
        setFeedback('Sevkiyat kaydi baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        await refreshCreateAuthority(production)
      } else {
        setFeedback(shipmentErrorMessage(error))
      }
    } finally {
      setOperation(null)
    }
  }

  const handleTransition = async (shipment: ApiShipmentView, toStatus: ApiShipmentStatus) => {
    if (operation) return
    setOperation(`transition:${shipment.id}`)
    try {
      const updated = await shipmentsApi.transition(shipment.id, {
        version: shipment.version,
        toStatus,
      })
      setFeedback('Sevkiyat durumu guncellendi.')
      await refreshShipmentAuthority(updated)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('Sevkiyat kaydi baska bir islem nedeniyle degisti. Guncel veri yeniden yuklendi.')
        await refreshShipmentAuthority(shipment)
      } else {
        setFeedback(shipmentErrorMessage(error))
      }
    } finally {
      setOperation(null)
    }
  }

  const filteredShipments = shipments.filter((shipment) => {
    const search = `${shipment.shipmentNumber} ${shipment.order.orderNumber} ${shipment.production.productionNumber} ${shipment.order.request.requestNumber} ${shipment.order.request.title} ${shipment.destinationAddress} ${shipment.carrier ?? ''} ${shipment.trackingNumber ?? ''}`.toLowerCase()
    return (!query.trim() || search.includes(query.trim().toLowerCase()))
      && (status === 'ALL' || shipment.status === status)
  })

  const renderTransition = (shipment: ApiShipmentView) => {
    if (!canTransition) return null
    if (shipment.status === 'PLANNED') {
      return <button type="button" className="solid-btn shipment-action-btn" disabled={Boolean(operation)} onClick={() => void handleTransition(shipment, 'IN_TRANSIT')}>Yola Cikar</button>
    }
    if (shipment.status === 'IN_TRANSIT') {
      return <button type="button" className="solid-btn shipment-action-btn" disabled={Boolean(operation)} onClick={() => void handleTransition(shipment, 'DELIVERED')}>Teslim Edildi Olarak Isaretle</button>
    }
    return null
  }

  return (
    <section className="workspace-main dashboard-main shipment-page shipment-api-page">
      <section className="shipment-header-row">
        <header className="workspace-header glass-card dashboard-hero shipment-hero">
          <div><p className="eyebrow">Sevkiyat Operasyonu</p><h2>Sevkiyat Yonetimi</h2><p>Tamamlanan uretimleri planlayin ve teslimata kadar authoritative olarak takip edin.</p></div>
        </header>
        {canCreate && <button type="button" className="solid-btn shipment-create-btn" onClick={openPlan}>Sevkiyat Planla</button>}
      </section>

      {!canRead && <div className="request-items-empty">Sevkiyatlari goruntuleme yetkiniz bulunmuyor.</div>}
      {canRead && (
        <ScreenStateGate state={listState} onRetry={() => void loadShipments()}>
          <section className="stat-grid shipment-stats-grid">
            <article className="glass-card stat-card shipment-stat-card"><span>Toplam</span><strong>{shipments.length}</strong><small>Tum sevkiyatlar</small></article>
            <article className="glass-card stat-card shipment-stat-card"><span>Planlanan</span><strong>{shipments.filter((item) => item.status === 'PLANNED').length}</strong><small>Cikis bekleyen</small></article>
            <article className="glass-card stat-card shipment-stat-card"><span>Yolda</span><strong>{shipments.filter((item) => item.status === 'IN_TRANSIT').length}</strong><small>Aktif teslimat</small></article>
            <article className="glass-card stat-card shipment-stat-card"><span>Teslim Edildi</span><strong>{shipments.filter((item) => item.status === 'DELIVERED').length}</strong><small>Tamamlanan</small></article>
          </section>

          <section className="glass-card panel shipment-filter-panel">
            <header className="panel-header"><h3>Filtreler</h3></header>
            <div className="shipment-filter-grid shipment-api-filters">
              <label className="shipment-filter-field shipment-filter-search"><span>Arama</span><input type="search" value={query} placeholder="Sevkiyat, siparis veya uretim ara" onChange={(event) => setQuery(event.target.value)} /></label>
              <label className="shipment-filter-field"><span>Durum</span><select value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | ApiShipmentStatus)}><option value="ALL">Tum Durumlar</option>{(Object.keys(SHIPMENT_STATUS_LABELS) as ApiShipmentStatus[]).map((item) => <option key={item} value={item}>{SHIPMENT_STATUS_LABELS[item]}</option>)}</select></label>
            </div>
          </section>

          {feedback && <p className="ui-feedback-message settings-feedback-message" role="status">{feedback}</p>}

          <section className="glass-card panel shipment-table-panel">
            <header className="panel-header shipment-table-head"><div><h3>Sevkiyat Listesi</h3><p>{filteredShipments.length} kayit gosteriliyor</p></div></header>
            <div className="table-wrap shipment-table-wrap">
              <table className="shipment-table shipment-api-table">
                <thead><tr><th>Sevkiyat No</th><th>Siparis</th><th>Uretim</th><th>Durum</th><th>Planlanan Cikis</th><th>Tahmini Teslim</th><th>Gercek Cikis</th><th>Gercek Teslim</th><th>Islem</th></tr></thead>
                <tbody>
                  {filteredShipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td data-label="Sevkiyat No">{shipment.shipmentNumber}</td>
                      <td data-label="Siparis">{shipment.order.orderNumber}</td>
                      <td data-label="Uretim">{shipment.production.productionNumber}</td>
                      <td data-label="Durum"><span className={`request-badge production-status-${shipment.status.toLowerCase()}`}>{SHIPMENT_STATUS_LABELS[shipment.status]}</span></td>
                      <td data-label="Planlanan Cikis">{formatApiDate(shipment.plannedDepartureAt)}</td>
                      <td data-label="Tahmini Teslim">{formatApiDate(shipment.estimatedDeliveryAt)}</td>
                      <td data-label="Gercek Cikis">{formatApiDate(shipment.departedAt)}</td>
                      <td data-label="Gercek Teslim">{formatApiDate(shipment.deliveredAt)}</td>
                      <td data-label="Islem"><div className="shipment-row-actions"><button type="button" className="ghost-btn shipment-action-btn" onClick={() => void loadDetail(shipment.id)}>Goruntule</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </ScreenStateGate>
      )}

      <RequestModal
        open={Boolean(planForm)}
        title="Sevkiyat Planla"
        onClose={() => !operation && setPlanForm(null)}
        footer={<><button type="button" className="ghost-btn" disabled={Boolean(operation)} onClick={() => setPlanForm(null)}>Vazgec</button><button type="button" className="solid-btn" disabled={Boolean(operation)} onClick={() => void handleCreate()}>Sevkiyati Planla</button></>}
      >
        {planForm && (
          <div className="request-form-grid">
            <label className="full-width">Tamamlanan Uretim<select value={planForm.productionId} onChange={(event) => setPlanForm((current) => current ? { ...current, productionId: event.target.value } : current)}><option value="">Uretim secin</option>{eligibleProductions.map((production) => <option key={production.id} value={production.id}>{production.productionNumber} / {production.order.orderNumber}</option>)}</select></label>
            <label>Planlanan Cikis<input type="date" value={planForm.plannedDepartureAt} onChange={(event) => setPlanForm((current) => current ? { ...current, plannedDepartureAt: event.target.value } : current)} /></label>
            <label>Tahmini Teslim<input type="date" value={planForm.estimatedDeliveryAt} onChange={(event) => setPlanForm((current) => current ? { ...current, estimatedDeliveryAt: event.target.value } : current)} /></label>
            <label className="full-width">Teslimat Adresi<textarea rows={3} maxLength={1000} value={planForm.destinationAddress} onChange={(event) => setPlanForm((current) => current ? { ...current, destinationAddress: event.target.value } : current)} /></label>
            <label>Tasiyici<input type="text" maxLength={200} value={planForm.carrier} onChange={(event) => setPlanForm((current) => current ? { ...current, carrier: event.target.value } : current)} /></label>
            <label>Takip Numarasi<input type="text" maxLength={200} value={planForm.trackingNumber} onChange={(event) => setPlanForm((current) => current ? { ...current, trackingNumber: event.target.value } : current)} /></label>
            <label className="full-width">Not<textarea rows={3} maxLength={1000} value={planForm.notes} onChange={(event) => setPlanForm((current) => current ? { ...current, notes: event.target.value } : current)} /></label>
          </div>
        )}
      </RequestModal>

      <RequestModal
        open={detailState === 'loading' || detailState === 'error' || Boolean(detail)}
        title="Sevkiyat Detayi"
        onClose={() => { setDetail(null); setDetailState('steady') }}
        footer={<>{detail && renderTransition(detail)}<button type="button" className="ghost-btn" onClick={() => { setDetail(null); setDetailState('steady') }}>Kapat</button></>}
      >
        {detailState === 'loading' && <div className="request-detail-state">Sevkiyat detayi yukleniyor...</div>}
        {detailState === 'error' && <div className="request-detail-state error">Sevkiyat detayi yuklenemedi.</div>}
        {detail && detailState === 'steady' && (
          <div className="request-detail-grid">
            <article className="request-detail-card"><span>Sevkiyat No</span><strong>{detail.shipmentNumber}</strong></article>
            <article className="request-detail-card"><span>Durum</span><strong>{SHIPMENT_STATUS_LABELS[detail.status]}</strong></article>
            <article className="request-detail-card"><span>Siparis</span><strong>{detail.order.orderNumber}</strong></article>
            <article className="request-detail-card"><span>Uretim</span><strong>{detail.production.productionNumber}</strong></article>
            <article className="request-detail-card"><span>Planlanan Cikis</span><strong>{formatApiDate(detail.plannedDepartureAt)}</strong></article>
            <article className="request-detail-card"><span>Tahmini Teslim</span><strong>{formatApiDate(detail.estimatedDeliveryAt)}</strong></article>
            <article className="request-detail-card"><span>Gercek Cikis</span><strong>{formatApiDate(detail.departedAt)}</strong></article>
            <article className="request-detail-card"><span>Gercek Teslim</span><strong>{formatApiDate(detail.deliveredAt)}</strong></article>
            {detail.carrier && <article className="request-detail-card"><span>Tasiyici</span><strong>{detail.carrier}</strong></article>}
            {detail.trackingNumber && <article className="request-detail-card"><span>Takip Numarasi</span><strong>{detail.trackingNumber}</strong></article>}
            <article className="request-detail-card full-width"><span>Teslimat Adresi</span><strong>{detail.destinationAddress}</strong></article>
            {detail.notes && <article className="request-detail-card full-width"><span>Not</span><p>{detail.notes}</p></article>}
          </div>
        )}
      </RequestModal>
    </section>
  )
}

export function SevkiyatPage(props: WorkspacePageProps) {
  if (props.currentUser?.backendRole) {
    return <ShipmentApiWorkspace currentUser={props.currentUser} />
  }
  return <LegacySevkiyatPage {...props} />
}

function LegacySevkiyatPage({ state, onRetry, currentUser, role, workflow, workflowActions }: WorkspacePageProps) {
  const rows = workflow.shipments
  const canWrite = canWriteView(role, 'shipment')
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState('Tum Firmalar')
  const [vehicle, setVehicle] = useState('Tum Araclar')
  const [driver, setDriver] = useState('Tum Soforler')
  const [status, setStatus] = useState<'Tum Durumlar' | ShipmentStatus>('Tum Durumlar')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeForm, setActiveForm] = useState<ShipmentFormState | null>(null)
  const [viewRow, setViewRow] = useState<ShipmentRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<ShipmentRow | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const scopedRows = useMemo(() => scopeRowsByCompany(rows, currentUser), [rows, currentUser])

  const shipmentCompanies = useMemo(() => ['Tum Firmalar', ...new Set(scopedRows.map((row) => row.company))], [scopedRows])
  const shipmentVehicles = useMemo(() => ['Tum Araclar', ...new Set(scopedRows.map((row) => row.vehicle))], [scopedRows])
  const shipmentDrivers = useMemo(() => ['Tum Soforler', ...new Set(scopedRows.map((row) => row.driver))], [scopedRows])

  const filteredRows = useMemo(() => {
    return scopedRows.filter((row) => {
      const matchesQuery =
        !query.trim() ||
        `${row.id} ${row.company} ${row.orderNo} ${row.vehicle} ${row.driver} ${row.plate} ${row.description}`.toLowerCase().includes(query.toLowerCase())
      const matchesCompany = company === 'Tum Firmalar' || row.company === company
      const matchesVehicle = vehicle === 'Tum Araclar' || row.vehicle === vehicle
      const matchesDriver = driver === 'Tum Soforler' || row.driver === driver
      const matchesStatus = status === 'Tum Durumlar' || row.status === status
      const rowTime = new Date(row.departureDate.split('.').reverse().join('-')).getTime()
      const matchesStart = !startDate || rowTime >= new Date(startDate).getTime()
      const matchesEnd = !endDate || rowTime <= new Date(endDate).getTime()
      return matchesQuery && matchesCompany && matchesVehicle && matchesDriver && matchesStatus && matchesStart && matchesEnd
    })
  }, [company, driver, endDate, query, scopedRows, startDate, status, vehicle])

  const totalCount = filteredRows.length
  const onRoadCount = filteredRows.filter((row) => row.status === 'Yolda').length
  const deliveredCount = filteredRows.filter((row) => row.status === 'Teslim Edildi').length
  const todayTimestamp = new Date().setHours(0, 0, 0, 0)
  const delayedCount = filteredRows.filter((row) => {
    if (row.status === 'Gecikti') {
      return true
    }

    if (row.status === 'Teslim Edildi') {
      return false
    }

    const deliveryTimestamp = new Date(row.estimatedDelivery.split('.').reverse().join('-')).getTime()
    return deliveryTimestamp < todayTimestamp
  }).length

  const handleSaveShipment = () => {
    if (!activeForm) {
      return
    }

    if (!activeForm.company.trim() || !activeForm.orderNo.trim() || !activeForm.vehicle.trim() || !activeForm.driver.trim() || !activeForm.plate.trim() || !activeForm.description.trim()) {
      return
    }

    const nextBaseRow: ShipmentRow = {
      ...activeForm,
    }

    const nextRow: ShipmentRow =
      currentUser?.role === 'BUYER'
        ? { ...nextBaseRow, company: currentUser.company }
        : currentUser?.role === 'MANUFACTURER'
          ? { ...nextBaseRow, manufacturerCompany: currentUser.company }
          : nextBaseRow

    const exists = rows.some((row) => row.id === nextRow.id)
    workflowActions.saveShipment(nextRow)
    setFeedbackMessage(exists ? 'Sevkiyat kaydi guncellendi.' : 'Yeni sevkiyat kaydi olusturuldu.')

    setActiveForm(null)
  }

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  return (
    <section className="workspace-main dashboard-main shipment-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="shipment-header-row">
          <header className="workspace-header glass-card dashboard-hero shipment-hero">
            <div>
              <p className="eyebrow">Sevkiyat Operasyonu</p>
              <h2>Sevkiyat Yonetimi</h2>
              <p>Hazir siparisleri planlayin, araclara atayin ve teslimat sureclerini yonetin.</p>
            </div>
          </header>

          {canWrite ? (
            <button type="button" className="solid-btn shipment-create-btn" onClick={() => setActiveForm(buildShipmentForm(scopedRows))}>
              + Yeni Sevkiyat
            </button>
          ) : null}
        </section>

        <section className="stat-grid shipment-stats-grid">
          <article className="glass-card stat-card shipment-stat-card">
            <span>Toplam Sevkiyat</span>
            <strong>{totalCount}</strong>
            <small>Aktif sevkiyat havuzu</small>
          </article>
          <article className="glass-card stat-card shipment-stat-card">
            <span>Yolda</span>
            <strong>{onRoadCount}</strong>
            <small>Aktif teslimat surecinde</small>
          </article>
          <article className="glass-card stat-card shipment-stat-card">
            <span>Teslim Edildi</span>
            <strong>{deliveredCount}</strong>
            <small>Tamamlanan sevkiyatlar</small>
          </article>
          <article className="glass-card stat-card shipment-stat-card">
            <span>Geciken</span>
            <strong>{delayedCount}</strong>
            <small>Tahmini teslim tarihi gecenler</small>
          </article>
        </section>

        <section className="glass-card panel shipment-filter-panel">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="shipment-filter-grid">
            <label className="shipment-filter-field shipment-filter-search">
              <span>Global Arama</span>
              <input type="search" value={query} placeholder="Sevkiyat, firma veya sofor ara" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="shipment-filter-field">
              <span>Firma</span>
              <select value={company} onChange={(event) => setCompany(event.target.value)}>
                {shipmentCompanies.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="shipment-filter-field">
              <span>Arac</span>
              <select value={vehicle} onChange={(event) => setVehicle(event.target.value)}>
                {shipmentVehicles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="shipment-filter-field">
              <span>Sofor</span>
              <select value={driver} onChange={(event) => setDriver(event.target.value)}>
                {shipmentDrivers.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="shipment-filter-field">
              <span>Sevkiyat Durumu</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | ShipmentStatus)}>
                {shipmentStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="shipment-filter-field shipment-date-range">
              <span>Tarih Araligi</span>
              <div className="shipment-date-inputs">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card panel shipment-table-panel">
          <header className="panel-header shipment-table-head">
            <div>
              <h3>Sevkiyat Listesi</h3>
              <p>{filteredRows.length} kayit gosteriliyor</p>
            </div>
          </header>

          {feedbackMessage && <p className="ui-feedback-message settings-feedback-message">{feedbackMessage}</p>}

          <div className="table-wrap shipment-table-wrap">
            <table className="shipment-table">
              <thead>
                <tr>
                  <th>Sevkiyat No</th>
                  <th>Firma</th>
                  <th>Siparis</th>
                  <th>Arac</th>
                  <th>Sofor</th>
                  <th>Plaka</th>
                  <th>Cikis Tarihi</th>
                  <th>Tahmini Teslim</th>
                  <th>Durum</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Sevkiyat No">{row.id}</td>
                    <td data-label="Firma">{row.company}</td>
                    <td data-label="Siparis">{row.orderNo}</td>
                    <td data-label="Arac">{row.vehicle}</td>
                    <td data-label="Sofor">{row.driver}</td>
                    <td data-label="Plaka">{row.plate}</td>
                    <td data-label="Cikis Tarihi">{row.departureDate}</td>
                    <td data-label="Tahmini Teslim">{row.estimatedDelivery}</td>
                    <td data-label="Durum">
                      <ShipmentStatusBadge status={row.status} />
                    </td>
                    <td data-label="Islemler">
                      <div className="shipment-row-actions">
                        <button type="button" className="ghost-btn shipment-action-btn" onClick={() => setViewRow(row)} aria-label="Goruntule">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        {canWrite ? (
                          <>
                            <button type="button" className="ghost-btn shipment-action-btn" onClick={() => setActiveForm(buildShipmentForm(scopedRows, row))} aria-label="Duzenle">
                              <span className="request-action-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                  <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                  <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" />
                                </svg>
                              </span>
                            </button>
                            <button type="button" className="ghost-btn shipment-action-btn shipment-action-danger" onClick={() => setDeleteRow(row)} aria-label="Sil">
                              <span className="request-action-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                  <path d="M9 5h6M5 8h14M9 10v6M15 10v6M7 8l1 11h8l1-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <RequestModal
          open={Boolean(activeForm)}
          title={scopedRows.some((row) => row.id === activeForm?.id) ? 'Sevkiyat Duzenle' : 'Yeni Sevkiyat'}
          onClose={() => setActiveForm(null)}
          footer={
            <>
              <button type="button" className="ghost-btn" onClick={() => setActiveForm(null)}>
                Iptal
              </button>
              <button type="button" className="solid-btn" onClick={handleSaveShipment}>
                {scopedRows.some((row) => row.id === activeForm?.id) ? 'Guncelle' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeForm && (
            <div className="request-form-grid">
              <label>
                Sevkiyat No
                <input type="text" value={activeForm.id} readOnly />
              </label>
              <label>
                Firma
                <select value={activeForm.company} onChange={(event) => setActiveForm((current) => (current ? { ...current, company: event.target.value } : current))}>
                  {shipmentCompanies
                    .filter((item) => item !== 'Tum Firmalar')
                    .map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Siparis
                <input type="text" value={activeForm.orderNo} onChange={(event) => setActiveForm((current) => (current ? { ...current, orderNo: event.target.value } : current))} />
              </label>
              <label>
                Arac
                <input type="text" value={activeForm.vehicle} onChange={(event) => setActiveForm((current) => (current ? { ...current, vehicle: event.target.value } : current))} />
              </label>
              <label>
                Sofor
                <input type="text" value={activeForm.driver} onChange={(event) => setActiveForm((current) => (current ? { ...current, driver: event.target.value } : current))} />
              </label>
              <label>
                Plaka
                <input type="text" value={activeForm.plate} onChange={(event) => setActiveForm((current) => (current ? { ...current, plate: event.target.value } : current))} />
              </label>
              <label>
                Cikis Tarihi
                <input
                  type="date"
                  value={toInputDate(activeForm.departureDate)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, departureDate: toDisplayDate(event.target.value) } : current))}
                />
              </label>
              <label>
                Tahmini Teslim
                <input
                  type="date"
                  value={toInputDate(activeForm.estimatedDelivery)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, estimatedDelivery: toDisplayDate(event.target.value) } : current))}
                />
              </label>
              <label>
                Durum
                <select value={activeForm.status} onChange={(event) => setActiveForm((current) => (current ? { ...current, status: event.target.value as ShipmentStatus } : current))}>
                  {shipmentStatuses
                    .filter((item) => item !== 'Tum Durumlar')
                    .map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                </select>
              </label>
              <label className="full-width">
                Aciklama
                <textarea rows={4} value={activeForm.description} onChange={(event) => setActiveForm((current) => (current ? { ...current, description: event.target.value } : current))} />
              </label>
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(viewRow)}
          title="Sevkiyat Detayi"
          onClose={() => setViewRow(null)}
          footer={
            <button type="button" className="solid-btn" onClick={() => setViewRow(null)}>
              Kapat
            </button>
          }
        >
          {viewRow && (
            <div className="request-detail-grid">
              <article className="request-detail-card">
                <span>Sevkiyat No</span>
                <strong>{viewRow.id}</strong>
              </article>
              <article className="request-detail-card">
                <span>Firma</span>
                <strong>{viewRow.company}</strong>
              </article>
              <article className="request-detail-card">
                <span>Siparis</span>
                <strong>{viewRow.orderNo}</strong>
              </article>
              <article className="request-detail-card">
                <span>Arac</span>
                <strong>{viewRow.vehicle}</strong>
              </article>
              <article className="request-detail-card">
                <span>Sofor</span>
                <strong>{viewRow.driver}</strong>
              </article>
              <article className="request-detail-card">
                <span>Plaka</span>
                <strong>{viewRow.plate}</strong>
              </article>
              <article className="request-detail-card">
                <span>Cikis Tarihi</span>
                <strong>{viewRow.departureDate}</strong>
              </article>
              <article className="request-detail-card">
                <span>Tahmini Teslim</span>
                <strong>{viewRow.estimatedDelivery}</strong>
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <ShipmentStatusBadge status={viewRow.status} />
              </article>
              <article className="request-detail-card full-width">
                <span>Aciklama</span>
                <strong>{viewRow.description}</strong>
              </article>
            </div>
          )}
        </RequestModal>

        <DeleteConfirmationModal
          open={Boolean(deleteRow)}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => {
            if (!deleteRow) {
              return
            }

            workflowActions.deleteShipment(deleteRow.id)
            setDeleteRow(null)
            setFeedbackMessage('Sevkiyat silindi.')
          }}
        />
      </ScreenStateGate>
    </section>
  )
}

function parseNumberInput(value: string): number | null {
  const cleaned = value.replaceAll('TRY', '').replaceAll('.', '').replaceAll(',', '.').trim()
  if (!cleaned) {
    return null
  }

  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : null
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${Math.round(value).toLocaleString('tr-TR')}`
}

function formatPercent(value: number): string {
  return `%${value}`
}

interface PriceCatalogFormState {
  id?: string
  productCode: string
  productType: string
  description: string
  baseUnit: MeasurementUnit
  unitPrice: string
  currency: string
  minimumOrderAmount: string
  defaultWasteRate: string
  defaultDiscountRate: string
  status: PriceCatalogStatus
}

function buildPriceCatalogForm(row?: ApiPriceCatalogItem): PriceCatalogFormState {
  if (row) {
    return {
      id: row.id,
      productCode: row.productCode,
      productType: row.productType,
      description: row.description ?? '',
      baseUnit: row.baseUnit,
      unitPrice: row.unitPrice,
      currency: row.currency,
      minimumOrderAmount: row.minimumOrderAmount ?? '',
      defaultWasteRate: row.defaultWasteRate,
      defaultDiscountRate: row.defaultDiscountRate,
      status: row.status,
    }
  }

  return {
    productCode: '',
    productType: '',
    description: '',
    baseUnit: 'M2',
    unitPrice: '',
    currency: 'TRY',
    minimumOrderAmount: '',
    defaultWasteRate: '0',
    defaultDiscountRate: '0',
    status: 'ACTIVE',
  }
}

function pricingApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Fiyat kalemi kaydedilemedi.'
}

export function FiyatUrunYonetimiPage({ state, onRetry, currentUser, role }: WorkspacePageProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)
  const canWrite = canWriteView(role, 'pricing')
  const [rows, setRows] = useState<ApiPriceCatalogItem[]>([])
  const [rowsState, setRowsState] = useState<'idle' | 'loading' | 'steady' | 'error'>('idle')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'Tum Durumlar' | PriceCatalogStatus>('Tum Durumlar')
  const [activeForm, setActiveForm] = useState<PriceCatalogFormState | null>(null)
  const [viewRow, setViewRow] = useState<ApiPriceCatalogItem | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const loadCatalog = useCallback(async () => {
    setRowsState('loading')
    try {
      const items = await pricingApi.list()
      setRows(items)
      setRowsState('steady')
    } catch {
      setRows([])
      setRowsState('error')
    }
  }, [])

  useEffect(() => {
    if (apiEnabled) {
      void loadCatalog()
    }
  }, [apiEnabled, loadCatalog])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const searchable = toComparable(`${row.productCode} ${row.productType} ${row.description ?? ''}`)
      const matchesQuery = !query.trim() || searchable.includes(toComparable(query))
      const matchesStatus = status === 'Tum Durumlar' || row.status === status
      return matchesQuery && matchesStatus
    })
  }, [query, rows, status])

  const totalCount = filteredRows.length
  const activeCount = filteredRows.filter((row) => row.status === 'ACTIVE').length
  const passiveCount = filteredRows.filter((row) => row.status === 'INACTIVE').length

  const handleSavePricing = async () => {
    if (!activeForm) {
      return
    }

    if (!activeForm.productCode.trim() || !activeForm.productType.trim() || !activeForm.unitPrice.trim()) {
      setFormError('Urun kodu, urun turu ve m2 fiyati zorunludur.')
      return
    }

    const unitPrice = parseNumberInput(activeForm.unitPrice)
    const minimumOrderAmount = activeForm.minimumOrderAmount.trim() ? parseNumberInput(activeForm.minimumOrderAmount) : null
    const defaultWasteRate = parseNumberInput(activeForm.defaultWasteRate)
    const defaultDiscountRate = parseNumberInput(activeForm.defaultDiscountRate)

    if (unitPrice === null || defaultWasteRate === null || defaultDiscountRate === null) {
      setFormError('Fiyat, fire ve indirim oranlari sayisal olmalidir.')
      return
    }

    setIsSaving(true)
    setFormError('')

    try {
      if (activeForm.id) {
        await pricingApi.update(activeForm.id, {
          productType: activeForm.productType.trim(),
          description: activeForm.description.trim() || undefined,
          unitPrice,
          currency: activeForm.currency.trim() || 'TRY',
          minimumOrderAmount: minimumOrderAmount ?? undefined,
          defaultWasteRate,
          defaultDiscountRate,
          status: activeForm.status,
        })
        setFeedbackMessage('Fiyat kalemi guncellendi.')
      } else if (currentUser?.companyId) {
        await pricingApi.create({
          companyId: currentUser.companyId,
          productCode: activeForm.productCode.trim(),
          productType: activeForm.productType.trim(),
          description: activeForm.description.trim() || undefined,
          baseUnit: activeForm.baseUnit,
          unitPrice,
          currency: activeForm.currency.trim() || 'TRY',
          minimumOrderAmount: minimumOrderAmount ?? undefined,
          defaultWasteRate,
          defaultDiscountRate,
          status: activeForm.status,
        })
        setFeedbackMessage('Yeni fiyat kalemi olusturuldu.')
      } else {
        setFormError('Aktif sirket uyeligi bulunamadigi icin fiyat kalemi kaydedilemedi.')
        return
      }

      await loadCatalog()
      setActiveForm(null)
    } catch (error) {
      setFormError(pricingApiErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  if (!apiEnabled) {
    return (
      <section className="workspace-main dashboard-main">
        <ScreenStateGate state={state} onRetry={onRetry}>
          <header className="workspace-header glass-card dashboard-hero">
            <div>
              <p className="eyebrow">Ticari Altyapi</p>
              <h2>Fiyat ve Urun Yonetimi</h2>
              <p>Bu bolum gercek oturum gerektirir; lutfen kurumsal hesabinizla giris yapin.</p>
            </div>
          </header>
        </ScreenStateGate>
      </section>
    )
  }

  return (
    <section className="workspace-main dashboard-main">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <header className="workspace-header glass-card dashboard-hero">
          <div>
            <p className="eyebrow">Ticari Altyapi</p>
            <h2>Fiyat ve Urun Yonetimi</h2>
            <p>Cam turleri, m2 fiyatlari, fire ve indirim kurallari tek panelde yonetilir.</p>
          </div>
          {canWrite ? (
            <button type="button" className="solid-btn pricing-create-btn" onClick={() => setActiveForm(buildPriceCatalogForm())}>
              + Yeni Fiyat Kalemi
            </button>
          ) : null}
        </header>

        <section className="request-overview-grid">
          <article className="request-overview-card glass-card">
            <span>Toplam Fiyat Kalemi</span>
            <strong>{totalCount}</strong>
            <p>Aktif ve pasif tum satirlar</p>
          </article>
          <article className="request-overview-card glass-card">
            <span>Aktif Kural</span>
            <strong>{activeCount}</strong>
            <p>Teklif motorunda kullanilacak kayitlar</p>
          </article>
          <article className="request-overview-card glass-card">
            <span>Pasif Kural</span>
            <strong>{passiveCount}</strong>
            <p>Gecici olarak devre disi satirlar</p>
          </article>
        </section>

        <section className="glass-card panel request-filters-card">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="request-filter-grid">
            <label>
              Global Arama
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Urun kodu, urun turu veya aciklama"
              />
            </label>
            <label>
              Durum
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | PriceCatalogStatus)}>
                <option value="Tum Durumlar">Tum Durumlar</option>
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Pasif</option>
              </select>
            </label>
          </div>
        </section>

        <section className="glass-card panel request-table-card">
          <header className="panel-header request-table-header">
            <div>
              <h3>Fiyat Listesi</h3>
              <p>{filteredRows.length} kayit gosteriliyor</p>
            </div>
          </header>
          {feedbackMessage ? <p className="request-feedback-message">{feedbackMessage}</p> : null}
          {rowsState === 'error' ? <p className="ui-feedback-message request-item-feedback">Fiyat listesi yuklenemedi.</p> : null}
          {rowsState === 'steady' && filteredRows.length === 0 ? <p>Henuz bir fiyat kalemi yok.</p> : null}
          <div className="request-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Urun Kodu</th>
                  <th>Urun Turu</th>
                  <th>Birim</th>
                  <th>Birim Fiyat</th>
                  <th>Minimum Tutar</th>
                  <th>Fire Orani</th>
                  <th>Indirim</th>
                  <th>Durum</th>
                  <th>Guncelleme</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Urun Kodu">{row.productCode}</td>
                    <td data-label="Urun Turu">{row.productType}</td>
                    <td data-label="Birim">{row.baseUnit}</td>
                    <td data-label="Birim Fiyat">{formatMoney(Number(row.unitPrice), row.currency)}</td>
                    <td data-label="Minimum Tutar">{row.minimumOrderAmount ? formatMoney(Number(row.minimumOrderAmount), row.currency) : '-'}</td>
                    <td data-label="Fire Orani">{formatPercent(Number(row.defaultWasteRate))}</td>
                    <td data-label="Indirim">{formatPercent(Number(row.defaultDiscountRate))}</td>
                    <td data-label="Durum">
                      <span className={row.status === 'ACTIVE' ? 'status-pill read' : 'status-pill unread'}>{row.status === 'ACTIVE' ? 'Aktif' : 'Pasif'}</span>
                    </td>
                    <td data-label="Guncelleme">{formatApiDate(row.updatedAt)}</td>
                    <td data-label="Islemler">
                      <div className="shipment-row-actions">
                        <button type="button" className="ghost-btn shipment-action-btn" onClick={() => setViewRow(row)} aria-label="Goruntule">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        {canWrite ? (
                          <button type="button" className="ghost-btn shipment-action-btn" onClick={() => setActiveForm(buildPriceCatalogForm(row))} aria-label="Duzenle">
                            <span className="request-action-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none">
                                <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" />
                              </svg>
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <RequestModal
          open={Boolean(activeForm)}
          title={activeForm?.id ? 'Fiyat Kalemi Duzenle' : 'Yeni Fiyat Kalemi'}
          onClose={() => setActiveForm(null)}
          footer={
            <>
              <button type="button" className="ghost-btn" onClick={() => setActiveForm(null)}>
                Iptal
              </button>
              <button type="button" className="solid-btn" onClick={() => void handleSavePricing()} disabled={isSaving}>
                {isSaving ? 'Kaydediliyor...' : activeForm?.id ? 'Guncelle' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeForm && (
            <div className="request-form-grid">
              <label>
                Urun Kodu
                <input
                  type="text"
                  value={activeForm.productCode}
                  readOnly={Boolean(activeForm.id)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, productCode: event.target.value } : current))}
                  placeholder="Orn: TEMPERLI-8MM"
                />
              </label>
              <label>
                Urun Turu
                <input
                  type="text"
                  value={activeForm.productType}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, productType: event.target.value } : current))}
                  placeholder="Orn: Temperli Cephe Cami"
                />
              </label>
              <label className="full-width">
                Aciklama
                <input
                  type="text"
                  value={activeForm.description}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, description: event.target.value } : current))}
                  placeholder="Opsiyonel aciklama"
                />
              </label>
              <label>
                Birim
                <select
                  value={activeForm.baseUnit}
                  disabled={Boolean(activeForm.id)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, baseUnit: event.target.value as MeasurementUnit } : current))}
                >
                  <option value="M2">m2</option>
                  <option value="M">m</option>
                  <option value="M3">m3</option>
                  <option value="PIECE">Adet</option>
                </select>
              </label>
              <label>
                Birim Fiyat
                <input
                  type="text"
                  value={activeForm.unitPrice}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, unitPrice: event.target.value } : current))}
                  placeholder="Orn: 1280"
                />
              </label>
              <label>
                Para Birimi
                <input
                  type="text"
                  value={activeForm.currency}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, currency: event.target.value } : current))}
                  placeholder="TRY"
                />
              </label>
              <label>
                Minimum Siparis Tutari
                <input
                  type="text"
                  value={activeForm.minimumOrderAmount}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, minimumOrderAmount: event.target.value } : current))}
                  placeholder="Orn: 100000"
                />
              </label>
              <label>
                Fire Orani (%)
                <input
                  type="text"
                  value={activeForm.defaultWasteRate}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, defaultWasteRate: event.target.value } : current))}
                  placeholder="Orn: 3"
                />
              </label>
              <label>
                Indirim Orani (%)
                <input
                  type="text"
                  value={activeForm.defaultDiscountRate}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, defaultDiscountRate: event.target.value } : current))}
                  placeholder="Orn: 5"
                />
              </label>
              <label>
                Durum
                <select value={activeForm.status} onChange={(event) => setActiveForm((current) => (current ? { ...current, status: event.target.value as PriceCatalogStatus } : current))}>
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Pasif</option>
                </select>
              </label>
              {formError ? <p className="settings-form-error full-width">{formError}</p> : null}
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(viewRow)}
          title="Fiyat Kalemi Detayi"
          onClose={() => setViewRow(null)}
          footer={
            <button type="button" className="solid-btn" onClick={() => setViewRow(null)}>
              Kapat
            </button>
          }
        >
          {viewRow && (
            <div className="request-detail-grid">
              <article className="request-detail-card">
                <span>Urun Kodu</span>
                <strong>{viewRow.productCode}</strong>
              </article>
              <article className="request-detail-card">
                <span>Urun Turu</span>
                <strong>{viewRow.productType}</strong>
              </article>
              <article className="request-detail-card">
                <span>Birim Fiyat</span>
                <strong>{formatMoney(Number(viewRow.unitPrice), viewRow.currency)} / {viewRow.baseUnit}</strong>
              </article>
              <article className="request-detail-card">
                <span>Minimum Tutar</span>
                <strong>{viewRow.minimumOrderAmount ? formatMoney(Number(viewRow.minimumOrderAmount), viewRow.currency) : '-'}</strong>
              </article>
              <article className="request-detail-card">
                <span>Fire Orani</span>
                <strong>{formatPercent(Number(viewRow.defaultWasteRate))}</strong>
              </article>
              <article className="request-detail-card">
                <span>Indirim Orani</span>
                <strong>{formatPercent(Number(viewRow.defaultDiscountRate))}</strong>
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <strong>{viewRow.status === 'ACTIVE' ? 'Aktif' : 'Pasif'}</strong>
              </article>
              {viewRow.description ? (
                <article className="request-detail-card full-width">
                  <span>Aciklama</span>
                  <strong>{viewRow.description}</strong>
                </article>
              ) : null}
            </div>
          )}
        </RequestModal>
      </ScreenStateGate>
    </section>
  )
}

// Activities without an audienceCompany stay broadcast so older stored entries keep working.
function matchesAudience(activity: WorkflowActivity, role: UserRole, currentUser?: AuthenticatedUser | null): boolean {
  if (activity.audience !== 'ALL' && activity.audience !== role) {
    return false
  }

  if (!activity.audienceCompany || role === 'ADMIN') {
    return true
  }

  return toComparable(activity.audienceCompany) === toComparable(currentUser?.company ?? '')
}

export function MesajlarPage({ state, onRetry, role, currentUser, workflow, workflowActions, activityReadIds, onMarkActivityRead, onMarkAllActivitiesRead }: WorkspacePageProps) {
  const items = workflow.activityLog.filter((item) => item.channel === 'message' && matchesAudience(item, role, currentUser))
  const [isComposeOpen, setComposeOpen] = useState(false)
  const [audience, setAudience] = useState<'ADMIN' | 'MANUFACTURER' | 'BUYER'>('MANUFACTURER')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const unreadCount = items.filter((item) => !activityReadIds.includes(item.id)).length

  const handleSendMessage = () => {
    if (!title.trim() || !description.trim()) {
      return
    }

    workflowActions.sendMessage({
      audience,
      title: title.trim(),
      description: description.trim(),
    })
    setTitle('')
    setDescription('')
    setComposeOpen(false)
  }

  const roleOptions: Array<'ADMIN' | 'MANUFACTURER' | 'BUYER'> = ['ADMIN', 'MANUFACTURER', 'BUYER']

  return (
    <section className="workspace-main dashboard-main">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <header className="workspace-header glass-card dashboard-hero">
          <div>
            <p className="eyebrow">Mesaj Merkezi</p>
            <h2>Is Akisi Mesajlari</h2>
            <p>Workflow adimlarinda olusan sistem mesajlari burada rol bazli listelenir.</p>
          </div>
        </header>

        <section className="glass-card panel">
          <header className="panel-header">
            <h3>Guncel Mesajlar</h3>
            <div className="order-row-actions">
              <button type="button" className="ghost-btn" onClick={() => onMarkAllActivitiesRead('message')} disabled={unreadCount === 0}>
                Tumunu Okundu Isaretle
              </button>
              <button type="button" className="solid-btn" onClick={() => setComposeOpen(true)}>
                + Yeni Mesaj
              </button>
            </div>
          </header>
          <p>{`Toplam ${items.length} mesaj, ${unreadCount} okunmamis.`}</p>
          {items.length === 0 ? <p>Bu role ait yeni mesaj bulunmuyor.</p> : null}
          <div className="request-detail-grid">
            {items.map((item) => (
              <article key={item.id} className="request-detail-card full-width">
                <span>{item.createdAt}</span>
                <strong>{item.title}</strong>
                <span className={activityReadIds.includes(item.id) ? 'status-pill read' : 'status-pill unread'}>
                  {activityReadIds.includes(item.id) ? 'Okundu' : 'Okunmamis'}
                </span>
                <p>{item.description}</p>
                {item.senderName ? <p>{`Gonderen: ${item.senderName}`}</p> : null}
                {!activityReadIds.includes(item.id) ? (
                  <button type="button" className="ghost-btn" onClick={() => onMarkActivityRead(item.id)}>
                    Okundu Isaretle
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <RequestModal
          open={isComposeOpen}
          title="Yeni Mesaj"
          onClose={() => setComposeOpen(false)}
          footer={
            <>
              <button type="button" className="ghost-btn" onClick={() => setComposeOpen(false)}>
                Iptal
              </button>
              <button type="button" className="solid-btn" onClick={handleSendMessage}>
                Gonder
              </button>
            </>
          }
        >
          <div className="request-form-grid">
            <label>
              Gonderen
              <input type="text" readOnly value={currentUser?.fullName ?? '-'} />
            </label>
            <label>
              Alici Rol
              <select value={audience} onChange={(event) => setAudience(event.target.value as 'ADMIN' | 'MANUFACTURER' | 'BUYER')}>
                {roleOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Mesaj Basligi
              <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="full-width">
              Mesaj
              <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
          </div>
        </RequestModal>
      </ScreenStateGate>
    </section>
  )
}

export function BildirimlerPage({ state, onRetry, role, currentUser, workflow, activityReadIds, onMarkActivityRead, onMarkAllActivitiesRead, apiNotifications, onMarkApiNotificationRead, onMarkAllApiNotificationsRead }: WorkspacePageProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)

  if (apiEnabled) {
    const unreadCount = apiNotifications.filter((item) => !item.readAt).length

    return (
      <section className="workspace-main dashboard-main">
        <ScreenStateGate state={state} onRetry={onRetry}>
          <header className="workspace-header glass-card dashboard-hero">
            <div>
              <p className="eyebrow">Bildirim Merkezi</p>
              <h2>Canli Bildirimler</h2>
              <p>Talep, teklif, uretim ve sevkiyat durumlarina ait bildirimler rol bazli guncellenir.</p>
            </div>
          </header>

          <section className="glass-card panel">
            <header className="panel-header">
              <h3>Bildirim Akisi</h3>
              <button type="button" className="ghost-btn" onClick={onMarkAllApiNotificationsRead} disabled={unreadCount === 0}>
                Tumunu Okundu Isaretle
              </button>
            </header>
            <p>{`Toplam ${apiNotifications.length} bildirim, ${unreadCount} okunmamis.`}</p>
            {apiNotifications.length === 0 ? <p>Henuz bir bildiriminiz yok.</p> : null}
            <div className="request-detail-grid">
              {apiNotifications.map((item) => (
                <article key={item.id} className="request-detail-card full-width">
                  <span>{formatApiDate(item.createdAt)}</span>
                  <strong>{item.title}</strong>
                  <span className={item.readAt ? 'status-pill read' : 'status-pill unread'}>
                    {item.readAt ? 'Okundu' : 'Okunmamis'}
                  </span>
                  {item.body ? <p>{item.body}</p> : null}
                  {!item.readAt ? (
                    <button type="button" className="ghost-btn" onClick={() => onMarkApiNotificationRead(item.id)}>
                      Okundu Isaretle
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </ScreenStateGate>
      </section>
    )
  }

  const items = workflow.activityLog.filter((item) => item.channel === 'notification' && matchesAudience(item, role, currentUser))
  const unreadCount = items.filter((item) => !activityReadIds.includes(item.id)).length

  return (
    <section className="workspace-main dashboard-main">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <header className="workspace-header glass-card dashboard-hero">
          <div>
            <p className="eyebrow">Bildirim Merkezi</p>
            <h2>Canli Bildirimler</h2>
            <p>Talep, teklif, uretim ve sevkiyat durumlarina ait bildirimler rol bazli guncellenir.</p>
          </div>
        </header>

        <section className="glass-card panel">
          <header className="panel-header">
            <h3>Bildirim Akisi</h3>
            <button type="button" className="ghost-btn" onClick={() => onMarkAllActivitiesRead('notification')} disabled={unreadCount === 0}>
              Tumunu Okundu Isaretle
            </button>
          </header>
          <p>{`Toplam ${items.length} bildirim, ${unreadCount} okunmamis.`}</p>
          {items.length === 0 ? <p>Bu role ait yeni bildirim bulunmuyor.</p> : null}
          <div className="request-detail-grid">
            {items.map((item) => (
              <article key={item.id} className="request-detail-card full-width">
                <span>{item.createdAt}</span>
                <strong>{item.title}</strong>
                <span className={activityReadIds.includes(item.id) ? 'status-pill read' : 'status-pill unread'}>
                  {activityReadIds.includes(item.id) ? 'Okundu' : 'Okunmamis'}
                </span>
                <p>{item.description}</p>
                {!activityReadIds.includes(item.id) ? (
                  <button type="button" className="ghost-btn" onClick={() => onMarkActivityRead(item.id)}>
                    Okundu Isaretle
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </ScreenStateGate>
    </section>
  )
}

type ManufacturerCustomerApiStatus = ApiManufacturerCustomer['status']
type ManufacturerCustomerApiInviteStatus = ApiManufacturerCustomer['inviteStatus']

const MANUFACTURER_CUSTOMER_STATUS_TO_LABEL: Record<ManufacturerCustomerApiStatus, CompanyStatus> = {
  ACTIVE: 'Aktif',
  INACTIVE: 'Pasif',
  SUSPENDED: 'Askida',
}

const MANUFACTURER_CUSTOMER_LABEL_TO_STATUS: Record<CompanyStatus, ManufacturerCustomerApiStatus> = {
  Aktif: 'ACTIVE',
  Pasif: 'INACTIVE',
  Askida: 'SUSPENDED',
}

const MANUFACTURER_CUSTOMER_INVITE_LABELS: Record<ManufacturerCustomerApiInviteStatus, string> = {
  NOT_PREPARED: 'Hazir',
  PREPARED: 'Davet Hazirlandi',
  SENT: 'Gonderim Bekliyor',
  ACCEPTED: 'Kabul Edildi',
}

interface ManufacturerCustomerFormState {
  id?: string
  companyName: string
  contactName: string
  phone: string
  email: string
  taxOffice: string
  taxNo: string
  address: string
  city: string
  region: string
  status: CompanyStatus
  description: string
}

function buildManufacturerCustomerForm(row?: ApiManufacturerCustomer): ManufacturerCustomerFormState {
  if (row) {
    return {
      id: row.id,
      companyName: row.companyName,
      contactName: row.contactName,
      phone: row.phone,
      email: row.email,
      taxOffice: row.taxOffice,
      taxNo: row.taxNo,
      address: row.address,
      city: row.city,
      region: row.region,
      status: MANUFACTURER_CUSTOMER_STATUS_TO_LABEL[row.status],
      description: row.description,
    }
  }

  return {
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    taxOffice: '',
    taxNo: '',
    address: '',
    city: '',
    region: 'Marmara',
    status: 'Aktif',
    description: '',
  }
}

function validateManufacturerCustomerForm(form: ManufacturerCustomerFormState): string | null {
  if (!form.companyName.trim() || !form.contactName.trim() || !form.phone.trim() || !form.email.trim() || !form.taxOffice.trim() || !form.taxNo.trim() || !form.address.trim() || !form.city.trim() || !form.region.trim() || !form.description.trim()) {
    return 'Lutfen zorunlu alanlari doldurun.'
  }

  if (form.companyName.trim().length > 120) {
    return 'Firma adi en fazla 120 karakter olabilir.'
  }

  if (form.contactName.trim().length > 80) {
    return 'Yetkili kisi alani en fazla 80 karakter olabilir.'
  }

  if (!/^\+?[0-9\s-]{10,20}$/.test(form.phone.trim())) {
    return 'Telefon numarasi gecersiz formatta.'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return 'E-posta adresi gecersiz.'
  }

  if (!/^\d{10,12}$/.test(form.taxNo.trim())) {
    return 'Vergi no 10 veya 12 haneli sayisal deger olmalidir.'
  }

  if (form.address.trim().length > 300) {
    return 'Adres en fazla 300 karakter olabilir.'
  }

  if (form.description.trim().length > 500) {
    return 'Aciklama en fazla 500 karakter olabilir.'
  }

  return null
}

function manufacturerCustomerApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Firma kaydi kaydedilemedi.'
}

export function FirmalarPage(props: WorkspacePageProps) {
  return props.role === 'ADMIN' ? <AdminCompaniesPage {...props} /> : <LegacyFirmalarPage {...props} />
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const diffMs = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

function AdminCompaniesPage({ state, onRetry, currentUser }: WorkspacePageProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)

  const [companies, setCompanies] = useState<ApiCompany[]>([])
  const [users, setUsers] = useState<ApiUser[]>([])
  const [regions, setRegions] = useState<ApiRegion[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'steady' | 'error'>('idle')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'Tumu' | 'Uretici' | 'Alici'>('Tumu')
  const [regionFilter, setRegionFilter] = useState('Tumu')
  const [statusFilter, setStatusFilter] = useState<'Tumu' | 'Aktif' | 'Pasif'>('Tumu')
  const [viewCompany, setViewCompany] = useState<ApiCompany | null>(null)

  const loadAll = useCallback(async () => {
    setLoadState('loading')
    try {
      const [companiesData, usersData, regionsData] = await Promise.all([
        companiesApi.list(),
        usersApi.list(),
        regionsApi.list(),
      ])
      setCompanies(companiesData)
      setUsers(usersData)
      setRegions(regionsData)
      setLoadState('steady')
    } catch {
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    if (apiEnabled) {
      void loadAll()
    }
  }, [apiEnabled, loadAll])

  const regionNameById = useMemo(() => new Map(regions.map((region) => [region.id, region.name])), [regions])
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])

  const filteredCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return companies.filter((company) => {
      const matchesType =
        typeFilter === 'Tumu' ||
        (typeFilter === 'Uretici' && isProducerCompany(company)) ||
        (typeFilter === 'Alici' && !isProducerCompany(company))
      const matchesRegion = regionFilter === 'Tumu' || company.regionId === regionFilter
      const matchesStatus =
        statusFilter === 'Tumu' ||
        (statusFilter === 'Aktif' && company.status === 'ACTIVE') ||
        (statusFilter === 'Pasif' && company.status !== 'ACTIVE')
      const matchesQuery =
        !normalizedQuery
        || `${company.legalName} ${company.tradeName ?? ''} ${company.contactEmail ?? ''} ${company.contactPhone ?? ''}`
          .toLowerCase()
          .includes(normalizedQuery)
      return matchesType && matchesRegion && matchesStatus && matchesQuery
    })
  }, [companies, query, regionFilter, statusFilter, typeFilter])

  return (
    <section className="workspace-main dashboard-main settings-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="settings-header-row">
          <header className="workspace-header glass-card dashboard-hero settings-hero">
            <div>
              <p className="eyebrow">Platform Yonetimi</p>
              <h2>Firmalar</h2>
              <p>Platformdaki tum uretici ve alici firmalarin iletisim bilgilerine ve aktivasyon gecmisine buradan ulasin.</p>
            </div>
          </header>
        </section>

        {!apiEnabled ? (
          <section className="glass-card panel settings-table-panel">
            <header className="panel-header settings-table-head">
              <div>
                <h3>Firmalar</h3>
                <p>Bu bolum gercek oturum gerektirir; lutfen kurumsal hesabinizla giris yapin.</p>
              </div>
            </header>
          </section>
        ) : loadState === 'error' ? (
          <section className="glass-card panel settings-table-panel">
            <p className="ui-feedback-message request-item-feedback">Firmalar yuklenemedi.</p>
            <button type="button" className="ghost-btn" onClick={() => void loadAll()}>Yeniden dene</button>
          </section>
        ) : (
          <>
            <section className="glass-card panel settings-filter-panel">
              <header className="panel-header">
                <h3>Filtreler</h3>
              </header>
              <div className="settings-filter-grid">
                <label className="settings-filter-field settings-filter-search">
                  <span>Ara</span>
                  <input
                    type="search"
                    value={query}
                    placeholder="Firma adi, e-posta veya telefon"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="settings-filter-field">
                  <span>Tur</span>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
                    <option value="Tumu">Tumu</option>
                    <option value="Uretici">Uretici</option>
                    <option value="Alici">Alici</option>
                  </select>
                </label>
                <label className="settings-filter-field">
                  <span>Bolge</span>
                  <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
                    <option value="Tumu">Tumu</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>{region.name}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-filter-field">
                  <span>Durum</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                    <option value="Tumu">Tumu</option>
                    <option value="Aktif">Aktif</option>
                    <option value="Pasif">Pasif</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="glass-card panel settings-table-panel">
              <header className="panel-header settings-table-head">
                <div>
                  <h3>Firma Listesi</h3>
                  <p>{filteredCompanies.length} kayit gosteriliyor</p>
                </div>
              </header>

              {loadState === 'steady' && filteredCompanies.length === 0 ? <p>Kayitli firma bulunamadi.</p> : null}

              {loadState === 'loading' ? (
                <p>Yukleniyor...</p>
              ) : (
                <div className="table-wrap settings-table-wrap">
                  <table className="settings-table">
                    <thead>
                      <tr>
                        <th>Firma Adi</th>
                        <th>Tur</th>
                        <th>Bolge</th>
                        <th>Durum</th>
                        <th>Aktivasyon</th>
                        <th>Iletisim</th>
                        <th>Islem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map((company) => {
                        const activeDays = company.status === 'ACTIVE' ? daysSince(company.activatedAt) : null
                        return (
                          <tr key={company.id}>
                            <td>{company.tradeName || company.legalName}</td>
                            <td>{isProducerCompany(company) ? 'Uretici' : 'Alici'}</td>
                            <td>{company.regionId ? regionNameById.get(company.regionId) ?? '-' : '-'}</td>
                            <td>
                              <span className={company.status === 'ACTIVE' ? 'status-pill read' : 'status-pill unread'}>
                                {company.status === 'ACTIVE' ? 'Aktif' : company.status === 'SUSPENDED' ? 'Askida' : 'Pasif'}
                              </span>
                            </td>
                            <td>{activeDays === null ? '-' : `${activeDays} gundur aktif`}</td>
                            <td>{company.contactEmail ?? company.contactPhone ?? '-'}</td>
                            <td>
                              <button type="button" className="ghost-btn settings-action-btn" onClick={() => setViewCompany(company)}>
                                Detay
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <RequestModal
          open={Boolean(viewCompany)}
          title={viewCompany?.tradeName || viewCompany?.legalName || 'Firma Detayi'}
          onClose={() => setViewCompany(null)}
          footer={<button type="button" className="ghost-btn" onClick={() => setViewCompany(null)}>Kapat</button>}
        >
          {viewCompany ? (
            <div className="request-overview-grid">
              <article className="request-detail-card">
                <span>Yasal Unvan</span>
                <strong>{viewCompany.legalName}</strong>
              </article>
              <article className="request-detail-card">
                <span>Tur</span>
                <strong>{isProducerCompany(viewCompany) ? 'Uretici' : 'Alici'} ({viewCompany.companyType})</strong>
              </article>
              <article className="request-detail-card">
                <span>Firma Turu / Meslek</span>
                <strong>{viewCompany.businessDescription ?? '-'}</strong>
              </article>
              <article className="request-detail-card">
                <span>Bolge</span>
                <strong>{viewCompany.regionId ? regionNameById.get(viewCompany.regionId) ?? '-' : '-'}</strong>
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <strong>{viewCompany.status === 'ACTIVE' ? 'Aktif' : viewCompany.status === 'SUSPENDED' ? 'Askida' : 'Pasif'}</strong>
              </article>
              <article className="request-detail-card">
                <span>Onay Durumu</span>
                <strong>
                  {viewCompany.verificationStatus === 'VERIFIED' ? 'Onaylandi' : viewCompany.verificationStatus === 'REJECTED' ? 'Reddedildi' : 'Beklemede'}
                </strong>
              </article>
              <article className="request-detail-card">
                <span>Aktivasyon Tarihi</span>
                <strong>{viewCompany.activatedAt ? new Date(viewCompany.activatedAt).toLocaleDateString('tr-TR') : 'Henuz aktif edilmedi'}</strong>
                {viewCompany.status === 'ACTIVE' && viewCompany.activatedAt ? <small>{daysSince(viewCompany.activatedAt)} gundur aktif</small> : null}
              </article>
              <article className="request-detail-card">
                <span>E-posta</span>
                <strong>{viewCompany.contactEmail ? <a href={`mailto:${viewCompany.contactEmail}`}>{viewCompany.contactEmail}</a> : '-'}</strong>
              </article>
              <article className="request-detail-card">
                <span>Telefon</span>
                <strong>{viewCompany.contactPhone ? <a href={`tel:${viewCompany.contactPhone}`}>{viewCompany.contactPhone}</a> : '-'}</strong>
              </article>
              <article className="request-detail-card">
                <span>Vergi No</span>
                <strong>{viewCompany.taxNumber ?? '-'}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Uyeler ({viewCompany.memberships.length})</span>
                {viewCompany.memberships.length === 0 ? (
                  <strong>Kayitli uye yok</strong>
                ) : (
                  <ul className="admin-company-member-list">
                    {viewCompany.memberships.map((membership) => {
                      const user = userById.get(membership.userId)
                      return (
                        <li key={membership.id}>
                          <strong>{user?.fullName ?? 'Bilinmeyen kullanici'}</strong>
                          <span>{user?.email ?? membership.userId}</span>
                          <span>{membership.role} - {membership.status === 'ACTIVE' ? 'Aktif' : 'Pasif'}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>
            </div>
          ) : null}
        </RequestModal>
      </ScreenStateGate>
    </section>
  )
}

function LegacyFirmalarPage({ state, onRetry, currentUser, role }: WorkspacePageProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)
  const canWrite = canWriteView(role, 'companies')
  const [rows, setRows] = useState<ApiManufacturerCustomer[]>([])
  const [rowsState, setRowsState] = useState<'idle' | 'loading' | 'steady' | 'error'>('idle')
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('Tum Sehirler')
  const [region, setRegion] = useState('Tum Bolgeler')
  const [status, setStatus] = useState<'Tum Durumlar' | CompanyStatus>('Tum Durumlar')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeForm, setActiveForm] = useState<ManufacturerCustomerFormState | null>(null)
  const [viewRow, setViewRow] = useState<ApiManufacturerCustomer | null>(null)
  const [deleteRow, setDeleteRow] = useState<ApiManufacturerCustomer | null>(null)
  const [formError, setFormError] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const loadCustomers = useCallback(async () => {
    setRowsState('loading')
    try {
      const items = await manufacturerCustomersApi.list()
      setRows(items)
      setRowsState('steady')
    } catch {
      setRows([])
      setRowsState('error')
    }
  }, [])

  useEffect(() => {
    if (apiEnabled) {
      void loadCustomers()
    }
  }, [apiEnabled, loadCustomers])

  const companyCities = useMemo(() => ['Tum Sehirler', ...new Set(rows.map((row) => row.city))], [rows])
  const regionOptions = useMemo(() => ['Tum Bolgeler', ...new Set(rows.map((row) => row.region))], [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesQuery =
        !query.trim() ||
        `${row.code} ${row.companyName} ${row.contactName} ${row.phone} ${row.email} ${row.taxNo} ${row.address} ${row.description}`.toLowerCase().includes(query.toLowerCase())
      const matchesCity = city === 'Tum Sehirler' || row.city === city
      const matchesRegion = region === 'Tum Bolgeler' || row.region === region
      const matchesStatus = status === 'Tum Durumlar' || MANUFACTURER_CUSTOMER_STATUS_TO_LABEL[row.status] === status
      const rowTime = new Date(row.createdAt).getTime()
      const matchesStart = !startDate || rowTime >= new Date(startDate).getTime()
      const matchesEnd = !endDate || rowTime <= new Date(endDate).getTime()
      return matchesQuery && matchesCity && matchesRegion && matchesStatus && matchesStart && matchesEnd
    })
  }, [city, endDate, query, region, rows, startDate, status])

  const totalCount = filteredRows.length
  const activeCount = filteredRows.filter((row) => row.status === 'ACTIVE').length
  const passiveCount = filteredRows.filter((row) => row.status === 'INACTIVE').length
  const waitingCount = filteredRows.filter((row) => row.status === 'SUSPENDED').length

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  const handleSaveCompany = async () => {
    if (!activeForm) {
      return
    }

    const validationError = validateManufacturerCustomerForm(activeForm)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setIsSaving(true)
    setFormError('')

    try {
      if (activeForm.id) {
        await manufacturerCustomersApi.update(activeForm.id, {
          companyName: activeForm.companyName.trim(),
          contactName: activeForm.contactName.trim(),
          phone: activeForm.phone.trim(),
          email: activeForm.email.trim(),
          taxOffice: activeForm.taxOffice.trim(),
          taxNo: activeForm.taxNo.trim(),
          address: activeForm.address.trim(),
          city: activeForm.city.trim(),
          region: activeForm.region.trim(),
          description: activeForm.description.trim(),
          status: MANUFACTURER_CUSTOMER_LABEL_TO_STATUS[activeForm.status],
        })
        setFeedbackMessage('Firma kaydi guncellendi.')
      } else if (currentUser?.companyId) {
        await manufacturerCustomersApi.create({
          manufacturerCompanyId: currentUser.companyId,
          companyName: activeForm.companyName.trim(),
          contactName: activeForm.contactName.trim(),
          phone: activeForm.phone.trim(),
          email: activeForm.email.trim(),
          taxOffice: activeForm.taxOffice.trim(),
          taxNo: activeForm.taxNo.trim(),
          address: activeForm.address.trim(),
          city: activeForm.city.trim(),
          region: activeForm.region.trim(),
          description: activeForm.description.trim(),
          status: MANUFACTURER_CUSTOMER_LABEL_TO_STATUS[activeForm.status],
        })
        setFeedbackMessage('Yeni firma kaydi olusturuldu.')
      } else {
        setFormError('Aktif sirket uyeligi bulunamadigi icin firma kaydedilemedi.')
        return
      }

      await loadCustomers()
      setActiveForm(null)
    } catch (error) {
      setFormError(manufacturerCustomerApiErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleStatus = async (row: ApiManufacturerCustomer) => {
    try {
      const nextStatus: ManufacturerCustomerApiStatus = row.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE'
      await manufacturerCustomersApi.update(row.id, { status: nextStatus })
      await loadCustomers()
      setFeedbackMessage(nextStatus === 'ACTIVE' ? 'Firma tekrar aktif edildi.' : 'Firma pasife alindi.')
    } catch (error) {
      setFeedbackMessage(manufacturerCustomerApiErrorMessage(error))
    }
  }

  const handlePrepareInvite = async (row: ApiManufacturerCustomer) => {
    try {
      await manufacturerCustomersApi.prepareInvite(row.id)
      await loadCustomers()
      setFeedbackMessage('Musteri davet kaydi hazirlandi.')
    } catch (error) {
      setFeedbackMessage(manufacturerCustomerApiErrorMessage(error))
    }
  }

  const handleDeleteCompany = async () => {
    if (!deleteRow) {
      return
    }

    try {
      await manufacturerCustomersApi.remove(deleteRow.id)
      await loadCustomers()
      setFeedbackMessage('Firma kaydi silindi.')
    } catch (error) {
      setFeedbackMessage(manufacturerCustomerApiErrorMessage(error))
    } finally {
      setDeleteRow(null)
    }
  }

  if (!apiEnabled) {
    return (
      <section className="workspace-main dashboard-main">
        <ScreenStateGate state={state} onRetry={onRetry}>
          <header className="workspace-header glass-card dashboard-hero">
            <div>
              <p className="eyebrow">Musteri Portfoy Yonetimi</p>
              <h2>Firma Yonetimi</h2>
              <p>Bu bolum gercek oturum gerektirir; lutfen kurumsal hesabinizla giris yapin.</p>
            </div>
          </header>
        </ScreenStateGate>
      </section>
    )
  }

  return (
    <section className="workspace-main dashboard-main companies-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="companies-header-row">
          <header className="workspace-header glass-card dashboard-hero companies-hero">
            <div>
              <p className="eyebrow">Musteri Portfoy Yonetimi</p>
              <h2>Firma Yonetimi</h2>
              <p>Uretici portfoyundeki musterileri yonetin, davet altyapisini hazirlayin ve musteri durumlarini takip edin.</p>
            </div>
          </header>

          {canWrite ? (
            <button
              type="button"
              className="solid-btn companies-create-btn"
              onClick={() => {
                setFormError('')
                setActiveForm(buildManufacturerCustomerForm())
              }}
            >
              + Yeni Firma
            </button>
          ) : null}
        </section>

        <section className="stat-grid companies-stats-grid">
          <article className="glass-card stat-card companies-stat-card">
            <span>Toplam Musteri</span>
            <strong>{totalCount}</strong>
            <small>Portfoydeki musteri havuzu</small>
          </article>
          <article className="glass-card stat-card companies-stat-card">
            <span>Aktif Firmalar</span>
            <strong>{activeCount}</strong>
            <small>Operasyonda aktif olanlar</small>
          </article>
          <article className="glass-card stat-card companies-stat-card">
            <span>Pasif Firmalar</span>
            <strong>{passiveCount}</strong>
            <small>Gecici olarak pasif kayitlar</small>
          </article>
          <article className="glass-card stat-card companies-stat-card">
            <span>Askidaki Firmalar</span>
            <strong>{waitingCount}</strong>
            <small>Onay veya mutabakat bekleyenler</small>
          </article>
        </section>

        <section className="glass-card panel companies-filter-panel">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="companies-filter-grid">
            <label className="companies-filter-field companies-filter-search">
              <span>Global Arama</span>
              <input type="search" value={query} placeholder="Firma, yetkili veya telefon ara" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="companies-filter-field">
              <span>Sehir</span>
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                {companyCities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="companies-filter-field">
              <span>Durum</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | CompanyStatus)}>
                {companyStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="companies-filter-field">
              <span>Bolge</span>
              <select value={region} onChange={(event) => setRegion(event.target.value)}>
                {regionOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="companies-filter-field companies-date-range">
              <span>Tarih Araligi</span>
              <div className="companies-date-inputs">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card panel companies-table-panel">
          <header className="panel-header companies-table-head">
            <div>
              <h3>Musteri Listesi</h3>
              <p>{filteredRows.length} kayit gosteriliyor</p>
            </div>
          </header>

          {feedbackMessage && <p className="ui-feedback-message settings-feedback-message">{feedbackMessage}</p>}
          {rowsState === 'error' ? <p className="ui-feedback-message request-item-feedback">Firma listesi yuklenemedi.</p> : null}
          {rowsState === 'steady' && filteredRows.length === 0 ? <p>Henuz bir firma kaydi yok.</p> : null}

          <div className="table-wrap companies-table-wrap">
            <table className="companies-table">
              <thead>
                <tr>
                  <th>Firma Kodu</th>
                  <th>Firma Adi</th>
                  <th>Yetkili Kisi</th>
                  <th>Telefon</th>
                  <th>E-posta</th>
                  <th>Vergi Bilgisi</th>
                  <th>Sehir</th>
                  <th>Bolge</th>
                  <th>Durum</th>
                  <th>Davet</th>
                  <th>Kayit Tarihi</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Firma Kodu">{row.code}</td>
                    <td data-label="Firma Adi">{row.companyName}</td>
                    <td data-label="Yetkili Kisi">{row.contactName}</td>
                    <td data-label="Telefon">{row.phone}</td>
                    <td data-label="E-posta">{row.email}</td>
                    <td data-label="Vergi Bilgisi">{`${row.taxOffice} / ${row.taxNo}`}</td>
                    <td data-label="Sehir">{row.city}</td>
                    <td data-label="Bolge">{row.region}</td>
                    <td data-label="Durum">
                      <CompanyStatusBadge status={MANUFACTURER_CUSTOMER_STATUS_TO_LABEL[row.status]} />
                    </td>
                    <td data-label="Davet">{MANUFACTURER_CUSTOMER_INVITE_LABELS[row.inviteStatus]}</td>
                    <td data-label="Kayit Tarihi">{formatApiDate(row.createdAt)}</td>
                    <td data-label="Islemler">
                      <div className="companies-row-actions">
                        <button type="button" className="ghost-btn companies-action-btn" onClick={() => setViewRow(row)} aria-label="Goruntule">
                          <span className="request-action-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          </span>
                        </button>
                        {canWrite ? (
                          <>
                            <button
                              type="button"
                              className="ghost-btn companies-action-btn"
                              onClick={() => {
                                setFormError('')
                                setActiveForm(buildManufacturerCustomerForm(row))
                              }}
                              aria-label="Duzenle"
                            >
                              <span className="request-action-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                  <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                  <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" />
                                </svg>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="ghost-btn companies-action-btn"
                              aria-label="Pasife Al"
                              onClick={() => void handleToggleStatus(row)}
                            >
                              {row.status === 'INACTIVE' ? 'Aktif Et' : 'Pasife Al'}
                            </button>
                            <button
                              type="button"
                              className="ghost-btn companies-action-btn"
                              aria-label="Davet Hazirla"
                              onClick={() => void handlePrepareInvite(row)}
                            >
                              Davet Hazirla
                            </button>
                          </>
                        ) : null}
                        {canWrite ? (
                          <button type="button" className="ghost-btn companies-action-btn companies-action-danger" onClick={() => setDeleteRow(row)} aria-label="Sil">
                            <span className="request-action-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none">
                                <path d="M9 5h6M5 8h14M9 10v6M15 10v6M7 8l1 11h8l1-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <RequestModal
          open={Boolean(activeForm)}
          title={activeForm?.id ? 'Firma Duzenle' : 'Yeni Firma'}
          onClose={() => {
            setFormError('')
            setActiveForm(null)
          }}
          footer={
            <>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setFormError('')
                  setActiveForm(null)
                }}
              >
                Iptal
              </button>
              <button type="button" className="solid-btn" onClick={() => void handleSaveCompany()} disabled={isSaving}>
                {isSaving ? 'Kaydediliyor...' : activeForm?.id ? 'Guncelle' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeForm && (
            <div className="request-form-grid">
              <label className="full-width">
                Firma Adi
                <input type="text" value={activeForm.companyName} onChange={(event) => setActiveForm((current) => (current ? { ...current, companyName: event.target.value } : current))} />
              </label>
              <label>
                Yetkili Kisi
                <input type="text" value={activeForm.contactName} onChange={(event) => setActiveForm((current) => (current ? { ...current, contactName: event.target.value } : current))} />
              </label>
              <label>
                Telefon
                <input type="text" value={activeForm.phone} onChange={(event) => setActiveForm((current) => (current ? { ...current, phone: event.target.value } : current))} />
              </label>
              <label>
                E-posta
                <input type="email" value={activeForm.email} onChange={(event) => setActiveForm((current) => (current ? { ...current, email: event.target.value } : current))} />
              </label>
              <label>
                Vergi Dairesi
                <input type="text" value={activeForm.taxOffice} onChange={(event) => setActiveForm((current) => (current ? { ...current, taxOffice: event.target.value } : current))} />
              </label>
              <label>
                Vergi No
                <input type="text" value={activeForm.taxNo} onChange={(event) => setActiveForm((current) => (current ? { ...current, taxNo: event.target.value } : current))} />
              </label>
              <label>
                Sehir
                <input type="text" value={activeForm.city} onChange={(event) => setActiveForm((current) => (current ? { ...current, city: event.target.value } : current))} />
              </label>
              <label>
                Bolge
                <select value={activeForm.region} onChange={(event) => setActiveForm((current) => (current ? { ...current, region: event.target.value } : current))}>
                  {companyRegions
                    .filter((item) => item !== 'Tum Bolgeler')
                    .map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Firma Durumu
                <select value={activeForm.status} onChange={(event) => setActiveForm((current) => (current ? { ...current, status: event.target.value as CompanyStatus } : current))}>
                  {companyStatuses
                    .filter((item) => item !== 'Tum Durumlar')
                    .map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                </select>
              </label>
              <label className="full-width">
                Adres
                <textarea rows={3} value={activeForm.address} onChange={(event) => setActiveForm((current) => (current ? { ...current, address: event.target.value } : current))} />
              </label>
              <label className="full-width">
                Aciklama
                <textarea rows={4} value={activeForm.description} onChange={(event) => setActiveForm((current) => (current ? { ...current, description: event.target.value } : current))} />
              </label>
              {formError ? <p className="settings-form-error full-width">{formError}</p> : null}
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(viewRow)}
          title="Firma Detayi"
          onClose={() => setViewRow(null)}
          footer={
            <button type="button" className="solid-btn" onClick={() => setViewRow(null)}>
              Kapat
            </button>
          }
        >
          {viewRow && (
            <div className="request-detail-grid">
              <article className="request-detail-card">
                <span>Firma Kodu</span>
                <strong>{viewRow.code}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Firma Adi</span>
                <strong>{viewRow.companyName}</strong>
              </article>
              <article className="request-detail-card">
                <span>Yetkili Kisi</span>
                <strong>{viewRow.contactName}</strong>
              </article>
              <article className="request-detail-card">
                <span>Telefon</span>
                <strong>{viewRow.phone}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>E-posta</span>
                <strong>{viewRow.email}</strong>
              </article>
              <article className="request-detail-card">
                <span>Vergi Dairesi</span>
                <strong>{viewRow.taxOffice}</strong>
              </article>
              <article className="request-detail-card">
                <span>Vergi No</span>
                <strong>{viewRow.taxNo}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Adres</span>
                <strong>{viewRow.address}</strong>
              </article>
              <article className="request-detail-card">
                <span>Sehir</span>
                <strong>{viewRow.city}</strong>
              </article>
              <article className="request-detail-card">
                <span>Bolge</span>
                <strong>{viewRow.region}</strong>
              </article>
              <article className="request-detail-card">
                <span>Davet Durumu</span>
                <strong>{MANUFACTURER_CUSTOMER_INVITE_LABELS[viewRow.inviteStatus]}</strong>
              </article>
              <article className="request-detail-card">
                <span>Firma Durumu</span>
                <CompanyStatusBadge status={MANUFACTURER_CUSTOMER_STATUS_TO_LABEL[viewRow.status]} />
              </article>
              <article className="request-detail-card">
                <span>Kayit Tarihi</span>
                <strong>{formatApiDate(viewRow.createdAt)}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Aciklama</span>
                <strong>{viewRow.description}</strong>
              </article>
              {viewRow.inviteToken ? (
                <article className="request-detail-card full-width">
                  <span>Davet Referansi</span>
                  <strong>{`${viewRow.inviteToken} · ${formatApiDate(viewRow.invitePreparedAt)} · ${viewRow.invitePreparedBy ?? '-'}`}</strong>
                </article>
              ) : null}
            </div>
          )}
        </RequestModal>

        <DeleteConfirmationModal
          open={Boolean(deleteRow)}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => void handleDeleteCompany()}
        />
      </ScreenStateGate>
    </section>
  )
}

export function RaporlarPage(props: WorkspacePageProps) {
  return props.role === 'ADMIN' ? <AdminReportsPage {...props} /> : <LegacyRaporlarPage {...props} />
}

function LegacyRaporlarPage({ state, onRetry, currentUser, role, workflow }: WorkspacePageProps) {
  const [company, setCompany] = useState(() => (currentUser && currentUser.role !== 'ADMIN' ? currentUser.company : 'Tum Firmalar'))
  const [reportType, setReportType] = useState<'Tum Rapor Turleri' | ReportType>('Tum Rapor Turleri')
  const [status, setStatus] = useState<'Tum Durumlar' | ReportStatus>('Tum Durumlar')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeReport, setActiveReport] = useState<ReportRow | null>(null)

  const scopedRequestRows = useMemo(() => scopeRequests(workflow.requests, currentUser), [currentUser, workflow.requests])
  const scopedOfferRows = useMemo(() => scopeOffers(workflow.offers, workflow.requests, currentUser), [currentUser, workflow.offers, workflow.requests])
  const scopedOrderRows = useMemo(() => scopeRowsByCompany(workflow.orders, currentUser), [currentUser, workflow.orders])
  const scopedProductionRows = useMemo(() => scopeRowsByCompany(workflow.productions, currentUser), [currentUser, workflow.productions])
  const scopedShipmentRows = useMemo(() => scopeRowsByCompany(workflow.shipments, currentUser), [currentUser, workflow.shipments])
  const scopedCompanyRows = useMemo(() => scopeCompanies(workflow.manufacturerCustomers, currentUser), [currentUser, workflow.manufacturerCustomers])
  const scopedReportRows = useMemo(() => scopeReports(reportRows, currentUser), [currentUser])

  const companyOptions = useMemo(() => {
    if (currentUser && currentUser.role !== 'ADMIN') {
      return [currentUser.company]
    }

    return [
      'Tum Firmalar',
      ...new Set([
        ...workflow.requests.map((row) => row.company),
        ...workflow.offers.map((row) => row.company),
        ...workflow.orders.map((row) => row.company),
        ...workflow.productions.map((row) => row.company),
        ...workflow.shipments.map((row) => row.company),
        ...workflow.manufacturerCustomers.map((row) => row.name),
      ]),
    ]
  }, [currentUser, workflow.manufacturerCustomers, workflow.offers, workflow.orders, workflow.productions, workflow.requests, workflow.shipments])

  const startTimestamp = startDate ? new Date(startDate).getTime() : Number.NEGATIVE_INFINITY
  const endTimestamp = endDate ? new Date(endDate).getTime() : Number.POSITIVE_INFINITY

  const isInRange = (value: string) => {
    const timestamp = new Date(value.split('.').reverse().join('-')).getTime()
    return timestamp >= startTimestamp && timestamp <= endTimestamp
  }

  const filteredRequests = scopedRequestRows.filter((row) => (company === 'Tum Firmalar' || row.company === company) && isInRange(row.createdAt))
  const filteredOffers = scopedOfferRows.filter((row) => (company === 'Tum Firmalar' || row.company === company) && isInRange(row.createdAt))
  const filteredOrders = scopedOrderRows.filter((row) => (company === 'Tum Firmalar' || row.company === company) && isInRange(row.createdAt))
  const filteredProduction = scopedProductionRows.filter((row) => (company === 'Tum Firmalar' || row.company === company) && isInRange(row.startedAt))
  const filteredShipment = scopedShipmentRows.filter((row) => (company === 'Tum Firmalar' || row.company === company) && isInRange(row.departureDate))
  const filteredCompanies = scopedCompanyRows.filter((row) => (company === 'Tum Firmalar' || row.name === company) && isInRange(row.createdAt))

  const filteredReports = scopedReportRows.filter((row) => {
    const matchesType = reportType === 'Tum Rapor Turleri' || row.type === reportType
    const matchesStatus = status === 'Tum Durumlar' || row.status === status
    const matchesDate = isInRange(row.createdAt)
    return matchesType && matchesStatus && matchesDate
  })

  const workflowReports = workflow.activityLog.filter((item) => item.channel === 'report' && matchesAudience(item, role, currentUser))

  const activeMetricKeys = useMemo(() => {
    const keys = new Set<string>()
    filteredReports.forEach((report) => {
      if (report.name === 'Talepler Raporu') {
        keys.add('requests')
      }
      if (report.name === 'Teklif Performansi') {
        keys.add('offers')
      }
      if (report.name === 'Siparis Analizi') {
        keys.add('orders')
      }
      if (report.name === 'Uretim Performansi') {
        keys.add('production')
      }
      if (report.name === 'Sevkiyat Performansi') {
        keys.add('shipment')
      }
      if (report.name === 'Firma Analizi') {
        keys.add('companies')
      }
    })
    return keys
  }, [filteredReports])

  const summaryStats = useMemo(
    () => [
      {
        label: 'Toplam Talepler',
        value: activeMetricKeys.has('requests') ? filteredRequests.length : 0,
        note: 'Filtre kriterlerine uyan talep kayitlari',
      },
      {
        label: 'Toplam Teklifler',
        value: activeMetricKeys.has('offers') ? filteredOffers.length : 0,
        note: 'Filtre kriterlerine uyan teklif kayitlari',
      },
      {
        label: 'Toplam Siparisler',
        value: activeMetricKeys.has('orders') ? filteredOrders.length : 0,
        note: 'Filtre kriterlerine uyan siparis kayitlari',
      },
      {
        label: 'Tamamlanan Uretimler',
        value: activeMetricKeys.has('production') ? filteredProduction.filter((row) => row.status === 'Tamamlandi').length : 0,
        note: 'Tamamlandi durumundaki uretim emirleri',
      },
      {
        label: 'Tamamlanan Sevkiyatlar',
        value: activeMetricKeys.has('shipment') ? filteredShipment.filter((row) => row.status === 'Teslim Edildi').length : 0,
        note: 'Teslim edildi durumundaki sevkiyatlar',
      },
      {
        label: 'Toplam Firma Sayisi',
        value: activeMetricKeys.has('companies') ? filteredCompanies.length : 0,
        note: 'Filtre kriterlerine uyan firma kayitlari',
      },
    ],
    [activeMetricKeys, filteredCompanies, filteredOffers, filteredOrders, filteredProduction, filteredRequests, filteredShipment],
  )

  const reportDescriptions: Record<string, string> = {
    'Talepler Raporu': 'Talep yogunlugu, oncelik dagilimi ve geri donus surelerini ozetler.',
    'Teklif Performansi': 'Teklif oranlari, onay red dagilimi ve tutar performansini izler.',
    'Siparis Analizi': 'Siparis akis hizini, termin uyumunu ve operasyonel darbogazlari gosterir.',
    'Uretim Performansi': 'Hat bazli tamamlanma, kapasite kullanimi ve kritik is emirlerini sunar.',
    'Sevkiyat Performansi': 'Teslimat hizi, gecikme oranlari ve sevkiyat kapanis performansini raporlar.',
    'Firma Analizi': 'Firma aktivitesi, durum dagilimi ve segment bazli ticari gorunumu verir.',
  }

  const reportIcon = (name: string) => {
    if (name === 'Talepler Raporu') {
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4h14v16H5z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 9h8M8 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    }

    if (name === 'Teklif Performansi') {
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M7 16V8M12 16V5M17 16v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    }

    if (name === 'Siparis Analizi') {
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    }

    if (name === 'Uretim Performansi') {
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="8" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M11 12h2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )
    }

    if (name === 'Sevkiyat Performansi') {
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 7h12v8H3zM15 10h4l2 2v3h-6z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )
    }

    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 9h8M8 13h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  const modalRows = useMemo(() => {
    if (!activeReport) {
      return [] as Array<{ label: string; value: string | number }>
    }

    if (activeReport.name === 'Talepler Raporu') {
      return filteredRequests.slice(0, 5).map((row) => ({ label: row.id, value: `${row.company} · ${row.status}` }))
    }

    if (activeReport.name === 'Teklif Performansi') {
      return filteredOffers.slice(0, 5).map((row) => ({ label: row.id, value: `${row.company} · ${row.status}` }))
    }

    if (activeReport.name === 'Siparis Analizi') {
      return filteredOrders.slice(0, 5).map((row) => ({ label: row.id, value: `${row.company} · ${row.status}` }))
    }

    if (activeReport.name === 'Uretim Performansi') {
      return filteredProduction.slice(0, 5).map((row) => ({ label: row.id, value: `${row.company} · ${row.status}` }))
    }

    if (activeReport.name === 'Sevkiyat Performansi') {
      return filteredShipment.slice(0, 5).map((row) => ({ label: row.id, value: `${row.company} · ${row.status}` }))
    }

    return filteredCompanies.slice(0, 5).map((row) => ({ label: row.code, value: `${row.name} · ${row.status}` }))
  }, [activeReport, filteredCompanies, filteredOffers, filteredOrders, filteredProduction, filteredRequests, filteredShipment])

  return (
    <section className="workspace-main dashboard-main reports-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="reports-header-row">
          <header className="workspace-header glass-card dashboard-hero reports-hero">
            <div>
              <p className="eyebrow">Rapor Merkezi</p>
              <h2>Kurumsal Raporlar</h2>
              <p>Operasyon verilerini tek merkezde analiz edin, kritik metrikleri filtreleyin ve raporlari aninda goruntuleyin.</p>
            </div>
          </header>

          <button
            type="button"
            className="solid-btn reports-create-btn"
            onClick={() => {
              setCompany(currentUser && currentUser.role !== 'ADMIN' ? currentUser.company : 'Tum Firmalar')
              setReportType('Tum Rapor Turleri')
              setStatus('Tum Durumlar')
              setStartDate('')
              setEndDate('')
            }}
          >
            Filtreleri Temizle
          </button>
        </section>

        <section className="stat-grid reports-stats-grid">
          {summaryStats.map((stat) => (
            <article key={stat.label} className="glass-card stat-card reports-stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </article>
          ))}
        </section>

        <section className="glass-card panel reports-cards-panel">
          <header className="panel-header reports-table-head">
            <div>
              <h3>Workflow Olay Ozeti</h3>
              <p>{workflowReports.length} olay gosteriliyor</p>
            </div>
          </header>
          {workflowReports.length === 0 ? <p>Bu role ait workflow rapor olayi bulunmuyor.</p> : null}
          <div className="request-detail-grid">
            {workflowReports.map((item) => (
              <article key={item.id} className="request-detail-card full-width">
                <span>{item.createdAt}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="glass-card panel reports-filter-panel">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="reports-filter-grid">
            <div className="reports-filter-field reports-date-range">
              <span>Tarih Araligi</span>
              <div className="reports-date-inputs">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
            <label className="reports-filter-field">
              <span>Firma</span>
              <select value={company} onChange={(event) => setCompany(event.target.value)}>
                {companyOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="reports-filter-field">
              <span>Rapor Turu</span>
              <select value={reportType} onChange={(event) => setReportType(event.target.value as 'Tum Rapor Turleri' | ReportType)}>
                {reportTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="reports-filter-field">
              <span>Durum</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | ReportStatus)}>
                {reportStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="glass-card panel reports-cards-panel">
          <header className="panel-header reports-table-head">
            <div>
              <h3>Rapor Kartlari</h3>
              <p>{filteredReports.length} rapor gosteriliyor</p>
            </div>
          </header>

          <div className="reports-card-grid">
            {filteredReports.map((report) => (
              <article key={report.id} className="reports-feature-card">
                <div className="reports-feature-icon">{reportIcon(report.name)}</div>
                <div className="reports-feature-body">
                  <h4>{report.name}</h4>
                  <p>{reportDescriptions[report.name] ?? 'Rapor ozeti bulunamadi.'}</p>
                  <div className="reports-feature-meta">
                    <ReportTypeBadge type={report.type} />
                    <ReportStatusBadge status={report.status} />
                  </div>
                </div>
                <button type="button" className="solid-btn reports-view-btn" onClick={() => setActiveReport(report)}>
                  Raporu Goruntule
                </button>
              </article>
            ))}
          </div>
        </section>

        <RequestModal
          open={Boolean(activeReport)}
          title={activeReport ? `${activeReport.name} Detayi` : 'Rapor Detayi'}
          onClose={() => setActiveReport(null)}
          footer={
            <button type="button" className="solid-btn" onClick={() => setActiveReport(null)}>
              Kapat
            </button>
          }
        >
          {activeReport && (
            <div className="request-detail-grid">
              <article className="request-detail-card">
                <span>Rapor No</span>
                <strong>{activeReport.id}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Rapor Adi</span>
                <strong>{activeReport.name}</strong>
              </article>
              <article className="request-detail-card">
                <span>Rapor Turu</span>
                <ReportTypeBadge type={activeReport.type} />
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <ReportStatusBadge status={activeReport.status} />
              </article>
              <article className="request-detail-card">
                <span>Hazirlayan</span>
                <strong>{activeReport.owner}</strong>
              </article>
              <article className="request-detail-card">
                <span>Guncellenme</span>
                <strong>{activeReport.updatedAt}</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Ozet Bilgiler</span>
                <strong>Filtreye gore hesaplanan metrikler ust kartlarda guncel olarak sunulmustur.</strong>
              </article>
              <article className="request-detail-card full-width">
                <span>Ornek Tablo</span>
                <div className="reports-preview-table-wrap">
                  <table className="reports-preview-table">
                    <thead>
                      <tr>
                        <th>Kayit</th>
                        <th>Detay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalRows.map((item) => (
                        <tr key={`${item.label}-${item.value}`}>
                          <td>{item.label}</td>
                          <td>{item.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          )}
        </RequestModal>
      </ScreenStateGate>
    </section>
  )
}

function AdminReportsPage({ state, onRetry, currentUser }: WorkspacePageProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)
  const [requests, setRequests] = useState<ApiRequest[]>([])
  const [quotations, setQuotations] = useState<ApiQuotation[]>([])
  const [orders, setOrders] = useState<ApiOrderView[]>([])
  const [companies, setCompanies] = useState<ApiCompany[]>([])
  const [regions, setRegions] = useState<ApiRegion[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'steady' | 'error'>('idle')

  const loadAll = useCallback(async () => {
    setLoadState('loading')
    try {
      const [requestsData, quotationsData, ordersData, companiesData, regionsData] = await Promise.all([
        requestsApi.list(),
        quotationsApi.list(),
        ordersApi.list(),
        companiesApi.list(),
        regionsApi.list(),
      ])
      setRequests(requestsData)
      setQuotations(quotationsData)
      setOrders(ordersData)
      setCompanies(companiesData)
      setRegions(regionsData)
      setLoadState('steady')
    } catch {
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    if (apiEnabled) {
      void loadAll()
    }
  }, [apiEnabled, loadAll])

  const stats = useMemo(() => {
    const producerCount = companies.filter((item) => item.companyType === 'GLASS_PRODUCER').length
    return {
      totalRequests: requests.length,
      totalQuotations: quotations.length,
      totalOrders: orders.length,
      producerCount,
      buyerCount: companies.length - producerCount,
      pendingCompanies: companies.filter((item) => item.status !== 'ACTIVE').length,
    }
  }, [companies, orders, quotations, requests])

  const regionBreakdown = useMemo(() => {
    const regionNameById = new Map(regions.map((region) => [region.id, region.name]))
    const counts = new Map<string, { requestCount: number; companyCount: number }>()

    requests.forEach((request) => {
      const label = request.regionId ? regionNameById.get(request.regionId) ?? 'Bilinmeyen bolge' : 'Belirtilmemis'
      const entry = counts.get(label) ?? { requestCount: 0, companyCount: 0 }
      entry.requestCount += 1
      counts.set(label, entry)
    })
    companies.forEach((company) => {
      const label = company.regionId ? regionNameById.get(company.regionId) ?? 'Bilinmeyen bolge' : 'Belirtilmemis'
      const entry = counts.get(label) ?? { requestCount: 0, companyCount: 0 }
      entry.companyCount += 1
      counts.set(label, entry)
    })

    return Array.from(counts.entries())
      .map(([region, value]) => ({ region, ...value }))
      .sort((a, b) => (b.requestCount + b.companyCount) - (a.requestCount + a.companyCount))
  }, [companies, regions, requests])

  const quotationStatusBreakdown = useMemo(() => {
    const counts = new Map<ApiQuotationStatus, number>()
    quotations.forEach((quotation) => {
      counts.set(quotation.status, (counts.get(quotation.status) ?? 0) + 1)
    })
    return Array.from(counts.entries()).map(([statusKey, count]) => ({ statusKey, count }))
  }, [quotations])

  return (
    <section className="workspace-main dashboard-main settings-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="settings-header-row">
          <header className="workspace-header glass-card dashboard-hero settings-hero">
            <div>
              <p className="eyebrow">Platform Raporlari</p>
              <h2>Alici ve Uretici Genel Raporu</h2>
              <p>Platform genelindeki gercek verilere dayali istatistikler ve bolgesel dagilim.</p>
            </div>
          </header>
        </section>

        {!apiEnabled ? (
          <section className="glass-card panel settings-table-panel">
            <header className="panel-header settings-table-head">
              <div>
                <h3>Raporlar</h3>
                <p>Bu bolum gercek oturum gerektirir; lutfen kurumsal hesabinizla giris yapin.</p>
              </div>
            </header>
          </section>
        ) : loadState === 'error' ? (
          <section className="glass-card panel settings-table-panel">
            <p className="ui-feedback-message request-item-feedback">Raporlar yuklenemedi.</p>
            <button type="button" className="ghost-btn" onClick={() => void loadAll()}>Yeniden dene</button>
          </section>
        ) : (
          <>
            <section className="stat-grid settings-stats-grid">
              <article className="glass-card stat-card settings-stat-card">
                <span>Toplam Talep</span>
                <strong>{stats.totalRequests}</strong>
                <small>Platform geneli (gercek veri)</small>
              </article>
              <article className="glass-card stat-card settings-stat-card">
                <span>Toplam Teklif</span>
                <strong>{stats.totalQuotations}</strong>
                <small>Platform geneli (gercek veri)</small>
              </article>
              <article className="glass-card stat-card settings-stat-card">
                <span>Toplam Siparis</span>
                <strong>{stats.totalOrders}</strong>
                <small>Platform geneli (gercek veri)</small>
              </article>
              <article className="glass-card stat-card settings-stat-card">
                <span>Uretici Firma</span>
                <strong>{stats.producerCount}</strong>
                <small>Aktif ve pasif tum uretici firmalar</small>
              </article>
              <article className="glass-card stat-card settings-stat-card">
                <span>Alici Firma</span>
                <strong>{stats.buyerCount}</strong>
                <small>Kendi kaydini olusturan alici firmalar</small>
              </article>
              <article className="glass-card stat-card settings-stat-card">
                <span>Onay Bekleyen Firma</span>
                <strong>{stats.pendingCompanies}</strong>
                <small>Aktivasyon bekleyen veya pasif firmalar</small>
              </article>
            </section>

            <section className="glass-card panel settings-table-panel">
              <header className="panel-header settings-table-head">
                <div>
                  <h3>Bolgelere Gore Dagilim</h3>
                  <p>Talep ve firma sayilarinin bolgelere gore kirilimi</p>
                </div>
              </header>
              <div className="table-wrap settings-table-wrap">
                <table className="settings-table">
                  <thead>
                    <tr><th>Bolge</th><th>Talep Sayisi</th><th>Firma Sayisi</th></tr>
                  </thead>
                  <tbody>
                    {regionBreakdown.length === 0 ? (
                      <tr><td colSpan={3}>Henuz veri yok.</td></tr>
                    ) : regionBreakdown.map((row) => (
                      <tr key={row.region}>
                        <td>{row.region}</td>
                        <td>{row.requestCount}</td>
                        <td>{row.companyCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="glass-card panel settings-table-panel">
              <header className="panel-header settings-table-head">
                <div>
                  <h3>Teklif Durum Dagilimi</h3>
                  <p>Tum tekliflerin durumlarina gore sayisi</p>
                </div>
              </header>
              <div className="request-detail-grid">
                {quotationStatusBreakdown.length === 0 ? (
                  <article className="request-detail-card"><span>Veri yok</span><strong>0</strong></article>
                ) : quotationStatusBreakdown.map((item) => (
                  <article key={item.statusKey} className="request-detail-card">
                    <span>{QUOTATION_STATUS_LABELS[item.statusKey] ?? item.statusKey}</span>
                    <strong>{item.count}</strong>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </ScreenStateGate>
    </section>
  )
}

interface NewUserFormState {
  fullName: string
  email: string
  phone: string
  password: string
  role: 'ADMIN' | 'MANUFACTURER' | 'BUYER'
  companyLegalName: string
}

export function AyarlarPage(props: WorkspacePageProps) {
  return props.role === 'ADMIN' ? <AdminSettingsPage {...props} /> : <LegacyAyarlarPage {...props} />
}

function LegacyAyarlarPage({ state, onRetry, currentUser, role }: WorkspacePageProps) {
  const isPlatformAdmin = role === 'ADMIN'
  const apiEnabled = Boolean(currentUser?.backendRole)
  const showConfiguration = role !== 'BUYER'
  const [rows, setRows] = useState<SettingRow[]>(() => scopeSettings(settingRows, currentUser))
  const [managedUsers, setManagedUsers] = useState<ApiUser[]>([])
  const [managedUsersState, setManagedUsersState] = useState<'idle' | 'loading' | 'steady' | 'error'>('idle')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'Tum Kategoriler' | SettingCategory>('Tum Kategoriler')
  const [status, setStatus] = useState<'Tum Durumlar' | SettingStatus>('Tum Durumlar')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeForm, setActiveForm] = useState<SettingFormState | null>(null)
  const [viewRow, setViewRow] = useState<SettingRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<SettingRow | null>(null)
  const [activeUserForm, setActiveUserForm] = useState<NewUserFormState | null>(null)
  const [savingUser, setSavingUser] = useState(false)
  const [formError, setFormError] = useState('')
  const [userFormError, setUserFormError] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const scopedRows = useMemo(() => scopeSettings(rows, currentUser), [rows, currentUser])
  const canManageUsers = isPlatformAdmin && apiEnabled

  const loadManagedUsers = useCallback(async () => {
    setManagedUsersState('loading')
    try {
      const list = await usersApi.list()
      setManagedUsers(list)
      setManagedUsersState('steady')
    } catch {
      setManagedUsersState('error')
    }
  }, [])

  useEffect(() => {
    if (canManageUsers) {
      void loadManagedUsers()
    }
  }, [canManageUsers, loadManagedUsers])

  const filteredRows = useMemo(() => {
    return scopedRows.filter((row) => {
      const matchesQuery = !query.trim() || `${row.code} ${row.name} ${row.category} ${row.updatedBy}`.toLowerCase().includes(query.toLowerCase())
      const matchesCategory = category === 'Tum Kategoriler' || row.category === category
      const matchesStatus = status === 'Tum Durumlar' || row.status === status
      const rowTime = new Date(row.updatedAt.split('.').reverse().join('-')).getTime()
      const matchesStart = !startDate || rowTime >= new Date(startDate).getTime()
      const matchesEnd = !endDate || rowTime <= new Date(endDate).getTime()
      return matchesQuery && matchesCategory && matchesStatus && matchesStart && matchesEnd
    })
  }, [category, endDate, query, scopedRows, startDate, status])

  const totalCount = filteredRows.length
  const activeCount = filteredRows.filter((row) => row.status === 'Aktif').length
  const pendingCount = filteredRows.filter((row) => row.status === 'Beklemede').length
  const latestUpdate = filteredRows[0]?.updatedAt ?? '-'
  const platformCoreSettings = useMemo(
    () =>
      rows.filter((row) =>
        ['Platform Unvani', 'Platform Dili', 'Dil Destegi Altyapisi', 'Platform Saat Dilimi', 'Varsayilan Para Birimi', 'Bolgesel Format'].includes(row.name),
      ),
    [rows],
  )

  const managedUserCounts = useMemo(
    () => ({
      total: managedUsers.length,
      active: managedUsers.filter((user) => user.isActive).length,
      passive: managedUsers.filter((user) => !user.isActive).length,
    }),
    [managedUsers],
  )

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  const handleSaveSetting = () => {
    if (!activeForm) {
      return
    }

    const normalizedForm: SettingFormState = {
      ...activeForm,
      updatedBy: activeForm.updatedBy.trim() || currentUser?.fullName || activeForm.updatedBy,
    }

    const validationError = validateSettingForm(normalizedForm)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setRows((currentRows) => {
      const exists = currentRows.some((row) => row.code === normalizedForm.code)
      if (exists) {
        return currentRows.map((row) => (row.code === normalizedForm.code ? normalizedForm : row))
      }

      return [normalizedForm, ...currentRows]
    })

    setFeedbackMessage(scopedRows.some((row) => row.code === normalizedForm.code) ? 'Ayar guncellendi.' : 'Yeni ayar kaydedildi.')
    setFormError('')
    setActiveForm(null)
  }

  const handleSaveUser = async () => {
    if (!activeUserForm || !canManageUsers) {
      return
    }

    const fullName = activeUserForm.fullName.trim()
    const email = activeUserForm.email.trim().toLowerCase()
    const phone = activeUserForm.phone.trim()
    const companyLegalName = activeUserForm.companyLegalName.trim()

    if (!fullName || !email || !activeUserForm.password) {
      setUserFormError('Lutfen ad soyad, e-posta ve sifre alanlarini doldurun.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setUserFormError('Kullanici e-posta adresi gecersiz.')
      return
    }

    if (activeUserForm.password.length < 8) {
      setUserFormError('Sifre en az 8 karakter olmalidir.')
      return
    }

    if (activeUserForm.role !== 'ADMIN' && !companyLegalName) {
      setUserFormError('Uretici veya alici kullanicilar icin firma adi zorunludur.')
      return
    }

    setUserFormError('')
    setSavingUser(true)

    try {
      let companyId: string | undefined
      if (activeUserForm.role !== 'ADMIN') {
        const company = await companiesApi.create({
          legalName: companyLegalName,
          companyType: activeUserForm.role === 'MANUFACTURER' ? 'GLASS_PRODUCER' : 'OTHER',
        })
        companyId = company.id
      }

      const backendRole = activeUserForm.role === 'ADMIN' ? 'ADMIN' : activeUserForm.role === 'MANUFACTURER' ? 'PRODUCER' : 'SALES'

      const user = await usersApi.create({
        fullName,
        email,
        phone: phone || undefined,
        password: activeUserForm.password,
        role: backendRole,
      })

      if (companyId) {
        await companiesApi.addMembership(companyId, user.id, 'OWNER')
      }

      await loadManagedUsers()
      setFeedbackMessage('Yeni kullanici olusturuldu.')
      setActiveUserForm(null)
    } catch (error) {
      setUserFormError(error instanceof ApiError ? error.message : 'Kullanici olusturulamadi.')
    } finally {
      setSavingUser(false)
    }
  }

  return (
    <section className="workspace-main dashboard-main settings-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="settings-header-row">
          <header className="workspace-header glass-card dashboard-hero settings-hero">
            <div>
              <p className="eyebrow">{isPlatformAdmin ? 'Platform Yapilandirmasi' : showConfiguration ? 'Firma Yapilandirmasi' : 'Hesap Bilgileri'}</p>
              <h2>{showConfiguration ? 'Ayarlar' : 'Profilim'}</h2>
              <p>
                {isPlatformAdmin
                  ? 'Sistem ayarlarini yonetin, kullanicilari duzenleyin ve platform yapilandirmasini kontrol edin.'
                  : showConfiguration
                    ? 'Firmaniza ait ayarlari yonetin ve hesap bilgilerinizi guncel tutun.'
                    : 'Hesap ve firma bilgilerinizi goruntuleyin.'}
              </p>
            </div>
          </header>

          {showConfiguration ? (
            <button
              type="button"
              className="solid-btn settings-create-btn"
              onClick={() => {
                setFormError('')
                const nextForm = buildSettingForm(scopedRows)
                setActiveForm({
                  ...nextForm,
                  updatedBy: currentUser?.fullName ?? nextForm.updatedBy,
                })
              }}
            >
              + Ayar Kaydet
            </button>
          ) : null}
        </section>

        <section className="glass-card panel settings-table-panel">
          <header className="panel-header settings-table-head">
            <div>
              <h3>Profil Bilgilerim</h3>
              <p>Oturumunuza bagli kullanici ve firma bilgileri</p>
            </div>
          </header>
          <div className="table-wrap settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Alan</th>
                  <th>Deger</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Alan">Ad Soyad</td>
                  <td data-label="Deger">{currentUser?.fullName ?? '-'}</td>
                </tr>
                <tr>
                  <td data-label="Alan">E-posta</td>
                  <td data-label="Deger">{currentUser?.email ?? '-'}</td>
                </tr>
                <tr>
                  <td data-label="Alan">Telefon</td>
                  <td data-label="Deger">{currentUser?.phone || '-'}</td>
                </tr>
                <tr>
                  <td data-label="Alan">Firma</td>
                  <td data-label="Deger">{currentUser?.company || '-'}</td>
                </tr>
                <tr>
                  <td data-label="Alan">Rol</td>
                  <td data-label="Deger">{role}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {showConfiguration ? (
        <section className="stat-grid settings-stats-grid">
          <article className="glass-card stat-card settings-stat-card">
            <span>Toplam Ayar</span>
            <strong>{totalCount}</strong>
            <small>Kayitli yapilandirma havuzu</small>
          </article>
          <article className="glass-card stat-card settings-stat-card">
            <span>Aktif Yapilandirma</span>
            <strong>{activeCount}</strong>
            <small>Yayinda olan ayar setleri</small>
          </article>
          <article className="glass-card stat-card settings-stat-card">
            <span>Bekleyen Degisiklik</span>
            <strong>{pendingCount}</strong>
            <small>Onay veya yayin bekleyenler</small>
          </article>
          <article className="glass-card stat-card settings-stat-card">
            <span>Son Guncelleme</span>
            <strong>{latestUpdate}</strong>
            <small>En guncel ayar tarihi</small>
          </article>
        </section>
        ) : null}

        {isPlatformAdmin ? (
        <section className="glass-card panel settings-table-panel">
          <header className="panel-header settings-table-head">
            <div>
              <h3>Platform Cekirdek Ayarlari</h3>
              <p>Dil, saat dilimi, para birimi ve bolgesel ayar altyapisinin guncel durumu</p>
            </div>
          </header>
          <div className="request-detail-grid">
            {platformCoreSettings.map((item) => (
              <article key={item.code} className="request-detail-card">
                <span>{item.name}</span>
                <strong>{item.value}</strong>
                <small>{item.updatedAt}</small>
              </article>
            ))}
          </div>
        </section>
        ) : null}

        {showConfiguration ? (
        <section className="glass-card panel settings-filter-panel">
          <header className="panel-header">
            <h3>Filtreler</h3>
          </header>
          <div className="settings-filter-grid">
            <label className="settings-filter-field settings-filter-search">
              <span>Global Arama</span>
              <input type="search" value={query} placeholder="Ayar, kategori veya guncelleyen ara" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="settings-filter-field">
              <span>Ayar Kategorisi</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as 'Tum Kategoriler' | SettingCategory)}>
                {settingCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-filter-field">
              <span>Durum</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'Tum Durumlar' | SettingStatus)}>
                {settingStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="settings-filter-field settings-date-range">
              <span>Tarih Araligi</span>
              <div className="settings-date-inputs">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {showConfiguration ? (
        <section className="glass-card panel settings-table-panel">
          <header className="panel-header settings-table-head">
            <div>
              <h3>Ayar Listesi</h3>
              <p>{filteredRows.length} kayit gosteriliyor</p>
            </div>
          </header>

          {feedbackMessage && <p className="ui-feedback-message settings-feedback-message">{feedbackMessage}</p>}

          <div className="table-wrap settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Ayar Kodu</th>
                  <th>Ayar Adi</th>
                  <th>Kategori</th>
                  <th>Deger</th>
                  <th>Son Guncelleyen</th>
                  <th>Guncelleme Tarihi</th>
                  <th>Durum</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.code}>
                    <td data-label="Ayar Kodu">{row.code}</td>
                    <td data-label="Ayar Adi">{row.name}</td>
                    <td data-label="Kategori">
                      <SettingCategoryBadge category={row.category} />
                    </td>
                    <td data-label="Deger">{row.value}</td>
                    <td data-label="Son Guncelleyen">{row.updatedBy}</td>
                    <td data-label="Guncelleme Tarihi">{row.updatedAt}</td>
                    <td data-label="Durum">
                      <SettingStatusBadge status={row.status} />
                    </td>
                    <td data-label="Islemler">
                      <div className="settings-row-actions">
                        <button type="button" className="ghost-btn settings-action-btn" onClick={() => setViewRow(row)}>
                          Goruntule
                        </button>
                        <button
                          type="button"
                          className="ghost-btn settings-action-btn"
                          onClick={() => {
                            setFormError('')
                            setActiveForm(buildSettingForm(scopedRows, row))
                          }}
                        >
                          Duzenle
                        </button>
                        <button type="button" className="ghost-btn settings-action-btn settings-action-danger" onClick={() => setDeleteRow(row)}>
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {isPlatformAdmin && !apiEnabled ? (
        <section className="glass-card panel settings-table-panel">
          <header className="panel-header settings-table-head">
            <div>
              <h3>Kullanici Yonetimi</h3>
              <p>Bu bolum gercek oturum gerektirir; lutfen kurumsal hesabinizla giris yapin.</p>
            </div>
          </header>
        </section>
        ) : null}

        {canManageUsers ? (
        <section className="glass-card panel settings-table-panel">
          <header className="panel-header settings-table-head">
            <div>
              <h3>Kullanici Yonetimi</h3>
              <p>Uretici ve alici hesaplarini olusturun; kullanici adi ve sifreyi burada belirlersiniz.</p>
            </div>
            {canManageUsers ? (
              <button
                type="button"
                className="solid-btn"
                onClick={() => {
                  setUserFormError('')
                  setActiveUserForm({ fullName: '', email: '', phone: '', password: '', role: 'MANUFACTURER', companyLegalName: '' })
                }}
              >
                + Yeni Kullanici
              </button>
            ) : null}
          </header>

          <section className="stat-grid settings-stats-grid">
            <article className="glass-card stat-card settings-stat-card">
              <span>Toplam Kullanici</span>
              <strong>{managedUserCounts.total}</strong>
              <small>Yonetilen kullanici havuzu</small>
            </article>
            <article className="glass-card stat-card settings-stat-card">
              <span>Aktif Kullanici</span>
              <strong>{managedUserCounts.active}</strong>
              <small>Oturuma acik hesaplar</small>
            </article>
            <article className="glass-card stat-card settings-stat-card">
              <span>Pasif Kullanici</span>
              <strong>{managedUserCounts.passive}</strong>
              <small>Erisimi askida olan hesaplar</small>
            </article>
          </section>

          {managedUsersState === 'error' ? <p className="ui-feedback-message request-item-feedback">Kullanicilar yuklenemedi.</p> : null}
          {managedUsersState === 'steady' && managedUsers.length === 0 ? <p>Henuz olusturulmus bir kullanici yok.</p> : null}

          {managedUsersState === 'loading' ? (
            <p>Yukleniyor...</p>
          ) : (
            <div className="table-wrap settings-table-wrap">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Ad Soyad</th>
                    <th>E-posta</th>
                    <th>Telefon</th>
                    <th>Rol</th>
                    <th>Durum</th>
                    <th>Olusturulma Tarihi</th>
                  </tr>
                </thead>
                <tbody>
                  {managedUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.fullName}</td>
                      <td>{user.email}</td>
                      <td>{user.phone ?? '-'}</td>
                      <td>{user.role}</td>
                      <td>
                        <span className={user.isActive ? 'status-pill read' : 'status-pill unread'}>{user.isActive ? 'Aktif' : 'Pasif'}</span>
                      </td>
                      <td>{formatApiDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        ) : null}

        <RequestModal
          open={Boolean(activeForm)}
          title={scopedRows.some((row) => row.code === activeForm?.code) ? 'Ayari Duzenle' : 'Yeni Ayar'}
          onClose={() => {
            setFormError('')
            setActiveForm(null)
          }}
          footer={
            <>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setFormError('')
                  setActiveForm(null)
                }}
              >
                Iptal
              </button>
              <button type="button" className="solid-btn" onClick={handleSaveSetting}>
                Kaydet
              </button>
            </>
          }
        >
          {activeForm && (
            <div className="settings-form-grid">
              <label>
                Ayar Kodu
                <input type="text" value={activeForm.code} readOnly />
              </label>
              <label>
                Ayar Adi
                <input type="text" value={activeForm.name} onChange={(event) => setActiveForm((current) => (current ? { ...current, name: event.target.value } : current))} />
              </label>
              <label>
                Kategori
                <select value={activeForm.category} onChange={(event) => setActiveForm((current) => (current ? { ...current, category: event.target.value as SettingCategory } : current))}>
                  {settingCategories.filter((item) => item !== 'Tum Kategoriler').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Deger
                <input type="text" value={activeForm.value} onChange={(event) => setActiveForm((current) => (current ? { ...current, value: event.target.value } : current))} />
              </label>
              <label>
                Son Guncelleyen
                <input type="text" value={activeForm.updatedBy} onChange={(event) => setActiveForm((current) => (current ? { ...current, updatedBy: event.target.value } : current))} />
              </label>
              <label>
                Guncelleme Tarihi
                <input
                  type="date"
                  value={toInputDate(activeForm.updatedAt)}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, updatedAt: toDisplayDate(event.target.value) } : current))}
                />
              </label>
              <label className="full-width">
                Durum
                <select value={activeForm.status} onChange={(event) => setActiveForm((current) => (current ? { ...current, status: event.target.value as SettingStatus } : current))}>
                  {settingStatuses.filter((item) => item !== 'Tum Durumlar').map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              {formError && <p className="settings-form-error full-width">{formError}</p>}
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(viewRow)}
          title="Ayar Detayi"
          onClose={() => setViewRow(null)}
          footer={
            <button type="button" className="solid-btn" onClick={() => setViewRow(null)}>
              Kapat
            </button>
          }
        >
          {viewRow && (
            <div className="settings-detail-grid">
              <article className="request-detail-card">
                <span>Ayar Kodu</span>
                <strong>{viewRow.code}</strong>
              </article>
              <article className="request-detail-card">
                <span>Ayar Adi</span>
                <strong>{viewRow.name}</strong>
              </article>
              <article className="request-detail-card">
                <span>Kategori</span>
                <SettingCategoryBadge category={viewRow.category} />
              </article>
              <article className="request-detail-card">
                <span>Durum</span>
                <SettingStatusBadge status={viewRow.status} />
              </article>
              <article className="request-detail-card full-width">
                <span>Deger</span>
                <strong>{viewRow.value}</strong>
              </article>
              <article className="request-detail-card">
                <span>Son Guncelleyen</span>
                <strong>{viewRow.updatedBy}</strong>
              </article>
              <article className="request-detail-card">
                <span>Guncelleme Tarihi</span>
                <strong>{viewRow.updatedAt}</strong>
              </article>
            </div>
          )}
        </RequestModal>

        <RequestModal
          open={Boolean(activeUserForm)}
          title="Yeni Kullanici"
          onClose={() => {
            setUserFormError('')
            setActiveUserForm(null)
          }}
          footer={
            <>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setUserFormError('')
                  setActiveUserForm(null)
                }}
              >
                Iptal
              </button>
              <button type="button" className="solid-btn" disabled={savingUser} onClick={() => void handleSaveUser()}>
                {savingUser ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeUserForm ? (
            <div className="settings-form-grid">
              <label>
                Ad Soyad
                <input type="text" value={activeUserForm.fullName} onChange={(event) => setActiveUserForm((current) => (current ? { ...current, fullName: event.target.value } : current))} />
              </label>
              <label>
                E-posta
                <input type="email" value={activeUserForm.email} onChange={(event) => setActiveUserForm((current) => (current ? { ...current, email: event.target.value } : current))} />
              </label>
              <label>
                Telefon
                <input type="text" value={activeUserForm.phone} onChange={(event) => setActiveUserForm((current) => (current ? { ...current, phone: event.target.value } : current))} />
              </label>
              <label>
                Sifre
                <input
                  type="password"
                  value={activeUserForm.password}
                  placeholder="Minimum 8 karakter"
                  onChange={(event) => setActiveUserForm((current) => (current ? { ...current, password: event.target.value } : current))}
                />
              </label>
              <label>
                Rol
                <select value={activeUserForm.role} onChange={(event) => setActiveUserForm((current) => (current ? { ...current, role: event.target.value as NewUserFormState['role'] } : current))}>
                  <option value="MANUFACTURER">Uretici</option>
                  <option value="BUYER">Alici</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              {activeUserForm.role !== 'ADMIN' && (
                <label className="full-width">
                  Firma Adi
                  <input
                    type="text"
                    value={activeUserForm.companyLegalName}
                    placeholder="Ornek: Firma Ticaret A.S."
                    onChange={(event) => setActiveUserForm((current) => (current ? { ...current, companyLegalName: event.target.value } : current))}
                  />
                </label>
              )}
              {userFormError ? <p className="settings-form-error full-width">{userFormError}</p> : null}
            </div>
          ) : null}
        </RequestModal>

        <DeleteConfirmationModal
          open={Boolean(deleteRow)}
          onClose={() => setDeleteRow(null)}
          onConfirm={() => {
            if (!deleteRow) {
              return
            }

            setRows((currentRows) => currentRows.filter((row) => row.code !== deleteRow.code))
            setDeleteRow(null)
            setFeedbackMessage('Ayar silindi.')
          }}
        />
      </ScreenStateGate>
    </section>
  )
}

interface NewProducerFormState {
  fullName: string
  email: string
  phone: string
  password: string
  companyLegalName: string
  regionId: string
}

function buildNewProducerForm(): NewProducerFormState {
  return { fullName: '', email: '', phone: '', password: '', companyLegalName: '', regionId: '' }
}

function isProducerCompany(company: ApiCompany): boolean {
  return company.companyType === 'GLASS_PRODUCER'
}

function AdminSettingsPage({ state, onRetry, currentUser }: WorkspacePageProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)

  const [companies, setCompanies] = useState<ApiCompany[]>([])
  const [companiesState, setCompaniesState] = useState<'idle' | 'loading' | 'steady' | 'error'>('idle')
  const [regions, setRegions] = useState<ApiRegion[]>([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'Tumu' | 'Uretici' | 'Alici'>('Tumu')
  const [statusFilter, setStatusFilter] = useState<'Tumu' | 'Aktif' | 'Pasif'>('Tumu')
  const [activeForm, setActiveForm] = useState<NewProducerFormState | null>(null)
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [togglingCompanyId, setTogglingCompanyId] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')

  const loadCompanies = useCallback(async () => {
    setCompaniesState('loading')
    try {
      const items = await companiesApi.list()
      setCompanies(items)
      setCompaniesState('steady')
    } catch {
      setCompanies([])
      setCompaniesState('error')
    }
  }, [])

  useEffect(() => {
    if (apiEnabled) {
      void loadCompanies()
      void regionsApi.list().then(setRegions).catch(() => setRegions([]))
    }
  }, [apiEnabled, loadCompanies])

  const regionNameById = useMemo(() => new Map(regions.map((region) => [region.id, region.name])), [regions])

  useEffect(() => {
    if (!feedbackMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedbackMessage(''), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedbackMessage])

  const stats = useMemo(() => {
    const producerCount = companies.filter(isProducerCompany).length
    return {
      total: companies.length,
      producerCount,
      buyerCount: companies.length - producerCount,
      pendingCount: companies.filter((company) => company.status !== 'ACTIVE').length,
    }
  }, [companies])

  const filteredCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return companies.filter((company) => {
      const matchesType =
        typeFilter === 'Tumu' ||
        (typeFilter === 'Uretici' && isProducerCompany(company)) ||
        (typeFilter === 'Alici' && !isProducerCompany(company))
      const matchesStatus =
        statusFilter === 'Tumu' ||
        (statusFilter === 'Aktif' && company.status === 'ACTIVE') ||
        (statusFilter === 'Pasif' && company.status !== 'ACTIVE')
      const matchesQuery =
        !normalizedQuery || `${company.legalName} ${company.tradeName ?? ''}`.toLowerCase().includes(normalizedQuery)
      return matchesType && matchesStatus && matchesQuery
    })
  }, [companies, query, statusFilter, typeFilter])

  const handleToggleCompanyStatus = async (company: ApiCompany) => {
    setTogglingCompanyId(company.id)
    try {
      const nextStatus = company.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      await companiesApi.update(company.id, { status: nextStatus })
      await loadCompanies()
      setFeedbackMessage(nextStatus === 'ACTIVE' ? 'Firma aktiflestirildi.' : 'Firma pasife alindi.')
    } catch (error) {
      setFeedbackMessage(error instanceof ApiError ? error.message : 'Islem gerceklestirilemedi.')
    } finally {
      setTogglingCompanyId(null)
    }
  }

  const handleCreateProducer = async () => {
    if (!activeForm) {
      return
    }

    const fullName = activeForm.fullName.trim()
    const email = activeForm.email.trim().toLowerCase()
    const phone = activeForm.phone.trim()
    const companyLegalName = activeForm.companyLegalName.trim()

    if (!fullName || !email || !activeForm.password || !companyLegalName) {
      setFormError('Lutfen tum zorunlu alanlari doldurun.')
      return
    }

    if (!activeForm.regionId) {
      setFormError('Ureticinin uretim yaptigi bolgeyi secmeniz zorunludur.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('E-posta adresi gecersiz.')
      return
    }

    if (activeForm.password.length < 8) {
      setFormError('Sifre en az 8 karakter olmalidir.')
      return
    }

    setFormError('')
    setIsSaving(true)

    try {
      const company = await companiesApi.create({
        legalName: companyLegalName,
        companyType: 'GLASS_PRODUCER',
        status: 'INACTIVE',
        regionId: activeForm.regionId,
      })

      const user = await usersApi.create({
        fullName,
        email,
        phone: phone || undefined,
        password: activeForm.password,
        role: 'PRODUCER',
      })

      await companiesApi.addMembership(company.id, user.id, 'OWNER')
      await loadCompanies()
      setFeedbackMessage('Uretici firma olusturuldu. Listeden aktiflestirmeyi unutmayin.')
      setActiveForm(null)
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Firma olusturulamadi.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="workspace-main dashboard-main settings-page">
      <ScreenStateGate state={state} onRetry={onRetry}>
        <section className="settings-header-row">
          <header className="workspace-header glass-card dashboard-hero settings-hero">
            <div>
              <p className="eyebrow">Platform Yonetimi</p>
              <h2>Uretici Firma Yonetimi</h2>
              <p>Uretici firma hesaplarini olusturun, onaylayin ve platformdaki tum firmalari tek yerden izleyin.</p>
            </div>
            {apiEnabled ? (
              <button
                type="button"
                className="solid-btn"
                onClick={() => {
                  setFormError('')
                  setActiveForm(buildNewProducerForm())
                }}
              >
                + Yeni Uretici Firma
              </button>
            ) : null}
          </header>
        </section>

        {!apiEnabled ? (
          <section className="glass-card panel settings-table-panel">
            <header className="panel-header settings-table-head">
              <div>
                <h3>Uretici Firma Yonetimi</h3>
                <p>Bu bolum gercek oturum gerektirir; lutfen kurumsal hesabinizla giris yapin.</p>
              </div>
            </header>
          </section>
        ) : (
          <>
            <section className="stat-grid settings-stats-grid">
              <article className="glass-card stat-card settings-stat-card">
                <span>Toplam Firma</span>
                <strong>{stats.total}</strong>
                <small>Platformdaki tum kayitli firmalar</small>
              </article>
              <article className="glass-card stat-card settings-stat-card">
                <span>Uretici Firma</span>
                <strong>{stats.producerCount}</strong>
                <small>Cam uretici firmalari</small>
              </article>
              <article className="glass-card stat-card settings-stat-card">
                <span>Alici Firma</span>
                <strong>{stats.buyerCount}</strong>
                <small>Kendi kaydini olusturan alici firmalar</small>
              </article>
              <article className="glass-card stat-card settings-stat-card">
                <span>Onay Bekleyen</span>
                <strong>{stats.pendingCount}</strong>
                <small>Aktivasyon bekleyen veya pasif firmalar</small>
              </article>
            </section>

            {feedbackMessage ? <p className="ui-feedback-message settings-feedback-message">{feedbackMessage}</p> : null}

            <section className="glass-card panel settings-filter-panel">
              <header className="panel-header">
                <h3>Filtreler</h3>
              </header>
              <div className="settings-filter-grid">
                <label className="settings-filter-field settings-filter-search">
                  <span>Ara</span>
                  <input type="search" value={query} placeholder="Firma adi" onChange={(event) => setQuery(event.target.value)} />
                </label>
                <label className="settings-filter-field">
                  <span>Tur</span>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
                    <option value="Tumu">Tumu</option>
                    <option value="Uretici">Uretici</option>
                    <option value="Alici">Alici</option>
                  </select>
                </label>
                <label className="settings-filter-field">
                  <span>Durum</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                    <option value="Tumu">Tumu</option>
                    <option value="Aktif">Aktif</option>
                    <option value="Pasif">Pasif</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="glass-card panel settings-table-panel">
              <header className="panel-header settings-table-head">
                <div>
                  <h3>Firma Listesi</h3>
                  <p>{filteredCompanies.length} kayit gosteriliyor</p>
                </div>
              </header>

              {companiesState === 'error' ? <p className="ui-feedback-message request-item-feedback">Firmalar yuklenemedi.</p> : null}
              {companiesState === 'steady' && filteredCompanies.length === 0 ? <p>Kayitli firma bulunamadi.</p> : null}

              {companiesState === 'loading' ? (
                <p>Yukleniyor...</p>
              ) : (
                <div className="table-wrap settings-table-wrap">
                  <table className="settings-table">
                    <thead>
                      <tr>
                        <th>Firma Adi</th>
                        <th>Tur</th>
                        <th>Bolge</th>
                        <th>Durum</th>
                        <th>Onay Durumu</th>
                        <th>Uye Sayisi</th>
                        <th>Islem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map((company) => (
                        <tr key={company.id}>
                          <td>{company.tradeName || company.legalName}</td>
                          <td>{isProducerCompany(company) ? 'Uretici' : 'Alici'}</td>
                          <td>{company.regionId ? regionNameById.get(company.regionId) ?? '-' : '-'}</td>
                          <td>
                            <span className={company.status === 'ACTIVE' ? 'status-pill read' : 'status-pill unread'}>
                              {company.status === 'ACTIVE' ? 'Aktif' : company.status === 'SUSPENDED' ? 'Askida' : 'Pasif'}
                            </span>
                          </td>
                          <td>
                            {company.verificationStatus === 'VERIFIED'
                              ? 'Onaylandi'
                              : company.verificationStatus === 'REJECTED'
                                ? 'Reddedildi'
                                : 'Beklemede'}
                          </td>
                          <td>{company.memberships.length}</td>
                          <td>
                            <button
                              type="button"
                              className="ghost-btn settings-action-btn"
                              disabled={togglingCompanyId === company.id}
                              onClick={() => void handleToggleCompanyStatus(company)}
                            >
                              {company.status === 'ACTIVE' ? 'Pasiflestir' : 'Aktiflestir'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <RequestModal
          open={Boolean(activeForm)}
          title="Yeni Uretici Firma"
          onClose={() => {
            setFormError('')
            setActiveForm(null)
          }}
          footer={
            <>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setFormError('')
                  setActiveForm(null)
                }}
              >
                Iptal
              </button>
              <button type="button" className="solid-btn" disabled={isSaving} onClick={() => void handleCreateProducer()}>
                {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          }
        >
          {activeForm ? (
            <div className="settings-form-grid">
              <label>
                Ad Soyad
                <input type="text" value={activeForm.fullName} onChange={(event) => setActiveForm((current) => (current ? { ...current, fullName: event.target.value } : current))} />
              </label>
              <label>
                E-posta
                <input type="email" value={activeForm.email} onChange={(event) => setActiveForm((current) => (current ? { ...current, email: event.target.value } : current))} />
              </label>
              <label>
                Telefon
                <input type="text" value={activeForm.phone} onChange={(event) => setActiveForm((current) => (current ? { ...current, phone: event.target.value } : current))} />
              </label>
              <label>
                Sifre
                <input
                  type="password"
                  value={activeForm.password}
                  placeholder="Minimum 8 karakter"
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, password: event.target.value } : current))}
                />
              </label>
              <label className="full-width">
                Firma Adi
                <input
                  type="text"
                  value={activeForm.companyLegalName}
                  placeholder="Ornek: Firma Ticaret A.S."
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, companyLegalName: event.target.value } : current))}
                />
              </label>
              <label className="full-width">
                Uretim Bolgesi
                <select
                  required
                  value={activeForm.regionId}
                  onChange={(event) => setActiveForm((current) => (current ? { ...current, regionId: event.target.value } : current))}
                >
                  <option value="">Bolge secin</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </label>
              {formError ? <p className="settings-form-error full-width">{formError}</p> : null}
            </div>
          ) : null}
        </RequestModal>
      </ScreenStateGate>
    </section>
  )
}

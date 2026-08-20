import type { BackendUserRole } from '../../entities/domain'

export type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
export type CompanyType = 'GLASS_PRODUCER' | 'ALUMINUM' | 'PVC' | 'BALCONY' | 'FURNITURE' | 'OTHER'
export type CompanyVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'
export type MembershipStatus = 'ACTIVE' | 'INACTIVE'
export type RequestStatus = 'DRAFT' | 'OPEN_FOR_QUOTATION' | 'QUOTED' | 'AWARDED' | 'CANCELLED'
export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED'
export type OrderStatus = 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'CANCELLED'
export type ProductionStatus = 'PLANNED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type CalculationStatus = 'GENERATED' | 'FINALIZED' | 'SUPERSEDED'
export type MeasurementUnit = 'MM' | 'CM' | 'M' | 'M2' | 'M3' | 'PIECE'
export type MeasurementSource = 'USER' | 'AI' | 'AI_CORRECTED' | 'MANUAL_CORRECTION'
export type MeasurementStatus = 'PENDING' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'
export type AttachmentStatus = 'PENDING_UPLOAD' | 'AVAILABLE' | 'QUARANTINED' | 'DELETED'
export type AnalysisJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type AnalysisReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CORRECTED'
export type MeasurementReviewAction = 'APPROVE' | 'REJECT' | 'CORRECT'
export type GeometryType = 'COUNT' | 'LINE' | 'RECTANGLE' | 'VOLUME' | 'CUSTOM'
export type PriceCatalogStatus = 'ACTIVE' | 'INACTIVE'
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface ApiNotification {
  id: string
  userId: string
  type: string
  title: string
  body: string | null
  payload: Record<string, unknown> | null
  status: NotificationStatus
  readAt: string | null
  createdAt: string
  updatedAt: string
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: 'Bekleyen',
  OPEN_FOR_QUOTATION: 'Teklif Hazirlaniyor',
  QUOTED: 'Teklif Gonderildi',
  AWARDED: 'Onaylanan',
  CANCELLED: 'Reddedilen',
}

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Taslak',
  SENT: 'Gonderildi',
  ACCEPTED: 'Kabul Edildi',
  REJECTED: 'Reddedildi',
  WITHDRAWN: 'Geri Cekildi',
  EXPIRED: 'Suresi Doldu',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: 'Onay Bekliyor',
  CONFIRMED: 'Onaylandi',
  CANCELLED: 'Iptal Edildi',
}

export interface ApiUser {
  id: string
  email: string
  phone: string | null
  fullName: string
  role: BackendUserRole
  permissions: string[] | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface RegisterAccountInput {
  companyLegalName: string
  companyTradeName?: string
  companyType: CompanyType
  taxNumber?: string
  fullName: string
  email: string
  phone?: string
  password: string
}

export interface CreateUserInput {
  email: string
  phone?: string
  fullName: string
  password: string
  role: BackendUserRole
  permissions?: string[]
}

export interface ApiMembership {
  id: string
  companyId: string
  userId: string
  role: string
  status: MembershipStatus
}

export interface ApiCompany {
  id: string
  legalName: string
  tradeName: string | null
  companyType: CompanyType
  status: CompanyStatus
  verificationStatus: CompanyVerificationStatus
  regionId: string | null
  contactEmail: string | null
  contactPhone: string | null
  taxNumber: string | null
  memberships: ApiMembership[]
}

export interface CreateCompanyInput {
  legalName: string
  tradeName?: string
  companyType?: CompanyType
  regionId?: string
  contactEmail?: string
  contactPhone?: string
  taxNumber?: string
  verificationStatus?: CompanyVerificationStatus
  status?: CompanyStatus
}

export type UpdateCompanyInput = Partial<CreateCompanyInput>

export interface ApiPriceCatalogItem {
  id: string
  companyId: string
  productCode: string
  productType: string
  description: string | null
  baseUnit: MeasurementUnit
  unitPrice: string
  currency: string
  minimumOrderAmount: string | null
  defaultWasteRate: string
  defaultDiscountRate: string
  status: PriceCatalogStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface CreatePriceCatalogItemInput {
  companyId: string
  productCode: string
  productType: string
  description?: string
  baseUnit: MeasurementUnit
  unitPrice: number
  currency?: string
  minimumOrderAmount?: number
  defaultWasteRate?: number
  defaultDiscountRate?: number
  status?: PriceCatalogStatus
}

export type UpdatePriceCatalogItemInput = Partial<Omit<CreatePriceCatalogItemInput, 'companyId' | 'productCode' | 'baseUnit'>>

export type ManufacturerCustomerInviteStatus = 'NOT_PREPARED' | 'PREPARED' | 'SENT' | 'ACCEPTED'

export interface ApiManufacturerCustomer {
  id: string
  code: string
  manufacturerCompanyId: string
  companyName: string
  contactName: string
  phone: string
  email: string
  taxOffice: string
  taxNo: string
  address: string
  city: string
  region: string
  description: string
  status: CompanyStatus
  inviteStatus: ManufacturerCustomerInviteStatus
  inviteToken: string | null
  invitePreparedAt: string | null
  invitePreparedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateManufacturerCustomerInput {
  manufacturerCompanyId: string
  companyName: string
  contactName: string
  phone: string
  email: string
  taxOffice: string
  taxNo: string
  address: string
  city: string
  region: string
  description: string
  status?: CompanyStatus
}

export type UpdateManufacturerCustomerInput = Partial<Omit<CreateManufacturerCustomerInput, 'manufacturerCompanyId'>>

export interface ApiRequestRecipientCompany {
  id: string
  legalName: string
  tradeName: string | null
}

export interface ApiRequest {
  id: string
  requestNumber: string
  companyId: string
  regionId: string | null
  createdByUserId: string | null
  title: string
  description: string | null
  productType: string
  quantity: string | null
  unit: string | null
  targetDeliveryDate: string | null
  budgetMin: string | null
  budgetMax: string | null
  currency: string
  status: RequestStatus
  version: number
  createdAt: string
  updatedAt: string
  company?: {
    id: string
    legalName: string
    tradeName: string | null
  }
  region?: {
    id: string
    name: string
  } | null
  createdBy?: {
    id: string
    fullName: string
    email: string
  } | null
  recipients?: Array<{
    id: string
    companyId: string
    company: {
      id: string
      legalName: string
      tradeName: string | null
    }
  }>
}

export interface ApiQuotation {
  id: string
  quotationNumber: string
  requestId: string
  companyId: string
  manufacturerCompanyId: string
  createdByUserId: string | null
  totalAmount: string
  currency: string
  leadTimeDays: number
  validUntil: string
  notes: string | null
  status: QuotationStatus
  revisionNumber: number
  version: number
  activeCalculationId: string | null
  createdAt: string
  updatedAt: string
  request: {
    id: string
    requestNumber: string
    companyId: string
    title: string
    status: RequestStatus
  }
  company: {
    id: string
    legalName: string
    tradeName: string | null
    status: CompanyStatus
  }
  manufacturerCompany: {
    id: string
    legalName: string
    tradeName: string | null
    status: CompanyStatus
  }
  createdBy: {
    id: string
    fullName: string
    email: string
  } | null
}

export interface ApiQuotationItem {
  id: string
  quotationId: string
  quotationCalculationId: string
  requestItemId: string | null
  priceCatalogItemId: string | null
  lineNumber: number
  description: string
  quantity: string
  unit: MeasurementUnit
  unitPrice: string
  wasteRate: string
  wasteQuantity: string
  regionalAdjustmentRate: string
  regionalAdjustmentAmount: string
  discountRate: string
  discountAmount: string
  taxRate: string
  taxAmount: string
  subtotalAmount: string
  totalAmount: string
  currency: string
  createdAt: string
}

export interface ApiCalculationSnapshotLine {
  requestItemId: string
  lineNumber: number
  description: string
  productType: string
  productCode: string | null
  measurementStatus: MeasurementStatus
  quantity: string
  unit: MeasurementUnit
  catalogProductCode: string
  unitPrice: string
  wasteRate: string
  discountRate: string
  totalAmount: string
  currency: string
}

export interface ApiQuotationCalculation {
  id: string
  quotationId: string
  requestId: string
  quotationRevisionNumber: number
  calculationVersion: number
  engineVersion: string
  inputHash: string
  currency: string
  subtotalAmount: string
  wasteAmount: string
  regionalAdjustmentAmount: string
  discountAmount: string
  taxAmount: string
  totalAmount: string
  snapshotSchemaVersion: number
  snapshotHash: string
  status: CalculationStatus
  createdByUserId: string | null
  finalizedAt: string | null
  createdAt: string
  items: ApiQuotationItem[]
  snapshotLines: ApiCalculationSnapshotLine[]
}

export interface ApiOrder {
  id: string
  orderNumber: string
  requestId: string
  quotationId: string
  companyId: string
  manufacturerCompanyId: string
  createdByUserId: string | null
  status: OrderStatus
  version: number
  confirmedAt: string | null
  confirmedByUserId: string | null
  cancelledAt: string | null
  cancelledByUserId: string | null
  cancellationReason: string | null
  currency: string
  totalAmount: string
  promisedDeliveryDate: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiOrderView extends ApiOrder {
  request: {
    id: string
    requestNumber: string
    companyId: string
    status: RequestStatus
  }
  quotation: {
    id: string
    quotationNumber: string
    requestId: string
    companyId: string
    manufacturerCompanyId: string
    status: QuotationStatus
  }
  company: {
    id: string
    legalName: string
    tradeName: string | null
    status: CompanyStatus
  }
  manufacturerCompany: {
    id: string
    legalName: string
    tradeName: string | null
    status: CompanyStatus
  }
  createdBy: { id: string; fullName: string; email: string } | null
  confirmedBy: { id: string; fullName: string; email: string } | null
  cancelledBy: { id: string; fullName: string; email: string } | null
}

export interface CreateRequestInput {
  companyId: string
  regionId?: string
  title: string
  description?: string
  productType: string
  quantity?: number
  unit?: string
  targetDeliveryDate?: string
  budgetMin?: number
  budgetMax?: number
  currency?: string
  recipientCompanyIds?: string[]
}

export interface UpdateRequestInput extends Partial<Omit<CreateRequestInput, 'companyId' | 'recipientCompanyIds' | 'regionId'>> {
  version: number
  regionId?: string | null
}

export interface CreateQuotationInput {
  manufacturerCompanyId: string
  totalAmount: number
  currency?: string
  leadTimeDays: number
  validUntil: string
  notes?: string
}

export interface UpdateQuotationInput {
  version: number
  totalAmount?: number
  currency?: string
  leadTimeDays?: number
  validUntil?: string
  notes?: string
}

export interface FinalizeQuotationCalculationInput {
  quotationVersion: number
  calculationVersion: number
}

export interface ApiRequestItem {
  id: string
  requestId: string
  lineNumber: number
  description: string
  productType: string
  productCode: string | null
  quantity: string | null
  unit: MeasurementUnit | null
  measurementSource: MeasurementSource | null
  widthMm: string | null
  heightMm: string | null
  lengthMm: string | null
  depthMm: string | null
  thicknessMm: string | null
  calculatedAreaM2: string | null
  calculatedLengthM: string | null
  calculatedVolumeM3: string | null
  measurementStatus: MeasurementStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface CreateRequestItemInput {
  description: string
  productType?: string
  productCode?: string
  quantity: number
  unit: MeasurementUnit
  measurementSource?: MeasurementSource
  width?: number
  height?: number
  length?: number
  depth?: number
  thickness?: number
}

export interface UpdateRequestItemInput extends Partial<CreateRequestItemInput> {
  version: number
}

export interface ApiAttachment {
  id: string
  requestId: string
  requestItemId: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  status: AttachmentStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface InitiateAttachmentUploadInput {
  fileName: string
  mimeType: string
  sizeBytes: number
  requestItemId?: string
}

export interface AttachmentCapability {
  url: string
  expiresAt: string
}

export interface InitiateAttachmentUploadResult {
  attachment: ApiAttachment
  upload: AttachmentCapability
}

export interface ApiAnalysisResult {
  id: string
  resultVersion: number
  reviewStatus: AnalysisReviewStatus
  version: number
  confidence: string | null
  warnings: string[]
  assumptions: string[]
  createdAt: string
  detectedMeasurements: ApiDetectedMeasurement[]
}

export interface ApiAnalysisJob {
  id: string
  requestId: string
  requestItemId: string | null
  attachmentId: string
  status: AnalysisJobStatus
  attemptCount: number
  maxAttempts: number
  startedAt: string | null
  completedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
  results: ApiAnalysisResult[]
}

export interface ApiDetectedMeasurement {
  id: string
  analysisResultId: string
  ordinal: number
  label: string | null
  geometryType: GeometryType
  widthMm: string | null
  heightMm: string | null
  lengthMm: string | null
  depthMm: string | null
  thicknessMm: string | null
  quantity: string | null
  unit: MeasurementUnit | null
  calculatedAreaM2: string | null
  calculatedLengthM: string | null
  calculatedVolumeM3: string | null
  confidence: string | null
  warnings: string[]
  assumptions: string[]
  createdAt: string
  analysisResult: Pick<ApiAnalysisResult, 'id' | 'resultVersion' | 'reviewStatus' | 'version' | 'createdAt'>
}

export interface ReviewMeasurementInput {
  detectedMeasurementId: string
  action: MeasurementReviewAction
  requestItemVersion: number
  analysisResultVersion: number
  reason?: string
  quantity?: number
  unit?: MeasurementUnit
  width?: number
  height?: number
  length?: number
  depth?: number
  thickness?: number
}

export interface ReviewMeasurementResult {
  review: {
    id: string
    action: MeasurementReviewAction
  }
  requestItem: ApiRequestItem
}

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  PLANNED: 'Planlandi',
  IN_PROGRESS: 'Devam Ediyor',
  ON_HOLD: 'Beklemede',
  COMPLETED: 'Tamamlandi',
  CANCELLED: 'Iptal Edildi',
}

export interface ApiProductionView {
  id: string
  productionNumber: string
  orderId: string
  status: ProductionStatus
  version: number
  productionLine: string | null
  plannedStartDate: string | null
  dueDate: string | null
  startedAt: string | null
  completedAt: string | null
  notes: string | null
  statusReason: string | null
  createdAt: string
  updatedAt: string
  order: {
    id: string
    orderNumber: string
    status: OrderStatus
    request: {
      requestNumber: string
      title: string
      productType: string
    }
    quotation: {
      quotationNumber: string
    }
    company: {
      legalName: string
      tradeName: string | null
    }
    manufacturerCompany: {
      legalName: string
      tradeName: string | null
    }
  }
  manufacturerCompany: {
    legalName: string
    tradeName: string | null
  }
  createdBy: {
    fullName: string
    email: string
  } | null
}

export interface CreateProductionInput {
  orderVersion: number
  productionLine?: string
  plannedStartDate?: string
  dueDate?: string
  notes?: string
}

export interface TransitionProductionInput {
  version: number
  toStatus: ProductionStatus
  reason?: string
}

export type ShipmentStatus = 'PLANNED' | 'IN_TRANSIT' | 'DELIVERED'

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PLANNED: 'Planlandi',
  IN_TRANSIT: 'Yolda',
  DELIVERED: 'Teslim Edildi',
}

export interface ApiShipmentView {
  id: string
  shipmentNumber: string
  productionId: string
  orderId: string
  status: ShipmentStatus
  version: number
  destinationAddress: string
  plannedDepartureAt: string
  estimatedDeliveryAt: string
  departedAt: string | null
  deliveredAt: string | null
  carrier: string | null
  trackingNumber: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  production: {
    productionNumber: string
    status: ProductionStatus
    completedAt: string | null
  }
  order: {
    orderNumber: string
    status: OrderStatus
    request: {
      requestNumber: string
      title: string
      productType: string
    }
    company: {
      legalName: string
      tradeName: string | null
    }
    manufacturerCompany: {
      legalName: string
      tradeName: string | null
    }
  }
}

export interface CreateShipmentInput {
  productionVersion: number
  destinationAddress: string
  plannedDepartureAt: string
  estimatedDeliveryAt: string
  carrier?: string
  trackingNumber?: string
  notes?: string
}

export interface TransitionShipmentInput {
  version: number
  toStatus: ShipmentStatus
}
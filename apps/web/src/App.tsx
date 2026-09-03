import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from './app/app-router'
import type { AuthenticatedUser, BackendUserRole, ScreenState, UserRole } from './entities/domain'
import type { ApiNotification, RegisterAccountInput } from './shared/api/contracts'
import {
  companyRows,
  offerRows,
  orderRows,
  priceCatalogRows,
  productionRows,
  shipmentRows,
  type OfferRow,
  type PriceCatalogRow,
  type OrderRow,
  type ProductionRow,
  type RequestRow,
  type ShipmentRow,
  type WorkflowActivity,
  type WorkflowActions,
  type WorkflowStore,
} from './pages/workspace-pages'
import { loginWithIdentifier, logoutFromBackend, registerCompanyAccount, requestPasswordReset } from './shared/data/auth'
import { apiRequest, AUTH_EXPIRED_EVENT, AUTH_SESSION_REPLACED_EVENT, setExpectedUserId } from './shared/api/http-client'
import { notificationsApi } from './shared/api/notifications-api'
import { notifications as sourceNotifications } from './shared/data/mock'
import type { ToastItem } from './shared/ui/toast'

const WORKFLOW_STORAGE_KEY = 'dijitalcam.workflowStore'
const AUTH_MODE_STORAGE_KEY = 'dijitalcam.authMode'

function readStoredWorkflow(): WorkflowStore | null {
  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<WorkflowStore>
    if (!parsed.requests || !parsed.offers || !parsed.orders || !parsed.productions || !parsed.shipments) {
      return null
    }

    const normalizeManufacturerCustomers = (storedCustomers: unknown): WorkflowStore['manufacturerCustomers'] => {
      if (!Array.isArray(storedCustomers)) {
        return companyRows
      }

      return storedCustomers.map((item, index) => {
        const row = item as Partial<WorkflowStore['manufacturerCustomers'][number]>

        return {
          code: row.code ?? `FRM-${1200 + index}`,
          manufacturerCompany: row.manufacturerCompany ?? 'Nova Cephe Sistemleri',
          name: row.name ?? 'Isimsiz Musteri',
          contact: row.contact ?? '-',
          phone: row.phone ?? '-',
          email: row.email ?? '-',
          taxOffice: row.taxOffice ?? '-',
          taxNo: row.taxNo ?? '-',
          address: row.address ?? '-',
          city: row.city ?? 'Istanbul',
          region: row.region ?? 'Marmara',
          status: row.status === 'Aktif' || row.status === 'Pasif' || row.status === 'Askida' ? row.status : 'Aktif',
          inviteStatus: row.inviteStatus === 'Hazir' || row.inviteStatus === 'Davet Hazirlandi' || row.inviteStatus === 'Gonderim Bekliyor' ? row.inviteStatus : 'Hazir',
          inviteToken: row.inviteToken,
          invitePreparedAt: row.invitePreparedAt,
          invitePreparedBy: row.invitePreparedBy,
          description: row.description ?? '-',
          createdAt: row.createdAt ?? getTodayDisplayDate(),
        }
      })
    }

    const normalizePriceCatalogs = (storedCatalogs: unknown): PriceCatalogRow[] => {
      if (!Array.isArray(storedCatalogs)) {
        return priceCatalogRows
      }

      return storedCatalogs.map((item, index) => {
        const row = item as Partial<PriceCatalogRow> & {
          glassType?: string
          pricePerSquareMeter?: number | string
          thicknessOptions?: string[] | string
          colorOptions?: string[] | string
          featureOptions?: string[] | string
          minimumOrderAmount?: number | string
          regionalAdjustment?: Array<{ region: string; deltaPercent: number }> | string
          discountRate?: number | string
          status?: 'Aktif' | 'Pasif' | 'Taslak'
        }

        const parseAmount = (value: number | string | undefined, fallback: number) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            return value
          }

          if (typeof value === 'string') {
            const numeric = Number(value.replaceAll('TRY', '').replaceAll('.', '').replaceAll('%', '').replaceAll(',', '.').trim())
            if (Number.isFinite(numeric)) {
              return numeric
            }
          }

          return fallback
        }

        const parseList = (value: string[] | string | undefined): string[] => {
          if (Array.isArray(value)) {
            return value.filter(Boolean)
          }

          if (typeof value === 'string') {
            return value
              .split(',')
              .map((token) => token.trim())
              .filter(Boolean)
          }

          return []
        }

        const parseAdjustments = (value: Array<{ region: string; deltaPercent: number }> | string | undefined): Array<{ region: string; deltaPercent: number }> => {
          if (Array.isArray(value)) {
            return value.filter((entry) => entry?.region && Number.isFinite(entry?.deltaPercent))
          }

          if (typeof value === 'string') {
            return value
              .split(',')
              .map((token) => token.trim())
              .filter(Boolean)
              .map((token) => {
                const tuple = token.split(':').map((part) => part.trim())
                if (tuple.length === 2) {
                  const [region, rawPercent] = tuple
                  const numeric = Number(rawPercent.replace('%', '').replace(',', '.'))
                  if (!region || Number.isNaN(numeric)) {
                    return null
                  }

                  return {
                    region,
                    deltaPercent: numeric,
                  }
                }

                const match = token.match(/^(.*?)([-+]?\d+(?:[.,]\d+)?)%?$/)
                if (!match) {
                  return null
                }

                const region = match[1]?.trim()
                const numeric = Number((match[2] ?? '').replace(',', '.'))
                if (!region || Number.isNaN(numeric)) {
                  return null
                }

                return {
                  region,
                  deltaPercent: numeric,
                }
              })
              .filter((entry): entry is { region: string; deltaPercent: number } => entry !== null)
          }

          return []
        }

        const rawStatus = (row as { status?: string }).status

        return {
          id: row.id ?? `FY-${3200 + index}`,
          company: row.company ?? 'Nova Cephe Sistemleri',
          glassGroup: row.glassGroup ?? 'Genel Cam',
          glassType: row.glassType ?? row.glassGroup ?? 'Standart Cam',
          pricePerSquareMeter: parseAmount(row.pricePerSquareMeter, 0),
          thicknessOptions: parseList(row.thicknessOptions),
          colorOptions: parseList(row.colorOptions),
          featureOptions: parseList(row.featureOptions),
          minimumOrderAmount: parseAmount(row.minimumOrderAmount, 0),
          regionalAdjustment: parseAdjustments(row.regionalAdjustment),
          discountRate: parseAmount(row.discountRate, 0),
          status: rawStatus === 'Taslak' ? 'Pasif' : rawStatus === 'Aktif' || rawStatus === 'Pasif' ? rawStatus : 'Aktif',
          updatedAt: row.updatedAt ?? getTodayDisplayDate(),
        }
      })
    }

    const safeRequests = Array.isArray(parsed.requests)
      ? parsed.requests.filter((row) => typeof row?.id === 'string')
      : []

    return {
      requests: safeRequests.map((row) => ({
        ...row,
        region: row.region ?? 'Marmara',
        assignedManufacturers: row.assignedManufacturers ?? ['Nova Cephe Sistemleri'],
      })),
      offers: parsed.offers.map((row) => ({
        ...row,
        manufacturerCompany: row.manufacturerCompany,
      })),
      orders: parsed.orders.map((row) => ({
        ...row,
        manufacturerCompany: row.manufacturerCompany,
      })),
      productions: parsed.productions,
      shipments: parsed.shipments.map((row) => ({
        ...row,
        manufacturerCompany: row.manufacturerCompany,
      })),
      manufacturerCustomers: normalizeManufacturerCustomers(parsed.manufacturerCustomers),
      priceCatalogs: normalizePriceCatalogs(parsed.priceCatalogs),
      activityLog: parsed.activityLog ?? [],
      activityReadKeys: Array.isArray(parsed.activityReadKeys) ? parsed.activityReadKeys.filter((entry): entry is string => typeof entry === 'string') : [],
    }
  } catch {
    return null
  }
}

function resolveManufacturers(region: string, requestType: string): string[] {
  const routingMatrix: Array<{ manufacturer: string; regions: string[]; groups: string[] }> = [
    {
      manufacturer: 'Nova Cephe Sistemleri',
      regions: ['Marmara', 'Istanbul', 'Anadolu', 'Akdeniz', 'Ege'],
      groups: ['Mimari Cam', 'Isicam', 'Lamine Cam', 'Dograma Camlari', 'Otel Projesi', 'Bolme Cami'],
    },
    {
      manufacturer: 'Marmara Cam',
      regions: ['Marmara', 'Ege'],
      groups: ['Cam Balkon', 'Numune', 'Lamine Cam'],
    },
  ]

  const matches = routingMatrix
    .filter((item) => item.regions.includes(region) && item.groups.includes(requestType))
    .map((item) => item.manufacturer)

  return matches.length > 0 ? matches : ['Nova Cephe Sistemleri']
}

function getTodayDisplayDate(): string {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
}

function getFutureDisplayDate(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

function getNextPrefixedId(prefix: string, items: Array<{ id: string }>, fallback: number): string {
  const maxId = items.reduce((currentMax, item) => {
    const numeric = Number(item.id.replace(prefix, ''))
    return Number.isNaN(numeric) ? currentMax : Math.max(currentMax, numeric)
  }, fallback)

  return `${prefix}${maxId + 1}`
}

function matchesAudienceForRole(activity: WorkflowActivity, role: UserRole): boolean {
  return activity.audience === 'ALL' || activity.audience === role
}

function makeActivityReadKey(userId: string, activityId: string): string {
  return `${userId}:${activityId}`
}

function normalizeBackendRole(rawRole: unknown): BackendUserRole | undefined {
  const role = typeof rawRole === 'string' ? rawRole.toUpperCase() : ''

  if (role === 'ADMIN' || role === 'MANAGER' || role === 'SALES' || role === 'PRODUCER' || role === 'USER') {
    return role as BackendUserRole
  }

  return undefined
}

function normalizeDomainUserRole(rawRole: unknown): UserRole | undefined {
  const role = typeof rawRole === 'string' ? rawRole.toUpperCase() : ''

  if (role === 'ADMIN' || role === 'MANAGER') {
    return 'ADMIN'
  }

  if (role === 'MANUFACTURER' || role === 'PRODUCER') {
    return 'MANUFACTURER'
  }

  if (role === 'BUYER' || role === 'USER' || role === 'SALES') {
    return 'BUYER'
  }

  return undefined
}

function markBackendAuthMode(): void {
  try {
    window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, 'backend')
  } catch {
    // Ignore storage quota or browser privacy errors while keeping session state in memory.
  }
}

function isBackendAuthMode(): boolean {
  try {
    return window.localStorage.getItem(AUTH_MODE_STORAGE_KEY) === 'backend'
  } catch {
    return false
  }
}

function persistStoredAuthUser(user: AuthenticatedUser | null): void {
  try {
    if (!user) {
      window.localStorage.removeItem('dijitalcam.authSession')
      window.localStorage.removeItem('dijitalcam.authUser')
      return
    }

    const rawSession = window.localStorage.getItem('dijitalcam.authSession')
    if (!rawSession && !window.localStorage.getItem('dijitalcam.authUser')) {
      // Backend sessions live in memory plus the httpOnly refresh cookie; never create a browser-storage session for them.
      return
    }

    const serializableUser: AuthenticatedUser = {
      ...user,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      phone: user.phone ?? '',
      company: user.company ?? '',
      companyId: user.companyId ?? undefined,
      memberships: Array.isArray(user.memberships) ? user.memberships : [],
    }

    const previousSession = rawSession ? JSON.parse(rawSession) as { issuedAt?: number; expiresAt?: number } : null
    window.localStorage.setItem('dijitalcam.authSession', JSON.stringify({
      user: serializableUser,
      issuedAt: previousSession?.issuedAt,
      expiresAt: previousSession?.expiresAt,
    }))
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(serializableUser))
  } catch {
    // Ignore storage quota or browser privacy errors while keeping session state in memory.
  }
}

function readStoredAuthUser(): AuthenticatedUser | null {
  try {
    const rawSession = window.localStorage.getItem('dijitalcam.authSession')
    const parsedSession = rawSession ? JSON.parse(rawSession) as { user?: Partial<AuthenticatedUser>; expiresAt?: number } : null

    if (typeof parsedSession?.expiresAt === 'number' && parsedSession.expiresAt <= Date.now()) {
      return null
    }

    const candidate = parsedSession?.user ?? JSON.parse(window.localStorage.getItem('dijitalcam.authUser') ?? 'null') as Partial<AuthenticatedUser> | null

    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.email !== 'string' || typeof candidate.fullName !== 'string') {
      return null
    }

    // backendRole marks a backend-issued session; deriving it from the local role would put local sessions into API mode.
    const effectiveBackendRole = normalizeBackendRole(candidate.backendRole)
    const roleHint = effectiveBackendRole ?? normalizeBackendRole(candidate.role)
    const normalizedRole: UserRole = normalizeDomainUserRole(candidate.role)
      ?? (roleHint === 'ADMIN' || roleHint === 'MANAGER'
        ? 'ADMIN'
        : roleHint === 'PRODUCER'
          ? 'MANUFACTURER'
          : 'BUYER')

    const activeMembership = Array.isArray(candidate.memberships)
      ? candidate.memberships.find((membership) => membership?.status === 'ACTIVE')
      : undefined

    const companyId = candidate.companyId?.trim() || activeMembership?.companyId || activeMembership?.company?.id || undefined
    const company = candidate.company?.trim() || activeMembership?.company?.tradeName || activeMembership?.company?.legalName || ''

    return {
      id: candidate.id,
      role: normalizedRole,
      backendRole: effectiveBackendRole,
      permissions: Array.isArray(candidate.permissions) ? candidate.permissions : [],
      email: candidate.email,
      phone: candidate.phone ?? '',
      fullName: candidate.fullName,
      company,
      companyId,
      memberships: Array.isArray(candidate.memberships) ? candidate.memberships as AuthenticatedUser['memberships'] : [],
    }
  } catch {
    return null
  }
}

function App() {
  const initialWorkflow = readStoredWorkflow()
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() => readStoredAuthUser())
  const [state, setState] = useState<ScreenState>('steady')
  const [activeToasts, setActiveToasts] = useState<ToastItem[]>([])
  const [requests, setRequests] = useState<RequestRow[]>(initialWorkflow?.requests ?? [])
  const [offers, setOffers] = useState<OfferRow[]>(initialWorkflow?.offers ?? offerRows)
  const [orders, setOrders] = useState<OrderRow[]>(initialWorkflow?.orders ?? orderRows)
  const [productions, setProductions] = useState<ProductionRow[]>(initialWorkflow?.productions ?? productionRows)
  const [shipments, setShipments] = useState<ShipmentRow[]>(initialWorkflow?.shipments ?? shipmentRows)
  const [manufacturerCustomers, setManufacturerCustomers] = useState<WorkflowStore['manufacturerCustomers']>(
    initialWorkflow?.manufacturerCustomers ?? companyRows,
  )
  const [priceCatalogs, setPriceCatalogs] = useState<PriceCatalogRow[]>(initialWorkflow?.priceCatalogs ?? priceCatalogRows)
  const [activityLog, setActivityLog] = useState<WorkflowActivity[]>(initialWorkflow?.activityLog ?? [])
  const [activityReadKeys, setActivityReadKeys] = useState<string[]>(initialWorkflow?.activityReadKeys ?? [])
  const [apiNotifications, setApiNotifications] = useState<ApiNotification[]>([])
  const [seeded, setSeeded] = useState(false)
  const [isAuthHydrated, setIsAuthHydrated] = useState(false)
  const [sessionNotice, setSessionNotice] = useState('')
  const hasSyncedStoredAuthRef = useRef(false)
  const role: UserRole = currentUser?.role ?? 'BUYER'
  const isAuthenticated = Boolean(currentUser)
  const apiEnabled = Boolean(currentUser?.backendRole)

  const loadApiNotifications = useCallback(async () => {
    try {
      const items = await notificationsApi.list()
      setApiNotifications(items)
    } catch {
      setApiNotifications([])
    }
  }, [])

  useEffect(() => {
    if (!apiEnabled) {
      setApiNotifications([])
      return
    }

    void loadApiNotifications()
  }, [apiEnabled, loadApiNotifications])

  const markApiNotificationRead = (notificationId: string) => {
    setApiNotifications((current) => (
      current.map((item) => (item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item))
    ))
    void notificationsApi.markAsRead(notificationId).catch(() => void loadApiNotifications())
  }

  const markAllApiNotificationsRead = () => {
    setApiNotifications((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() })))
    void notificationsApi.markAllAsRead().catch(() => void loadApiNotifications())
  }

  useEffect(() => {
    const handleAuthExpired = () => setCurrentUser(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
  }, [])

  useEffect(() => {
    const handleSessionReplaced = () => {
      setCurrentUser(null)
      persistStoredAuthUser(null)
      setSessionNotice('Bu tarayicida baska bir hesapla giris yapildigi icin oturumunuz sonlandirildi. Lutfen tekrar giris yapin.')
    }
    window.addEventListener(AUTH_SESSION_REPLACED_EVENT, handleSessionReplaced)
    return () => window.removeEventListener(AUTH_SESSION_REPLACED_EVENT, handleSessionReplaced)
  }, [])

  useEffect(() => {
    setExpectedUserId(currentUser?.id ?? null)
  }, [currentUser])

  useEffect(() => {
    // The mounted user was read from storage; rewriting it here would clobber a session replaced after boot.
    if (!hasSyncedStoredAuthRef.current) {
      hasSyncedStoredAuthRef.current = true
      return
    }

    persistStoredAuthUser(currentUser)
  }, [currentUser])

  useEffect(() => {
    let active = true

    const hydrateSession = async () => {
      const storedUser = readStoredAuthUser()

      // Local sessions are self-contained; only backend-issued ones need (and are allowed) a server round trip.
      if (!isBackendAuthMode() && !storedUser?.backendRole) {
        if (active) {
          setIsAuthHydrated(true)
        }
        return
      }

      try {
        const profile = await apiRequest<{
          id: string
          email: string
          phone: string | null
          fullName: string
          role: 'ADMIN' | 'MANAGER' | 'SALES' | 'PRODUCER' | 'USER'
          permissions: string[] | null
          isActive: boolean
          createdAt: string
          updatedAt: string
          companyId?: string
          company?: string
          memberships?: AuthenticatedUser['memberships']
        }>('/auth/me')

        if (!active || !profile?.id) {
          return
        }

        const latestStoredUser = readStoredAuthUser()

        setCurrentUser((previous) => {
          const previousMemberships = Array.isArray(previous?.memberships) ? previous.memberships : []
          const activeStoredMembership = previousMemberships.find((membership) => membership.status === 'ACTIVE')
          const previousCompany = typeof previous?.company === 'string' ? previous.company.trim() : ''
          const hasConcretePreviousCompany = Boolean(previousCompany) && !/^Firma\s+Hesab/i.test(previousCompany)
          const previousCompanyId = previous?.companyId?.trim() || activeStoredMembership?.companyId || activeStoredMembership?.company?.id || undefined
          const previousCompanyName = hasConcretePreviousCompany
            ? previousCompany
            : activeStoredMembership?.company?.tradeName || activeStoredMembership?.company?.legalName || ''
          const storedMemberships = Array.isArray(latestStoredUser?.memberships) ? latestStoredUser.memberships : []
          const activeLatestStoredMembership = storedMemberships.find((membership) => membership.status === 'ACTIVE')
          const storedCompany = typeof latestStoredUser?.company === 'string' ? latestStoredUser.company.trim() : ''
          const hasConcreteStoredCompany = Boolean(storedCompany) && !/^Firma\s+Hesab/i.test(storedCompany)
          const storedCompanyId = latestStoredUser?.companyId?.trim()
            || activeLatestStoredMembership?.companyId
            || activeLatestStoredMembership?.company?.id
            || undefined
          const storedCompanyName = hasConcreteStoredCompany
            ? storedCompany
            : activeLatestStoredMembership?.company?.tradeName || activeLatestStoredMembership?.company?.legalName || ''
          const storedRole = previous?.role ?? latestStoredUser?.role ?? 'BUYER'
          const storedPermissions = Array.isArray(previous?.permissions) && previous.permissions.length > 0
            ? previous.permissions
            : Array.isArray(latestStoredUser?.permissions) && latestStoredUser.permissions.length > 0
              ? latestStoredUser.permissions
              : []

          const incomingCompanyIdValue = (profile as { companyId?: string | null }).companyId
          const incomingCompanyId = typeof incomingCompanyIdValue === 'string' ? incomingCompanyIdValue.trim() : undefined
          const incomingCompanyNameValue = (profile as { company?: string | null }).company
          const incomingCompanyName = typeof incomingCompanyNameValue === 'string' ? incomingCompanyNameValue.trim() : ''
          const incomingMembershipsValue = (profile as { memberships?: AuthenticatedUser['memberships'] | null }).memberships
          const incomingMemberships: NonNullable<AuthenticatedUser['memberships']> = Array.isArray(incomingMembershipsValue)
            ? incomingMembershipsValue as NonNullable<AuthenticatedUser['memberships']>
            : []

          const profileRoleValue = typeof profile.role === 'string' ? profile.role.trim() : ''
          const explicitBackendRole = profileRoleValue ? normalizeBackendRole(profile.role) : undefined
          const explicitRoleOverride = profileRoleValue ? normalizeDomainUserRole(profile.role) : undefined
          const effectiveBackendRole = explicitBackendRole ?? normalizeBackendRole(previous?.backendRole ?? latestStoredUser?.backendRole) ?? 'USER'
          const effectiveNormalizedRole: UserRole = explicitRoleOverride ?? storedRole

          const effectivePermissions = Array.isArray(profile.permissions) && profile.permissions.length > 0
            ? profile.permissions
            : storedPermissions

          const mergedCompanyId = incomingCompanyId && incomingCompanyId.length > 0
            ? incomingCompanyId
            : previousCompanyId || storedCompanyId || undefined
          const mergedCompany = incomingCompanyName && incomingCompanyName.length > 0
            ? incomingCompanyName
            : previousCompanyName || storedCompanyName || (effectiveNormalizedRole === 'ADMIN' ? 'Platform Yonetimi' : 'Firma Hesabi')
          const mergedMemberships = incomingMemberships.length > 0
            ? incomingMemberships
            : previousMemberships.length > 0
              ? previousMemberships
              : storedMemberships

          const nextUser: AuthenticatedUser = {
            id: profile.id,
            role: effectiveNormalizedRole,
            backendRole: effectiveBackendRole,
            permissions: effectivePermissions,
            email: profile.email,
            phone: profile.phone ?? previous?.phone ?? '',
            fullName: profile.fullName,
            company: mergedCompany,
            companyId: mergedCompanyId,
            memberships: mergedMemberships,
          }

          return nextUser
        })
      } catch {
        if (active) {
          if (isBackendAuthMode()) {
            persistStoredAuthUser(null)
            setCurrentUser(null)
          } else {
            setCurrentUser((previous) => previous ?? storedUser)
          }
        }
      } finally {
        if (active) {
          setIsAuthHydrated(true)
        }
      }
    }

    void hydrateSession()

    return () => {
      active = false
    }
  }, [])

  const pushWorkflowNotification = (title: string, description: string, type: ToastItem['type'] = 'info') => {
    const item: ToastItem = {
      id: `WF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      description,
    }

    setActiveToasts((current) => [item, ...current].slice(0, 5))
  }

  const pushWorkflowActivity = (activity: Omit<WorkflowActivity, 'id' | 'createdAt'>) => {
    setActivityLog((current) => {
      if (activity.eventKey && current.some((item) => item.eventKey === activity.eventKey)) {
        return current
      }

      const item: WorkflowActivity = {
        ...activity,
        id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: getTodayDisplayDate(),
      }

      return [item, ...current]
    })
  }

  const activityReadIds = useMemo(() => {
    if (!currentUser) {
      return []
    }

    const prefix = `${currentUser.id}:`
    return activityReadKeys.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length))
  }, [activityReadKeys, currentUser])

  const markActivityRead = (activityId: string) => {
    if (!currentUser) {
      return
    }

    const key = makeActivityReadKey(currentUser.id, activityId)
    setActivityReadKeys((current) => (current.includes(key) ? current : [...current, key]))
  }

  const markAllActivitiesRead = (channel: 'notification' | 'message') => {
    if (!currentUser) {
      return
    }

    const scopedIds = activityLog.filter((item) => item.channel === channel && matchesAudienceForRole(item, role)).map((item) => item.id)
    if (scopedIds.length === 0) {
      return
    }

    setActivityReadKeys((current) => {
      const keys = scopedIds.map((activityId) => makeActivityReadKey(currentUser.id, activityId))
      const next = [...current]
      keys.forEach((key) => {
        if (!next.includes(key)) {
          next.push(key)
        }
      })
      return next
    })
  }

  const notifications = useMemo<ToastItem[]>(() => {
    return sourceNotifications.map((item) => ({ ...item }))
  }, [])

  useEffect(() => {
    if (!isAuthenticated || seeded) {
      return
    }

    setActivityLog((current) => {
      const next = [...current]
      notifications.forEach((item, index) => {
        const eventKey = `system-seed-${item.id}`
        if (next.some((logItem) => logItem.eventKey === eventKey)) {
          return
        }

        next.unshift({
          id: `ACT-SEED-${item.id}-${Date.now()}-${index}`,
          audience: 'ALL',
          channel: 'notification',
          title: item.title,
          description: item.description,
          eventKey,
          createdAt: getTodayDisplayDate(),
        })
      })
      return next
    })
    // Toast popups are a legacy/local-demo affordance only - a real backend session's
    // notifications already surface through the real bell/notifications feed.
    const ids = apiEnabled
      ? []
      : notifications.map((item, index) =>
          window.setTimeout(() => {
            setActiveToasts((current) => [{ ...item, id: `${item.id}-${Date.now()}-${index}` }, ...current].slice(0, 5))
          }, index * 220),
        )
    setSeeded(true)

    return () => {
      ids.forEach((id) => window.clearTimeout(id))
    }
  }, [isAuthenticated, notifications, seeded, apiEnabled])

  useEffect(() => {
    const snapshot: WorkflowStore = {
      requests,
      offers,
      orders,
      productions,
      shipments,
      manufacturerCustomers,
      priceCatalogs,
      activityLog,
      activityReadKeys,
    }

    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(snapshot))
  }, [activityLog, activityReadKeys, manufacturerCustomers, offers, orders, priceCatalogs, productions, requests, shipments])

  const handleRetryState = () => {
    setState('steady')
  }

  const handleLogin = async (identifier: string, password: string) => {
    const result = await loginWithIdentifier(identifier, password)
    if (!result.success || !result.user) {
      return { success: false, error: result.error ?? 'Giris islemi basarisiz.' }
    }

    markBackendAuthMode()
    setCurrentUser(result.user)
    persistStoredAuthUser(result.user)
    return { success: true }
  }

  const handleRegister = async (input: RegisterAccountInput) => {
    const result = await registerCompanyAccount(input)
    if (!result.success || !result.user) {
      return { success: false, error: result.error ?? 'Kayit islemi basarisiz.' }
    }

    markBackendAuthMode()
    setCurrentUser(result.user)
    persistStoredAuthUser(result.user)
    return { success: true }
  }

  const handleLogout = () => {
    setCurrentUser(null)
    persistStoredAuthUser(null)
    setActiveToasts([])
    setSeeded(false)
    setSessionNotice('')
    void logoutFromBackend().catch(() => undefined)
  }

  const workflowActions: WorkflowActions = {
    saveRequest: (row) => {
      setRequests((currentRows) => {
        const exists = currentRows.some((item) => item.id === row.id)
        if (exists) {
          return currentRows.map((item) => (item.id === row.id ? row : item))
        }

        const routedManufacturers = resolveManufacturers(row.region, row.requestType)
        const nextRequest: RequestRow = {
          ...row,
          status: 'Bekleyen',
          assignedManufacturers: routedManufacturers,
        }

        pushWorkflowActivity({
          audience: 'BUYER',
          audienceCompany: nextRequest.company,
          channel: 'report',
          title: 'Talep kaydi alindi',
          description: `${nextRequest.id} talebi kaydedildi.`,
          eventKey: `request-report:${nextRequest.id}`,
        })
        pushWorkflowActivity({
          audience: 'MANUFACTURER',
          channel: 'notification',
          title: 'Yeni talep atamasi',
          description: `${nextRequest.id} talebi panelinize atandi.`,
          eventKey: `request-notification:${nextRequest.id}`,
        })
        pushWorkflowActivity({
          audience: 'MANUFACTURER',
          channel: 'message',
          title: 'Yeni yonlendirilmis talep',
          description: `${nextRequest.id} talebi ${routedManufacturers.join(', ')} ureticilerine yonlendirildi.`,
          eventKey: `request-message:${nextRequest.id}`,
          senderName: currentUser?.fullName,
          senderRole: currentUser?.role,
        })
        pushWorkflowNotification('Talep yonlendirildi', `${nextRequest.id} uygun ureticilere atandi.`, 'info')

        return [nextRequest, ...currentRows]
      })
    },
    deleteRequest: (id) => {
      setRequests((currentRows) => currentRows.filter((item) => item.id !== id))
    },
    createOfferFromRequest: (requestId) => {
      const request = requests.find((item) => item.id === requestId)
      if (!request) {
        return
      }

      const manufacturerScope = currentUser?.company ?? ''
      const hasExistingOffer = offers.some((item) => item.requestId === requestId && (item.manufacturerCompany ?? '') === manufacturerScope)
      if (hasExistingOffer) {
        return
      }

      setRequests((currentRows) => currentRows.map((item) => (item.id === requestId ? { ...item, status: 'Teklif Hazirlaniyor' } : item)))

      setOffers((currentRows) => {
        const today = getTodayDisplayDate()
        const nextOffer: OfferRow = {
          id: getNextPrefixedId('TK-', currentRows, 8700),
          requestId,
          company: request.company,
          manufacturerCompany: currentUser?.company,
          title: `[${request.id}] ${request.title} teklifi`,
          amount: 'TRY 0',
          owner: currentUser?.fullName ?? request.owner,
          status: 'Hazirlaniyor',
          type: 'Workflow Teklifi',
          createdAt: today,
          updatedAt: today,
        }

        return [nextOffer, ...currentRows]
      })
    },
    saveOffer: (row) => {
      let previous: OfferRow | undefined
      setOffers((currentRows) => {
        previous = currentRows.find((item) => item.id === row.id)
        const exists = Boolean(previous)
        if (exists) {
          return currentRows.map((item) => (item.id === row.id ? row : item))
        }

        return [row, ...currentRows]
      })

      if (row.requestId && (row.status === 'Hazirlaniyor' || row.status === 'Gonderildi' || row.status === 'Onaylandi')) {
        setRequests((currentRows) =>
          currentRows.map((item) => {
            if (item.id !== row.requestId) {
              return item
            }

            return {
              ...item,
              status: row.status === 'Onaylandi' ? 'Onaylanan' : row.status === 'Gonderildi' ? 'Teklif Gonderildi' : 'Teklif Hazirlaniyor',
            }
          }),
        )
      }

      if (row.status === 'Gonderildi' && previous?.status !== 'Gonderildi') {
        pushWorkflowNotification('Teklif gonderildi', `${row.id} numarali teklif musteriye iletildi.`, 'info')
        pushWorkflowActivity({
          audience: 'BUYER',
          audienceCompany: row.company,
          channel: 'notification',
          title: 'Yeni teklif alindi',
          description: `${row.id} teklifi gonderildi.`,
          eventKey: `offer-sent:${row.id}`,
        })
        pushWorkflowActivity({
          audience: 'ADMIN',
          channel: 'report',
          title: 'Teklif gonderim olayi',
          description: `${row.id} teklifi gonderildi.`,
          eventKey: `offer-report:${row.id}`,
        })
      }

      if (row.status === 'Onaylandi' && previous?.status !== 'Onaylandi') {
        const linkedRequest = row.requestId ? requests.find((item) => item.id === row.requestId) : undefined
        const assignedManufacturer = linkedRequest?.assignedManufacturers?.[0]
        const existingOrder = orders.find((item) => item.sourceOfferId === row.id)
        const today = getTodayDisplayDate()
        const ensuredOrder: OrderRow =
          existingOrder ?? {
            id: getNextPrefixedId('SP-', orders, 9000),
            sourceOfferId: row.id,
            company: linkedRequest?.company ?? row.company,
            manufacturerCompany: row.manufacturerCompany ?? assignedManufacturer,
            type: 'Standart Siparis',
            title: `${row.title} siparisi`,
            dueDate: getFutureDisplayDate(5),
            owner: linkedRequest?.owner ?? row.owner,
            status: 'Bekliyor',
            createdAt: today,
          }

        if (!existingOrder) {
          setOrders((currentRows) => {
            const exists = currentRows.some((item) => item.sourceOfferId === row.id)
            if (exists) {
              return currentRows
            }

            return [ensuredOrder, ...currentRows]
          })
        }

        setProductions((currentRows) => {
          const exists = currentRows.some((item) => item.orderId === ensuredOrder.id)
          if (exists) {
            return currentRows
          }

          const nextProduction: ProductionRow = {
            id: getNextPrefixedId('UE-', currentRows, 4400),
            orderId: ensuredOrder.id,
            company: ensuredOrder.manufacturerCompany ?? row.manufacturerCompany ?? row.company,
            product: ensuredOrder.title,
            line: 'Kesim Hatti',
            startedAt: today,
            dueDate: ensuredOrder.dueDate,
            owner: row.owner,
            priority: 'Orta',
            status: 'Planlandi',
            description: `${ensuredOrder.id} siparisi icin otomatik is emri acildi.`,
          }

          return [nextProduction, ...currentRows]
        })

        pushWorkflowNotification('Teklif onaylandi', `${row.id} teklifinden otomatik siparis olusturuldu.`, 'success')
        pushWorkflowActivity({
          audience: 'MANUFACTURER',
          audienceCompany: ensuredOrder.manufacturerCompany,
          channel: 'notification',
          title: 'Yeni siparis emri',
          description: `${row.id} teklifine bagli siparis acildi.`,
          eventKey: `order-created-manufacturer:${row.id}`,
        })
        pushWorkflowActivity({
          audience: 'MANUFACTURER',
          audienceCompany: ensuredOrder.manufacturerCompany,
          channel: 'message',
          title: 'Siparis otomatik acildi',
          description: `${row.id} teklifine bagli siparis ve is emri olusturuldu.`,
          eventKey: `order-created-message:${row.id}`,
        })
        pushWorkflowActivity({
          audience: 'BUYER',
          audienceCompany: ensuredOrder.company,
          channel: 'notification',
          title: 'Siparis olusturuldu',
          description: `${row.id} teklifi siparise donusturuldu.`,
          eventKey: `order-created-buyer:${row.id}`,
        })
        pushWorkflowActivity({
          audience: 'BUYER',
          audienceCompany: ensuredOrder.company,
          channel: 'report',
          title: 'Teklif onayi tamamlandi',
          description: `${row.id} teklifi onaylandi ve siparise donustu.`,
          eventKey: `offer-approved-report:${row.id}`,
        })
      }
    },
    deleteOffer: (id) => {
      setOffers((currentRows) => currentRows.filter((item) => item.id !== id))
    },
    saveOrder: (row) => {
      let previous: OrderRow | undefined
      setOrders((currentRows) => {
        previous = currentRows.find((item) => item.id === row.id)
        const exists = Boolean(previous)
        if (exists) {
          return currentRows.map((item) => (item.id === row.id ? row : item))
        }

        return [row, ...currentRows]
      })

      if (row.status === 'Uretimde' && previous?.status !== 'Uretimde') {
        setProductions((currentRows) => {
          const exists = currentRows.some((item) => item.orderId === row.id)
          if (exists) {
            return currentRows
          }

          const today = getTodayDisplayDate()
          const productionCompany = row.manufacturerCompany ?? row.company
          const nextProduction: ProductionRow = {
            id: getNextPrefixedId('UE-', currentRows, 4400),
            orderId: row.id,
            company: productionCompany,
            product: row.title,
            line: 'Kesim Hatti',
            startedAt: today,
            dueDate: row.dueDate,
            owner: row.owner,
            priority: 'Orta',
            status: 'Planlandi',
            description: `${row.id} siparisi icin otomatik is emri olusturuldu.`,
          }

          return [nextProduction, ...currentRows]
        })

        pushWorkflowNotification('Siparis uretime alindi', `${row.id} icin uretim is emri olusturuldu.`, 'info')
        pushWorkflowActivity({
          audience: 'BUYER',
          audienceCompany: row.company,
          channel: 'notification',
          title: 'Siparis uretime alindi',
          description: `${row.id} icin uretim sureci baslatildi.`,
          eventKey: `order-production:${row.id}`,
        })
      }
    },
    deleteOrder: (id) => {
      setOrders((currentRows) => currentRows.filter((item) => item.id !== id))
    },
    saveProduction: (row) => {
      let previous: ProductionRow | undefined
      setProductions((currentRows) => {
        previous = currentRows.find((item) => item.id === row.id)
        const exists = Boolean(previous)
        if (exists) {
          return currentRows.map((item) => (item.id === row.id ? row : item))
        }

        return [row, ...currentRows]
      })

      if (previous?.status && previous.status !== row.status) {
        pushWorkflowActivity({
          audience: 'BUYER',
          audienceCompany: orders.find((item) => item.id === row.orderId)?.company,
          channel: 'notification',
          title: 'Uretim durumu guncellendi',
          description: `${row.orderId ?? row.id} uretim durumu ${row.status} oldu.`,
          eventKey: `production-status:${row.id}:${row.status}`,
        })
      }

      if (row.status === 'Tamamlandi' && previous?.status !== 'Tamamlandi') {
        if (row.orderId) {
          setOrders((currentRows) =>
            currentRows.map((item) => {
              if (item.id !== row.orderId) {
                return item
              }

              return {
                ...item,
                status: 'Sevkiyata Hazir',
              }
            }),
          )
        }

        setShipments((currentRows) => {
          if (!row.orderId || currentRows.some((item) => item.orderNo === row.orderId)) {
            return currentRows
          }

          const today = getTodayDisplayDate()
          const nextShipment: ShipmentRow = {
            id: getNextPrefixedId('SV-', currentRows, 2200),
            company: orders.find((item) => item.id === row.orderId)?.company ?? row.company,
            manufacturerCompany: row.company,
            orderNo: row.orderId,
            vehicle: 'Planlama Bekliyor',
            driver: 'Atanacak',
            plate: '-',
            departureDate: today,
            estimatedDelivery: getFutureDisplayDate(1),
            status: 'Planlandi',
            description: `${row.id} uretimi tamamlandi, sevkiyat otomatik olusturuldu.`,
          }

          return [nextShipment, ...currentRows]
        })

        pushWorkflowNotification('Uretim tamamlandi', `${row.id} sevkiyat planina aktarildi.`, 'success')
        pushWorkflowActivity({
          audience: 'BUYER',
          audienceCompany: orders.find((item) => item.id === row.orderId)?.company,
          channel: 'notification',
          title: 'Uretim tamamlandi',
          description: `${row.orderId ?? row.id} icin sevkiyat planlandi.`,
          eventKey: `production-complete:${row.id}`,
        })
        pushWorkflowActivity({
          audience: 'MANUFACTURER',
          channel: 'report',
          title: 'Sevkiyat hazirligi basladi',
          description: `${row.orderId ?? row.id} icin sevkiyat olusturuldu.`,
          eventKey: `shipment-prep-report:${row.id}`,
        })
      }
    },
    deleteProduction: (id) => {
      setProductions((currentRows) => currentRows.filter((item) => item.id !== id))
    },
    saveShipment: (row) => {
      let previous: ShipmentRow | undefined
      setShipments((currentRows) => {
        previous = currentRows.find((item) => item.id === row.id)
        const exists = Boolean(previous)
        if (exists) {
          return currentRows.map((item) => (item.id === row.id ? row : item))
        }

        return [row, ...currentRows]
      })

      if (previous?.status && previous.status !== row.status) {
        pushWorkflowActivity({
          audience: 'ALL',
          channel: 'notification',
          title: 'Sevkiyat durumu guncellendi',
          description: `${row.orderNo} sevkiyat durumu ${row.status} oldu.`,
          eventKey: `shipment-status:${row.id}:${row.status}`,
        })
      }

      if (row.status === 'Teslim Edildi' && previous?.status !== 'Teslim Edildi') {
        setOrders((currentRows) =>
          currentRows.map((item) => {
            if (item.id !== row.orderNo) {
              return item
            }

            return {
              ...item,
              status: 'Teslim Edildi',
            }
          }),
        )

        pushWorkflowNotification('Sevkiyat tamamlandi', `${row.orderNo} siparisi teslim edildi.`, 'success')
        pushWorkflowActivity({
          audience: 'ALL',
          channel: 'notification',
          title: 'Teslimat tamamlandi',
          description: `${row.orderNo} siparisi teslim edildi.`,
          eventKey: `shipment-delivered:${row.id}`,
        })
        pushWorkflowActivity({
          audience: 'ALL',
          channel: 'report',
          title: 'Siparis teslim edildi',
          description: `${row.orderNo} siparisi tamamlandi ve dashboard metrikleri guncellendi.`,
          eventKey: `shipment-report:${row.id}`,
        })
      }
    },
    deleteShipment: (id) => {
      setShipments((currentRows) => currentRows.filter((item) => item.id !== id))
    },
    saveManufacturerCustomer: (row) => {
      setManufacturerCustomers((currentRows) => {
        const exists = currentRows.some((item) => item.code === row.code)
        if (exists) {
          return currentRows.map((item) => (item.code === row.code ? row : item))
        }

        return [row, ...currentRows]
      })
    },
    deleteManufacturerCustomer: (code) => {
      setManufacturerCustomers((currentRows) => currentRows.filter((item) => item.code !== code))
    },
    prepareCustomerInvite: (code) => {
      const today = getTodayDisplayDate()
      let inviteTarget: WorkflowStore['manufacturerCustomers'][number] | undefined
      setManufacturerCustomers((currentRows) =>
        currentRows.map((item) => {
          if (item.code !== code) {
            return item
          }

          const inviteToken = `INV-${item.code}-${Date.now()}`
          inviteTarget = {
            ...item,
            inviteStatus: 'Davet Hazirlandi',
            inviteToken,
            invitePreparedAt: today,
            invitePreparedBy: currentUser?.fullName ?? 'Sistem',
          }

          return inviteTarget
        }),
      )

      if (inviteTarget) {
        pushWorkflowActivity({
          audience: 'MANUFACTURER',
          channel: 'report',
          title: 'Musteri davet kaydi hazirlandi',
          description: `${inviteTarget.name} icin davet referansi olusturuldu (${inviteTarget.inviteToken}).`,
          eventKey: `customer-invite:${inviteTarget.code}:${inviteTarget.inviteToken}`,
        })
      }
    },
    savePriceCatalog: (row) => {
      setPriceCatalogs((currentRows) => {
        const exists = currentRows.some((item) => item.id === row.id)
        if (exists) {
          return currentRows.map((item) => (item.id === row.id ? row : item))
        }

        return [row, ...currentRows]
      })
    },
    deletePriceCatalog: (id) => {
      setPriceCatalogs((currentRows) => currentRows.filter((item) => item.id !== id))
    },
    sendMessage: (message) => {
      if (!currentUser) {
        return
      }

      pushWorkflowActivity({
        audience: message.audience,
        channel: 'message',
        title: message.title,
        description: message.description,
        eventKey: `direct-message:${currentUser.id}:${message.audience}:${message.title.trim().toLowerCase()}:${message.description.trim().toLowerCase()}`,
        senderName: currentUser.fullName,
        senderRole: currentUser.role,
      })
      pushWorkflowNotification('Mesaj gonderildi', `${message.audience} rolune yeni mesaj iletildi.`, 'success')
    },
  }

  const workflow: WorkflowStore = {
    requests,
    offers,
    orders,
    productions,
    shipments,
    manufacturerCustomers,
    priceCatalogs,
    activityLog,
    activityReadKeys,
  }

  return (
    <BrowserRouter>
      <AppRouter
        isAuthenticated={isAuthenticated}
        isAuthHydrated={isAuthHydrated}
        currentUser={currentUser}
        role={role}
        state={state}
        sessionNotice={sessionNotice}
        notifications={activeToasts}
        activityLog={activityLog}
        activityReadIds={activityReadIds}
        onMarkActivityRead={markActivityRead}
        onMarkAllActivitiesRead={markAllActivitiesRead}
        apiNotifications={apiNotifications}
        onMarkApiNotificationRead={markApiNotificationRead}
        onMarkAllApiNotificationsRead={markAllApiNotificationsRead}
        onDismissToast={(id) => setActiveToasts((current) => current.filter((item) => item.id !== id))}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onRequestPasswordReset={requestPasswordReset}
        onLogout={handleLogout}
        onRetryState={handleRetryState}
        workflow={workflow}
        workflowActions={workflowActions}
      />
    </BrowserRouter>
  )
}

export default App


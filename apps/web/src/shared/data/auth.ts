import type {
  AuthenticatedMembership,
  AuthenticatedUser,
  BackendUserRole,
  UserRole,
} from '../../entities/domain'
import type { ApiCompany, ApiUser, RegisterAccountInput } from '../api/contracts'
import { ApiError, apiRequest, getAccessToken, setAccessToken } from '../api/http-client'

export interface LoginResult {
  success: boolean
  user?: AuthenticatedUser
  error?: string
}

interface AuthResponse {
  accessToken: string
  user: ApiUser
}

interface AccessTokenClaims {
  sub: string
  role: BackendUserRole
  permissions: string[]
}

const UI_ROLE_BY_BACKEND_ROLE: Record<BackendUserRole, UserRole> = {
  ADMIN: 'ADMIN',
  MANAGER: 'ADMIN',
  SALES: 'BUYER',
  PRODUCER: 'MANUFACTURER',
  USER: 'BUYER',
}

function readAccessTokenClaims(token: string): AccessTokenClaims | null {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) {
      return null
    }

    const normalized = encodedPayload.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as AccessTokenClaims
  } catch {
    return null
  }
}

function toMemberships(companies: ApiCompany[], userId: string): AuthenticatedMembership[] {
  return companies.flatMap((company) => {
    if (company.status !== 'ACTIVE') {
      return []
    }

    return company.memberships
      .filter((membership) => membership.userId === userId && membership.status === 'ACTIVE')
      .map((membership) => ({
        id: membership.id,
        companyId: company.id,
        role: membership.role,
        status: membership.status,
        company: {
          id: company.id,
          legalName: company.legalName,
          tradeName: company.tradeName,
          status: company.status,
        },
      }))
  })
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Giris bilgileri hatali. Lutfen tekrar deneyin.'
  }
  if (error instanceof TypeError) {
    return 'Sunucuya ulasilamadi. Lutfen daha sonra tekrar deneyin.'
  }
  return 'Giris islemi basarisiz. Lutfen tekrar deneyin.'
}

function registerErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return 'Bu e-posta veya telefon ile kayitli bir hesap zaten var.'
    }
    return error.message
  }
  if (error instanceof TypeError) {
    return 'Sunucuya ulasilamadi. Lutfen daha sonra tekrar deneyin.'
  }
  return 'Kayit islemi basarisiz. Lutfen tekrar deneyin.'
}

async function resolveAuthenticatedUser(response: AuthResponse): Promise<AuthenticatedUser> {
  const companies = await apiRequest<ApiCompany[]>('/companies')
  const memberships = toMemberships(companies, response.user.id)
  const primaryMembership = memberships[0]
  const claims = readAccessTokenClaims(getAccessToken() ?? response.accessToken)
  const permissions = claims?.sub === response.user.id && Array.isArray(claims.permissions)
    ? claims.permissions
    : response.user.permissions ?? []

  return {
    id: response.user.id,
    role: UI_ROLE_BY_BACKEND_ROLE[response.user.role],
    backendRole: response.user.role,
    permissions,
    email: response.user.email,
    phone: response.user.phone ?? '',
    fullName: response.user.fullName,
    company: primaryMembership?.company.tradeName
      ?? primaryMembership?.company.legalName
      ?? (response.user.role === 'ADMIN' || response.user.role === 'MANAGER' ? 'Platform Yonetimi' : ''),
    companyId: primaryMembership?.companyId,
    memberships,
  }
}

export async function loginWithIdentifier(identifier: string, password: string): Promise<LoginResult> {
  const normalizedIdentifier = identifier.trim().toLowerCase()
  if (!normalizedIdentifier || !password.trim()) {
    return {
      success: false,
      error: 'E-posta veya telefon ve sifre zorunludur.',
    }
  }

  try {
    const response = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { identifier: normalizedIdentifier, password },
      skipAuthRefresh: true,
    })
    setAccessToken(response.accessToken)

    const user = await resolveAuthenticatedUser(response)
    return { success: true, user }
  } catch (error) {
    setAccessToken(null)
    return {
      success: false,
      error: loginErrorMessage(error),
    }
  }
}

export async function registerCompanyAccount(input: RegisterAccountInput): Promise<LoginResult> {
  try {
    const response = await apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: input,
      skipAuthRefresh: true,
    })
    setAccessToken(response.accessToken)

    const user = await resolveAuthenticatedUser(response)
    return { success: true, user }
  } catch (error) {
    setAccessToken(null)
    return {
      success: false,
      error: registerErrorMessage(error),
    }
  }
}

export async function logoutFromBackend(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' })
  } finally {
    setAccessToken(null)
  }
}

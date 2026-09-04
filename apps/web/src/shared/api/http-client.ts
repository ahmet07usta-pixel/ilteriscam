const runtimeApiBaseUrl = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}/api/v1`
  : 'http://127.0.0.1:4100/api/v1'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? runtimeApiBaseUrl).replace(/\/$/, '')

export const AUTH_EXPIRED_EVENT = 'dijitalcam:auth-expired'
// Fired when a refresh returns a DIFFERENT user than the one this tab had - the shared refreshToken
// cookie was overwritten by another account logging in on the same origin (cookies are not tab-scoped).
export const AUTH_SESSION_REPLACED_EVENT = 'dijitalcam:auth-session-replaced'

export class ApiError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(
    status: number,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  skipAuthRefresh?: boolean
}

interface RefreshResponse {
  accessToken: string
  user: unknown
}

let accessToken: string | null = null
let refreshPromise: Promise<RefreshResponse> | null = null
// Persisted in sessionStorage (tab-scoped, survives reload, NOT shared with other tabs - unlike the
// refreshToken cookie) so a hard reload still knows "who this tab was" and can catch a hijacked cookie
// on the very first refresh call, not just later ones during the same in-memory session.
const EXPECTED_USER_STORAGE_KEY = 'dijitalcam.expectedUserId'

function readExpectedUserId(): string | null {
  try {
    return window.sessionStorage.getItem(EXPECTED_USER_STORAGE_KEY)
  } catch {
    return null
  }
}

let expectedUserId: string | null = typeof window !== 'undefined' ? readExpectedUserId() : null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

// Lets the app declare "this tab is currently logged in as user X" so a refresh that comes back
// as a different user (see AUTH_SESSION_REPLACED_EVENT above) can be detected instead of silently adopted.
export function setExpectedUserId(userId: string | null): void {
  expectedUserId = userId
  try {
    if (userId) {
      window.sessionStorage.setItem(EXPECTED_USER_STORAGE_KEY, userId)
    } else {
      window.sessionStorage.removeItem(EXPECTED_USER_STORAGE_KEY)
    }
  } catch {
    // Ignore storage quota or browser privacy errors - the in-memory value still works for this page's lifetime.
  }
}

export function resolveApiCapabilityUrl(url: string): string {
  return new URL(url, `${API_BASE_URL}/`).toString()
}

function notifyAuthExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }
}

function notifySessionReplaced(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_REPLACED_EVENT))
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>
  }

  return response.text() as Promise<T>
}

async function toApiError(response: Response): Promise<ApiError> {
  let details: unknown
  try {
    details = await parseResponse<unknown>(response)
  } catch {
    details = undefined
  }

  const serverMessage = details && typeof details === 'object' && 'message' in details
    ? String((details as { message: unknown }).message)
    : undefined

  return new ApiError(response.status, serverMessage ?? `API istegi basarisiz (${response.status})`, details)
}

async function requestRefresh(): Promise<RefreshResponse> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw await toApiError(response)
        }

        const result = await parseResponse<RefreshResponse>(response)
        const refreshedUserId = result.user && typeof result.user === 'object' && 'id' in result.user
          ? String((result.user as { id: unknown }).id)
          : undefined

        if (expectedUserId && refreshedUserId && refreshedUserId !== expectedUserId) {
          setAccessToken(null)
          notifySessionReplaced()
          throw new ApiError(401, 'Bu tarayicida baska bir hesapla giris yapildigi icin oturumunuz sonlandirildi.')
        }

        setAccessToken(result.accessToken)
        return result
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

export async function refreshAccessToken(): Promise<RefreshResponse> {
  return requestRefresh()
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, skipAuthRefresh = false, ...requestInit } = options

  const execute = () => fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  let response = await execute()
  if (response.status === 401 && !skipAuthRefresh) {
    try {
      await requestRefresh()
      response = await execute()
    } catch (error) {
      setAccessToken(null)
      // Only a definitive server rejection (refresh token invalid/expired/missing) means the session is really over.
      // A raw network failure (offline blip, mobile tab backgrounded mid-request) is not proof of that - don't force
      // a global logout for it, just let the caller see the failed request like any other transient error.
      if (error instanceof ApiError) {
        notifyAuthExpired()
      }
      throw error
    }
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  return parseResponse<T>(response)
}
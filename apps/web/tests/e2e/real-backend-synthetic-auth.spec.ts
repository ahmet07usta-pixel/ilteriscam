import { expect, test } from '@playwright/test'
import fixture from '../../../platform-core-api/scripts/synthetic-auth-fixture.json' with { type: 'json' }

const API_BASE = 'http://127.0.0.1:4100/api/v1'
const WEB_ORIGIN = 'http://127.0.0.1:4177'
const ADMIN = {
  identifier: fixture.admin.email,
  password: fixture.admin.password,
}
const USER_A = {
  identifier: fixture.userA.email,
  password: fixture.userA.password,
}
const USER_B = {
  identifier: fixture.userB.email,
  password: fixture.userB.password,
}

function parseRefreshCookie(setCookieHeader: string | undefined): string {
  return (setCookieHeader ?? '').split(';')[0] || ''
}

test('real backend-backed synthetic auth E2E for rotation, revoke, revoke-all, and tenant boundaries', async ({ page, request }) => {
  await page.addInitScript(() => {
    ;(window as any).__runtime = {
      loginAccessToken: null,
      rotateStatus: null,
      rotateJson: null,
      meJson: null,
      auditJson: null,
    }

    const originalFetch = window.fetch.bind(window)
    window.fetch = async (...args: [RequestInfo | URL, RequestInit?]) => {
      const response = await originalFetch(...args)
      try {
        const input = typeof args[0] === 'string' ? args[0] : new URL(args[0].toString(), window.location.origin).toString()
        if (input.includes('/auth/login') && response.ok) {
          const payload = await response.clone().json()
          ;(window as any).__runtime.loginAccessToken = payload.accessToken
        }
        if (input.includes('/auth/password/rotate') && response.ok) {
          const payload = await response.clone().json()
          ;(window as any).__runtime.rotateJson = payload
          ;(window as any).__runtime.rotateStatus = response.status
        }
        if (input.includes('/auth/me') && response.ok) {
          ;(window as any).__runtime.meJson = await response.clone().json()
        }
        if (input.includes('/audit') && response.ok) {
          ;(window as any).__runtime.auditJson = await response.clone().json()
        }
      } catch {
        // ignore non-json responses
      }
      return response
    }
  })

  await page.goto('/login')
  await page.getByLabel('E-posta veya Telefon').fill(ADMIN.identifier)
  await page.getByLabel('Sifre').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Giris Yap' }).click()
  await expect(page).toHaveURL(/\/app(?:\/|$)/)

  const adminToken = await page.evaluate(() => (window as any).__runtime.loginAccessToken)
  expect(adminToken).toBeTruthy()

  const adminUser = await request.get(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${adminToken}` } })
  expect(adminUser.status()).toBe(200)
  const adminUsers = await adminUser.json()
  const adminRecord = adminUsers.find((entry: { email: string }) => entry.email === ADMIN.identifier)
  expect(adminRecord).toBeTruthy()

  const userAResponse = await request.post(`${API_BASE}/auth/login`, {
    data: { identifier: USER_A.identifier, password: USER_A.password },
    headers: { Origin: WEB_ORIGIN },
    failOnStatusCode: false,
  })
  expect(userAResponse.status()).toBe(201)
  const userAJson = await userAResponse.json()
  const userAAccess = userAJson.accessToken
  const userARefreshCookie = parseRefreshCookie(userAResponse.headers()['set-cookie'])
  expect(userAAccess).toBeTruthy()
  expect(userARefreshCookie).toContain('refreshToken=')

  const meA = await request.get(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${userAAccess}` },
    failOnStatusCode: false,
  })
  expect(meA.status()).toBe(200)
  const meAJson = await meA.json()
  expect(meAJson.passwordHash).toBeUndefined()
  expect(meAJson.refreshTokenHash).toBeUndefined()
  expect(meAJson.token).toBeUndefined()
  expect(meAJson.secret).toBeUndefined()
  expect(meAJson.credential).toBeUndefined()

  const userACompanies = await request.get(`${API_BASE}/companies`, { headers: { Authorization: `Bearer ${userAAccess}` } })
  expect(userACompanies.status()).toBe(200)
  const userACompanyList = await userACompanies.json()
  expect(userACompanyList.some((entry: { legalName: string }) => entry.legalName === 'Synthetic Alpha Holdings')).toBeTruthy()
  expect(userACompanyList.some((entry: { legalName: string }) => entry.legalName === 'Synthetic Beta Partners')).toBeFalsy()

  const adminCompanies = await request.get(`${API_BASE}/companies`, { headers: { Authorization: `Bearer ${adminToken}` } })
  expect(adminCompanies.status()).toBe(200)
  const adminCompanyList = await adminCompanies.json()
  const companyB = adminCompanyList.find((entry: { legalName: string }) => entry.legalName === 'Synthetic Beta Partners')
  expect(companyB).toBeTruthy()
  expect(companyB.id).toBeTruthy()

  const forbiddenCompanyAccess = await request.get(`${API_BASE}/companies/${companyB.id}`, {
    headers: { Authorization: `Bearer ${userAAccess}` },
    failOnStatusCode: false,
  })
  expect(forbiddenCompanyAccess.status()).toBe(403)

  const userBRequestPayload = { identifier: USER_B.identifier, password: USER_B.password }
  console.log('USER_B_LOGIN_PAYLOAD', userBRequestPayload)

  const userBResponse = await request.post(`${API_BASE}/auth/login`, {
    data: userBRequestPayload,
    headers: { Origin: WEB_ORIGIN },
    failOnStatusCode: false,
  })
  const userBText = await userBResponse.text()
  console.log('USER_B_LOGIN_STATUS', userBResponse.status())
  console.log('USER_B_LOGIN_TEXT', userBText)
  expect(userBResponse.status()).toBe(201)
  const userBJson = JSON.parse(userBText || '{}')
  const userBAccess = userBJson.accessToken
  const userBRefreshCookie = parseRefreshCookie(userBResponse.headers()['set-cookie'])
  expect(userBAccess).toBeTruthy()

  const targetUserId = (await request.get(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${adminToken}` } })).json()
  const userBRecord = (await targetUserId).find((entry: { email: string }) => entry.email === USER_B.identifier)
  expect(userBRecord).toBeTruthy()
  const userBId = userBRecord.id

  const unauthorizedRotation = await request.post(`${API_BASE}/auth/password/rotate`, {
    data: { targetUserId: userBId, newPassword: 'InvalidUserA!Pass2026' },
    headers: { Authorization: `Bearer ${userAAccess}`, 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  })
  expect(unauthorizedRotation.status()).toBe(403)

  const rotateResult = await page.evaluate(async ({ apiBase, token, targetUserId, password }) => {
    const response = await fetch(`${apiBase}/auth/password/rotate`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUserId, newPassword: password }),
    })
    const text = await response.text()
    return {
      status: response.status,
      body: text,
    }
  }, {
    apiBase: API_BASE,
    token: adminToken,
    targetUserId: userBId,
    password: 'SyntheticUserB!New2026',
  })
  expect(rotateResult.status).toBe(201)

  const audit = await request.get(`${API_BASE}/audit?limit=50`, { headers: { Authorization: `Bearer ${adminToken}` }, failOnStatusCode: false })
  expect(audit.status()).toBe(200)
  const auditJson = await audit.json()
  expect(auditJson.some((entry: { action: string }) => entry.action === 'PASSWORD_ROTATION')).toBeTruthy()

  const userARevokeResult = await request.post(`${API_BASE}/auth/sessions/revoke`, {
    data: { targetUserId: userAJson.user.id, refreshToken: userARefreshCookie.split('refreshToken=')[1] },
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  })
  expect(userARevokeResult.status()).toBe(201)

  const userARefreshAfterRevoke = await request.post(`${API_BASE}/auth/refresh`, {
    headers: { Cookie: userARefreshCookie },
    failOnStatusCode: false,
  })
  expect(userARefreshAfterRevoke.status()).toBe(401)

  const userBRevokeAllResult = await request.post(`${API_BASE}/auth/sessions/revoke-all`, {
    data: { targetUserId: userBId },
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  })
  expect(userBRevokeAllResult.status()).toBe(201)

  const userBRefreshAfterRevokeAll = await request.post(`${API_BASE}/auth/refresh`, {
    headers: { Cookie: userBRefreshCookie },
    failOnStatusCode: false,
  })
  expect(userBRefreshAfterRevokeAll.status()).toBe(401)

  const refreshedMe = await request.get(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    failOnStatusCode: false,
  })
  expect(refreshedMe.status()).toBe(200)
  const refreshedUser = await refreshedMe.json()
  expect(refreshedUser.passwordHash).toBeUndefined()
  expect(refreshedUser.refreshTokenHash).toBeUndefined()

  await page.goto('/app/ayarlar')
  await expect(page.getByRole('heading', { name: 'Uretici Firma Yonetimi', exact: true })).toBeVisible()
  await expect(page.locator('h2', { hasText: 'Uretici Firma Yonetimi' })).toBeVisible()

  const finalAudit = await page.evaluate(async ({ apiBase, token }) => {
    const response = await fetch(`${apiBase}/audit?limit=25`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return response.ok ? response.json() : { error: response.status }
  }, { apiBase: API_BASE, token: adminToken })

  expect(finalAudit.some((entry: { action: string }) => entry.action === 'PASSWORD_ROTATION')).toBeTruthy()
  expect(finalAudit.some((entry: { action: string }) => entry.action === 'SESSION_REVOKE')).toBeTruthy()
  expect(finalAudit.some((entry: { action: string }) => entry.action === 'SESSION_REVOKE_ALL')).toBeTruthy()
})

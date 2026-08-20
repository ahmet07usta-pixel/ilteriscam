import { expect, test } from '@playwright/test'

function token(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.test-signature`
}

test('uses backend login, centralized cookie refresh, membership IDs, and backend logout', async ({ page }) => {
  const user = {
    id: 'buyer-user-1',
    email: 'buyer@example.invalid',
    phone: null,
    fullName: 'Buyer User',
    role: 'SALES',
    permissions: null,
    isActive: true,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  }
  const initialToken = token({
    sub: user.id,
    role: user.role,
    permissions: ['orders.read'],
    tokenType: 'access',
  })
  const refreshedToken = token({
    sub: user.id,
    role: user.role,
    permissions: ['requests.read', 'requests.create', 'orders.read', 'orders.cancel'],
    tokenType: 'access',
  })
  let companyCalls = 0
  let refreshCalls = 0
  let logoutCalls = 0

  await page.route('http://127.0.0.1:4000/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/api/v1/auth/login') {
      expect(request.method()).toBe('POST')
      expect(request.postDataJSON()).toEqual({
        identifier: 'buyer@example.invalid',
        password: 'backend-password',
      })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'set-cookie': 'refreshToken=test-refresh; Path=/; HttpOnly; SameSite=Lax' },
        body: JSON.stringify({ accessToken: initialToken, user }),
      })
      return
    }

    if (path === '/api/v1/auth/refresh') {
      refreshCalls += 1
      expect(request.method()).toBe('POST')
      expect(request.headers().cookie).toContain('refreshToken=test-refresh')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: refreshedToken, user }),
      })
      return
    }

    if (path === '/api/v1/companies') {
      companyCalls += 1
      if (companyCalls === 1) {
        expect(request.headers().authorization).toBe(`Bearer ${initialToken}`)
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) })
        return
      }

      expect(request.headers().authorization).toBe(`Bearer ${refreshedToken}`)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'company-real-id',
            legalName: 'Backend Buyer Company',
            tradeName: 'Backend Buyer',
            status: 'ACTIVE',
            memberships: [
              {
                id: 'membership-real-id',
                companyId: 'company-real-id',
                userId: user.id,
                role: 'BUYER',
                status: 'ACTIVE',
              },
            ],
          },
        ]),
      })
      return
    }

    if (path === '/api/v1/auth/logout') {
      logoutCalls += 1
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${refreshedToken}`)
      await route.fulfill({ status: 204 })
      return
    }

    await route.abort()
  })

  await page.goto('/login')
  await page.getByLabel('E-posta veya Telefon').fill('buyer@example.invalid')
  await page.getByLabel('Sifre').fill('backend-password')
  await page.getByRole('button', { name: 'Giris Yap' }).click()
  await expect(page).toHaveURL(/\/app\/kontrol-paneli$/)
  await expect(page.getByText('Backend Buyer', { exact: true }).first()).toBeVisible()

  const stored = await page.evaluate(() => ({
    user: window.localStorage.getItem('dijitalcam.authUser'),
    session: window.localStorage.getItem('dijitalcam.authSession'),
    workflow: window.localStorage.getItem('dijitalcam.workflowStore'),
  }))
  expect(stored.user).toBeNull()
  expect(stored.session).toBeNull()
  expect(stored.workflow).not.toBeNull()
  expect(companyCalls).toBe(2)
  expect(refreshCalls).toBe(1)

  await page.locator('button.side-logout').click()
  await expect(page).toHaveURL(/\/login$/)
  await expect.poll(() => logoutCalls).toBe(1)
  expect(await page.evaluate(() => window.localStorage.getItem('dijitalcam.workflowStore'))).not.toBeNull()
  expect(await page.evaluate(() => window.localStorage.getItem('dijitalcam.authUser'))).toBeNull()

  await page.evaluate(() => {
    const localUser = {
      id: 'local-admin',
      role: 'ADMIN',
      email: 'local@example.invalid',
      phone: '',
      fullName: 'Local Admin',
      company: 'Local Company',
    }
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(localUser))
    window.localStorage.setItem('dijitalcam.authSession', JSON.stringify({ user: localUser, issuedAt: Date.now(), expiresAt: Date.now() + 60_000 }))
  })
  await page.goto('/app/ayarlar')
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => window.localStorage.getItem('dijitalcam.authUser'))).toBeNull()
  expect(await page.evaluate(() => window.localStorage.getItem('dijitalcam.authSession'))).toBeNull()
})
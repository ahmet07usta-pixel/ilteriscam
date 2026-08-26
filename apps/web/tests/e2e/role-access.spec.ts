import { expect, test, type Page } from '@playwright/test'

type UserRole = 'ADMIN' | 'MANUFACTURER' | 'BUYER'

type DemoUser = {
  id: string
  role: UserRole
  email: string
  phone: string
  fullName: string
  company: string
}

type RouteRule = {
  path: string
  allowedRoles: UserRole[]
  expectsTable?: boolean
  expectsTableExcludedRoles?: UserRole[]
}

const ACCESS_DENIED_TEXT = 'Bu sayfaya erişim yetkiniz bulunmamaktadır.'

const users: Record<UserRole, DemoUser> = {
  ADMIN: {
    id: 'usr-admin-001',
    role: 'ADMIN',
    email: 'admin@dijitalcam.com',
    phone: '+905300000001',
    fullName: 'Platform Admin',
    company: 'Dijital Cam Platformu',
  },
  MANUFACTURER: {
    id: 'usr-manufacturer-001',
    role: 'MANUFACTURER',
    email: 'uretici@firma.com',
    phone: '+905300000002',
    fullName: 'Emre Tunali',
    company: 'Nova Cephe Sistemleri',
  },
  BUYER: {
    id: 'usr-buyer-001',
    role: 'BUYER',
    email: 'alici@musteri.com',
    phone: '+905300000003',
    fullName: 'Selin Kaya',
    company: 'Eksen Cam Sanayi',
  },
}

const routeRules: RouteRule[] = [
  { path: '/app/kontrol-paneli', allowedRoles: ['ADMIN', 'MANUFACTURER', 'BUYER'] },
  { path: '/app/talepler', allowedRoles: ['MANUFACTURER', 'BUYER'], expectsTable: true },
  { path: '/app/teklifler', allowedRoles: ['MANUFACTURER', 'BUYER'], expectsTable: true },
  { path: '/app/siparisler', allowedRoles: ['MANUFACTURER', 'BUYER'], expectsTable: true },
  { path: '/app/fiyat-urun-yonetimi', allowedRoles: ['MANUFACTURER'] },
  { path: '/app/uretim-takibi', allowedRoles: ['MANUFACTURER', 'BUYER'], expectsTable: true },
  { path: '/app/sevkiyat', allowedRoles: ['MANUFACTURER', 'BUYER'], expectsTable: true },
  { path: '/app/mesajlar', allowedRoles: ['ADMIN', 'MANUFACTURER', 'BUYER'] },
  { path: '/app/bildirimler', allowedRoles: ['ADMIN', 'MANUFACTURER', 'BUYER'] },
  { path: '/app/firmalar', allowedRoles: ['ADMIN', 'MANUFACTURER'] },
  { path: '/app/raporlar', allowedRoles: ['ADMIN', 'MANUFACTURER'] },
  { path: '/app/ayarlar', allowedRoles: ['ADMIN', 'MANUFACTURER', 'BUYER'], expectsTable: true, expectsTableExcludedRoles: ['ADMIN'] },
]

async function loginAs(page: Page, role: UserRole): Promise<void> {
  const user = users[role]
  await page.goto('/login')
  await page.evaluate((authUser) => {
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(authUser))
    window.localStorage.setItem(
      'dijitalcam.authSession',
      JSON.stringify({
        user: authUser,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      }),
    )
    window.localStorage.removeItem('dijitalcam.workflowStore')
  }, user)
  await page.goto('/app/kontrol-paneli')
}

async function assertTableIfVisible(page: Page): Promise<void> {
  const table = page.locator('table').first()
  await expect(table).toBeVisible()

  const rowCount = await page.locator('table tbody tr').count()
  if (rowCount > 0) {
    await expect(page.locator('table tbody tr').first()).toBeVisible()
  }
}

async function assertRoleAwareRoute(page: Page, role: UserRole, route: RouteRule): Promise<void> {
  await page.goto(route.path)

  const isAllowed = route.allowedRoles.includes(role)
  const deniedMessage = page.getByText(ACCESS_DENIED_TEXT)

  if (!isAllowed) {
    await expect(deniedMessage).toBeVisible()
    return
  }

  await expect(deniedMessage).toHaveCount(0)

  if (route.expectsTable && !route.expectsTableExcludedRoles?.includes(role)) {
    await assertTableIfVisible(page)
  }
}

for (const role of Object.keys(users) as UserRole[]) {
  test.describe(`${role} role route matrix`, () => {
    test(`should follow role-based flow without table timeout`, async ({ page }) => {
      await loginAs(page, role)

      for (const routeRule of routeRules) {
        await test.step(`${role} -> ${routeRule.path}`, async () => {
          await assertRoleAwareRoute(page, role, routeRule)
        })
      }
    })
  })
}

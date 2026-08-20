import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

type UserRole = 'ADMIN' | 'MANUFACTURER' | 'BUYER'

type DemoUser = {
  id: string
  role: UserRole
  email: string
  phone: string
  fullName: string
  company: string
}

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

const ACCESS_DENIED_TEXT = 'Bu sayfaya erişim yetkiniz bulunmamaktadır.'

async function setUser(page: Page, role: UserRole): Promise<void> {
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
  }, users[role])
}

test.describe('Admin Platform, Security and System Validation', () => {
  test.setTimeout(120_000)

  test('validates settings, users, companies, security, forms, responsive and runtime health', async ({ page }) => {
    const consoleIssues: string[] = []
    const requestFailures: string[] = []
    const runtimeErrors: string[] = []

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleIssues.push(`${msg.type()}: ${msg.text()}`)
      }
    })

    page.on('requestfailed', (request) => {
      requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`)
    })

    page.on('pageerror', (error) => {
      runtimeErrors.push(error.message)
    })

    await setUser(page, 'ADMIN')
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.goto('/app/ayarlar')

    await expect(page.getByText('Platform Cekirdek Ayarlari')).toBeVisible()
    await expect(page.locator('.request-detail-card', { hasText: 'Platform Dili' }).first()).toBeVisible()
    await expect(page.locator('.request-detail-card', { hasText: 'Platform Saat Dilimi' }).first()).toBeVisible()
    await expect(page.locator('.request-detail-card', { hasText: 'Varsayilan Para Birimi' }).first()).toBeVisible()
    await expect(page.locator('.request-detail-card', { hasText: 'Bolgesel Format' }).first()).toBeVisible()

    await page.getByRole('button', { name: '+ Ayar Kaydet' }).click()
    const settingModal = page.getByRole('region', { name: 'Yeni Ayar' })
    await settingModal.locator('label:has-text("Ayar Adi") input').fill('Platform Saat Dilimi')
    await settingModal.locator('label:has-text("Deger") input').fill('Istanbul')
    await settingModal.locator('label:has-text("Son Guncelleyen") input').fill('Platform Admin')
    await settingModal.getByRole('button', { name: 'Kaydet' }).click()
    await expect(settingModal.getByText('Saat dilimi Area/Location formatinda olmalidir')).toBeVisible()

    await settingModal.locator('label:has-text("Deger") input').fill('Europe/Istanbul')
    await settingModal.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText(/Ayar guncellendi|Yeni ayar kaydedildi/)).toBeVisible()

    const userSection = page.locator('section', { hasText: 'Kullanici Yonetimi' }).first()
    await expect(userSection).toBeVisible()
    await expect(userSection).toContainText('Bu bolum gercek oturum gerektirir')

    await page.goto('/app/firmalar')
    await expect(page.getByRole('heading', { name: 'Firma Yonetimi' })).toBeVisible()
    await expect(page.getByText('Bu bolum gercek oturum gerektirir')).toBeVisible()

    await setUser(page, 'BUYER')
    await page.goto('/app/firmalar')
    await expect(page.getByText(ACCESS_DENIED_TEXT)).toBeVisible()

    await page.goto('/app/uretim-takibi')
    await expect(page.getByText(ACCESS_DENIED_TEXT)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Yeni Is Emri' })).toHaveCount(0)

    await page.evaluate(() => {
      window.localStorage.removeItem('dijitalcam.authUser')
      window.localStorage.removeItem('dijitalcam.authSession')
    })
    await page.goto('/app/ayarlar')
    await expect(page).toHaveURL(/\/login$/)

    await setUser(page, 'ADMIN')
    await page.goto('/app/kontrol-paneli')
    await page.getByRole('button', { name: 'Cikis Yap' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/login')
    await page.evaluate((authUser) => {
      window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(authUser))
      window.localStorage.setItem(
        'dijitalcam.authSession',
        JSON.stringify({
          user: authUser,
          issuedAt: Date.now() - 60_000,
          expiresAt: Date.now() - 1,
        }),
      )
    }, users.ADMIN)
    await page.goto('/app/kontrol-paneli')
    await expect(page).toHaveURL(/\/login$/)

    await setUser(page, 'ADMIN')
    const viewports = [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1366, height: 900 },
      { width: 1920, height: 1080 },
    ]

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)

      const settingsStart = Date.now()
      await page.goto('/app/ayarlar')
      await expect(page.getByRole('heading', { name: 'Ayarlar', exact: true })).toBeVisible()
      const settingsLoadDuration = Date.now() - settingsStart
      expect(settingsLoadDuration).toBeLessThan(6000)

      const companiesStart = Date.now()
      await page.goto('/app/firmalar')
      await expect(page.getByRole('heading', { name: 'Firma Yonetimi' })).toBeVisible()
      const companiesLoadDuration = Date.now() - companiesStart
      expect(companiesLoadDuration).toBeLessThan(6000)
      await page.mouse.wheel(0, 1200)
    }

    expect(consoleIssues, `Console issues:\n${consoleIssues.join('\n')}`).toEqual([])
    expect(requestFailures, `Network request failures:\n${requestFailures.join('\n')}`).toEqual([])
    expect(runtimeErrors, `Runtime errors:\n${runtimeErrors.join('\n')}`).toEqual([])
  })
})

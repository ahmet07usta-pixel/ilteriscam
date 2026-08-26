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

type WorkflowSnapshot = {
  requests: Array<{ id: string; company: string; region: string; requestType: string; product: string; title: string; description: string; owner: string; assignedManufacturers: string[]; priority: string; status: string; createdAt: string; deliveryDate: string }>
  offers: Array<{ id: string; requestId?: string; manufacturerCompany?: string; status: string }>
  orders: Array<{ id: string; status: string }>
  productions: Array<{ id: string; orderId?: string; status: string }>
  shipments: Array<{ id: string; orderNo: string; status: string }>
  priceCatalogs: unknown[]
  activityLog: Array<{ id: string; eventKey?: string; title: string; description: string; audience: string; channel: string }>
  activityReadKeys: string[]
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
  }, users[role])
}

async function readWorkflowSnapshot(page: Page): Promise<WorkflowSnapshot> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('dijitalcam.workflowStore')
    if (!raw) {
      return {
        requests: [],
        offers: [],
        orders: [],
        productions: [],
        shipments: [],
        priceCatalogs: [],
        activityLog: [],
        activityReadKeys: [],
      }
    }

    return JSON.parse(raw) as WorkflowSnapshot
  })
}

function buildLargeRequests(count: number): WorkflowSnapshot['requests'] {
  const createdAt = '07.08.2026'
  const deliveryDate = '14.08.2026'

  return Array.from({ length: count }, (_, index) => {
    const no = String(index + 1).padStart(4, '0')
    return {
      id: `TL-PERF-${no}`,
      company: index % 2 === 0 ? 'Eksen Cam Sanayi' : 'Nova Cephe Sistemleri',
      region: index % 3 === 0 ? 'Marmara' : 'Ege',
      requestType: index % 4 === 0 ? 'Mimari Cam' : 'Lamine Cam',
      product: `Performans Test Cam ${no}`,
      title: `Performans Talep ${no}`,
      description: `Performans testi satiri ${no}`,
      owner: index % 2 === 0 ? 'Selin Kaya' : 'Emre Tunali',
      assignedManufacturers: ['Nova Cephe Sistemleri'],
      priority: index % 5 === 0 ? 'Kritik' : 'Orta',
      status: index % 7 === 0 ? 'Onaylanan' : 'Bekleyen',
      createdAt,
      deliveryDate,
    }
  })
}

async function seedRequests(page: Page, count: number): Promise<void> {
  await page.evaluate((nextRows) => {
    const raw = window.localStorage.getItem('dijitalcam.workflowStore')
    const parsed = raw ? (JSON.parse(raw) as WorkflowSnapshot) : null
    const nextSnapshot: WorkflowSnapshot = {
      requests: nextRows,
      offers: parsed?.offers ?? [],
      orders: parsed?.orders ?? [],
      productions: parsed?.productions ?? [],
      shipments: parsed?.shipments ?? [],
      priceCatalogs: parsed?.priceCatalogs ?? [],
      activityLog: parsed?.activityLog ?? [],
      activityReadKeys: parsed?.activityReadKeys ?? [],
    }

    window.localStorage.setItem('dijitalcam.workflowStore', JSON.stringify(nextSnapshot))
  }, buildLargeRequests(count))
}

test.describe('System Performance, Security and Resilience Validation', () => {
  test.setTimeout(180_000)

  test('validates performance, security boundaries, resilience and runtime health', async ({ page }) => {
    const consoleIssues: string[] = []
    const requestFailures: string[] = []
    const runtimeErrors: string[] = []
    const requestCountByUrl = new Map<string, number>()
    let dialogOpened = false

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleIssues.push(`${msg.type()}: ${msg.text()}`)
      }
    })

    page.on('requestfailed', (request) => {
      requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`)
    })

    page.on('request', (request) => {
      const url = request.url()
      requestCountByUrl.set(url, (requestCountByUrl.get(url) ?? 0) + 1)
    })

    page.on('pageerror', (error) => {
      runtimeErrors.push(error.message)
    })

    page.on('dialog', async (dialog) => {
      dialogOpened = true
      await dialog.dismiss()
    })

    await setUser(page, 'ADMIN')
    await page.evaluate(() => window.localStorage.removeItem('dijitalcam.workflowStore'))
    await page.setViewportSize({ width: 1366, height: 900 })

    const perfRoutes = [
      '/app/kontrol-paneli',
      '/app/mesajlar',
      '/app/bildirimler',
      '/app/firmalar',
      '/app/raporlar',
      '/app/ayarlar',
    ]

    for (const route of perfRoutes) {
      const startedAt = Date.now()
      await page.goto(route)
      await expect(page.locator('.workspace-main').first()).toBeVisible()
      const duration = Date.now() - startedAt
      expect(duration).toBeLessThan(4000)
    }

    // Talepler pagination/search-at-scale is not admin-specific; run it as a role that still has the page.
    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/talepler')
    for (const size of [500, 1000, 5000]) {
      await seedRequests(page, size)

      const startedAt = Date.now()
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Talepler' })).toBeVisible()
      const duration = Date.now() - startedAt
      expect(duration).toBeLessThan(5000)

      await expect(page.locator('.requests-table-panel .panel-header p')).toContainText(`${size} kayit gosteriliyor`)
      await expect(page.locator('.ui-pagination')).toBeVisible()
      await expect(page.locator('.requests-table tbody tr')).toHaveCount(50)

      const term = `TL-PERF-${String(Math.floor(size / 2)).padStart(4, '0')}`
      const filterStart = Date.now()
      await page.getByPlaceholder('Talep, firma veya olusturan ara').fill(term)
      await expect(page.locator('.requests-table tbody tr')).toHaveCount(1)
      const filterDuration = Date.now() - filterStart
      expect(filterDuration).toBeLessThan(2000)

      await page.getByPlaceholder('Talep, firma veya olusturan ara').fill('')
      await expect(page.locator('.requests-table tbody tr')).toHaveCount(50)
    }

    await setUser(page, 'BUYER')
    await page.goto('/app/raporlar')
    await expect(page.getByText(ACCESS_DENIED_TEXT)).toBeVisible()
    await page.goto('/app/uretim-takibi')
    await expect(page.getByText(ACCESS_DENIED_TEXT)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Yeni Is Emri' })).toHaveCount(0)

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
    }, users.BUYER)
    await page.goto('/app/kontrol-paneli')
    await expect(page).toHaveURL(/\/login$/)

    await setUser(page, 'BUYER')
    await page.goto('/app/talepler')
    await page.getByRole('button', { name: '+ Yeni Talep Olustur' }).click()
    const requestModal = page.getByRole('region', { name: 'Yeni Talep' })
    const injectionTitle = '<script>alert(1)</script>'
    const injectionSql = "' OR 1=1 --"
    await requestModal.locator('label:has-text("Talep Basligi") input').fill(injectionTitle)
    await requestModal.locator('label:has-text("Urun") input').fill('12 mm Guvenlik Cami')
    await requestModal.locator('label:has-text("Aciklama") textarea').fill(`XSS/SQL test ${injectionSql}`)
    await requestModal.locator('label:has-text("Bolge") select').selectOption('Marmara')
    await requestModal.locator('label:has-text("Sorumlu") input').fill('Selin Kaya')
    await requestModal.locator('.request-modal-actions .solid-btn').click()
    await expect(page.locator('table tbody tr', { hasText: injectionTitle }).first()).toBeVisible()
    expect(dialogOpened).toBe(false)

    const sensitiveLeak = await page.evaluate(() => {
      const entries = Object.entries(window.localStorage)
      const suspiciousPattern = /password|secret|jwt|access[_-]?token|refresh[_-]?token/i
      return entries.filter(([key, value]) => suspiciousPattern.test(key) || suspiciousPattern.test(value))
    })
    expect(sensitiveLeak).toEqual([])

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/talepler')
    await page.getByRole('button', { name: '+ Yeni Talep Olustur' }).click()
    const duplicateModal = page.getByRole('region', { name: 'Yeni Talep' })
    const duplicateRequestId = (await duplicateModal.locator('input[readonly]').first().inputValue()).trim()
    await duplicateModal.locator('label:has-text("Talep Basligi") input').fill(`Cift Islem Testi ${Date.now()}`)
    await duplicateModal.locator('label:has-text("Urun") input').fill('10 mm Test Cam')
    await duplicateModal.locator('label:has-text("Aciklama") textarea').fill('Double click duplicate kontrolu')
    await duplicateModal.locator('label:has-text("Bolge") select').selectOption('Marmara')
    await duplicateModal.locator('label:has-text("Sorumlu") input').fill('Emre Tunali')
    await duplicateModal.locator('.request-modal-actions .solid-btn').click()

    const convertButton = page.locator('table tbody tr', { hasText: duplicateRequestId }).first().getByRole('button', { name: 'Teklife Donustur' })
    await convertButton.dblclick()

    const duplicateCheckSnapshot = await readWorkflowSnapshot(page)
    const duplicateOfferCount = duplicateCheckSnapshot.offers.filter(
      (item) => item.requestId === duplicateRequestId && (item.manufacturerCompany ?? '') === users.MANUFACTURER.company,
    ).length
    expect(duplicateOfferCount).toBe(1)

    await setUser(page, 'MANUFACTURER')
    await page.evaluate(() => {
      const emptySnapshot: WorkflowSnapshot = {
        requests: [],
        offers: [],
        orders: [],
        productions: [],
        shipments: [],
        priceCatalogs: [],
        activityLog: [],
        activityReadKeys: [],
      }
      window.localStorage.setItem('dijitalcam.workflowStore', JSON.stringify(emptySnapshot))
    })
    await page.goto('/app/talepler')
    await expect(page.locator('.requests-table-panel .panel-header p')).toContainText('0 kayit gosteriliyor')
    await expect(page.locator('table tbody tr')).toHaveCount(0)

    await page.evaluate(() => {
      window.localStorage.setItem('dijitalcam.workflowStore', '{malformed-json')
    })
    await page.goto('/app/talepler')
    await expect(page.getByRole('heading', { name: 'Talepler' })).toBeVisible()
    await expect(page.locator('table')).toBeVisible()

    const maxRepeat = Math.max(...Array.from(requestCountByUrl.values()), 0)
    expect(maxRepeat).toBeLessThan(40)

    expect(consoleIssues, `Console/runtime issues:\n${consoleIssues.join('\n')}`).toEqual([])
    expect(requestFailures, `Failed network requests:\n${requestFailures.join('\n')}`).toEqual([])
    expect(runtimeErrors, `Runtime page errors:\n${runtimeErrors.join('\n')}`).toEqual([])
  })
})

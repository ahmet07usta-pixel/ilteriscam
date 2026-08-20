import { expect, test, type Page, type Route } from '@playwright/test'

const apiBase = 'http://127.0.0.1:4000/api/v1'
const permissions = ['orders.read', 'orders.confirm', 'orders.cancel']
const sessionUser = {
  id: 'order-user',
  role: 'MANUFACTURER',
  backendRole: 'PRODUCER',
  permissions,
  email: 'orders@example.invalid',
  phone: '',
  fullName: 'Order User',
  company: 'API Manufacturer',
  companyId: 'manufacturer-1',
  memberships: [],
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1', orderNumber: 'ORD-API-1', requestId: 'request-1', quotationId: 'quotation-1',
    companyId: 'buyer-1', manufacturerCompanyId: 'manufacturer-1', createdByUserId: 'buyer-user',
    status: 'PENDING_CONFIRMATION', version: 4, confirmedAt: null, confirmedByUserId: null,
    cancelledAt: null, cancelledByUserId: null, cancellationReason: null, currency: 'TRY',
    totalAmount: '125000.00', promisedDeliveryDate: '2026-09-01T12:00:00.000Z',
    createdAt: '2026-08-09T10:00:00.000Z', updatedAt: '2026-08-09T10:00:00.000Z',
    request: { id: 'request-1', requestNumber: 'REQ-API-1', companyId: 'buyer-1', status: 'AWARDED', internalRequest: 'hidden' },
    quotation: {
      id: 'quotation-1', quotationNumber: 'QUO-API-1', requestId: 'request-1', companyId: 'buyer-1',
      manufacturerCompanyId: 'manufacturer-1', status: 'ACCEPTED', internalQuotation: 'hidden',
    },
    company: { id: 'buyer-1', legalName: 'API Buyer AS', tradeName: 'API Buyer', status: 'ACTIVE', taxNumber: 'hidden' },
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer', status: 'ACTIVE', taxNumber: 'hidden' },
    createdBy: { id: 'buyer-user', fullName: 'Buyer User', email: 'buyer@example.invalid', passwordHash: 'hidden' },
    confirmedBy: null,
    cancelledBy: null,
    internalOrderField: 'must-not-be-rendered',
    ...overrides,
  }
}

function requestFixture() {
  return {
    id: 'request-1', requestNumber: 'REQ-API-1', companyId: 'buyer-1', regionId: null,
    createdByUserId: 'buyer-user', title: 'Order Request', description: null, productType: 'GLASS',
    quantity: null, unit: null, targetDeliveryDate: null, budgetMin: null, budgetMax: null,
    currency: 'TRY', status: 'AWARDED', version: 5, createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z', company: null, region: null, createdBy: null, recipients: [],
  }
}

function quotationFixture() {
  return {
    id: 'quotation-1', quotationNumber: 'QUO-API-1', requestId: 'request-1', companyId: 'buyer-1',
    manufacturerCompanyId: 'manufacturer-1', createdByUserId: 'producer-user', totalAmount: '125000.00',
    currency: 'TRY', leadTimeDays: 7, validUntil: '2026-09-01T12:00:00.000Z', notes: null,
    status: 'ACCEPTED', revisionNumber: 1, version: 9, activeCalculationId: null,
    createdAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-09T10:00:00.000Z',
    request: { id: 'request-1', requestNumber: 'REQ-API-1', companyId: 'buyer-1', title: 'Order Request', status: 'AWARDED' },
    company: { id: 'buyer-1', legalName: 'API Buyer AS', tradeName: 'API Buyer', status: 'ACTIVE' },
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer', status: 'ACTIVE' },
    createdBy: null,
  }
}

async function setSession(page: Page, allowedPermissions = permissions): Promise<void> {
  await page.goto('/login')
  await page.evaluate(({ user, userPermissions }) => {
    const authenticatedUser = { ...user, permissions: userPermissions }
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(authenticatedUser))
    window.localStorage.setItem('dijitalcam.authSession', JSON.stringify({
      user: authenticatedUser, issuedAt: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000,
    }))
  }, { user: sessionUser, userPermissions: allowedPermissions })
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

const readWorkflowStore = (page: Page) =>
  page.evaluate(() => window.localStorage.getItem('dijitalcam.workflowStore'))

// The app seeds its local workflow store asynchronously after mount, so the baseline
// must be captured only once the seeded activity log has landed and the value is stable.
async function settledWorkflowStore(page: Page): Promise<string | null> {
  await expect.poll(async () => {
    const raw = await readWorkflowStore(page)
    return raw ? (JSON.parse(raw).activityLog as unknown[]).length > 0 : false
  }).toBe(true)
  let previous = await readWorkflowStore(page)
  await expect.poll(async () => {
    const current = await readWorkflowStore(page)
    const settled = current === previous
    previous = current
    return settled
  }).toBe(true)
  return previous
}

test('lists and loads allowlisted authoritative Order details', async ({ page }) => {
  const current = order()
  let detailCalls = 0
  await page.route(`${apiBase}/orders**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/orders') return fulfillJson(route, [current])
    if (path === '/api/v1/orders/order-1') {
      detailCalls += 1
      return fulfillJson(route, current)
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/siparisler')
  const row = page.locator('.order-api-table tbody tr', { hasText: 'ORD-API-1' })
  await expect(row).toContainText('API Buyer')
  await expect(row).toContainText('API Manufacturer')
  await expect(row).toContainText('Onay Bekliyor')
  await expect(row).not.toContainText('must-not-be-rendered')
  await row.getByRole('button', { name: 'Goruntule' }).click()
  const detail = page.getByRole('region', { name: 'Siparis Detayi' })
  await expect(detail).toContainText('REQ-API-1')
  await expect(detail).toContainText('QUO-API-1')
  await expect(detail).toContainText('TRY 125000.00')
  await expect(detail).not.toContainText('passwordHash')
  expect(detailCalls).toBe(1)
})

test('confirms and cancels with authoritative versions without mutating local workflow', async ({ page }) => {
  let orders = [order(), order({ id: 'order-2', orderNumber: 'ORD-API-2', version: 8 })]
  const bodies: Array<Record<string, unknown>> = []
  await page.route(`${apiBase}/requests/request-1`, (route) => fulfillJson(route, requestFixture()))
  await page.route(`${apiBase}/quotations/quotation-1`, (route) => fulfillJson(route, quotationFixture()))
  await page.route(`${apiBase}/orders**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/orders' && request.method() === 'GET') return fulfillJson(route, orders)
    const match = path.match(/^\/api\/v1\/orders\/(order-[12])\/(confirm|cancel)$/)
    if (match && request.method() === 'POST') {
      const [, id, action] = match
      const body = request.postDataJSON() as Record<string, unknown>
      bodies.push({ id, action, ...body })
      const current = orders.find((item) => item.id === id)!
      const updated = order({
        ...current,
        status: action === 'confirm' ? 'CONFIRMED' : 'CANCELLED',
        version: Number(current.version) + 1,
        confirmedAt: action === 'confirm' ? '2026-08-09T12:00:00.000Z' : null,
        cancellationReason: action === 'cancel' ? body.cancellationReason : null,
      })
      orders = orders.map((item) => item.id === id ? updated : item)
      return fulfillJson(route, updated)
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/siparisler')
  const workflowBefore = await settledWorkflowStore(page)
  await page.locator('.order-api-table tbody tr', { hasText: 'ORD-API-1' }).getByRole('button', { name: 'Onayla' }).click()
  await expect(page.locator('.order-api-table tbody tr', { hasText: 'ORD-API-1' })).toContainText('Onaylandi')

  await page.locator('.order-api-table tbody tr', { hasText: 'ORD-API-2' }).getByRole('button', { name: 'Iptal Et' }).click()
  const cancelModal = page.getByRole('region', { name: 'Siparisi Iptal Et' })
  await cancelModal.getByLabel('Iptal Nedeni (istege bagli)').fill('Buyer cancelled')
  await cancelModal.getByRole('button', { name: 'Siparisi Iptal Et' }).click()
  await expect(page.locator('.order-api-table tbody tr', { hasText: 'ORD-API-2' })).toContainText('Iptal Edildi')

  expect(bodies).toEqual([
    { id: 'order-1', action: 'confirm', version: 4 },
    { id: 'order-2', action: 'cancel', version: 8, cancellationReason: 'Buyer cancelled' },
  ])
  const workflowAfter = await settledWorkflowStore(page)
  expect(workflowAfter).toBe(workflowBefore)
})

test('does not retry a 409 and refetches Order, Quotation, and Request authority', async ({ page }) => {
  let listCalls = 0
  let detailCalls = 0
  let confirmCalls = 0
  let requestCalls = 0
  let quotationCalls = 0
  await page.route(`${apiBase}/requests/request-1`, async (route) => {
    requestCalls += 1
    await fulfillJson(route, requestFixture())
  })
  await page.route(`${apiBase}/quotations/quotation-1`, async (route) => {
    quotationCalls += 1
    await fulfillJson(route, quotationFixture())
  })
  await page.route(`${apiBase}/orders**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/orders') {
      listCalls += 1
      return fulfillJson(route, [order({ version: listCalls === 1 ? 4 : 5 })])
    }
    if (path === '/api/v1/orders/order-1' && request.method() === 'GET') {
      detailCalls += 1
      return fulfillJson(route, order({ version: 5 }))
    }
    if (path.endsWith('/confirm')) {
      confirmCalls += 1
      return fulfillJson(route, { message: 'stale' }, 409)
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/siparisler')
  await page.locator('.order-api-table tbody tr').getByRole('button', { name: 'Goruntule' }).click()
  await page.getByRole('region', { name: 'Siparis Detayi' }).getByRole('button', { name: 'Onayla' }).click()
  await expect(page.getByRole('status')).toContainText('Guncel veri yeniden yuklendi')
  expect(confirmCalls).toBe(1)
  expect(listCalls).toBeGreaterThanOrEqual(2)
  expect(detailCalls).toBeGreaterThanOrEqual(2)
  expect(requestCalls).toBe(1)
  expect(quotationCalls).toBe(1)
})

test('gates actions by permission and shows loading, empty, and error states', async ({ page }) => {
  let mode: 'loading' | 'empty' | 'error' | 'data' = 'loading'
  let releaseLoading: (() => void) | undefined
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve })
  await page.route(`${apiBase}/orders**`, async (route) => {
    if (mode === 'loading') await loadingGate
    if (mode === 'error') return fulfillJson(route, {}, 503)
    return fulfillJson(route, mode === 'data' ? [order()] : [])
  })

  await setSession(page)
  await page.goto('/app/siparisler')
  await expect(page.getByText('Veriler yukleniyor')).toBeVisible()
  mode = 'empty'
  releaseLoading?.()
  await expect(page.getByText('Gosterilecek kayit yok')).toBeVisible()

  mode = 'error'
  await page.reload()
  await expect(page.getByText('Gecici bir hata olustu')).toBeVisible()

  mode = 'data'
  await page.getByRole('button', { name: 'Yeniden dene' }).click()
  await expect(page.locator('.order-api-table tbody tr')).toHaveCount(1)
  await setSession(page, ['orders.read'])
  await page.goto('/app/siparisler')
  await expect(page.locator('.order-api-table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Onayla' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Iptal Et' })).toHaveCount(0)

  await setSession(page, [])
  await page.goto('/app/siparisler')
  await expect(page.getByText('Siparisleri goruntuleme yetkiniz bulunmuyor.')).toBeVisible()
})

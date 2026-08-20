import { expect, test, type Page, type Route } from '@playwright/test'

const apiBase = 'http://127.0.0.1:4000/api/v1'
const permissions = [
  'orders.read',
  'productions.read',
  'shipments.read',
  'shipments.create',
  'shipments.transition',
]
const sessionUser = {
  id: 'shipment-user',
  role: 'MANUFACTURER',
  backendRole: 'PRODUCER',
  permissions,
  email: 'shipment@example.invalid',
  phone: '',
  fullName: 'Shipment User',
  company: 'API Manufacturer',
  companyId: 'manufacturer-1',
  memberships: [],
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1', orderNumber: 'ORD-SHP-1', requestId: 'request-1', quotationId: 'quotation-1',
    companyId: 'buyer-1', manufacturerCompanyId: 'manufacturer-1', createdByUserId: 'buyer-user',
    status: 'CONFIRMED', version: 6, confirmedAt: '2026-08-09T10:00:00.000Z', confirmedByUserId: sessionUser.id,
    cancelledAt: null, cancelledByUserId: null, cancellationReason: null, currency: 'TRY',
    totalAmount: '45000.00', promisedDeliveryDate: '2026-09-01T12:00:00.000Z',
    createdAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-09T10:00:00.000Z',
    request: { id: 'request-1', requestNumber: 'REQ-SHP-1', companyId: 'buyer-1', status: 'AWARDED', title: 'Magaza Vitrin Camlari', productType: 'TEMPERED_GLASS' },
    quotation: { id: 'quotation-1', quotationNumber: 'QUO-SHP-1', requestId: 'request-1', companyId: 'buyer-1', manufacturerCompanyId: 'manufacturer-1', status: 'ACCEPTED' },
    company: { id: 'buyer-1', legalName: 'API Buyer AS', tradeName: 'API Buyer', status: 'ACTIVE' },
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer', status: 'ACTIVE' },
    createdBy: null, confirmedBy: null, cancelledBy: null,
    privateOrderField: 'must-not-be-rendered',
    ...overrides,
  }
}

function production(overrides: Record<string, unknown> = {}) {
  return {
    id: 'production-1', productionNumber: 'PRD-ORD-SHP-1', orderId: 'order-1',
    manufacturerCompanyId: 'manufacturer-1', createdByUserId: sessionUser.id,
    status: 'COMPLETED', version: 7, productionLine: 'Hat A',
    plannedStartDate: '2026-08-20T08:00:00.000Z', dueDate: '2026-09-01T12:00:00.000Z',
    startedAt: '2026-08-20T08:00:00.000Z', completedAt: '2026-08-21T16:00:00.000Z',
    notes: null, statusReason: null, createdAt: '2026-08-09T11:00:00.000Z', updatedAt: '2026-08-21T16:00:00.000Z',
    order: {
      ...order(),
      request: { id: 'request-1', requestNumber: 'REQ-SHP-1', title: 'Magaza Vitrin Camlari', productType: 'TEMPERED_GLASS', companyId: 'buyer-1' },
      quotation: { id: 'quotation-1', quotationNumber: 'QUO-SHP-1' },
    },
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer', status: 'ACTIVE' },
    createdBy: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email },
    internalProductionField: 'must-not-be-rendered',
    ...overrides,
  }
}

function shipment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shipment-1', shipmentNumber: 'SHP-PRD-ORD-SHP-1', productionId: 'production-1', orderId: 'order-1',
    manufacturerCompanyId: 'manufacturer-1', createdByUserId: sessionUser.id,
    status: 'PLANNED', version: 2, destinationAddress: 'Levent Mah. Cam Sok. No: 10 Istanbul',
    plannedDepartureAt: '2026-09-02T08:00:00.000Z', estimatedDeliveryAt: '2026-09-03T16:00:00.000Z',
    departedAt: null, deliveredAt: null, carrier: 'Guven Nakliyat', trackingNumber: 'TRK-1001', notes: 'Dik tasinacak',
    createdAt: '2026-08-22T10:00:00.000Z', updatedAt: '2026-08-22T10:00:00.000Z',
    production: { id: 'production-1', productionNumber: 'PRD-ORD-SHP-1', status: 'COMPLETED', version: 7, completedAt: '2026-08-21T16:00:00.000Z', internalProduction: 'hidden' },
    order: order(),
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer', status: 'ACTIVE', taxNumber: 'hidden' },
    createdBy: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email, passwordHash: 'hidden' },
    internalShipmentField: 'must-not-be-rendered',
    ...overrides,
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

test('lists and loads allowlisted Shipment details with a contained mobile layout', async ({ page }) => {
  let detailCalls = 0
  await page.route(`${apiBase}/shipments**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/shipments') return fulfillJson(route, [shipment()])
    if (path === '/api/v1/shipments/shipment-1') {
      detailCalls += 1
      return fulfillJson(route, shipment())
    }
    await route.abort()
  })
  await page.route(`${apiBase}/productions**`, async (route) => fulfillJson(route, [production()]))

  await setSession(page)
  await page.goto('/app/sevkiyat')
  const row = page.locator('.shipment-api-table tbody tr', { hasText: 'SHP-PRD-ORD-SHP-1' })
  await expect(row).toContainText('ORD-SHP-1')
  await expect(row).toContainText('PRD-ORD-SHP-1')
  await expect(row).toContainText('Planlandi')
  await expect(row).not.toContainText('must-not-be-rendered')
  await row.getByRole('button', { name: 'Goruntule' }).click()
  const detail = page.getByRole('region', { name: 'Sevkiyat Detayi' })
  await expect(detail).toContainText('Levent Mah. Cam Sok. No: 10 Istanbul')
  await expect(detail).toContainText('Guven Nakliyat')
  await expect(detail).toContainText('TRK-1001')
  await expect(detail).not.toContainText(/version|internal|passwordHash|tenant|Prisma/i)
  expect(detailCalls).toBe(1)

  await detail.locator('.request-modal-actions').getByRole('button', { name: 'Kapat' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.shipment-table-wrap')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await row.getByRole('button', { name: 'Goruntule' }).click()
  const mobileDetail = page.getByRole('region', { name: 'Sevkiyat Detayi' })
  expect(await mobileDetail.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.top >= 0
  })).toBe(true)
})

test('plans from a COMPLETED Production with authoritative version and no local workflow writes', async ({ page }) => {
  let shipments: ReturnType<typeof shipment>[] = []
  const createBodies: Array<Record<string, unknown>> = []
  await page.route(`${apiBase}/shipments**`, async (route) => {
    if (route.request().method() === 'GET') return fulfillJson(route, shipments)
    await route.abort()
  })
  await page.route(`${apiBase}/productions**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/productions' && request.method() === 'GET') return fulfillJson(route, [production()])
    if (path === '/api/v1/productions/production-1' && request.method() === 'GET') return fulfillJson(route, production())
    if (path === '/api/v1/productions/production-1/shipment' && request.method() === 'POST') {
      createBodies.push(request.postDataJSON() as Record<string, unknown>)
      shipments = [shipment()]
      return fulfillJson(route, shipments[0], 201)
    }
    await route.abort()
  })
  await page.route(`${apiBase}/orders/order-1`, async (route) => fulfillJson(route, order()))

  await setSession(page)
  await page.goto('/app/sevkiyat')
  const workflowBefore = await settledWorkflowStore(page)
  await page.getByRole('button', { name: 'Sevkiyat Planla' }).click()
  const modal = page.getByRole('region', { name: 'Sevkiyat Planla' })
  await modal.getByLabel('Tamamlanan Uretim').selectOption('production-1')
  await modal.getByLabel('Planlanan Cikis').fill('2026-09-02')
  await modal.getByLabel('Tahmini Teslim').fill('2026-09-03')
  await modal.getByLabel('Teslimat Adresi').fill('Levent Mah. Cam Sok. No: 10 Istanbul')
  await modal.getByLabel('Tasiyici').fill('Guven Nakliyat')
  await modal.getByLabel('Takip Numarasi').fill('TRK-1001')
  await modal.getByLabel('Not').fill('Dik tasinacak')
  await modal.getByRole('button', { name: 'Sevkiyati Planla' }).click()

  expect(createBodies).toEqual([{
    productionVersion: 7,
    destinationAddress: 'Levent Mah. Cam Sok. No: 10 Istanbul',
    plannedDepartureAt: '2026-09-02',
    estimatedDeliveryAt: '2026-09-03',
    carrier: 'Guven Nakliyat',
    trackingNumber: 'TRK-1001',
    notes: 'Dik tasinacak',
  }])
  await expect(page.locator('.shipment-api-table tbody tr')).toHaveCount(1)
  expect(await settledWorkflowStore(page)).toBe(workflowBefore)
})

test('uses authoritative Shipment versions and does not retry 409 while refetching all authority', async ({ page }) => {
  let listCalls = 0
  let detailCalls = 0
  let productionDetailCalls = 0
  let orderDetailCalls = 0
  let transitionCalls = 0
  await page.route(`${apiBase}/orders/order-1`, async (route) => {
    orderDetailCalls += 1
    return fulfillJson(route, order())
  })
  await page.route(`${apiBase}/productions**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/productions') return fulfillJson(route, [production()])
    if (path === '/api/v1/productions/production-1') {
      productionDetailCalls += 1
      return fulfillJson(route, production())
    }
    await route.abort()
  })
  await page.route(`${apiBase}/shipments**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/shipments') {
      listCalls += 1
      return fulfillJson(route, [shipment({ version: listCalls === 1 ? 2 : 3 })])
    }
    if (path === '/api/v1/shipments/shipment-1' && request.method() === 'GET') {
      detailCalls += 1
      return fulfillJson(route, shipment({ version: detailCalls === 1 ? 2 : 3 }))
    }
    if (path.endsWith('/transition')) {
      transitionCalls += 1
      expect(request.postDataJSON()).toEqual({ version: 2, toStatus: 'IN_TRANSIT' })
      return fulfillJson(route, { message: 'stale' }, 409)
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/sevkiyat')
  const workflowBefore = await settledWorkflowStore(page)
  await page.locator('.shipment-api-table tbody tr').getByRole('button', { name: 'Goruntule' }).click()
  await page.getByRole('region', { name: 'Sevkiyat Detayi' }).getByRole('button', { name: 'Yola Cikar' }).click()
  await expect(page.getByRole('status')).toContainText('Guncel veri yeniden yuklendi')
  expect(transitionCalls).toBe(1)
  expect(listCalls).toBeGreaterThanOrEqual(2)
  expect(detailCalls).toBeGreaterThanOrEqual(2)
  expect(productionDetailCalls).toBeGreaterThanOrEqual(1)
  expect(orderDetailCalls).toBeGreaterThanOrEqual(1)
  expect(await settledWorkflowStore(page)).toBe(workflowBefore)
})

test('gates permissions and covers loading, empty, error, and valid lifecycle actions', async ({ page }) => {
  let mode: 'loading' | 'empty' | 'error' | 'data' = 'loading'
  let releaseLoading: (() => void) | undefined
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve })
  await page.route(`${apiBase}/shipments**`, async (route) => {
    if (mode === 'loading') await loadingGate
    if (mode === 'error') return fulfillJson(route, {}, 503)
    return fulfillJson(route, mode === 'data' ? [shipment()] : [])
  })
  await page.route(`${apiBase}/productions**`, async (route) => fulfillJson(route, [production()]))

  await setSession(page)
  await page.goto('/app/sevkiyat')
  await expect(page.getByText('Veriler yukleniyor')).toBeVisible()
  mode = 'empty'
  releaseLoading?.()
  await expect(page.getByText('Gosterilecek kayit yok')).toBeVisible()

  mode = 'error'
  await page.reload()
  await expect(page.getByText('Gecici bir hata olustu')).toBeVisible()
  mode = 'data'
  await page.getByRole('button', { name: 'Yeniden dene' }).click()
  await expect(page.locator('.shipment-api-table tbody tr')).toHaveCount(1)

  await setSession(page, ['shipments.read'])
  await page.goto('/app/sevkiyat')
  await expect(page.getByRole('button', { name: 'Sevkiyat Planla' })).toHaveCount(0)
  await page.locator('.shipment-api-table tbody tr').getByRole('button', { name: 'Goruntule' }).click()
  await expect(page.getByRole('region', { name: 'Sevkiyat Detayi' }).getByRole('button', { name: /Yola Cikar|Teslim Edildi Olarak Isaretle/ })).toHaveCount(0)

  await setSession(page, [])
  await page.goto('/app/sevkiyat')
  await expect(page.getByText('Sevkiyatlari goruntuleme yetkiniz bulunmuyor.')).toBeVisible()
})
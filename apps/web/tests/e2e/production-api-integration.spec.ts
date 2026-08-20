import { expect, test, type Page, type Route } from '@playwright/test'

const apiBase = 'http://127.0.0.1:4000/api/v1'
const permissions = [
  'orders.read',
  'productions.read',
  'productions.create',
  'productions.transition',
]
const sessionUser = {
  id: 'production-user',
  role: 'MANUFACTURER',
  backendRole: 'PRODUCER',
  permissions,
  email: 'production@example.invalid',
  phone: '',
  fullName: 'Production User',
  company: 'API Manufacturer',
  companyId: 'manufacturer-1',
  memberships: [],
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1', orderNumber: 'ORD-PROD-1', requestId: 'request-1', quotationId: 'quotation-1',
    companyId: 'buyer-1', manufacturerCompanyId: 'manufacturer-1', createdByUserId: 'buyer-user',
    status: 'CONFIRMED', version: 6, confirmedAt: '2026-08-09T10:00:00.000Z', confirmedByUserId: sessionUser.id,
    cancelledAt: null, cancelledByUserId: null, cancellationReason: null, currency: 'TRY',
    totalAmount: '45000.00', promisedDeliveryDate: '2026-09-01T12:00:00.000Z',
    createdAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-09T10:00:00.000Z',
    request: { id: 'request-1', requestNumber: 'REQ-PROD-1', companyId: 'buyer-1', status: 'AWARDED' },
    quotation: { id: 'quotation-1', quotationNumber: 'QUO-PROD-1', requestId: 'request-1', companyId: 'buyer-1', manufacturerCompanyId: 'manufacturer-1', status: 'ACCEPTED' },
    company: { id: 'buyer-1', legalName: 'API Buyer AS', tradeName: 'API Buyer', status: 'ACTIVE' },
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer', status: 'ACTIVE' },
    createdBy: null, confirmedBy: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email }, cancelledBy: null,
    privateOrderField: 'must-not-be-rendered',
    ...overrides,
  }
}

function production(overrides: Record<string, unknown> = {}) {
  return {
    id: 'production-1', productionNumber: 'PRD-ORD-PROD-1', orderId: 'order-1',
    manufacturerCompanyId: 'manufacturer-1', createdByUserId: sessionUser.id,
    status: 'PLANNED', version: 3, productionLine: 'Hat A',
    plannedStartDate: '2026-08-20T08:00:00.000Z', dueDate: '2026-09-01T12:00:00.000Z',
    startedAt: null, completedAt: null, notes: 'Camlar dikkatli tasinacak', statusReason: null,
    createdAt: '2026-08-09T11:00:00.000Z', updatedAt: '2026-08-09T11:00:00.000Z',
    order: {
      ...order(),
      request: { id: 'request-1', requestNumber: 'REQ-PROD-1', title: 'Magaza Vitrin Camlari', productType: 'TEMPERED_GLASS', companyId: 'buyer-1', privateRequestField: 'hidden' },
      quotation: { id: 'quotation-1', quotationNumber: 'QUO-PROD-1', privateQuotationField: 'hidden' },
    },
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer', status: 'ACTIVE', taxNumber: 'hidden' },
    createdBy: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email, passwordHash: 'hidden' },
    internalProductionField: 'must-not-be-rendered',
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

test('lists and loads allowlisted authoritative Production details', async ({ page }) => {
  let detailCalls = 0
  await page.route(`${apiBase}/productions**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/productions') return fulfillJson(route, [production()])
    if (path === '/api/v1/productions/production-1') {
      detailCalls += 1
      return fulfillJson(route, production())
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/uretim-takibi')
  const row = page.locator('.production-api-table tbody tr', { hasText: 'ORD-PROD-1' })
  await expect(row).toContainText('API Buyer')
  await expect(row).toContainText('Magaza Vitrin Camlari')
  await expect(row).toContainText('Planlandi')
  await expect(row).not.toContainText('must-not-be-rendered')
  await row.getByRole('button', { name: 'Goruntule' }).click()
  const detail = page.getByRole('region', { name: 'Uretim Detayi' })
  await expect(detail).toContainText('REQ-PROD-1')
  await expect(detail).toContainText('Magaza Vitrin Camlari')
  await expect(detail).toContainText('Camlar dikkatli tasinacak')
  await expect(detail).not.toContainText(/version|internal|passwordHash|tenant|Prisma/i)
  expect(detailCalls).toBe(1)
})

test('plans and transitions with authoritative versions without local Production or Shipment effects', async ({ page }) => {
  let productions: ReturnType<typeof production>[] = []
  const planBodies: Array<Record<string, unknown>> = []
  const transitionBodies: Array<Record<string, unknown>> = []
  await page.route(`${apiBase}/orders**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/orders' && request.method() === 'GET') return fulfillJson(route, [order()])
    if (path === '/api/v1/orders/order-1' && request.method() === 'GET') return fulfillJson(route, order())
    if (path === '/api/v1/orders/order-1/production' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>
      planBodies.push(body)
      productions = [production({
        productionLine: body.productionLine,
        plannedStartDate: body.plannedStartDate,
        dueDate: body.dueDate,
        notes: body.notes,
      })]
      return fulfillJson(route, productions[0], 201)
    }
    await route.abort()
  })
  await page.route(`${apiBase}/productions**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/productions' && request.method() === 'GET') return fulfillJson(route, productions)
    if (path === '/api/v1/productions/production-1' && request.method() === 'GET') return fulfillJson(route, productions[0])
    if (path === '/api/v1/productions/production-1/transition' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>
      transitionBodies.push(body)
      productions = [production({
        ...productions[0],
        status: body.toStatus,
        version: Number((productions[0] as { version: number }).version) + 1,
        statusReason: body.reason ?? null,
        startedAt: body.toStatus === 'IN_PROGRESS' ? '2026-08-20T08:00:00.000Z' : (productions[0] as { startedAt: unknown }).startedAt,
        completedAt: body.toStatus === 'COMPLETED' ? '2026-08-21T16:00:00.000Z' : null,
      })]
      return fulfillJson(route, productions[0])
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/siparisler')
  const orderRow = page.locator('.order-api-table tbody tr', { hasText: 'ORD-PROD-1' })
  await expect(orderRow).toContainText('Onaylandi')
  await expect(orderRow).not.toContainText('Uretimde')
  const workflowBefore = await page.evaluate(() => {
    const raw = window.localStorage.getItem('dijitalcam.workflowStore')
    if (!raw) return null
    const workflow = JSON.parse(raw)
    return { orders: workflow.orders, productions: workflow.productions, shipments: workflow.shipments }
  })
  await orderRow.getByRole('button', { name: 'Uretim Planla' }).click()
  const planModal = page.getByRole('region', { name: 'Uretim Planla' })
  await planModal.getByLabel('Uretim Hatti').fill('Hat B')
  await planModal.getByLabel('Planlanan Baslangic').fill('2026-08-22')
  await planModal.getByLabel('Termin').fill('2026-09-05')
  await planModal.getByLabel('Not').fill('Planlama notu')
  await planModal.getByRole('button', { name: 'Uretimi Planla' }).click()

  await page.goto('/app/uretim-takibi')
  await page.locator('.production-api-table tbody tr').getByRole('button', { name: 'Goruntule' }).click()
  let detail = page.getByRole('region', { name: 'Uretim Detayi' })
  await detail.getByRole('button', { name: 'Uretimi Baslat' }).click()
  await expect(detail).toContainText('Devam Ediyor')
  await detail.getByRole('button', { name: 'Beklemeye Al' }).click()
  const holdModal = page.getByRole('region', { name: 'Uretimi Beklemeye Al' })
  await holdModal.getByLabel('Neden').fill('Malzeme bekleniyor')
  await holdModal.getByRole('button', { name: 'Beklemeye Al' }).click()
  await expect(detail).toContainText('Beklemede')
  await detail.getByRole('button', { name: 'Devam Et' }).click()
  await detail.getByRole('button', { name: 'Tamamla' }).click()
  await expect(detail).toContainText('Tamamlandi')

  expect(planBodies).toEqual([{
    orderVersion: 6,
    productionLine: 'Hat B',
    plannedStartDate: '2026-08-22',
    dueDate: '2026-09-05',
    notes: 'Planlama notu',
  }])
  expect(transitionBodies).toEqual([
    { version: 3, toStatus: 'IN_PROGRESS' },
    { version: 4, toStatus: 'ON_HOLD', reason: 'Malzeme bekleniyor' },
    { version: 5, toStatus: 'IN_PROGRESS' },
    { version: 6, toStatus: 'COMPLETED' },
  ])
  const workflowAfter = await page.evaluate(() => {
    const raw = window.localStorage.getItem('dijitalcam.workflowStore')
    if (!raw) return null
    const workflow = JSON.parse(raw)
    return { orders: workflow.orders, productions: workflow.productions, shipments: workflow.shipments }
  })
  expect(workflowAfter).toEqual(workflowBefore)
  expect(workflowAfter?.shipments).toEqual(workflowBefore?.shipments)
})

test('sends cancellation reason and does not retry 409 while refetching Production and Order authority', async ({ page }) => {
  let listCalls = 0
  let detailCalls = 0
  let orderDetailCalls = 0
  let transitionCalls = 0
  await page.route(`${apiBase}/orders/order-1`, async (route) => {
    orderDetailCalls += 1
    await fulfillJson(route, order())
  })
  await page.route(`${apiBase}/productions**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/productions') {
      listCalls += 1
      return fulfillJson(route, [production({ version: listCalls === 1 ? 3 : 4 })])
    }
    if (path === '/api/v1/productions/production-1' && request.method() === 'GET') {
      detailCalls += 1
      return fulfillJson(route, production({ version: detailCalls === 1 ? 3 : 4 }))
    }
    if (path.endsWith('/transition')) {
      transitionCalls += 1
      expect(request.postDataJSON()).toEqual({ version: 3, toStatus: 'CANCELLED', reason: 'Siparis kapsami degisti' })
      return fulfillJson(route, { message: 'stale' }, 409)
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/uretim-takibi')
  await page.locator('.production-api-table tbody tr').getByRole('button', { name: 'Goruntule' }).click()
  await page.getByRole('region', { name: 'Uretim Detayi' }).getByRole('button', { name: 'Iptal Et' }).click()
  const cancelModal = page.getByRole('region', { name: 'Uretimi Iptal Et' })
  await cancelModal.getByLabel('Neden').fill('Siparis kapsami degisti')
  await cancelModal.getByRole('button', { name: 'Uretimi Iptal Et' }).click()
  await expect(page.getByRole('status')).toContainText('Guncel veri yeniden yuklendi')
  expect(transitionCalls).toBe(1)
  expect(listCalls).toBeGreaterThanOrEqual(2)
  expect(detailCalls).toBeGreaterThanOrEqual(2)
  expect(orderDetailCalls).toBeGreaterThanOrEqual(1)
})

test('gates actions, covers loading/empty/error, and contains the 390px layout', async ({ page }) => {
  let mode: 'loading' | 'empty' | 'error' | 'data' = 'loading'
  let releaseLoading: (() => void) | undefined
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve })
  await page.route(`${apiBase}/productions**`, async (route) => {
    if (mode === 'loading') await loadingGate
    if (mode === 'error') return fulfillJson(route, {}, 503)
    return fulfillJson(route, mode === 'data' ? [production()] : [])
  })
  await page.route(`${apiBase}/orders**`, async (route) => fulfillJson(route, [order()]))

  await setSession(page)
  await page.goto('/app/uretim-takibi')
  await expect(page.getByText('Veriler yukleniyor')).toBeVisible()
  mode = 'empty'
  releaseLoading?.()
  await expect(page.getByText('Gosterilecek kayit yok')).toBeVisible()

  mode = 'error'
  await page.reload()
  await expect(page.getByText('Gecici bir hata olustu')).toBeVisible()

  mode = 'data'
  await page.getByRole('button', { name: 'Yeniden dene' }).click()
  await expect(page.locator('.production-api-table tbody tr')).toHaveCount(1)
  await setSession(page, ['productions.read'])
  await page.goto('/app/uretim-takibi')
  await page.locator('.production-api-table tbody tr').getByRole('button', { name: 'Goruntule' }).click()
  await expect(page.getByRole('region', { name: 'Uretim Detayi' }).getByRole('button', { name: /Uretimi Baslat|Beklemeye Al|Tamamla|Iptal Et/ })).toHaveCount(0)
  await page.goto('/app/siparisler')
  await expect(page.getByRole('button', { name: 'Uretim Planla' })).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/uretim-takibi')
  await expect(page.locator('.production-table-wrap')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await page.locator('.production-table-wrap').evaluate((element) => {
    const style = window.getComputedStyle(element)
    return element.scrollWidth <= element.clientWidth || style.overflowX === 'auto'
  })).toBe(true)
  await page.locator('.production-api-table tbody tr').getByRole('button', { name: 'Goruntule' }).click()
  const detailModal = page.getByRole('region', { name: 'Uretim Detayi' })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await detailModal.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return bounds.left >= 0 && bounds.right <= window.innerWidth
  })).toBe(true)

  await setSession(page, [])
  await page.goto('/app/uretim-takibi')
  await expect(page.getByText('Uretimleri goruntuleme yetkiniz bulunmuyor.')).toBeVisible()
})

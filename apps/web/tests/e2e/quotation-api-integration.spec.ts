import { expect, test, type Page } from '@playwright/test'

const apiBase = '**/api/v1'
const sessionUser = {
  id: 'quotation-user',
  role: 'MANUFACTURER',
  backendRole: 'PRODUCER',
  permissions: [
    'requests.read',
    'quotations.read',
    'quotations.create',
    'quotations.update',
    'quotations.send',
    'quotations.withdraw',
    'quotations.decide',
  ],
  email: 'quotation@example.invalid',
  phone: '',
  fullName: 'Quotation User',
  company: 'API Manufacturer',
  companyId: 'manufacturer-1',
  memberships: [],
}

function quotation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quotation-1',
    quotationNumber: 'QUO-API-1',
    requestId: 'request-1',
    companyId: 'buyer-1',
    manufacturerCompanyId: 'manufacturer-1',
    createdByUserId: sessionUser.id,
    totalAmount: '125000.00',
    currency: 'TRY',
    leadTimeDays: 7,
    validUntil: '2026-09-01T23:59:59.999Z',
    notes: 'Authoritative quotation',
    status: 'DRAFT',
    revisionNumber: 1,
    version: 1,
    activeCalculationId: null,
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    request: { id: 'request-1', requestNumber: 'REQ-API-1', companyId: 'buyer-1', title: 'API Request', status: 'QUOTED' },
    company: { id: 'buyer-1', legalName: 'API Buyer AS', tradeName: 'API Buyer', status: 'ACTIVE' },
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer', status: 'ACTIVE' },
    createdBy: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email },
    internalField: 'must-not-be-rendered',
    ...overrides,
  }
}

function apiRequest() {
  return {
    id: 'request-1',
    requestNumber: 'REQ-API-1',
    companyId: 'buyer-1',
    regionId: null,
    createdByUserId: 'buyer-user',
    title: 'API Request',
    description: 'Request with quotations',
    productType: 'TEMPERED_GLASS',
    quantity: null,
    unit: null,
    targetDeliveryDate: null,
    budgetMin: null,
    budgetMax: null,
    currency: 'TRY',
    status: 'QUOTED',
    version: 3,
    createdAt: '2026-08-09T09:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    company: { id: 'buyer-1', legalName: 'API Buyer AS', tradeName: 'API Buyer' },
    region: null,
    createdBy: { id: 'buyer-user', fullName: 'Buyer User', email: 'buyer@example.invalid' },
    recipients: [{
      id: 'recipient-1',
      companyId: 'manufacturer-1',
      company: { id: 'manufacturer-1', legalName: 'API Manufacturer AS', tradeName: 'API Manufacturer' },
    }],
  }
}

async function setSession(page: Page, permissions = sessionUser.permissions): Promise<void> {
  await page.goto('/login')
  await page.evaluate(({ user, allowedPermissions }) => {
    const authenticatedUser = { ...user, permissions: allowedPermissions }
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(authenticatedUser))
    window.localStorage.setItem('dijitalcam.authSession', JSON.stringify({
      user: authenticatedUser,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    }))
  }, { user: sessionUser, allowedPermissions: permissions })
}

test('renders authoritative quotation list and loads detail from the backend', async ({ page }) => {
  let detailCalls = 0
  const current = quotation()
  await page.route(`${apiBase}/quotations**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/quotations' && route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([current]) })
      return
    }
    if (url.pathname === '/api/v1/quotations/quotation-1' && route.request().method() === 'GET') {
      detailCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) })
      return
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/teklifler')
  const row = page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-API-1' })
  await expect(row).toContainText('API Manufacturer')
  await expect(row).toContainText('TRY 125000.00')
  await expect(row).not.toContainText('must-not-be-rendered')
  await row.getByRole('button', { name: 'Goruntule' }).click()
  const detail = page.getByRole('region', { name: 'Teklif Detayi' })
  await expect(detail).toContainText('Authoritative quotation')
  await expect(detail).toContainText('Legacy / hesaplamasiz')
  expect(detailCalls).toBe(1)
})

test('creates a request quotation with the exact backend DTO and refetches the request list', async ({ page }) => {
  let quotations: ReturnType<typeof quotation>[] = []
  let createBody: Record<string, unknown> | undefined
  let quotationListCalls = 0
  await page.route(`${apiBase}/requests**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/requests' && route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([apiRequest()]) })
      return
    }
    if (url.pathname === '/api/v1/requests/request-1' && route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiRequest()) })
      return
    }
    if (url.pathname === '/api/v1/requests/request-1/quotations' && route.request().method() === 'GET') {
      quotationListCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quotations) })
      return
    }
    if (url.pathname === '/api/v1/requests/request-1/quotations' && route.request().method() === 'POST') {
      createBody = route.request().postDataJSON() as Record<string, unknown>
      quotations = [quotation({
        totalAmount: String(createBody.totalAmount),
        currency: createBody.currency,
        leadTimeDays: createBody.leadTimeDays,
        validUntil: createBody.validUntil,
        notes: createBody.notes,
      })]
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(quotations[0]) })
      return
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/talepler')
  const requestRow = page.locator('table tbody tr', { hasText: 'REQ-API-1' }).first()
  await requestRow.getByRole('button', { name: 'Goruntule' }).click()
  const requestDetail = page.getByRole('region', { name: 'Talep Detayi' })
  await requestDetail.getByRole('button', { name: '+ Teklif Olustur' }).click()
  const form = page.getByRole('region', { name: 'Yeni Teklif' })
  await form.getByLabel('Toplam Tutar').fill('99000.50')
  await form.getByLabel('Para Birimi').fill('USD')
  await form.getByLabel('Termin (Gun)').fill('12')
  await form.getByLabel('Gecerlilik Tarihi').fill('2026-10-01')
  await form.getByLabel('Notlar').fill('Created through API')
  await form.getByRole('button', { name: 'Kaydet' }).click()

  expect(createBody).toEqual({
    manufacturerCompanyId: 'manufacturer-1',
    totalAmount: 99000.5,
    currency: 'USD',
    leadTimeDays: 12,
    validUntil: '2026-10-01T23:59:59.999Z',
    notes: 'Created through API',
  })
  await expect.poll(() => quotationListCalls).toBeGreaterThanOrEqual(2)
  await expect(requestDetail.locator('.quotation-api-table')).toContainText('QUO-API-1')
})

test('applies the producer price catalog through one snapshot action and updates the draft total', async ({ page }) => {
  const pricingPermissions = [
    ...sessionUser.permissions,
    'quotation-calculations.read',
    'quotation-calculations.create',
    'quotation-calculations.finalize',
  ]
  const current = quotation()
  const calculated = {
    id: 'calculation-1',
    quotationId: current.id,
    requestId: current.requestId,
    quotationRevisionNumber: 1,
    calculationVersion: 1,
    engineVersion: '1.0.0',
    inputHash: 'input-hash',
    currency: 'TRY',
    subtotalAmount: '13600.00',
    wasteAmount: '0.00',
    regionalAdjustmentAmount: '0.00',
    discountAmount: '0.00',
    taxAmount: '0.00',
    totalAmount: '13600.00',
    snapshotSchemaVersion: 1,
    snapshotHash: 'snapshot-hash',
    status: 'GENERATED',
    createdByUserId: sessionUser.id,
    finalizedAt: null,
    createdAt: '2026-09-05T12:00:00.000Z',
    items: [],
    snapshotPayload: {
      lines: [{
        requestItem: { id: 'item-1', lineNumber: 1, description: 'Isicam paneli', productType: 'Isicam', productCode: 'ISICIFT', measurementStatus: 'APPROVED' },
        pricing: { catalog: { productCode: 'ISICIFT' } },
        result: { quantity: '10', unit: 'M2', unitPrice: '1360', wasteRate: '0', discountRate: '0', totalAmount: '13600', currency: 'TRY' },
      }],
    },
  }
  let generated = false
  let finalized = false

  await page.route(`${apiBase}/requests/request-1`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiRequest()) })
  })
  await page.route(`${apiBase}/quotations**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/quotations' && request.method() === 'GET') {
      const row = finalized ? quotation({ totalAmount: '13600.00', activeCalculationId: calculated.id, version: 2 }) : current
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row]) })
      return
    }
    if (path === '/api/v1/quotations/quotation-1' && request.method() === 'GET') {
      const detail = finalized ? quotation({ totalAmount: '13600.00', activeCalculationId: calculated.id, version: 2 }) : current
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) })
      return
    }
    if (path === '/api/v1/quotations/quotation-1/calculations' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(generated ? [calculated] : []) })
      return
    }
    if (path === '/api/v1/quotations/quotation-1/calculations/calculation-1' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(calculated) })
      return
    }
    if (path === '/api/v1/quotations/quotation-1/calculations' && request.method() === 'POST') {
      generated = true
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(calculated) })
      return
    }
    if (path === '/api/v1/quotations/quotation-1/calculations/calculation-1/finalize' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ quotationVersion: 1, calculationVersion: 1 })
      finalized = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...calculated, status: 'FINALIZED', finalizedAt: '2026-09-05T12:00:01.000Z' }) })
      return
    }
    await route.abort()
  })

  await setSession(page, pricingPermissions)
  await page.goto('/app/teklifler')
  await page.locator('.quotation-api-table tbody tr').getByRole('button', { name: 'Goruntule' }).click()
  const detail = page.getByRole('region', { name: 'Teklif Detayi' })
  await detail.getByRole('button', { name: 'Snapshot ile Fiyati Hesapla' }).click()
  await expect(detail).toContainText('TRY 13600.00')
  await expect(page.getByRole('status')).toContainText('teklif tutari fiyat listenize gore guncellendi')
  await expect(detail.getByRole('heading', { name: 'Snapshot v1' })).toBeVisible()
  expect(generated).toBe(true)
  expect(finalized).toBe(true)
})

test('uses authoritative versions for update, send, revise, withdraw, accept, and reject', async ({ page }) => {
  let quotations = [
    quotation(),
    quotation({ id: 'quotation-accept', quotationNumber: 'QUO-ACCEPT', status: 'SENT', version: 8 }),
    quotation({ id: 'quotation-reject', quotationNumber: 'QUO-REJECT', status: 'SENT', version: 11 }),
  ]
  const bodies: Record<string, unknown>[] = []
  await page.route(`${apiBase}/requests/request-1`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiRequest()) })
  })
  await page.route(`${apiBase}/quotations**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/quotations' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quotations) })
      return
    }
    if (path === '/api/v1/quotations/quotation-1' && request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>
      bodies.push({ action: 'update', ...body })
      quotations = quotations.map((item) => item.id === 'quotation-1' ? quotation({ ...item, totalAmount: String(body.totalAmount), version: 2 }) : item)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quotations[0]) })
      return
    }
    const actionMatch = path.match(/^\/api\/v1\/quotations\/([^/]+)\/(send|revise|withdraw|accept|reject)$/)
    if (actionMatch && request.method() === 'POST') {
      const [, id, action] = actionMatch
      const body = request.postDataJSON() as Record<string, unknown>
      bodies.push({ action, id, ...body })
      const current = quotations.find((item) => item.id === id)!
      const nextStatus = { send: 'SENT', revise: 'DRAFT', withdraw: 'WITHDRAWN', accept: 'ACCEPTED', reject: 'REJECTED' }[action]
      const updated = quotation({ ...current, status: nextStatus, version: Number(current.version) + 1 })
      quotations = quotations.map((item) => item.id === id ? updated : item)
      const response = action === 'accept' ? { quotation: updated, order: { id: 'order-real-1' } } : updated
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
      return
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/teklifler')
  let draftRow = page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-API-1' })
  await draftRow.getByRole('button', { name: 'Duzenle' }).click()
  const edit = page.getByRole('region', { name: 'Teklif Duzenle' })
  await edit.getByLabel('Toplam Tutar').fill('130000')
  await edit.getByRole('button', { name: 'Kaydet' }).click()
  draftRow = page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-API-1' })
  await draftRow.getByRole('button', { name: 'Gonder' }).click()
  await page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-API-1' }).getByRole('button', { name: 'Revize Et' }).click()
  await page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-API-1' }).getByRole('button', { name: 'Gonder' }).click()
  await page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-API-1' }).getByRole('button', { name: 'Geri Cek' }).click()
  await page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-ACCEPT' }).getByRole('button', { name: 'Kabul Et' }).click()
  await page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-REJECT' }).getByRole('button', { name: 'Reddet' }).click()

  expect(bodies).toEqual([
    expect.objectContaining({ action: 'update', version: 1, totalAmount: 130000 }),
    { action: 'send', id: 'quotation-1', version: 2 },
    { action: 'revise', id: 'quotation-1', version: 3 },
    { action: 'send', id: 'quotation-1', version: 4 },
    { action: 'withdraw', id: 'quotation-1', version: 5 },
    { action: 'accept', id: 'quotation-accept', version: 8 },
    { action: 'reject', id: 'quotation-reject', version: 11 },
  ])
  const storedWorkflow = await page.evaluate(() => JSON.parse(window.localStorage.getItem('dijitalcam.workflowStore') ?? 'null'))
  expect(storedWorkflow.orders.some((order: { id: string }) => order.id === 'order-real-1')).toBe(false)
})

test('does not retry a 409 mutation and refetches authoritative quotation data', async ({ page }) => {
  let listCalls = 0
  let sendCalls = 0
  await page.route(`${apiBase}/requests/request-1`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiRequest()) })
  })
  await page.route(`${apiBase}/quotations**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/quotations' && route.request().method() === 'GET') {
      listCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([quotation({ version: listCalls === 1 ? 1 : 2 })]) })
      return
    }
    if (path.endsWith('/send')) {
      sendCalls += 1
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'stale' }) })
      return
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/teklifler')
  await page.locator('.quotation-api-table tbody tr').getByRole('button', { name: 'Gonder' }).click()
  await expect(page.getByRole('status')).toContainText('Guncel veri yeniden yuklendi')
  expect(sendCalls).toBe(1)
  expect(listCalls).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.quotation-api-table tbody tr')).toContainText('2')
})

test('shows safe 403 feedback and loading, empty, and error list states', async ({ page }) => {
  let mode: 'loading' | 'empty' | 'error' | 'data' = 'loading'
  let releaseLoading: (() => void) | undefined
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve })
  await page.route(`${apiBase}/quotations**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/quotations' && route.request().method() === 'GET') {
      if (mode === 'loading') await loadingGate
      if (mode === 'error') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'data' ? [quotation()] : []) })
      return
    }
    if (path.endsWith('/send')) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Forbidden' }) })
      return
    }
    await route.abort()
  })

  await setSession(page)
  await page.goto('/app/teklifler')
  await expect(page.getByText('Veriler yukleniyor')).toBeVisible()
  mode = 'empty'
  releaseLoading?.()
  await expect(page.getByText('Gosterilecek kayit yok')).toBeVisible()

  mode = 'error'
  await page.reload()
  await expect(page.getByText('Gecici bir hata olustu')).toBeVisible()

  mode = 'data'
  await page.getByRole('button', { name: 'Yeniden dene' }).click()
  await page.locator('.quotation-api-table tbody tr').getByRole('button', { name: 'Gonder' }).click()
  await expect(page.getByRole('status')).toContainText('yetkiniz bulunmuyor')
})
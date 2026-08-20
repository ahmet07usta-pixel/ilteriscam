import { expect, test, type Page, type Route } from '@playwright/test'

const apiBase = 'http://127.0.0.1:4000/api/v1'
const calculationPermissions = [
  'requests.read',
  'quotations.read',
  'quotation-calculations.read',
  'quotation-calculations.create',
  'quotation-calculations.finalize',
]
const sessionUser = {
  id: 'calculation-user',
  role: 'MANUFACTURER',
  backendRole: 'PRODUCER',
  permissions: calculationPermissions,
  email: 'calculation@example.invalid',
  phone: '',
  fullName: 'Calculation User',
  company: 'API Manufacturer',
  companyId: 'manufacturer-1',
  memberships: [],
}

function quotation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quotation-1',
    quotationNumber: 'QUO-CALC-1',
    requestId: 'request-1',
    companyId: 'buyer-1',
    manufacturerCompanyId: 'manufacturer-1',
    createdByUserId: sessionUser.id,
    totalAmount: '500.00',
    currency: 'TRY',
    leadTimeDays: 7,
    validUntil: '2026-09-01T23:59:59.999Z',
    notes: 'Calculation quotation',
    status: 'DRAFT',
    revisionNumber: 2,
    version: 7,
    activeCalculationId: 'calculation-finalized',
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    request: { id: 'request-1', requestNumber: 'REQ-CALC-1', companyId: 'buyer-1', title: 'Calculation Request', status: 'QUOTED' },
    company: { id: 'buyer-1', legalName: 'Buyer AS', tradeName: 'Buyer', status: 'ACTIVE' },
    manufacturerCompany: { id: 'manufacturer-1', legalName: 'Manufacturer AS', tradeName: 'Manufacturer', status: 'ACTIVE' },
    createdBy: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email },
    ...overrides,
  }
}

function calculation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'calculation-finalized',
    quotationId: 'quotation-1',
    requestId: 'request-1',
    quotationRevisionNumber: 2,
    calculationVersion: 3,
    engineVersion: '1.0.0',
    inputHash: 'input-hash',
    currency: 'TRY',
    subtotalAmount: '450.00',
    wasteAmount: '50.00',
    regionalAdjustmentAmount: '0.00',
    discountAmount: '0.00',
    taxAmount: '0.00',
    totalAmount: '500.00',
    snapshotSchemaVersion: 1,
    snapshotHash: 'snapshot-hash',
    status: 'FINALIZED',
    createdByUserId: sessionUser.id,
    finalizedAt: '2026-08-09T13:00:00.000Z',
    createdAt: '2026-08-08T12:00:00.000Z',
    items: [{
      id: 'quotation-item-1', quotationId: 'quotation-1', quotationCalculationId: 'calculation-finalized',
      requestItemId: 'request-item-1', priceCatalogItemId: 'catalog-1', lineNumber: 1,
      description: 'Temperli cam', quantity: '2', unit: 'PIECE', unitPrice: '250',
      wasteRate: '0.1', wasteQuantity: '0.2', regionalAdjustmentRate: '0',
      regionalAdjustmentAmount: '0', discountRate: '0', discountAmount: '0', taxRate: '0',
      taxAmount: '0', subtotalAmount: '500', totalAmount: '500', currency: 'TRY',
      createdAt: '2026-08-08T12:00:00.000Z', privateItemField: 'hidden',
    }],
    snapshotPayload: {
      schemaVersion: 1,
      privateRootField: 'must-not-enter-state',
      lines: [{
        requestItem: {
          id: 'request-item-1', lineNumber: 1, description: 'Temperli cam', productCode: 'GLASS-01',
          measurementStatus: 'APPROVED', quantity: '2', unit: 'PIECE', privateMeasurement: 'hidden',
        },
        pricing: { catalog: { productCode: 'CAT-GLASS', privateCatalog: 'hidden' } },
        result: {
          quantity: '2', unit: 'PIECE', unitPrice: '250', wasteRate: '0.1',
          discountRate: '0', totalAmount: '500', currency: 'TRY', privateResult: 'hidden',
        },
      }],
    },
    privateCalculationField: 'hidden',
    ...overrides,
  }
}

function requestFixture() {
  return {
    id: 'request-1', requestNumber: 'REQ-CALC-1', companyId: 'buyer-1', regionId: null,
    createdByUserId: 'buyer-user', title: 'Calculation Request', description: null,
    productType: 'TEMPERED_GLASS', quantity: null, unit: null, targetDeliveryDate: null,
    budgetMin: null, budgetMax: null, currency: 'TRY', status: 'QUOTED', version: 3,
    createdAt: '2026-08-08T09:00:00.000Z', updatedAt: '2026-08-09T10:00:00.000Z',
    company: { id: 'buyer-1', legalName: 'Buyer AS', tradeName: 'Buyer' }, region: null,
    createdBy: { id: 'buyer-user', fullName: 'Buyer User', email: 'buyer@example.invalid' }, recipients: [],
  }
}

async function setSession(page: Page, permissions = calculationPermissions): Promise<void> {
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

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function openQuotationDetail(page: Page) {
  await page.goto('/app/teklifler')
  await page.locator('.quotation-api-table tbody tr', { hasText: 'QUO-CALC-1' }).getByRole('button', { name: 'Goruntule' }).click()
  return page.getByRole('region', { name: 'Teklif Detayi' })
}

test('lists calculation revisions and loads a safe authoritative snapshot detail', async ({ page }) => {
  const current = quotation()
  const currentCalculation = calculation()
  const previousCalculation = calculation({
    id: 'calculation-previous', quotationRevisionNumber: 1, calculationVersion: 1,
    status: 'GENERATED', finalizedAt: null, createdAt: '2026-08-07T12:00:00.000Z',
  })
  let detailCalls = 0

  await page.route(`${apiBase}/quotations**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/quotations') return fulfillJson(route, [current])
    if (path === '/api/v1/quotations/quotation-1') return fulfillJson(route, current)
    if (path === '/api/v1/quotations/quotation-1/calculations') return fulfillJson(route, [currentCalculation, previousCalculation])
    if (path === '/api/v1/quotations/quotation-1/calculations/calculation-finalized') {
      detailCalls += 1
      return fulfillJson(route, currentCalculation)
    }
    await route.abort()
  })

  await setSession(page)
  const detail = await openQuotationDetail(page)
  const calculations = detail.getByRole('region', { name: 'Teklif Hesaplamalari' })
  await expect(detail).toContainText('Revizyon')
  await expect(detail).toContainText('2')
  await expect(calculations).toContainText('Guncel revizyon')
  await expect(calculations).toContainText('Onceki revizyon')
  await expect(calculations).toContainText('Aktif')
  await expect(calculations).toContainText('08.08.2026')
  await expect(calculations).toContainText('09.08.2026')

  await calculations.locator('tr', { hasText: 'v3' }).getByRole('button', { name: 'Snapshot' }).click()
  const snapshot = detail.getByRole('region', { name: 'Hesaplama Snapshot' })
  await expect(snapshot).toContainText('Temperli cam')
  await expect(snapshot).toContainText('CAT-GLASS')
  await expect(snapshot).toContainText('TRY 500')
  await expect(snapshot).not.toContainText('must-not-enter-state')
  await expect(snapshot).not.toContainText('privateMeasurement')
  expect(detailCalls).toBe(1)
})

test('generates without a body, finalizes with authoritative CAS, and only refetches API state', async ({ page }) => {
  let currentQuotation = quotation({ activeCalculationId: null, totalAmount: '100.00' })
  let calculations: ReturnType<typeof calculation>[] = []
  let generateBody: string | null | undefined
  let finalizeBody: Record<string, unknown> | undefined
  let quotationDetailCalls = 0
  let calculationListCalls = 0

  await page.route(`${apiBase}/requests/request-1`, (route) => fulfillJson(route, requestFixture()))
  await page.route(`${apiBase}/quotations**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/quotations') return fulfillJson(route, [currentQuotation])
    if (path === '/api/v1/quotations/quotation-1' && request.method() === 'GET') {
      quotationDetailCalls += 1
      return fulfillJson(route, currentQuotation)
    }
    if (path === '/api/v1/quotations/quotation-1/calculations' && request.method() === 'GET') {
      calculationListCalls += 1
      return fulfillJson(route, calculations)
    }
    if (path === '/api/v1/quotations/quotation-1/calculations' && request.method() === 'POST') {
      generateBody = request.postData()
      calculations = [calculation({ id: 'calculation-generated', status: 'GENERATED', finalizedAt: null })]
      return fulfillJson(route, calculations[0], 201)
    }
    if (path === '/api/v1/quotations/quotation-1/calculations/calculation-generated/finalize') {
      finalizeBody = request.postDataJSON() as Record<string, unknown>
      calculations = [calculation({ id: 'calculation-generated' })]
      currentQuotation = quotation({ activeCalculationId: 'calculation-generated', totalAmount: '500.00', version: 8 })
      return fulfillJson(route, calculations[0])
    }
    await route.abort()
  })

  await setSession(page)
  const detail = await openQuotationDetail(page)
  const workflowBefore = await page.evaluate(() => window.localStorage.getItem('dijitalcam.workflowStore'))
  await detail.getByRole('button', { name: 'Hesaplama Olustur' }).click()
  await expect(detail.getByRole('region', { name: 'Teklif Hesaplamalari' })).toContainText('v3')
  expect(generateBody).toBeNull()

  await detail.getByRole('button', { name: 'Finalize Et' }).click()
  await expect(detail).toContainText('Finalize edildi')
  await expect(detail.getByRole('region', { name: 'Teklif Hesaplamalari' })).toContainText('Aktif')
  expect(finalizeBody).toEqual({ quotationVersion: 7, calculationVersion: 3 })
  expect(quotationDetailCalls).toBeGreaterThanOrEqual(3)
  expect(calculationListCalls).toBeGreaterThanOrEqual(3)
  const workflowAfter = await page.evaluate(() => window.localStorage.getItem('dijitalcam.workflowStore'))
  expect(workflowAfter).toBe(workflowBefore)
})

test('does not retry a Calculation 409 and refetches quotation and calculations', async ({ page }) => {
  let currentQuotation = quotation({ activeCalculationId: null })
  const generated = calculation({ id: 'calculation-generated', status: 'GENERATED', finalizedAt: null })
  let finalizeCalls = 0
  let quotationDetailCalls = 0
  let calculationListCalls = 0

  await page.route(`${apiBase}/requests/request-1`, (route) => fulfillJson(route, requestFixture()))
  await page.route(`${apiBase}/quotations**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/quotations') return fulfillJson(route, [currentQuotation])
    if (path === '/api/v1/quotations/quotation-1') {
      quotationDetailCalls += 1
      return fulfillJson(route, currentQuotation)
    }
    if (path === '/api/v1/quotations/quotation-1/calculations' && request.method() === 'GET') {
      calculationListCalls += 1
      if (calculationListCalls > 1) currentQuotation = quotation({ activeCalculationId: null, version: 8 })
      return fulfillJson(route, [generated])
    }
    if (path.endsWith('/calculation-generated/finalize')) {
      finalizeCalls += 1
      return fulfillJson(route, { message: 'stale' }, 409)
    }
    await route.abort()
  })

  await setSession(page)
  const detail = await openQuotationDetail(page)
  await detail.getByRole('button', { name: 'Finalize Et' }).click()
  await expect(page.getByRole('status')).toContainText('Guncel veri yeniden yuklendi')
  expect(finalizeCalls).toBe(1)
  expect(quotationDetailCalls).toBeGreaterThanOrEqual(2)
  expect(calculationListCalls).toBeGreaterThanOrEqual(2)
})

test('gates actions by permissions and exposes loading, empty, and error states', async ({ page }) => {
  const current = quotation({ activeCalculationId: null })
  let calculationMode: 'loading' | 'empty' | 'error' = 'loading'
  let releaseLoading: (() => void) | undefined
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve })

  await page.route(`${apiBase}/quotations**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/quotations') return fulfillJson(route, [current])
    if (path === '/api/v1/quotations/quotation-1') return fulfillJson(route, current)
    if (path === '/api/v1/quotations/quotation-1/calculations') {
      if (calculationMode === 'loading') await loadingGate
      if (calculationMode === 'error') return fulfillJson(route, {}, 503)
      return fulfillJson(route, [])
    }
    await route.abort()
  })

  await setSession(page)
  let detail = await openQuotationDetail(page)
  await expect(detail.getByText('Hesaplamalar yukleniyor...')).toBeVisible()
  calculationMode = 'empty'
  releaseLoading?.()
  await expect(detail.getByText('Bu teklif icin henuz hesaplama bulunmuyor.')).toBeVisible()

  await page.keyboard.press('Escape')
  calculationMode = 'error'
  detail = await openQuotationDetail(page)
  await expect(detail.getByText('Hesaplamalar yuklenemedi.')).toBeVisible()

  await page.keyboard.press('Escape')
  await setSession(page, ['quotations.read'])
  detail = await openQuotationDetail(page)
  await expect(detail.getByText('Hesaplamalari goruntuleme yetkiniz bulunmuyor.')).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Hesaplama Olustur' })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: 'Finalize Et' })).toHaveCount(0)
})

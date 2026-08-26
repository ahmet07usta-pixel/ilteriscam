import { expect, test, type Browser, type Page } from '@playwright/test'

const apiPattern = '**/api/v1/**'

const buyer = {
  id: 'buyer-routing-user',
  role: 'BUYER',
  backendRole: 'SALES',
  permissions: ['requests.read', 'requests.create', 'requests.submit'],
  email: 'buyer-routing@example.invalid',
  phone: '',
  fullName: 'Routing Buyer',
  company: 'Routing Buyer Company',
  companyId: 'buyer-company-routing',
  memberships: [],
}

const assignedProducer = {
  id: 'producer-routing-user',
  role: 'MANUFACTURER',
  backendRole: 'PRODUCER',
  permissions: ['requests.read'],
  email: 'producer-routing@example.invalid',
  phone: '',
  fullName: 'Assigned Producer',
  company: 'Assigned Glass Producer',
  companyId: 'producer-company-assigned',
  memberships: [],
}

const otherProducer = {
  ...assignedProducer,
  id: 'producer-other-user',
  email: 'producer-other@example.invalid',
  fullName: 'Other Producer',
  company: 'Other Glass Producer',
  companyId: 'producer-company-other',
}

const admin = {
  ...buyer,
  id: 'admin-routing-user',
  role: 'ADMIN',
  backendRole: 'ADMIN',
  permissions: ['requests.read', 'platform.admin'],
  email: 'admin-routing@example.invalid',
  fullName: 'Routing Admin',
  company: 'Platform Management',
  companyId: undefined,
}

const recipientCompanies = [
  { id: assignedProducer.companyId, legalName: 'Assigned Glass Producer A.S.', tradeName: assignedProducer.company },
  { id: otherProducer.companyId, legalName: 'Other Glass Producer A.S.', tradeName: otherProducer.company },
]

function requestFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-routing-1',
    requestNumber: 'REQ-ROUTING-1',
    companyId: buyer.companyId,
    regionId: null,
    createdByUserId: buyer.id,
    title: 'Routed glass request',
    description: 'Focused routing test',
    productType: 'TEMPERED_GLASS',
    quantity: null,
    unit: null,
    targetDeliveryDate: '2026-09-01T00:00:00.000Z',
    budgetMin: null,
    budgetMax: null,
    currency: 'TRY',
    status: 'OPEN_FOR_QUOTATION',
    version: 2,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    company: { id: buyer.companyId, legalName: 'Routing Buyer Company A.S.', tradeName: buyer.company },
    region: null,
    createdBy: { id: buyer.id, fullName: buyer.fullName, email: buyer.email },
    recipients: [{
      id: 'recipient-routing-1',
      companyId: assignedProducer.companyId,
      company: recipientCompanies[0],
    }],
    ...overrides,
  }
}

async function openWithSession(page: Page, user: typeof buyer): Promise<void> {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        role: user.backendRole,
        permissions: user.permissions,
        isActive: true,
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-10T00:00:00.000Z',
      }),
    })
  })

  await page.goto('/login')
  await page.evaluate((authenticatedUser) => {
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(authenticatedUser))
    window.localStorage.setItem('dijitalcam.authSession', JSON.stringify({
      user: authenticatedUser,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    }))
  }, user)
  await page.goto('/app/talepler')
}

async function openScopedPanel(browser: Browser, user: typeof buyer, visibleRequests: unknown[]) {
  const page = await browser.newPage()
  await page.route(apiPattern, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/requests' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(visibleRequests) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await openWithSession(page, user)
  return page
}

test('routes a submitted buyer request only to its recipient producer; admin no longer has direct Talepler access', async ({ browser, page }) => {
  let createCalls = 0
  let submitCalls = 0
  let createBody: Record<string, unknown> | undefined
  let submittedRequest = requestFixture()
  let createdRequest = requestFixture({ status: 'DRAFT', version: 1 })

  await page.route(apiPattern, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/api/v1/requests/recipient-companies' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(recipientCompanies) })
      return
    }
    if (path === '/api/v1/requests' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    if (path === '/api/v1/requests' && request.method() === 'POST') {
      createCalls += 1
      createBody = request.postDataJSON() as Record<string, unknown>
      createdRequest = requestFixture({
        status: 'DRAFT',
        version: 1,
        title: createBody.title,
        description: createBody.description,
        productType: createBody.productType,
      })
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(createdRequest) })
      return
    }
    if (path === '/api/v1/requests/request-routing-1' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(createdRequest) })
      return
    }
    if (path === '/api/v1/requests/request-routing-1/items' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    if (path === '/api/v1/requests/request-routing-1/attachments' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    if (path === '/api/v1/requests/request-routing-1/submit' && request.method() === 'POST') {
      submitCalls += 1
      expect(request.postDataJSON()).toEqual({ version: 1 })
      submittedRequest = requestFixture()
      createdRequest = submittedRequest
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submittedRequest) })
      return
    }
    await route.abort()
  })

  // Submitting a request with no items yet prompts a confirmation dialog; accept it for this test.
  page.on('dialog', (dialog) => void dialog.accept())

  await openWithSession(page, buyer)
  await page.getByRole('button', { name: '+ Yeni Talep Olustur' }).click()
  const createModal = page.getByRole('region', { name: 'Yeni Talep' })
  await createModal.getByLabel('Urun').fill('TEMPERED_GLASS')
  await createModal.getByLabel('Talep Basligi').fill('Routed glass request')
  await createModal.getByLabel('Aciklama').fill('Focused routing test')
  await createModal.getByLabel('Sorumlu').fill(buyer.fullName)

  await expect(createModal.getByRole('button', { name: 'Kaydet' })).toBeDisabled()
  expect(createCalls).toBe(0)

  await createModal.getByLabel('Uretici Firma').selectOption(assignedProducer.companyId)
  await createModal.getByRole('button', { name: 'Kaydet' }).click()

  // Requests now stay DRAFT after creation; the detail view opens automatically so the buyer can submit explicitly.
  const newRequestDetailModal = page.getByRole('region', { name: 'Talep Detayi' })
  await expect(newRequestDetailModal).toBeVisible()
  await newRequestDetailModal.getByRole('button', { name: 'Ureticiye Gonder' }).click()
  await expect(page.getByText('Talep ureticiye gonderildi.')).toBeVisible()
  await newRequestDetailModal.locator('.request-modal-actions').getByRole('button', { name: 'Kapat' }).click()

  await expect(page.locator('table tbody tr', { hasText: 'REQ-ROUTING-1' })).toContainText('Teklif Hazirlaniyor')
  expect(createBody?.recipientCompanyIds).toEqual([assignedProducer.companyId])
  expect(createCalls).toBe(1)
  expect(submitCalls).toBe(1)

  const producerPage = await openScopedPanel(browser, assignedProducer, [submittedRequest])
  await expect(producerPage.locator('table tbody tr', { hasText: 'REQ-ROUTING-1' })).toBeVisible()

  const otherProducerPage = await openScopedPanel(browser, otherProducer, [])
  await expect(otherProducerPage.locator('table tbody tr', { hasText: 'REQ-ROUTING-1' })).toHaveCount(0)

  const adminPage = await openScopedPanel(browser, admin, [submittedRequest])
  await expect(adminPage.getByText('Bu sayfaya erişim yetkiniz bulunmamaktadır.')).toBeVisible()
})
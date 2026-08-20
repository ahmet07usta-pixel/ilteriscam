import { expect, test, type Page } from '@playwright/test'
import { canonicalRequestRows } from '../../src/shared/data/synthetic-request-fixture'

const requestApiPattern = '**/api/v1/requests**'
const canonicalPrimaryRequestId = canonicalRequestRows[0]?.id ?? 'REQ-20260806-0001'
const canonicalSecondaryRequestId = canonicalRequestRows[1]?.id ?? 'REQ-20260806-0002'
const recipientCompany = {
  id: 'producer-company-api',
  legalName: 'Backend Producer Company',
  tradeName: 'Backend Producer',
}
const sessionUser = {
  id: 'buyer-user-api',
  role: 'BUYER',
  backendRole: 'SALES',
  permissions: ['requests.read', 'requests.create', 'requests.update', 'requests.submit', 'requests.cancel'],
  email: 'buyer-api@example.invalid',
  phone: '',
  fullName: 'Backend Buyer User',
  company: 'Backend Buyer',
  companyId: 'buyer-company-api',
  memberships: [
    {
      id: 'membership-api',
      companyId: 'buyer-company-api',
      role: 'BUYER',
      status: 'ACTIVE',
      company: {
        id: 'buyer-company-api',
        legalName: 'Backend Buyer Company',
        tradeName: 'Backend Buyer',
        status: 'ACTIVE',
      },
    },
  ],
}

function apiRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-db-1',
    requestNumber: canonicalPrimaryRequestId,
    companyId: 'buyer-company-api',
    regionId: null,
    createdByUserId: sessionUser.id,
    title: 'Backend Request One',
    description: 'Backend request detail',
    productType: 'TEMPERED_GLASS',
    quantity: '25',
    unit: 'm2',
    targetDeliveryDate: '2026-09-01T00:00:00.000Z',
    budgetMin: null,
    budgetMax: null,
    currency: 'TRY',
    status: 'DRAFT',
    version: 1,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    company: { id: 'buyer-company-api', legalName: 'Backend Buyer Company', tradeName: 'Backend Buyer' },
    region: null,
    createdBy: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email },
    recipients: [],
    ...overrides,
  }
}

async function openWithBackendSession(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: sessionUser.id,
        email: sessionUser.email,
        phone: sessionUser.phone,
        fullName: sessionUser.fullName,
        role: sessionUser.backendRole,
        permissions: sessionUser.permissions,
        isActive: true,
        createdAt: '2026-08-08T00:00:00.000Z',
        updatedAt: '2026-08-08T00:00:00.000Z',
      }),
    })
  })

  await page.goto('/login')
  await page.evaluate((user) => {
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(user))
    window.localStorage.setItem('dijitalcam.authSession', JSON.stringify({
      user,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    }))
  }, sessionUser)
  await page.goto('/app/talepler')
}

test('binds Request list, detail, create, submit, and cancel without replacing workflowStore', async ({ page }) => {
  let requests = [apiRequest()]
  let detailCalls = 0
  let createBody: Record<string, unknown> | undefined
  let updateBody: Record<string, unknown> | undefined
  const submitCalls: Array<{ requestId: string; version: number }> = []
  let cancelCalls = 0

  await page.route(requestApiPattern, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/api/v1/requests' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(requests) })
      return
    }

    if (path === '/api/v1/requests/recipient-companies' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([recipientCompany]) })
      return
    }

    if (path === '/api/v1/requests' && request.method() === 'POST') {
      createBody = request.postDataJSON() as Record<string, unknown>
      const created = apiRequest({
        id: 'request-db-2',
        requestNumber: canonicalSecondaryRequestId,
        title: createBody.title,
        description: createBody.description,
        productType: createBody.productType,
        targetDeliveryDate: createBody.targetDeliveryDate,
        recipients: [{ id: 'recipient-api', companyId: recipientCompany.id, company: recipientCompany }],
      })
      requests = [created, ...requests]
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
      return
    }

    if (path === '/api/v1/requests/request-db-1' && request.method() === 'GET') {
      detailCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(requests.find((item) => item.id === 'request-db-1')) })
      return
    }

    if (path === '/api/v1/requests/request-db-1' && request.method() === 'PATCH') {
      updateBody = request.postDataJSON() as Record<string, unknown>
      const updated = apiRequest({
        ...requests.find((item) => item.id === 'request-db-1'),
        title: updateBody.title,
        description: updateBody.description,
        productType: updateBody.productType,
        version: 2,
      })
      requests = requests.map((item) => item.id === updated.id ? updated : item)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) })
      return
    }

    if ((path === '/api/v1/requests/request-db-1/submit' || path === '/api/v1/requests/request-db-2/submit') && request.method() === 'POST') {
      const requestId = path.includes('request-db-1') ? 'request-db-1' : 'request-db-2'
      const body = request.postDataJSON() as { version: number }
      submitCalls.push({ requestId, version: body.version })
      const submitted = apiRequest({
        ...requests.find((item) => item.id === requestId),
        status: 'OPEN_FOR_QUOTATION',
        version: body.version + 1,
      })
      requests = requests.map((item) => item.id === submitted.id ? submitted : item)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submitted) })
      return
    }

    if (path === '/api/v1/requests/request-db-2/cancel' && request.method() === 'POST') {
      cancelCalls += 1
      expect(request.postDataJSON()).toEqual({ version: 2 })
      const cancelled = apiRequest({
        ...requests.find((item) => item.id === 'request-db-2'),
        status: 'CANCELLED',
        version: 3,
      })
      requests = requests.map((item) => item.id === cancelled.id ? cancelled : item)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cancelled) })
      return
    }

    await route.abort()
  })

  await openWithBackendSession(page)
  const initialRow = page.locator('table tbody tr', { hasText: canonicalPrimaryRequestId })
  await expect(initialRow).toBeVisible()
  await expect(initialRow).toContainText('Backend Buyer')
  await expect(initialRow).toContainText('Bekleyen')

  await initialRow.getByRole('button', { name: 'Goruntule' }).click()
  const detailModal = page.getByRole('region', { name: 'Talep Detayi' })
  await expect(detailModal).toContainText('Backend request detail')
  expect(detailCalls).toBe(1)
  await detailModal.locator('.request-modal-actions .solid-btn').click()

  await page.getByRole('button', { name: '+ Yeni Talep Olustur' }).click()
  const createModal = page.getByRole('region', { name: 'Yeni Talep' })
  await createModal.locator('label:has-text("Urun") input').fill('LAMINATED_GLASS')
  await createModal.locator('label:has-text("Talep Basligi") input').fill('API Created Request')
  await createModal.locator('label:has-text("Aciklama") textarea').fill('Created through requestsApi')
  await createModal.locator('label:has-text("Sorumlu") input').fill(sessionUser.fullName)
  await createModal.getByLabel('Uretici Firma').selectOption(recipientCompany.id)
  await createModal.locator('.request-modal-actions .solid-btn').click()

  const createdRow = page.locator('table tbody tr', { hasText: canonicalSecondaryRequestId })
  await expect(createdRow).toBeVisible()
  expect(createBody?.companyId).toBe(sessionUser.companyId)
  expect(createBody?.recipientCompanyIds).toEqual([recipientCompany.id])
  expect(createBody).not.toHaveProperty('status')
  expect(createBody).not.toHaveProperty('createdByUserId')
  await expect(createdRow).toContainText('Teklif Hazirlaniyor')
  expect(submitCalls).toContainEqual({ requestId: 'request-db-2', version: 1 })

  await initialRow.getByRole('button', { name: 'Duzenle' }).click()
  const editModal = page.getByRole('region', { name: 'Talep Duzenle' })
  await editModal.locator('label:has-text("Durum") select').selectOption('Teklif Hazirlaniyor')
  await editModal.locator('.request-modal-actions .solid-btn').click()
  await expect(initialRow).toContainText('Teklif Hazirlaniyor')
  expect(updateBody).not.toHaveProperty('companyId')
  expect(updateBody).not.toHaveProperty('status')
  expect(submitCalls).toContainEqual({ requestId: 'request-db-1', version: 2 })

  await createdRow.getByRole('button', { name: 'Sil' }).click()
  await page.getByRole('region', { name: 'Kaydi silmek istediginize emin misiniz?' }).getByRole('button', { name: 'Sil' }).click()
  await expect(createdRow).toContainText('Reddedilen')
  expect(cancelCalls).toBe(1)

  const storedWorkflow = await page.evaluate(() => JSON.parse(window.localStorage.getItem('dijitalcam.workflowStore') ?? 'null'))
  expect(storedWorkflow).not.toBeNull()
  expect(storedWorkflow.requests.some((item: { id: string }) => item.id === canonicalPrimaryRequestId || item.id === canonicalSecondaryRequestId)).toBe(false)
})

test('shows the existing controlled error state instead of mock data when Request API fails', async ({ page }) => {
  await page.route(requestApiPattern, async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) })
  })

  await openWithBackendSession(page)
  await expect(page.getByText('Gecici bir hata olustu')).toBeVisible()
  await expect(page.locator('.requests-table')).toHaveCount(0)
})
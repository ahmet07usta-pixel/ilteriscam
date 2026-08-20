import { expect, test, type Page, type Route } from '@playwright/test'

const apiBase = 'http://127.0.0.1:4000/api/v1'
const allItemPermissions = [
  'requests.read',
  'request-items.read',
  'request-items.create',
  'request-items.update',
  'request-items.delete',
]

function sessionUser(permissions = allItemPermissions) {
  return {
    id: 'request-item-user',
    role: 'BUYER',
    backendRole: 'SALES',
    permissions,
    email: 'request-items@example.invalid',
    phone: '',
    fullName: 'Request Item User',
    company: 'Request Item Buyer',
    companyId: 'buyer-company-items',
    memberships: [],
  }
}

function apiRequest(status = 'DRAFT') {
  return {
    id: 'request-items-parent',
    requestNumber: 'REQ-ITEMS-1',
    companyId: 'buyer-company-items',
    regionId: null,
    createdByUserId: 'request-item-user',
    title: 'Request with authoritative items',
    description: 'Request item integration detail',
    productType: 'TEMPERED_GLASS',
    quantity: '1',
    unit: 'PIECE',
    targetDeliveryDate: '2026-10-01T00:00:00.000Z',
    budgetMin: null,
    budgetMax: null,
    currency: 'TRY',
    status,
    version: 3,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    company: { id: 'buyer-company-items', legalName: 'Request Item Buyer', tradeName: 'Request Item Buyer' },
    region: null,
    createdBy: { id: 'request-item-user', fullName: 'Request Item User', email: 'request-items@example.invalid' },
    recipients: [],
  }
}

function apiItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    requestId: 'request-items-parent',
    lineNumber: 1,
    description: 'Temperli cam panel',
    productType: 'TEMPERED_GLASS',
    productCode: 'TG-10',
    quantity: '2.000000',
    unit: 'PIECE',
    measurementSource: 'USER',
    measurementStatus: 'APPROVED',
    widthMm: '1200.000000',
    heightMm: '800.000000',
    lengthMm: null,
    depthMm: null,
    thicknessMm: '10.000000',
    calculatedAreaM2: '0.960000',
    calculatedLengthM: null,
    calculatedVolumeM3: null,
    sourceAnalysisResultId: 'server-analysis-id',
    createdByUserId: 'server-created-by',
    updatedByUserId: 'server-updated-by',
    version: 4,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  }
}

async function openWithSession(page: Page, permissions = allItemPermissions): Promise<void> {
  const user = sessionUser(permissions)
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

async function openRequestDetail(page: Page): Promise<void> {
  const row = page.locator('table tbody tr', { hasText: 'REQ-ITEMS-1' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Goruntule' }).click()
  await expect(page.getByRole('region', { name: 'Talep Detayi' })).toContainText('Request item integration detail')
}

async function fulfillRequestRoutes(route: Route): Promise<boolean> {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/v1/requests' && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([apiRequest()]) })
    return true
  }
  if (path === '/api/v1/requests/request-items-parent' && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiRequest()) })
    return true
  }
  return false
}

test('lists and mutates RequestItems with DTO fields and server versions', async ({ page }) => {
  let items = [apiItem()]
  let listCalls = 0
  let createCalls = 0
  let createBody: Record<string, unknown> | undefined
  let updateBody: Record<string, unknown> | undefined
  let deleteBody: Record<string, unknown> | undefined

  await page.route(`${apiBase}/requests**`, async (route) => {
    if (await fulfillRequestRoutes(route)) return
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/api/v1/requests/request-items-parent/items' && request.method() === 'GET') {
      listCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) })
      return
    }
    if (path === '/api/v1/requests/request-items-parent/items' && request.method() === 'POST') {
      createCalls += 1
      createBody = request.postDataJSON() as Record<string, unknown>
      items = [...items, apiItem({ ...createBody, id: 'item-2', lineNumber: 2, version: 1, widthMm: String(createBody.width), width: undefined })]
      await new Promise((resolve) => setTimeout(resolve, 100))
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(items[1]) })
      return
    }
    if (path === '/api/v1/requests/request-items-parent/items/item-1' && request.method() === 'PATCH') {
      updateBody = request.postDataJSON() as Record<string, unknown>
      items = items.map((item) => item.id === 'item-1' ? apiItem({ description: updateBody?.description, version: 5 }) : item)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items[0]) })
      return
    }
    if (path === '/api/v1/requests/request-items-parent/items/item-1' && request.method() === 'DELETE') {
      deleteBody = request.postDataJSON() as Record<string, unknown>
      items = items.filter((item) => item.id !== 'item-1')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'item-1', deleted: true }) })
      return
    }
    await route.abort()
  })

  await openWithSession(page)
  await openRequestDetail(page)
  const detail = page.getByRole('region', { name: 'Talep Detayi' })
  await expect(detail.getByRole('region', { name: 'Talep Kalemleri' })).toContainText('Temperli cam panel')
  await expect(detail).toContainText('Onaylandi')
  await expect(detail).toContainText('Alan: 0.960000')
  expect(listCalls).toBe(1)

  await detail.getByRole('button', { name: '+ Yeni Kalem' }).click()
  const createModal = page.getByRole('region', { name: 'Yeni Kalem' })
  await createModal.getByLabel('Aciklama').fill('Yeni cam panel')
  await createModal.getByLabel('Urun Turu').fill('LAMINATED_GLASS')
  await createModal.getByLabel('Urun Kodu').fill('LG-12')
  await createModal.getByLabel('Miktar').fill('3')
  await createModal.getByLabel('Birim').selectOption('M2')
  await createModal.getByLabel('Olcu Kaynagi').selectOption('USER')
  await createModal.getByLabel('Width (mm)').fill('900')
  await createModal.locator('.request-modal-actions .solid-btn').dblclick()
  await expect(detail).toContainText('Yeni cam panel')
  expect(createCalls).toBe(1)
  expect(createBody).toEqual({
    description: 'Yeni cam panel',
    productType: 'LAMINATED_GLASS',
    productCode: 'LG-12',
    quantity: 3,
    unit: 'M2',
    measurementSource: 'USER',
    width: 900,
  })
  for (const serverOwnedField of ['id', 'requestId', 'lineNumber', 'measurementStatus', 'widthMm', 'calculatedAreaM2', 'sourceAnalysisResultId', 'createdByUserId', 'updatedByUserId', 'createdAt', 'updatedAt', 'version']) {
    expect(createBody).not.toHaveProperty(serverOwnedField)
  }

  await detail.getByRole('button', { name: 'Kalem 1 Duzenle' }).click()
  const editModal = page.getByRole('region', { name: 'Kalem Duzenle' })
  await editModal.getByLabel('Aciklama').fill('Guncel cam panel')
  await editModal.locator('.request-modal-actions .solid-btn').click()
  await expect(detail).toContainText('Guncel cam panel')
  expect(updateBody?.version).toBe(4)
  expect(updateBody?.width).toBe(1200)
  expect(updateBody).not.toHaveProperty('widthMm')
  expect(updateBody).not.toHaveProperty('measurementStatus')

  await detail.getByRole('button', { name: 'Kalem 1 Sil' }).click()
  await page.getByRole('region', { name: 'Kaydi silmek istediginize emin misiniz?' }).getByRole('button', { name: 'Sil' }).click()
  await expect(detail).not.toContainText('Guncel cam panel')
  expect(deleteBody).toEqual({ version: 5 })
})

test('refetches once after stale update and delete without retrying mutations', async ({ page }) => {
  let listCalls = 0
  let updateCalls = 0
  let deleteCalls = 0

  await page.route(`${apiBase}/requests**`, async (route) => {
    if (await fulfillRequestRoutes(route)) return
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/requests/request-items-parent/items' && request.method() === 'GET') {
      listCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([apiItem({ version: 4 + listCalls })]) })
      return
    }
    if (path.endsWith('/items/item-1') && request.method() === 'PATCH') {
      updateCalls += 1
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Stale version' }) })
      return
    }
    if (path.endsWith('/items/item-1') && request.method() === 'DELETE') {
      deleteCalls += 1
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Stale version' }) })
      return
    }
    await route.abort()
  })

  await openWithSession(page)
  await openRequestDetail(page)
  const detail = page.getByRole('region', { name: 'Talep Detayi' })
  await detail.getByRole('button', { name: 'Kalem 1 Duzenle' }).click()
  await page.getByRole('region', { name: 'Kalem Duzenle' }).locator('.request-modal-actions .solid-btn').click()
  await expect(detail).toContainText('Guncel veri yeniden yuklendi.')
  expect(updateCalls).toBe(1)
  expect(listCalls).toBe(2)

  await detail.getByRole('button', { name: 'Kalem 1 Sil' }).click()
  await page.getByRole('region', { name: 'Kaydi silmek istediginize emin misiniz?' }).getByRole('button', { name: 'Sil' }).click()
  await expect.poll(() => listCalls).toBe(3)
  expect(deleteCalls).toBe(1)
})

test('keeps item actions permission-based and exposes the item API error state', async ({ page }) => {
  await page.route(`${apiBase}/requests**`, async (route) => {
    if (await fulfillRequestRoutes(route)) return
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/requests/request-items-parent/items' && request.method() === 'GET') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) })
      return
    }
    await route.abort()
  })

  await openWithSession(page, ['requests.read', 'request-items.read'])
  await openRequestDetail(page)
  const detail = page.getByRole('region', { name: 'Talep Detayi' })
  await expect(detail).toContainText('Kalemler yuklenemedi.')
  await expect(detail.getByRole('button', { name: '+ Yeni Kalem' })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: /Kalem .* Duzenle/ })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: /Kalem .* Sil/ })).toHaveCount(0)
})
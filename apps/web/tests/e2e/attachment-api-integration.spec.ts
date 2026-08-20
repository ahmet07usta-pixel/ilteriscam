import { expect, test, type Page, type Route } from '@playwright/test'

const apiBase = 'http://127.0.0.1:4000/api/v1'
const requestId = 'request-attachments-parent'
const allAttachmentPermissions = [
  'requests.read',
  'attachments.read',
  'attachments.create',
  'attachments.delete',
]

function sessionUser(permissions = allAttachmentPermissions) {
  return {
    id: 'attachment-user',
    role: 'BUYER',
    backendRole: 'SALES',
    permissions,
    email: 'attachments@example.invalid',
    phone: '',
    fullName: 'Attachment User',
    company: 'Attachment Buyer',
    companyId: 'attachment-company',
    memberships: [],
  }
}

function apiRequest(status = 'DRAFT') {
  return {
    id: requestId,
    requestNumber: 'REQ-ATTACHMENTS-1',
    companyId: 'attachment-company',
    regionId: null,
    createdByUserId: 'attachment-user',
    title: 'Request with attachments',
    description: 'Authoritative attachment integration',
    productType: 'TEMPERED_GLASS',
    quantity: '1',
    unit: 'PIECE',
    targetDeliveryDate: '2026-10-01T00:00:00.000Z',
    budgetMin: null,
    budgetMax: null,
    currency: 'TRY',
    status,
    version: 2,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    company: { id: 'attachment-company', legalName: 'Attachment Buyer', tradeName: 'Attachment Buyer' },
    region: null,
    createdBy: { id: 'attachment-user', fullName: 'Attachment User', email: 'attachments@example.invalid' },
    recipients: [],
  }
}

function apiAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attachment-1',
    requestId,
    requestItemId: null,
    fileName: 'technical-drawing.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 18,
    uploadedByUserId: 'internal-uploader-id',
    analysisEligible: false,
    status: 'AVAILABLE',
    version: 7,
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
    storageKey: 'internal-storage-key',
    checksum: 'internal-checksum',
    path: 'C:/private/storage/object',
    ...overrides,
  }
}

async function openWithSession(page: Page, permissions = allAttachmentPermissions): Promise<void> {
  const user = sessionUser(permissions)
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
  const row = page.locator('table tbody tr', { hasText: 'REQ-ATTACHMENTS-1' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Goruntule' }).click()
  await expect(page.getByRole('region', { name: 'Talep Detayi' })).toContainText('Authoritative attachment integration')
}

async function fulfillRequestRoute(route: Route, status = 'DRAFT'): Promise<boolean> {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/v1/requests' && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([apiRequest(status)]) })
    return true
  }
  if (path === `/api/v1/requests/${requestId}` && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiRequest(status)) })
    return true
  }
  return false
}

test('runs upload-init, binary PUT, complete, download, and versioned delete through authoritative APIs', async ({ page }) => {
  let attachments = [apiAttachment()]
  let listCalls = 0
  let initCalls = 0
  let completeCalls = 0
  let downloadCalls = 0
  let capabilityDownloadCalls = 0
  let initBody: Record<string, unknown> | undefined
  let completeBody: Record<string, unknown> | undefined
  let deleteBody: Record<string, unknown> | undefined
  let uploadedBinary: Buffer | null = null

  await page.route(`${apiBase}/requests**`, async (route) => {
    if (await fulfillRequestRoute(route)) return
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === `/api/v1/requests/${requestId}/attachments` && request.method() === 'GET') {
      listCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attachments) })
      return
    }
    if (path.endsWith('/attachments/upload-init') && request.method() === 'POST') {
      initCalls += 1
      initBody = request.postDataJSON() as Record<string, unknown>
      const pending = apiAttachment({
        id: 'attachment-2',
        fileName: initBody.fileName,
        mimeType: initBody.mimeType,
        sizeBytes: initBody.sizeBytes,
        status: 'PENDING_UPLOAD',
        version: 1,
      })
      attachments = [...attachments, pending]
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          attachment: pending,
          upload: {
            url: '/api/v1/storage/uploads/upload-capability',
            expiresAt: '2026-08-10T10:05:00.000Z',
            capabilityToken: 'must-not-render',
          },
        }),
      })
      return
    }
    if (path.endsWith('/attachments/attachment-2/upload-complete') && request.method() === 'POST') {
      completeCalls += 1
      completeBody = request.postDataJSON() as Record<string, unknown>
      attachments = attachments.map((attachment) => attachment.id === 'attachment-2'
        ? apiAttachment({ ...attachment, status: 'AVAILABLE', version: 2 })
        : attachment)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attachments[1]) })
      return
    }
    if (path.endsWith('/attachments/attachment-1/download') && request.method() === 'GET') {
      downloadCalls += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/api/v1/storage/downloads/download-capability', expiresAt: '2026-08-10T10:05:00.000Z' }),
      })
      return
    }
    if (path.endsWith('/attachments/attachment-1') && request.method() === 'DELETE') {
      deleteBody = request.postDataJSON() as Record<string, unknown>
      attachments = attachments.filter((attachment) => attachment.id !== 'attachment-1')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiAttachment({ status: 'DELETED', version: 8 })) })
      return
    }
    await route.abort()
  })

  await page.route(`${apiBase}/storage/uploads/upload-capability`, async (route) => {
    uploadedBinary = route.request().postDataBuffer()
    await new Promise((resolve) => setTimeout(resolve, 150))
    await route.fulfill({ status: 204 })
  })
  await page.route(`${apiBase}/storage/downloads/download-capability`, async (route) => {
    capabilityDownloadCalls += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: { 'Content-Disposition': 'attachment; filename="technical-drawing.pdf"' },
      body: '%PDF-download',
    })
  })

  await openWithSession(page)
  await openRequestDetail(page)
  const detail = page.getByRole('region', { name: 'Talep Detayi' })
  const filesSection = detail.getByRole('region', { name: 'Talep Dosyalari' })
  await expect(filesSection).toContainText('technical-drawing.pdf')
  await expect(filesSection).toContainText('Kullanilabilir')
  expect(listCalls).toBe(1)
  for (const internalValue of ['internal-storage-key', 'internal-checksum', 'C:/private/storage/object', 'internal-uploader-id', 'must-not-render']) {
    await expect(detail).not.toContainText(internalValue)
  }

  const fileInput = filesSection.locator('input[type="file"]')
  const pdfContents = Buffer.from('%PDF-attachment-test')
  await fileInput.setInputFiles({ name: 'new-drawing.pdf', mimeType: 'application/pdf', buffer: pdfContents })
  await expect(fileInput).toBeDisabled()
  await fileInput.dispatchEvent('change')
  await expect.poll(() => completeCalls).toBe(1)
  await expect.poll(() => listCalls).toBe(2)
  await expect(filesSection).toContainText('new-drawing.pdf')
  expect(initCalls).toBe(1)
  expect(initBody).toEqual({ fileName: 'new-drawing.pdf', mimeType: 'application/pdf', sizeBytes: pdfContents.length })
  expect(initBody).not.toHaveProperty('storageKey')
  expect(initBody).not.toHaveProperty('checksum')
  expect(initBody).not.toHaveProperty('status')
  expect(initBody).not.toHaveProperty('analysisEligible')
  expect(initBody).not.toHaveProperty('companyId')
  expect(completeBody).toEqual({ version: 1 })
  expect(uploadedBinary?.equals(pdfContents)).toBe(true)
  expect(listCalls).toBe(2)

  const originalRow = filesSection.locator('tbody tr', { hasText: 'technical-drawing.pdf' })
  const downloadPromise = page.waitForEvent('download')
  await originalRow.getByRole('button', { name: 'Indir' }).click()
  await downloadPromise
  expect(downloadCalls).toBe(1)
  expect(capabilityDownloadCalls).toBe(1)

  await originalRow.getByRole('button', { name: 'Sil' }).click()
  await page.getByRole('region', { name: 'Kaydi silmek istediginize emin misiniz?' }).getByRole('button', { name: 'Sil' }).click()
  await expect(filesSection).not.toContainText('technical-drawing.pdf')
  expect(deleteBody).toEqual({ version: 7 })
  expect(listCalls).toBe(3)
})

test('validates MIME, size, and filename before init and hides actions without permissions', async ({ page }) => {
  let initCalls = 0
  await page.route(`${apiBase}/requests**`, async (route) => {
    if (await fulfillRequestRoute(route)) return
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/attachments') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([apiAttachment()]) })
      return
    }
    if (path.endsWith('/attachments/upload-init')) {
      initCalls += 1
      await route.abort()
      return
    }
    await route.abort()
  })

  await openWithSession(page)
  await openRequestDetail(page)
  const filesSection = page.getByRole('region', { name: 'Talep Dosyalari' })
  const fileInput = filesSection.locator('input[type="file"]')
  await fileInput.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('text') })
  await expect(filesSection).toContainText('Yalniz PDF, JPEG ve PNG')
  await fileInput.setInputFiles({ name: 'too-large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(26_214_401) })
  await expect(filesSection).toContainText('25.0 MB arasinda')
  await fileInput.setInputFiles({ name: 'unsafe?.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') })
  await expect(filesSection).toContainText('Dosya adi gecersiz')
  expect(initCalls).toBe(0)

  await page.goto('/login')
  await openWithSession(page, ['requests.read', 'attachments.read'])
  await openRequestDetail(page)
  const readOnlySection = page.getByRole('region', { name: 'Talep Dosyalari' })
  await expect(readOnlySection.locator('input[type="file"]')).toHaveCount(0)
  await expect(readOnlySection.getByRole('button', { name: 'Sil' })).toHaveCount(0)
  await expect(readOnlySection.getByRole('button', { name: 'Indir' })).toBeVisible()
})

test('does not retry stale delete and refetches the authoritative attachment version', async ({ page }) => {
  let listCalls = 0
  let deleteCalls = 0
  await page.route(`${apiBase}/requests**`, async (route) => {
    if (await fulfillRequestRoute(route)) return
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/attachments') && request.method() === 'GET') {
      listCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([apiAttachment({ version: 6 + listCalls })]) })
      return
    }
    if (path.endsWith('/attachments/attachment-1') && request.method() === 'DELETE') {
      deleteCalls += 1
      expect(request.postDataJSON()).toEqual({ version: 7 })
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Stale attachment' }) })
      return
    }
    await route.abort()
  })

  await openWithSession(page)
  await openRequestDetail(page)
  const filesSection = page.getByRole('region', { name: 'Talep Dosyalari' })
  await filesSection.getByRole('button', { name: 'Sil' }).click()
  await page.getByRole('region', { name: 'Kaydi silmek istediginize emin misiniz?' }).getByRole('button', { name: 'Sil' }).click()
  await expect(filesSection).toContainText('Guncel liste yeniden yuklendi.')
  expect(deleteCalls).toBe(1)
  expect(listCalls).toBe(2)
})

test('shows quarantined state and keeps complete-503 upload authoritative', async ({ page }) => {
  let listCalls = 0
  let completeCalls = 0
  const pending = apiAttachment({ id: 'attachment-pending', fileName: 'pending.png', mimeType: 'image/png', status: 'PENDING_UPLOAD', version: 1 })
  const quarantined = apiAttachment({ id: 'attachment-quarantined', fileName: 'blocked.jpg', mimeType: 'image/jpeg', status: 'QUARANTINED', version: 2 })

  await page.route(`${apiBase}/requests**`, async (route) => {
    if (await fulfillRequestRoute(route, 'OPEN_FOR_QUOTATION')) return
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/attachments') && request.method() === 'GET') {
      listCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listCalls === 1 ? [quarantined] : [quarantined, pending]) })
      return
    }
    if (path.endsWith('/attachments/upload-init') && request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ attachment: pending, upload: { url: '/api/v1/storage/uploads/pending-token', expiresAt: '2026-08-10T10:05:00.000Z' } }),
      })
      return
    }
    if (path.endsWith('/attachments/attachment-pending/upload-complete') && request.method() === 'POST') {
      completeCalls += 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Storage verification failed' }) })
      return
    }
    await route.abort()
  })
  await page.route(`${apiBase}/storage/uploads/pending-token`, async (route) => {
    await route.fulfill({ status: 204 })
  })

  await openWithSession(page)
  await openRequestDetail(page)
  const filesSection = page.getByRole('region', { name: 'Talep Dosyalari' })
  await expect(filesSection).toContainText('Dogrulama Nedeniyle Kullanilamiyor')
  await expect(filesSection.locator('tbody tr', { hasText: 'blocked.jpg' }).getByRole('button', { name: 'Indir' })).toHaveCount(0)
  await filesSection.locator('input[type="file"]').setInputFiles({
    name: 'pending.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  })
  await expect(filesSection).toContainText('storage dogrulamasi tamamlanamadi')
  await expect(filesSection.locator('tbody tr', { hasText: 'pending.png' })).toContainText('Yukleme Bekliyor')
  await expect(filesSection.locator('tbody tr', { hasText: 'pending.png' }).getByRole('button', { name: 'Indir' })).toHaveCount(0)
  expect(completeCalls).toBe(1)
  expect(listCalls).toBe(2)
})
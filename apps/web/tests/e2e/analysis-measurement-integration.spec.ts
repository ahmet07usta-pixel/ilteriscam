import { expect, test, type Page, type Route } from '@playwright/test'

const apiBase = 'http://127.0.0.1:4000/api/v1'
const requestId = 'request-analysis-1'
const itemId = 'item-analysis-1'
const attachmentId = 'attachment-analysis-1'
const permissions = [
  'requests.read', 'request-items.read', 'attachments.read', 'attachments.create',
  'analysis.read', 'analysis.create', 'analysis.review',
]

function requestFixture() {
  return {
    id: requestId, requestNumber: 'REQ-ANALYSIS-1', companyId: 'company-analysis', regionId: null,
    createdByUserId: 'analysis-user', title: 'AI olcu analizi', description: 'Analysis integration request',
    productType: 'TEMPERED_GLASS', quantity: '1', unit: 'PIECE', targetDeliveryDate: null,
    budgetMin: null, budgetMax: null, currency: 'TRY', status: 'DRAFT', version: 2,
    createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
    company: { id: 'company-analysis', legalName: 'Analysis Company', tradeName: 'Analysis Company' },
    region: null, createdBy: { id: 'analysis-user', fullName: 'Analysis User', email: 'analysis@example.invalid' }, recipients: [],
  }
}

function itemFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId, requestId, lineNumber: 1, description: 'Cephe paneli', productType: 'GLASS', productCode: 'GP-1',
    quantity: '1.000000', unit: 'PIECE', measurementSource: null, measurementStatus: 'PENDING_REVIEW',
    widthMm: null, heightMm: null, lengthMm: null, depthMm: null, thicknessMm: null,
    calculatedAreaM2: null, calculatedLengthM: null, calculatedVolumeM3: null,
    version: 4, createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z', ...overrides,
  }
}

function attachmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: attachmentId, requestId, requestItemId: itemId, fileName: 'panel.pdf', mimeType: 'application/pdf',
    sizeBytes: 1024, status: 'AVAILABLE', version: 2, createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z', ...overrides,
  }
}

function jobFixture(status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED', overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-analysis-1', requestId, requestItemId: itemId, attachmentId, taskType: 'MEASUREMENT_EXTRACTION',
    status, attemptCount: status === 'QUEUED' ? 0 : 1, maxAttempts: 3, version: 2,
    startedAt: status === 'QUEUED' ? null : '2026-08-08T00:00:01.000Z',
    completedAt: ['COMPLETED', 'FAILED'].includes(status) ? '2026-08-08T00:00:03.000Z' : null,
    createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
    leaseToken: 'must-not-render-lease', leaseExpiresAt: '2026-08-08T00:05:00.000Z',
    failureReason: 'must-not-render-provider-detail', inputHash: 'must-not-render-hash',
    idempotencyKey: 'must-not-render-idempotency', results: [], ...overrides,
  }
}

function measurementFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'measurement-1', analysisResultId: 'result-1', ordinal: 1, label: 'Panel A', geometryType: 'RECTANGLE',
    widthMm: '1200.000000', heightMm: '800.000000', lengthMm: '2500.000000', depthMm: '10.000000',
    thicknessMm: '8.000000', quantity: '3.000000', unit: 'PIECE', calculatedAreaM2: '0.960000',
    calculatedLengthM: '2.500000', calculatedVolumeM3: '0.009600', confidence: '0.9100',
    warnings: ['Olcek dogrulanmali'], assumptions: ['Milimetre varsayildi'], createdAt: '2026-08-08T00:00:03.000Z',
    analysisResult: { id: 'result-1', resultVersion: 1, reviewStatus: 'PENDING', version: 5, createdAt: '2026-08-08T00:00:03.000Z' },
    ...overrides,
  }
}

async function openSession(page: Page, granted = permissions): Promise<void> {
  const user = {
    id: 'analysis-user', role: 'BUYER', backendRole: 'SALES', permissions: granted,
    email: 'analysis@example.invalid', phone: '', fullName: 'Analysis User', company: 'Analysis Company',
    companyId: 'company-analysis', memberships: [],
  }
  await page.goto('/login')
  await page.evaluate((value) => {
    localStorage.setItem('dijitalcam.authUser', JSON.stringify(value))
    localStorage.setItem('dijitalcam.authSession', JSON.stringify({ user: value, issuedAt: Date.now(), expiresAt: Date.now() + 1_800_000 }))
  }, user)
  await page.goto('/app/talepler')
}

async function baseRoutes(route: Route, items = [itemFixture()], attachments = [attachmentFixture()]): Promise<boolean> {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/v1/requests' && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([requestFixture()]) }); return true
  }
  if (path === `/api/v1/requests/${requestId}` && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(requestFixture()) }); return true
  }
  if (path === `/api/v1/requests/${requestId}/items` && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) }); return true
  }
  if (path === `/api/v1/requests/${requestId}/attachments` && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attachments) }); return true
  }
  return false
}

async function openDetail(page: Page): Promise<void> {
  const row = page.locator('table tbody tr', { hasText: 'REQ-ANALYSIS-1' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Goruntule' }).click()
  await expect(page.getByRole('region', { name: 'Talep Detayi' })).toContainText('Analysis integration request')
}

test('starts analysis, polls QUEUED to RUNNING to COMPLETED, refreshes item and measurements, and cleans polling on close', async ({ page }) => {
  let analysisCalls = 0
  let startCalls = 0
  let itemCalls = 0
  let measurementCalls = 0
  await page.route(`${apiBase}/requests**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === `/api/v1/requests/${requestId}/items` && request.method() === 'GET') itemCalls += 1
    if (await baseRoutes(route)) return
    if (path.endsWith(`/attachments/${attachmentId}/analysis`) && request.method() === 'POST') {
      startCalls += 1
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(jobFixture('QUEUED')) }); return
    }
    if (path.endsWith(`/attachments/${attachmentId}/analysis`) && request.method() === 'GET') {
      analysisCalls += 1
      if (startCalls === 0) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return
      }
      const status = analysisCalls === 2 ? 'QUEUED' : analysisCalls === 3 ? 'RUNNING' : 'COMPLETED'
      const results = status === 'COMPLETED' ? [{ id: 'result-1', resultVersion: 1, reviewStatus: 'PENDING', version: 5, detectedMeasurements: [measurementFixture()] }] : []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([jobFixture(status, { results, rawOutputStorageKey: 'must-not-render-raw' })]) }); return
    }
    if (path.endsWith(`/items/${itemId}/measurements`) && request.method() === 'GET') {
      measurementCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisCalls >= 3 ? [measurementFixture()] : []) }); return
    }
    await route.abort()
  })

  await openSession(page)
  await openDetail(page)
  const detail = page.getByRole('region', { name: 'Talep Detayi' })
  await detail.getByRole('button', { name: 'Analiz Baslat' }).click()
  await expect(detail).toContainText('Analiz hazirlaniyor')
  await expect(detail.getByRole('button', { name: 'Analiz Baslat' })).toHaveCount(0)
  await expect(detail).toContainText('Analiz tamamlandi', { timeout: 10_000 })
  await expect(detail).toContainText('Panel A')
  await expect(detail).toContainText('0.960000')
  expect(startCalls).toBe(1)
  expect(analysisCalls).toBeGreaterThanOrEqual(3)
  expect(measurementCalls).toBeGreaterThan(0)
  expect(itemCalls).toBeGreaterThan(1)
  for (const internal of ['must-not-render-lease', 'must-not-render-provider-detail', 'must-not-render-hash', 'must-not-render-idempotency', 'must-not-render-raw']) {
    await expect(detail).not.toContainText(internal)
  }
  await detail.locator('.request-modal-actions').getByRole('button', { name: 'Kapat' }).click()
  const callsAfterClose = analysisCalls
  await page.waitForTimeout(3_000)
  expect(analysisCalls).toBe(callsAfterClose)
})

test('shows FAILED terminal state, prevents duplicate start, and explains unlinked attachment review limitation', async ({ page }) => {
  const unlinked = attachmentFixture({ id: 'attachment-unlinked', requestItemId: null, fileName: 'request-level.pdf' })
  await page.route(`${apiBase}/requests**`, async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname
    if (await baseRoutes(route, [itemFixture()], [attachmentFixture(), unlinked])) return
    if (path.endsWith(`/attachments/${attachmentId}/analysis`) && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([jobFixture('FAILED')]) }); return
    }
    if (path.endsWith('/attachments/attachment-unlinked/analysis') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([jobFixture('RUNNING', { id: 'job-unlinked', attachmentId: 'attachment-unlinked', requestItemId: null })]) }); return
    }
    if (path.endsWith(`/items/${itemId}/measurements`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return
    }
    await route.abort()
  })
  await openSession(page)
  await openDetail(page)
  const detail = page.getByRole('region', { name: 'Talep Detayi' })
  await expect(detail).toContainText('Analiz tamamlanamadi')
  await expect(detail.locator('tbody tr', { hasText: 'panel.pdf' }).getByRole('button', { name: 'Analiz Baslat' })).toHaveCount(0)
  const unlinkedRow = detail.locator('tbody tr', { hasText: 'request-level.pdf' })
  await expect(unlinkedRow).toContainText('Olcu incelemesi icin bir talep kalemine bagli degil')
  await expect(unlinkedRow.getByRole('button', { name: 'Analiz Baslat' })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: /Tekrar|Retry/i })).toHaveCount(0)
})

test('sends exact APPROVE, CORRECT, and REJECT review payloads', async ({ page }) => {
  const reviewBodies: Record<string, unknown>[] = []
  let itemVersion = 4
  await page.route(`${apiBase}/requests**`, async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname
    if (path === `/api/v1/requests/${requestId}/items` && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([itemFixture({ version: itemVersion })]) }); return
    }
    if (await baseRoutes(route)) return
    if (path.endsWith(`/attachments/${attachmentId}/analysis`) && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([jobFixture('COMPLETED')]) }); return
    }
    if (path.endsWith(`/items/${itemId}/measurements`) && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([measurementFixture({ analysisResult: { id: 'result-1', resultVersion: 1, reviewStatus: 'PENDING', version: 5, createdAt: '2026-08-08T00:00:03.000Z' } })]) }); return
    }
    if (path.endsWith(`/items/${itemId}/measurement-review`) && request.method() === 'POST') {
      reviewBodies.push(request.postDataJSON() as Record<string, unknown>)
      itemVersion += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ review: { id: `review-${reviewBodies.length}`, action: reviewBodies.at(-1)?.action }, requestItem: itemFixture({ version: itemVersion, measurementStatus: reviewBodies.at(-1)?.action === 'REJECT' ? 'REJECTED' : 'APPROVED' }) }) }); return
    }
    await route.abort()
  })
  await openSession(page)
  await openDetail(page)
  const detail = page.getByRole('region', { name: 'Talep Detayi' })
  await detail.getByRole('button', { name: 'Olcuyu Onayla' }).click()
  await expect.poll(() => reviewBodies.length).toBe(1)
  expect(reviewBodies[0]).toEqual({ detectedMeasurementId: 'measurement-1', action: 'APPROVE', requestItemVersion: 4, analysisResultVersion: 5 })

  await detail.getByRole('button', { name: 'Olcuyu Duzelt' }).click()
  const correctModal = page.getByRole('region', { name: 'Olcuyu Duzelt' })
  await correctModal.getByLabel('Genislik (mm)').fill('1300')
  await correctModal.getByLabel('Neden').fill('Saha olcusu')
  await correctModal.getByRole('button', { name: 'Duzeltmeyi Kaydet' }).click()
  await expect.poll(() => reviewBodies.length).toBe(2)
  expect(reviewBodies[1]).toEqual({ detectedMeasurementId: 'measurement-1', action: 'CORRECT', requestItemVersion: 5, analysisResultVersion: 5, reason: 'Saha olcusu', width: 1300 })
  expect(reviewBodies[1]).not.toHaveProperty('widthMm')

  await detail.getByRole('button', { name: 'Olcuyu Reddet' }).click()
  const rejectModal = page.getByRole('region', { name: 'Olcuyu Reddet' })
  await rejectModal.getByLabel('Neden').fill('Yanlis bolge')
  await rejectModal.getByRole('button', { name: 'Reddet' }).click()
  await expect.poll(() => reviewBodies.length).toBe(3)
  expect(reviewBodies[2]).toEqual({ detectedMeasurementId: 'measurement-1', action: 'REJECT', requestItemVersion: 6, analysisResultVersion: 5, reason: 'Yanlis bolge' })
})

test('handles stale review without retry, refetches authoritative data, and hides review actions without permission', async ({ page }) => {
  let reviewCalls = 0; let itemCalls = 0; let measurementCalls = 0
  await page.route(`${apiBase}/requests**`, async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname
    if (path === `/api/v1/requests/${requestId}/items` && request.method() === 'GET') itemCalls += 1
    if (await baseRoutes(route)) return
    if (path.endsWith(`/attachments/${attachmentId}/analysis`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([jobFixture('COMPLETED')]) }); return
    }
    if (path.endsWith(`/items/${itemId}/measurements`)) {
      measurementCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([measurementFixture()]) }); return
    }
    if (path.endsWith(`/items/${itemId}/measurement-review`)) {
      reviewCalls += 1
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: reviewCalls === 1 ? 'Request item stale' : 'Analysis result stale' }) }); return
    }
    await route.abort()
  })
  await openSession(page)
  await openDetail(page)
  const detail = page.getByRole('region', { name: 'Talep Detayi' })
  const initialItems = itemCalls; const initialMeasurements = measurementCalls
  await detail.getByRole('button', { name: 'Olcuyu Onayla' }).click()
  await expect(detail).toContainText('Veriler guncellendi, yeniden yuklendi')
  expect(reviewCalls).toBe(1)
  expect(itemCalls).toBeGreaterThan(initialItems)
  expect(measurementCalls).toBeGreaterThan(initialMeasurements)

  await page.goto('/login')
  await openSession(page, permissions.filter((permission) => permission !== 'analysis.review'))
  await openDetail(page)
  await expect(page.getByRole('region', { name: 'Talep Detayi' }).getByRole('button', { name: /Olcuyu (Onayla|Duzelt|Reddet)/ })).toHaveCount(0)
})

test('links a new attachment to a selected RequestItem during capability upload', async ({ page }) => {
  let uploadBody: Record<string, unknown> | undefined
  let currentAttachments = [attachmentFixture()]
  await page.route(`${apiBase}/requests**`, async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname
    if (path === '/api/v1/requests' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([requestFixture()]) }); return
    }
    if (path === `/api/v1/requests/${requestId}` && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(requestFixture()) }); return
    }
    if (path === `/api/v1/requests/${requestId}/items` && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([itemFixture()]) }); return
    }
    if (path === `/api/v1/requests/${requestId}/attachments` && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentAttachments) }); return
    }
    if (path.endsWith('/analysis') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return
    }
    if (path.endsWith(`/items/${itemId}/measurements`) && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return
    }
    if (path.endsWith('/attachments/upload-init') && request.method() === 'POST') {
      uploadBody = request.postDataJSON() as Record<string, unknown>
      const pending = attachmentFixture({ id: 'attachment-linked-new', fileName: 'linked.pdf', requestItemId: itemId, status: 'PENDING_UPLOAD', version: 1 })
      currentAttachments = [...currentAttachments, pending]
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ attachment: pending, upload: { url: '/api/v1/storage/uploads/linked-capability', expiresAt: '2026-08-08T00:05:00.000Z' } }) }); return
    }
    if (path.endsWith('/attachments/attachment-linked-new/upload-complete') && request.method() === 'POST') {
      currentAttachments = currentAttachments.map((attachment) => attachment.id === 'attachment-linked-new' ? { ...attachment, status: 'AVAILABLE', version: 2 } : attachment)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentAttachments.at(-1)) }); return
    }
    await route.abort()
  })
  await page.route(`${apiBase}/storage/uploads/linked-capability`, (route) => route.fulfill({ status: 204 }))

  await openSession(page)
  await openDetail(page)
  const files = page.getByRole('region', { name: 'Talep Dosyalari' })
  await files.getByLabel('Dosyanin bagli oldugu kalem').selectOption(itemId)
  await files.locator('input[type="file"]').setInputFiles({ name: 'linked.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-linked') })
  await expect(files).toContainText('linked.pdf')
  expect(uploadBody).toEqual({ fileName: 'linked.pdf', mimeType: 'application/pdf', sizeBytes: 11, requestItemId: itemId })
})
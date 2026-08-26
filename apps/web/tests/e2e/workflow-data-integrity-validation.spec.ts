import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

type UserRole = 'ADMIN' | 'MANUFACTURER' | 'BUYER'

type DemoUser = {
  id: string
  role: UserRole
  email: string
  phone: string
  fullName: string
  company: string
}

type WorkflowSnapshot = {
  requests: Array<{ id: string; status: string; assignedManufacturers?: string[] }>
  offers: Array<{ id: string; requestId?: string; status: string }>
  orders: Array<{ id: string; sourceOfferId?: string; status: string }>
  productions: Array<{ id: string; orderId?: string; status: string }>
  shipments: Array<{ id: string; orderNo: string; status: string }>
  activityLog: Array<{ id: string; eventKey?: string; title: string; description: string; audience: string; channel: string }>
}

const users: Record<UserRole, DemoUser> = {
  ADMIN: {
    id: 'usr-admin-001',
    role: 'ADMIN',
    email: 'admin@dijitalcam.com',
    phone: '+905300000001',
    fullName: 'Platform Admin',
    company: 'Dijital Cam Platformu',
  },
  MANUFACTURER: {
    id: 'usr-manufacturer-001',
    role: 'MANUFACTURER',
    email: 'uretici@firma.com',
    phone: '+905300000002',
    fullName: 'Emre Tunali',
    company: 'Nova Cephe Sistemleri',
  },
  BUYER: {
    id: 'usr-buyer-001',
    role: 'BUYER',
    email: 'alici@musteri.com',
    phone: '+905300000003',
    fullName: 'Selin Kaya',
    company: 'Eksen Cam Sanayi',
  },
}

const ACCESS_DENIED_TEXT = 'Bu sayfaya erişim yetkiniz bulunmamaktadır.'

function toNumber(value: string): number {
  return Number(value.replace(/[^0-9]/g, ''))
}

async function setUser(page: Page, role: UserRole): Promise<void> {
  await page.goto('/login')
  await page.evaluate((authUser) => {
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(authUser))
    window.localStorage.setItem(
      'dijitalcam.authSession',
      JSON.stringify({
        user: authUser,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      }),
    )
  }, users[role])
}

async function readDashboardMetric(page: Page, label: string): Promise<number> {
  const card = page.locator('.metric-kpi', { hasText: label }).first()
  await expect(card).toBeVisible()
  const value = (await card.locator('strong').innerText()).trim()
  return toNumber(value)
}

async function readWorkflowSnapshot(page: Page): Promise<WorkflowSnapshot> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('dijitalcam.workflowStore')
    if (!raw) {
      return {
        requests: [],
        offers: [],
        orders: [],
        productions: [],
        shipments: [],
        activityLog: [],
      }
    }

    const parsed = JSON.parse(raw) as WorkflowSnapshot
    return {
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      offers: Array.isArray(parsed.offers) ? parsed.offers : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      productions: Array.isArray(parsed.productions) ? parsed.productions : [],
      shipments: Array.isArray(parsed.shipments) ? parsed.shipments : [],
      activityLog: Array.isArray(parsed.activityLog) ? parsed.activityLog : [],
    }
  })
}

test.describe('Workflow and Data Integrity Validation', () => {
  test.setTimeout(180_000)

  test('validates buyer-to-delivery workflow with data integrity, authorization and activity routing', async ({ page }) => {
    const consoleIssues: string[] = []
    const requestFailures: string[] = []
    const runtimeErrors: string[] = []

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleIssues.push(`${msg.type()}: ${msg.text()}`)
      }
    })

    page.on('requestfailed', (request) => {
      requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`)
    })

    page.on('pageerror', (error) => {
      runtimeErrors.push(error.message)
    })

    const requestTitle = `E2E Tam Akis Talep ${Date.now()}`

    await setUser(page, 'ADMIN')
    await page.evaluate(() => window.localStorage.removeItem('dijitalcam.workflowStore'))
    await page.setViewportSize({ width: 1366, height: 900 })

    await page.goto('/app/kontrol-paneli')
    const completedBefore = await readDashboardMetric(page, 'Tamamlanan Siparisler')

    await setUser(page, 'BUYER')
    await page.goto('/app/talepler')
    const beforeRequestSnapshot = await readWorkflowSnapshot(page)

    await page.getByRole('button', { name: '+ Yeni Talep Olustur' }).click()
    const requestModal = page.getByRole('region', { name: 'Yeni Talep' })
    const requestId = (await requestModal.locator('input[readonly]').first().inputValue()).trim()
    await requestModal.locator('label:has-text("Talep Basligi") input').fill(requestTitle)
    await requestModal.locator('label:has-text("Urun") input').fill('10 mm Temperli Cam')
    await requestModal.locator('label:has-text("Aciklama") textarea').fill('Uctan uca workflow veri butunlugu testi')
    await requestModal.locator('label:has-text("Bolge") select').selectOption('Marmara')
    await requestModal.locator('label:has-text("Sorumlu") input').fill('Selin Kaya')
    await requestModal.locator('.request-modal-actions .solid-btn').click()

    const buyerRequestRow = page.locator('table tbody tr', { hasText: requestId }).first()
    await expect(buyerRequestRow).toBeVisible()
    await expect(buyerRequestRow).toContainText('Bekleyen')

    const afterRequestSnapshot = await readWorkflowSnapshot(page)
    expect(afterRequestSnapshot.requests.length).toBe(beforeRequestSnapshot.requests.length + 1)
    const storedRequest = afterRequestSnapshot.requests.find((item) => item.id === requestId)
    expect(storedRequest).toBeDefined()
    expect(storedRequest?.status).toBe('Bekleyen')
    expect(storedRequest?.assignedManufacturers?.length ?? 0).toBeGreaterThan(0)

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Yeni talep atamasi' }).first()).toBeVisible()
    await page.goto('/app/mesajlar')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Yeni yonlendirilmis talep' }).first()).toBeVisible()

    await page.goto('/app/talepler')
    const manufacturerRequestRow = page.locator('table tbody tr', { hasText: requestId }).first()
    await expect(manufacturerRequestRow).toBeVisible()

    const beforeOfferSnapshot = await readWorkflowSnapshot(page)
    await manufacturerRequestRow.getByRole('button', { name: 'Teklife Donustur' }).click()

    await page.goto('/app/teklifler')
    const manufacturerOfferRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await expect(manufacturerOfferRow).toBeVisible()
    await manufacturerOfferRow.getByRole('button', { name: 'Duzenle' }).click()
    const offerModal = page.getByRole('region', { name: 'Teklif Duzenle' })
    await offerModal.locator('label:has-text("Toplam Tutar") input').fill('TRY 720.000')
    await offerModal.locator('label:has-text("Durum") select').selectOption('Gonderildi')
    await offerModal.locator('.request-modal-actions .solid-btn').click()

    const afterOfferSnapshot = await readWorkflowSnapshot(page)
    expect(afterOfferSnapshot.offers.length).toBe(beforeOfferSnapshot.offers.length + 1)
    const createdOffer = afterOfferSnapshot.offers.find((item) => item.requestId === requestId)
    expect(createdOffer).toBeDefined()
    expect(createdOffer?.status).toBe('Gonderildi')
    expect(afterOfferSnapshot.offers.filter((item) => item.requestId === requestId)).toHaveLength(1)
    expect(afterOfferSnapshot.requests.find((item) => item.id === requestId)?.status).toBe('Teklif Gonderildi')

    await setUser(page, 'BUYER')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Yeni teklif alindi' }).first()).toBeVisible()

    await page.goto('/app/teklifler')
    const buyerOfferRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await expect(buyerOfferRow).toBeVisible()
    await buyerOfferRow.getByRole('button', { name: 'Duzenle' }).click()
    const buyerOfferModal = page.getByRole('region', { name: 'Teklif Duzenle' })
    await buyerOfferModal.locator('label:has-text("Durum") select').selectOption('Onaylandi')
    await buyerOfferModal.locator('.request-modal-actions .solid-btn').click()

    await expect
      .poll(async () => {
        const snapshot = await readWorkflowSnapshot(page)
        const approvedOfferInSnapshot = snapshot.offers.find((item) => item.requestId === requestId && item.status === 'Onaylandi')
        if (!approvedOfferInSnapshot) {
          return 0
        }

        const linkedOrdersInSnapshot = snapshot.orders.filter((item) => item.sourceOfferId === approvedOfferInSnapshot.id)
        if (linkedOrdersInSnapshot.length !== 1) {
          return 0
        }

        return snapshot.productions.filter((item) => item.orderId === linkedOrdersInSnapshot[0].id).length
      })
      .toBe(1)

    const afterApprovalSnapshot = await readWorkflowSnapshot(page)
    const approvedOffer = afterApprovalSnapshot.offers.find((item) => item.requestId === requestId)
    expect(approvedOffer?.status).toBe('Onaylandi')
    expect(afterApprovalSnapshot.requests.find((item) => item.id === requestId)?.status).toBe('Onaylanan')
    const linkedOrders = afterApprovalSnapshot.orders.filter((item) => item.sourceOfferId === approvedOffer?.id)
    expect(linkedOrders).toHaveLength(1)
    const orderId = linkedOrders[0].id
    expect(linkedOrders[0].status).toBe('Bekliyor')
    const linkedProductions = afterApprovalSnapshot.productions.filter((item) => item.orderId === orderId)
    expect(linkedProductions).toHaveLength(1)
    expect(linkedProductions[0].status).toBe('Planlandi')
    const productionId = linkedProductions[0].id

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Yeni siparis emri' }).first()).toBeVisible()

    await page.goto('/app/siparisler')
    const manufacturerOrderRow = page.locator('table tbody tr', { hasText: orderId }).first()
    await expect(manufacturerOrderRow).toBeVisible()
    await manufacturerOrderRow.getByRole('button', { name: 'Duzenle' }).click()
    const orderModal = page.getByRole('region', { name: 'Siparis Duzenle' })
    await orderModal.locator('label:has-text("Durum") select').selectOption('Uretimde')
    await orderModal.locator('.request-modal-actions .solid-btn').click()

    const afterProductionStartSnapshot = await readWorkflowSnapshot(page)
    expect(afterProductionStartSnapshot.orders.find((item) => item.id === orderId)?.status).toBe('Uretimde')
    expect(afterProductionStartSnapshot.productions.filter((item) => item.orderId === orderId)).toHaveLength(1)

    await setUser(page, 'BUYER')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Siparis uretime alindi' }).first()).toBeVisible()

    await page.goto('/app/uretim-takibi')
    await expect(page.getByText(ACCESS_DENIED_TEXT)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Yeni Is Emri' })).toHaveCount(0)

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/uretim-takibi')
    const productionRow = page.locator('table tbody tr', { hasText: productionId }).first()
    await expect(productionRow).toBeVisible()
    await productionRow.getByRole('button', { name: 'Duzenle' }).click()
    const productionModal = page.getByRole('region', { name: 'Is Emri Duzenle' })
    await productionModal.locator('label:has-text("Durum") select').selectOption('Kesim')
    await productionModal.locator('.request-modal-actions .solid-btn').click()
    await expect(page.locator('table tbody tr', { hasText: productionId }).first()).toContainText('Kesim')

    await page.locator('table tbody tr', { hasText: productionId }).first().getByRole('button', { name: 'Duzenle' }).click()
    const productionCompleteModal = page.getByRole('region', { name: 'Is Emri Duzenle' })
    await productionCompleteModal.locator('label:has-text("Durum") select').selectOption('Tamamlandi')
    await productionCompleteModal.locator('.request-modal-actions .solid-btn').click()

    const afterProductionCompleteSnapshot = await readWorkflowSnapshot(page)
    expect(afterProductionCompleteSnapshot.productions.filter((item) => item.orderId === orderId)).toHaveLength(1)
    expect(afterProductionCompleteSnapshot.productions.find((item) => item.orderId === orderId)?.status).toBe('Tamamlandi')
    expect(afterProductionCompleteSnapshot.orders.find((item) => item.id === orderId)?.status).toBe('Sevkiyata Hazir')
    const linkedShipments = afterProductionCompleteSnapshot.shipments.filter((item) => item.orderNo === orderId)
    expect(linkedShipments).toHaveLength(1)
    expect(linkedShipments[0].status).toBe('Planlandi')

    await page.goto('/app/sevkiyat')
    const shipmentRow = page.locator('table tbody tr', { hasText: orderId }).first()
    await expect(shipmentRow).toBeVisible()
    await shipmentRow.getByRole('button', { name: 'Duzenle' }).click()
    const shipmentModal = page.getByRole('region', { name: 'Sevkiyat Duzenle' })
    await shipmentModal.locator('label:has-text("Durum") select').selectOption('Yolda')
    await shipmentModal.locator('label:has-text("Arac") input').fill('Workflow Test Araci')
    await shipmentModal.locator('label:has-text("Sofor") input').fill('Workflow Test Soforu')
    await shipmentModal.locator('label:has-text("Plaka") input').fill('34 WF 999')
    await shipmentModal.locator('label:has-text("Aciklama") textarea').fill('Sevkiyat yola cikti')
    await shipmentModal.locator('.request-modal-actions .solid-btn').click()

    await page.locator('table tbody tr', { hasText: orderId }).first().getByRole('button', { name: 'Duzenle' }).click()
    const deliveredModal = page.getByRole('region', { name: 'Sevkiyat Duzenle' })
    await deliveredModal.locator('label:has-text("Durum") select').selectOption('Teslim Edildi')
    await deliveredModal.locator('.request-modal-actions .solid-btn').click()

    const afterDeliverySnapshot = await readWorkflowSnapshot(page)
    expect(afterDeliverySnapshot.shipments.filter((item) => item.orderNo === orderId)).toHaveLength(1)
    expect(afterDeliverySnapshot.shipments.find((item) => item.orderNo === orderId)?.status).toBe('Teslim Edildi')
    expect(afterDeliverySnapshot.orders.find((item) => item.id === orderId)?.status).toBe('Teslim Edildi')

    await page.locator('table tbody tr', { hasText: orderId }).first().getByRole('button', { name: 'Duzenle' }).click()
    const deliveredAgainModal = page.getByRole('region', { name: 'Sevkiyat Duzenle' })
    await deliveredAgainModal.locator('label:has-text("Durum") select').selectOption('Teslim Edildi')
    await deliveredAgainModal.locator('.request-modal-actions .solid-btn').click()

    const afterDeliverySecondSaveSnapshot = await readWorkflowSnapshot(page)
    expect(afterDeliverySecondSaveSnapshot.shipments.filter((item) => item.orderNo === orderId)).toHaveLength(1)
    expect(afterDeliverySecondSaveSnapshot.orders.filter((item) => item.id === orderId)).toHaveLength(1)
    const deliveredEvents = afterDeliverySecondSaveSnapshot.activityLog.filter((item) => item.eventKey === `shipment-delivered:${linkedShipments[0].id}`)
    expect(deliveredEvents).toHaveLength(1)

    await setUser(page, 'BUYER')
    await page.goto('/app/siparisler')
    await expect(page.locator('table tbody tr', { hasText: orderId }).first()).toContainText('Teslim Edildi')

    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Uretim durumu guncellendi' }).first()).toBeVisible()
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Uretim tamamlandi' }).first()).toBeVisible()
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Sevkiyat durumu guncellendi' }).first()).toBeVisible()
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: `${orderId} siparisi teslim edildi.` }).first()).toBeVisible()

    await setUser(page, 'ADMIN')
    await page.goto('/app/raporlar')
    await expect(page.getByRole('heading', { name: 'Alici ve Uretici Genel Raporu' })).toBeVisible()

    await page.goto('/app/kontrol-paneli')
    const completedAfter = await readDashboardMetric(page, 'Tamamlanan Siparisler')
    expect(completedAfter).toBeGreaterThanOrEqual(completedBefore + 1)

    expect(consoleIssues, `Console/runtime issues:\n${consoleIssues.join('\n')}`).toEqual([])
    expect(requestFailures, `Failed network requests:\n${requestFailures.join('\n')}`).toEqual([])
    expect(runtimeErrors, `Runtime page errors:\n${runtimeErrors.join('\n')}`).toEqual([])
  })
})

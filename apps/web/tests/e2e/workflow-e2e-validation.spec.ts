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

test.describe('Workflow E2E Validation', () => {
  test.setTimeout(90_000)

  test('order-production-shipment lifecycle with CRUD, dashboard, responsiveness and log health', async ({ page }) => {
    const consoleIssues: string[] = []
    const requestFailures: string[] = []

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleIssues.push(`${msg.type()}: ${msg.text()}`)
      }
    })

    page.on('requestfailed', (request) => {
      requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`)
    })

    const manualOrderTag = `E2E-SIP-${Date.now()}`
    const requestTitle = `E2E Workflow Talep ${Date.now()}`

    await setUser(page, 'ADMIN')
    await page.evaluate(() => window.localStorage.removeItem('dijitalcam.workflowStore'))

    await page.setViewportSize({ width: 1366, height: 900 })
    await page.goto('/app/kontrol-paneli')
    const completedBefore = await readDashboardMetric(page, 'Tamamlanan Siparisler')

    await page.goto('/app/siparisler')
    await page.getByRole('button', { name: '+ Yeni Siparis Olustur' }).click()
    const createOrderModal = page.getByRole('region', { name: 'Yeni Siparis' })
    const newOrderId = (await createOrderModal.locator('input[readonly]').first().inputValue()).trim()
    await createOrderModal.locator('label:has-text("Firma") select').selectOption('Eksen Cam Sanayi')
    await createOrderModal.locator('label:has-text("Siparis Turu") select').selectOption('Standart Siparis')
    await createOrderModal.locator('label:has-text("Durum") select').selectOption('Bekliyor')
    await createOrderModal.locator('label:has-text("Siparis Basligi") input').fill(manualOrderTag)
    await createOrderModal.locator('label:has-text("Sorumlu") input').fill('Platform Admin')
    await createOrderModal.locator('.request-modal-actions .solid-btn').click()

    const manualOrderRow = page.locator('table tbody tr', { hasText: newOrderId }).first()
    await expect(manualOrderRow).toBeVisible()
    await expect(manualOrderRow).toContainText(manualOrderTag)

    await manualOrderRow.getByRole('button', { name: 'Goruntule' }).click()
    const orderDetailModal = page.getByRole('region', { name: 'Siparis Detayi' })
    await expect(orderDetailModal).toContainText(manualOrderTag)
    await orderDetailModal.locator('.request-modal-actions .solid-btn').click()

    await manualOrderRow.getByRole('button', { name: 'Duzenle' }).click()
    const editOrderModal = page.getByRole('region', { name: 'Siparis Duzenle' })
    await editOrderModal.locator('label:has-text("Durum") select').selectOption('Uretimde')
    await editOrderModal.locator('.request-modal-actions .solid-btn').click()
    await expect(page.locator('table tbody tr', { hasText: newOrderId }).first()).toContainText('Uretimde')

    await page.goto('/app/uretim-takibi')
    const autoProductionRow = page.locator('table tbody tr', { hasText: manualOrderTag }).first()
    await expect(autoProductionRow).toBeVisible()
    await expect(autoProductionRow).toContainText('Planlandi')

    await autoProductionRow.getByRole('button', { name: 'Duzenle' }).click()
    const editProductionModal = page.getByRole('region', { name: 'Is Emri Duzenle' })
    await editProductionModal.locator('label:has-text("Durum") select').selectOption('Kesim')
    await editProductionModal.locator('.request-modal-actions .solid-btn').click()
    await expect(page.locator('table tbody tr', { hasText: manualOrderTag }).first()).toContainText('Kesim')

    await page.goto('/app/siparisler')
    await expect(page.locator('table tbody tr', { hasText: newOrderId }).first()).toContainText('Uretimde')

    await page.goto('/app/uretim-takibi')
    await page.locator('table tbody tr', { hasText: manualOrderTag }).first().getByRole('button', { name: 'Duzenle' }).click()
    const completeProductionModal = page.getByRole('region', { name: 'Is Emri Duzenle' })
    await completeProductionModal.locator('label:has-text("Durum") select').selectOption('Tamamlandi')
    await completeProductionModal.locator('.request-modal-actions .solid-btn').click()
    await expect(page.locator('table tbody tr', { hasText: manualOrderTag }).first()).toContainText('Tamamlandi')

    await page.goto('/app/siparisler')
    await expect(page.locator('table tbody tr', { hasText: newOrderId }).first()).toContainText('Sevkiyata Hazir')

    await page.goto('/app/sevkiyat')
    const shipmentRow = page.locator('table tbody tr', { hasText: newOrderId }).first()
    await expect(shipmentRow).toBeVisible()
    await expect(shipmentRow).toContainText('Planlandi')

    await shipmentRow.getByRole('button', { name: 'Duzenle' }).click()
    const editShipmentModal = page.getByRole('region', { name: 'Sevkiyat Duzenle' })
    await editShipmentModal.locator('label:has-text("Durum") select').selectOption('Yolda')
    await editShipmentModal.locator('label:has-text("Arac") input').fill('Test Araci')
    await editShipmentModal.locator('label:has-text("Sofor") input').fill('Test Soforu')
    await editShipmentModal.locator('label:has-text("Plaka") input').fill('34 TEST 01')
    await editShipmentModal.locator('label:has-text("Aciklama") textarea').fill('Yolda guncellemesi')
    await editShipmentModal.locator('.request-modal-actions .solid-btn').click()
    await expect(page.locator('table tbody tr', { hasText: newOrderId }).first()).toContainText('Yolda')

    await page.locator('table tbody tr', { hasText: newOrderId }).first().getByRole('button', { name: 'Duzenle' }).click()
    const deliveredShipmentModal = page.getByRole('region', { name: 'Sevkiyat Duzenle' })
    await deliveredShipmentModal.locator('label:has-text("Durum") select').selectOption('Teslim Edildi')
    await deliveredShipmentModal.locator('.request-modal-actions .solid-btn').click()
    await expect(page.locator('table tbody tr', { hasText: newOrderId }).first()).toContainText('Teslim Edildi')

    await page.goto('/app/siparisler')
    await expect(page.locator('table tbody tr', { hasText: newOrderId }).first()).toContainText('Teslim Edildi')

    await page.goto('/app/kontrol-paneli')
    const completedAfter = await readDashboardMetric(page, 'Tamamlanan Siparisler')
    expect(completedAfter).toBeGreaterThanOrEqual(completedBefore + 1)

    await page.goto('/app/talepler')
    await page.getByRole('button', { name: '+ Yeni Talep Olustur' }).click()
    const requestModal = page.getByRole('region', { name: 'Yeni Talep' })
    const requestId = (await requestModal.locator('input[readonly]').first().inputValue()).trim()
    await requestModal.locator('label:has-text("Talep Basligi") input').fill(requestTitle)
    await requestModal.locator('label:has-text("Urun") input').fill('10 mm Test Cam')
    await requestModal.locator('label:has-text("Aciklama") textarea').fill('Otomatik aktarim kontrolu')
    await requestModal.locator('label:has-text("Bolge") select').selectOption('Marmara')
    await requestModal.locator('label:has-text("Sorumlu") input').fill('Selin Kaya')
    await requestModal.locator('.request-modal-actions .solid-btn').click()
    await expect(page.locator('table tbody tr', { hasText: requestId }).first()).toBeVisible()

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/talepler')
    const manufacturerRequestRow = page.locator('table tbody tr', { hasText: requestId }).first()
    await expect(manufacturerRequestRow).toBeVisible()
    await manufacturerRequestRow.getByRole('button', { name: 'Teklife Donustur' }).click()

    await page.goto('/app/teklifler')
    const manufacturerOfferRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await expect(manufacturerOfferRow).toBeVisible()
    await manufacturerOfferRow.getByRole('button', { name: 'Duzenle' }).click()
    const offerModal = page.getByRole('region', { name: 'Teklif Duzenle' })
    await offerModal.locator('label:has-text("Toplam Tutar") input').fill('TRY 500.000')
    await offerModal.locator('label:has-text("Durum") select').selectOption('Gonderildi')
    await offerModal.locator('.request-modal-actions .solid-btn').click()

    await setUser(page, 'BUYER')
    await page.goto('/app/teklifler')
    const buyerOfferRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await expect(buyerOfferRow).toBeVisible()
    await buyerOfferRow.getByRole('button', { name: 'Duzenle' }).click()
    const buyerOfferModal = page.getByRole('region', { name: 'Teklif Duzenle' })
    await buyerOfferModal.locator('label:has-text("Durum") select').selectOption('Onaylandi')
    await buyerOfferModal.locator('.request-modal-actions .solid-btn').click()

    await setUser(page, 'ADMIN')
    await page.goto('/app/siparisler')
    const transferredOrder = page.locator('table tbody tr', { hasText: requestId }).first()
    await expect(transferredOrder).toBeVisible()

    await page.goto('/app/siparisler')
    const filterInput = page.getByPlaceholder('Siparis, firma veya sorumlu ara')
    await filterInput.fill(manualOrderTag)
    await expect(page.locator('table tbody tr')).toHaveCount(1)
    await page.locator('table tbody tr', { hasText: manualOrderTag }).first().getByRole('button', { name: 'Sil' }).click()
    await page.getByRole('region', { name: 'Kaydi silmek istediginize emin misiniz?' }).getByRole('button', { name: 'Sil' }).click()
    await expect(page.locator('table tbody tr', { hasText: manualOrderTag })).toHaveCount(0)

    await setUser(page, 'BUYER')
    await page.goto('/app/uretim-takibi')
    await expect(page.getByText(ACCESS_DENIED_TEXT)).toHaveCount(0)
    await expect(page.locator('table').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Yeni Is Emri' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Duzenle' })).toHaveCount(0)

    await setUser(page, 'ADMIN')
    for (const viewport of [
      { width: 1366, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/app/siparisler')
      await expect(page.locator('table').first()).toBeVisible()
      await page.getByRole('button', { name: '+ Yeni Siparis Olustur' }).click()
      await expect(page.getByRole('region', { name: 'Yeni Siparis' })).toBeVisible()
      await page.getByRole('region', { name: 'Yeni Siparis' }).getByRole('button', { name: 'Iptal' }).click()

      await page.goto('/app/uretim-takibi')
      await expect(page.locator('table').first()).toBeVisible()
      await page.goto('/app/sevkiyat')
      await expect(page.locator('table').first()).toBeVisible()
      await page.getByPlaceholder('Sevkiyat, firma veya sofor ara').fill('test')
    }

    expect(consoleIssues, `Console/runtime issues:\n${consoleIssues.join('\n')}`).toEqual([])
    expect(requestFailures, `Failed network requests:\n${requestFailures.join('\n')}`).toEqual([])
  })
})

import { expect, test, type Page } from '@playwright/test'

type DemoUser = {
  id: string
  role: 'BUYER' | 'MANUFACTURER' | 'ADMIN'
  email: string
  phone: string
  fullName: string
  company: string
}

const buyer: DemoUser = {
  id: 'usr-buyer-001',
  role: 'BUYER',
  email: 'alici@musteri.com',
  phone: '+905300000003',
  fullName: 'Selin Kaya',
  company: 'Eksen Cam Sanayi',
}

const manufacturer: DemoUser = {
  id: 'usr-manufacturer-001',
  role: 'MANUFACTURER',
  email: 'uretici@firma.com',
  phone: '+905300000002',
  fullName: 'Emre Tunali',
  company: 'Nova Cephe Sistemleri',
}

const admin: DemoUser = {
  id: 'usr-admin-001',
  role: 'ADMIN',
  email: 'admin@dijitalcam.com',
  phone: '+905300000001',
  fullName: 'Platform Admin',
  company: 'Dijital Cam Platformu',
}

async function setUser(page: Page, user: DemoUser): Promise<void> {
  await page.goto('/login')
  await page.evaluate((payload) => {
    window.localStorage.setItem('dijitalcam.authUser', JSON.stringify(payload))
    window.localStorage.setItem(
      'dijitalcam.authSession',
      JSON.stringify({
        user: payload,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      }),
    )
  }, user)
}

test.describe('Workflow Integration Chain', () => {
  test('buyer -> manufacturer -> buyer -> manufacturer -> admin full chain', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 })

    await setUser(page, buyer)
    await page.evaluate(() => window.localStorage.removeItem('dijitalcam.workflowStore'))

    await page.goto('/app/talepler')
    await page.getByRole('button', { name: '+ Yeni Talep Olustur' }).click()
    const requestId = await page.locator('input[readonly]').first().inputValue()
    await page.locator('label:has-text("Talep Basligi") input').fill('Workflow Zincir Test Talebi')
    await page.locator('label:has-text("Urun") input').fill('12 mm Temperli Cam')
    await page.locator('label:has-text("Aciklama") textarea').fill('Tam entegre workflow testi.')
    await page.locator('label:has-text("Bolge") select').selectOption('Marmara')
    await page.locator('label:has-text("Sorumlu") input').fill('Selin Kaya')
    await page.locator('.request-modal-actions .solid-btn').click()

    const buyerRequestRow = page.locator('table tbody tr', { hasText: requestId }).first()
    await expect(buyerRequestRow).toBeVisible()
    await expect(buyerRequestRow.locator('td').nth(5)).toContainText('Bekleyen')

    await setUser(page, manufacturer)
    await page.goto('/app/talepler')
    const manufacturerRequestRow = page.locator('table tbody tr', { hasText: requestId }).first()
    await expect(manufacturerRequestRow).toBeVisible()

    await manufacturerRequestRow.getByRole('button', { name: 'Teklife Donustur' }).click()
    await page.locator('table tbody tr', { hasText: requestId }).first().getByRole('button', { name: 'Teklife Donustur' }).waitFor({ state: 'visible' })

    await page.goto('/app/teklifler')
    const manufacturerOfferRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await expect(manufacturerOfferRow).toBeVisible()
    await manufacturerOfferRow.getByRole('button', { name: 'Duzenle' }).click()
    await page.locator('label:has-text("Toplam Tutar") input').fill('TRY 610.000')
    await page.locator('label:has-text("Durum") select').last().selectOption('Gonderildi')
    await page.locator('.request-modal-actions .solid-btn').click()

    await setUser(page, buyer)
    await page.goto('/app/teklifler')
    const buyerOfferRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await expect(buyerOfferRow).toBeVisible()
    await expect(buyerOfferRow.locator('td').nth(5)).toContainText('Gonderildi')
    await buyerOfferRow.getByRole('button', { name: 'Duzenle' }).click()
    await page.locator('label:has-text("Durum") select').last().selectOption('Onaylandi')
    await page.locator('.request-modal-actions .solid-btn').click()

    await page.goto('/app/siparisler')
    const buyerOrderRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await expect(buyerOrderRow).toBeVisible()
    const orderId = (await buyerOrderRow.locator('td').nth(0).innerText()).trim()
    await expect(buyerOrderRow.locator('td').nth(6)).toContainText('Bekliyor')

    await setUser(page, manufacturer)
    await page.goto('/app/siparisler')
    const manufacturerOrderRow = page.locator('table tbody tr', { hasText: orderId }).first()
    await expect(manufacturerOrderRow).toBeVisible()
    await manufacturerOrderRow.getByRole('button', { name: 'Duzenle' }).click()
    await page.locator('label:has-text("Durum") select').last().selectOption('Uretimde')
    await page.locator('.request-modal-actions .solid-btn').click()

    await page.goto('/app/uretim-takibi')
    const productionRow = page.locator('table tbody tr', { hasText: 'Workflow Zincir Test Talebi' }).first()
    await expect(productionRow).toBeVisible()
    await productionRow.getByRole('button', { name: 'Duzenle' }).click()
    await page.locator('label:has-text("Durum") select').last().selectOption('Tamamlandi')
    await page.locator('.request-modal-actions .solid-btn').click()

    await page.goto('/app/sevkiyat')
    const shipmentRow = page.locator('table tbody tr', { hasText: orderId }).first()
    await expect(shipmentRow).toBeVisible()
    await shipmentRow.getByRole('button', { name: 'Duzenle' }).click()
    await page.locator('label:has-text("Durum") select').last().selectOption('Teslim Edildi')
    await page.locator('.request-modal-actions .solid-btn').click()

    await setUser(page, buyer)
    await page.goto('/app/siparisler')
    const buyerFinalOrder = page.locator('table tbody tr', { hasText: orderId }).first()
    await expect(buyerFinalOrder.locator('td').nth(6)).toContainText('Teslim Edildi')

    await page.goto('/app/bildirimler')
    await expect(page.locator('.request-detail-card').first()).toBeVisible()

    await page.goto('/app/mesajlar')
    await expect(page.locator('.request-detail-card')).toHaveCount(0)

    await setUser(page, manufacturer)
    await page.goto('/app/mesajlar')
    await expect(page.locator('.request-detail-card').first()).toBeVisible()

    await page.goto('/app/raporlar')
    await expect(page.getByText('Workflow Olay Ozeti')).toBeVisible()
    await expect(page.locator('.request-detail-card')).not.toHaveCount(0)

    await setUser(page, admin)
    await page.goto('/app/raporlar')
    await expect(page.getByRole('heading', { name: 'Alici ve Uretici Genel Raporu' })).toBeVisible()
  })
})

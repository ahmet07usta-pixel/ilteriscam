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

async function readIconBadge(page: Page, label: 'Bildirimler' | 'Mesajlar'): Promise<number> {
  const text = ((await page.locator(`button[aria-label="${label}"] em`).innerText()) || '0').trim()
  const numeric = Number(text.replace(/[^0-9]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

test.describe('Messages and Notifications Validation', () => {
  test.setTimeout(90_000)

  test('end-to-end validation for roles, read states, counters, duplicate prevention and responsive behavior', async ({ page }) => {
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

    const requestTitle = `E2E MsgFlow Talep ${Date.now()}`

    await setUser(page, 'ADMIN')
    await page.evaluate(() => window.localStorage.removeItem('dijitalcam.workflowStore'))
    await page.setViewportSize({ width: 1366, height: 900 })

    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Teklif kabul edildi' }).first()).toBeVisible()

    const adminBadgeBeforeRead = await readIconBadge(page, 'Bildirimler')
    expect(adminBadgeBeforeRead).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Okundu Isaretle' }).first().click()
    const adminBadgeAfterSingleRead = await readIconBadge(page, 'Bildirimler')
    expect(adminBadgeAfterSingleRead).toBeLessThan(adminBadgeBeforeRead)

    const bulkReadButton = page.locator('.workspace-main .panel').getByRole('button', { name: 'Tumunu Okundu Isaretle' })
    if (await bulkReadButton.isEnabled()) {
      await bulkReadButton.click()
    }
    const adminBadgeAfterAllRead = await readIconBadge(page, 'Bildirimler')
    expect(adminBadgeAfterAllRead).toBe(0)

    await page.goto('/app/mesajlar')
    await page.getByRole('button', { name: '+ Yeni Mesaj' }).click()
    const composeModal = page.getByRole('region', { name: 'Yeni Mesaj' })
    await composeModal.locator('label:has-text("Alici Rol") select').selectOption('MANUFACTURER')
    await composeModal.locator('label:has-text("Mesaj Basligi") input').fill('E2E Kullanici Mesaji')
    await composeModal.locator('label:has-text("Mesaj") textarea').fill('Admin tarafından üreticiye gönderilen test mesajı.')
    await composeModal.getByRole('button', { name: 'Gonder' }).click()
    await expect(page.locator('.toast', { hasText: 'Mesaj gonderildi' }).first()).toBeVisible()

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/mesajlar')
    await expect(page.getByText('E2E Kullanici Mesaji')).toBeVisible()

    const manufacturerMessageBadgeBeforeRead = await readIconBadge(page, 'Mesajlar')
    expect(manufacturerMessageBadgeBeforeRead).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Okundu Isaretle' }).first().click()
    const manufacturerMessageBadgeAfterRead = await readIconBadge(page, 'Mesajlar')
    expect(manufacturerMessageBadgeAfterRead).toBeLessThan(manufacturerMessageBadgeBeforeRead)

    await setUser(page, 'BUYER')
    await page.goto('/app/talepler')
    await page.getByRole('button', { name: '+ Yeni Talep Olustur' }).click()
    const requestModal = page.getByRole('region', { name: 'Yeni Talep' })
    const requestId = (await requestModal.locator('input[readonly]').first().inputValue()).trim()
    await requestModal.locator('label:has-text("Talep Basligi") input').fill(requestTitle)
    await requestModal.locator('label:has-text("Urun") input').fill('10 mm Temperli Cam')
    await requestModal.locator('label:has-text("Aciklama") textarea').fill('Mesaj ve bildirim test talebi')
    await requestModal.locator('label:has-text("Bolge") select').selectOption('Marmara')
    await requestModal.locator('label:has-text("Sorumlu") input').fill('Emre Tunali')
    await requestModal.locator('.request-modal-actions .solid-btn').click()

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Yeni talep atamasi' }).first()).toBeVisible()

    await page.goto('/app/talepler')
    await page.locator('table tbody tr', { hasText: requestId }).first().getByRole('button', { name: 'Teklife Donustur' }).click()
    await page.goto('/app/teklifler')
    const manufacturerOfferRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await manufacturerOfferRow.getByRole('button', { name: 'Duzenle' }).click()
    const offerModal = page.getByRole('region', { name: 'Teklif Duzenle' })
    await offerModal.locator('label:has-text("Toplam Tutar") input').fill('TRY 430.000')
    await offerModal.locator('label:has-text("Durum") select').selectOption('Gonderildi')
    await offerModal.locator('.request-modal-actions .solid-btn').click()

    await setUser(page, 'BUYER')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Yeni teklif alindi' }).first()).toBeVisible()

    await page.goto('/app/teklifler')
    const buyerOfferRow = page.locator('table tbody tr', { hasText: `[${requestId}]` }).first()
    await buyerOfferRow.getByRole('button', { name: 'Duzenle' }).click()
    const buyerOfferModal = page.getByRole('region', { name: 'Teklif Duzenle' })
    await buyerOfferModal.locator('label:has-text("Durum") select').selectOption('Onaylandi')
    await buyerOfferModal.locator('.request-modal-actions .solid-btn').click()

    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Siparis olusturuldu' }).first()).toBeVisible()

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/siparisler')
    const orderRow = page.locator('table tbody tr', { hasText: requestId }).first()
    const orderId = (await orderRow.locator('td').first().innerText()).trim()
    await orderRow.getByRole('button', { name: 'Duzenle' }).click()
    const orderModal = page.getByRole('region', { name: 'Siparis Duzenle' })
    await orderModal.locator('label:has-text("Durum") select').selectOption('Uretimde')
    await orderModal.locator('.request-modal-actions .solid-btn').click()

    await setUser(page, 'BUYER')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Siparis uretime alindi' }).first()).toBeVisible()

    await setUser(page, 'MANUFACTURER')
    await page.goto('/app/uretim-takibi')
    const productionRow = page.locator('table tbody tr', { hasText: requestTitle }).first()
    await productionRow.getByRole('button', { name: 'Duzenle' }).click()
    const productionModal = page.getByRole('region', { name: 'Is Emri Duzenle' })
    await productionModal.locator('label:has-text("Durum") select').selectOption('Kesim')
    await productionModal.locator('.request-modal-actions .solid-btn').click()

    await productionRow.getByRole('button', { name: 'Duzenle' }).click()
    const productionCompleteModal = page.getByRole('region', { name: 'Is Emri Duzenle' })
    await productionCompleteModal.locator('label:has-text("Durum") select').selectOption('Tamamlandi')
    await productionCompleteModal.locator('.request-modal-actions .solid-btn').click()

    await page.goto('/app/sevkiyat')
    const shipmentRow = page.locator('table tbody tr', { hasText: orderId }).first()
    await shipmentRow.getByRole('button', { name: 'Duzenle' }).click()
    const shipmentModal = page.getByRole('region', { name: 'Sevkiyat Duzenle' })
    await shipmentModal.locator('label:has-text("Durum") select').selectOption('Yolda')
    await shipmentModal.locator('label:has-text("Arac") input').fill('E2E Arac')
    await shipmentModal.locator('label:has-text("Sofor") input').fill('E2E Sofor')
    await shipmentModal.locator('label:has-text("Plaka") input').fill('34 E2E 99')
    await shipmentModal.locator('label:has-text("Aciklama") textarea').fill('Yolda asamasi')
    await shipmentModal.locator('.request-modal-actions .solid-btn').click()

    await shipmentRow.getByRole('button', { name: 'Duzenle' }).click()
    const shipmentDeliveredModal = page.getByRole('region', { name: 'Sevkiyat Duzenle' })
    await shipmentDeliveredModal.locator('label:has-text("Durum") select').selectOption('Teslim Edildi')
    await shipmentDeliveredModal.locator('.request-modal-actions .solid-btn').click()

    await shipmentRow.getByRole('button', { name: 'Duzenle' }).click()
    const shipmentSecondSaveModal = page.getByRole('region', { name: 'Sevkiyat Duzenle' })
    await shipmentSecondSaveModal.locator('label:has-text("Durum") select').selectOption('Teslim Edildi')
    await shipmentSecondSaveModal.locator('.request-modal-actions .solid-btn').click()

    await setUser(page, 'BUYER')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Uretim durumu guncellendi' }).first()).toBeVisible()
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Uretim tamamlandi' }).first()).toBeVisible()
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Sevkiyat durumu guncellendi' }).first()).toBeVisible()

    const deliveredNotificationRows = page.locator('.request-detail-card', { hasText: `${orderId} siparisi teslim edildi.` })
    await expect(deliveredNotificationRows).toHaveCount(1)

    await setUser(page, 'ADMIN')
    await page.goto('/app/bildirimler')
    await expect(page.locator('.workspace-main .request-detail-card', { hasText: 'Yeni teklif alindi' })).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/app/mesajlar')
    await expect(page.getByRole('button', { name: '+ Yeni Mesaj' })).toBeVisible()
    await page.getByRole('button', { name: '+ Yeni Mesaj' }).click()
    await expect(page.getByRole('region', { name: 'Yeni Mesaj' })).toBeVisible()
    await page.getByRole('region', { name: 'Yeni Mesaj' }).getByRole('button', { name: 'Iptal' }).click()
    await page.mouse.wheel(0, 1200)

    await page.goto('/app/bildirimler')
    await expect(page.locator('.request-detail-card').first()).toBeVisible()
    await page.mouse.wheel(0, 1400)

    await page.getByRole('button', { name: 'Bildirimler' }).click()
    await expect(page.getByRole('region', { name: 'Bildirim Merkezi' })).toBeVisible()
    await page.getByRole('button', { name: 'Mesajlar' }).click()
    await expect(page.getByRole('region', { name: 'Mesajlar' })).toBeVisible()

    expect(consoleIssues, `Console/runtime issues:\n${consoleIssues.join('\n')}`).toEqual([])
    expect(requestFailures, `Failed network requests:\n${requestFailures.join('\n')}`).toEqual([])
  })
})

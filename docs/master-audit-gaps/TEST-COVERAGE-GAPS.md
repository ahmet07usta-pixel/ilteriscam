# Test Coverage Gaps

Tarih: 2026-08-10

## Calistirilan komutlar

| Komut | Sonuc | Gercekte neyi kanitlar |
|---|---|---|
| `node --test src/modules/**/*.test.js` | 168 passed, 0 failed, 0 skipped, 0 todo | Mock servis kurallari ve temporary local storage adapter |
| `npm test` (backend) | 0 test; `No tests configured yet` | Standart test scriptinin no-op oldugunu |
| `npm run lint` (backend) | Passed | TypeScript noEmit/typecheck |
| `npm run lint` (frontend) | Passed | Oxlint static rules |
| Izole `npx playwright test --workers=1` | 45 passed, 1 failed, 3 flaky | Mevcut dist + mocked API UI kontratlari, Chromium |

Aktif LAN server test sunucusu olarak kullanilmadi. Izole preview `127.0.0.1:4178` test sonrasinda kapatildi.

## PASSED

- Backend: 168/168 direct Node test.
- Auth origin/role unit davranisi ve JWT refresh expiry strategy.
- Request/Quotation/Order/Production/Shipment service scope, CAS ve transition unit setleri.
- RequestItem concurrency ve server-owned measurement fields unit seti.
- Calculation engine unit, waste/discount/region/rounding temel kurallari.
- Attachment validation ve local adapter temporary file davranisi.
- Analysis runner lease/idempotency ve provider error unit davranisi.
- Frontend: 45 Playwright testi ilk veya retry sonrasi passed kategorisinde; flaky olanlar bu sayiya dahil edilmeden ayrica tutuldu.
- Backend typecheck ve frontend lint.

## FAILED

1. `quotation-api-integration.spec.ts`
   - Test: request quotation create ve request list refetch.
   - Beklenen: En az iki request-scoped quotation list GET.
   - Gercek: Bir explicit list refetch; POST body ve gorunen yeni row dogru.
   - Kapsam yorumu: Test kontrati ile implementasyon authority sozlesmesi uyumsuz. Urun hatasi veya eski assertion oldugu karara baglanmadi.

## FLAKY

1. `order-api-integration.spec.ts` confirm/cancel local workflow degismemeli.
2. `shipment-api-integration.spec.ts` plan create local workflow degismemeli.
3. `shipment-api-integration.spec.ts` 409 authority refetch local workflow degismemeli.

Uc test retry'da gecti. Koku: login sonrasi static notification seed effect'i ayni `dijitalcam.workflowStore` anahtarini async yazar. Onceki izole kosuda Order flaky degildi; flaky sayisinin 2'den 3'e cikmasi nondeterminism kanitidir.

## SKIPPED

- Backend direct runner: 0.
- Frontend Playwright: 0.
- Source taramasinda `.skip`, `.only` veya `.todo` bulunmadi.

## NOT COVERED

### Gercek entegrasyon

- Playwright testlerinin tumu route interception/mock API kullanir.
- Backend servis testleri Prisma ve servis portlarini mocklar; local storage adapter disinda gercek infrastructure yoktur.
- Gercek Nest HTTP -> guard -> controller -> service -> PostgreSQL integration suite yoktur.
- Transaction rollback, PostgreSQL FK/cascade ve serializable race gercek DB'de otomatik test edilmez.

### Test entrypoint ve CI

- Backend `npm test` test calistirmaz.
- CI workflow, coverage threshold ve sifir-test guard kanitlanmadi.
- Playwright `reuseExistingServer:true` server identity/build freshness kontrol etmez.
- Uc ardarda sifir fail/sifir flaky clean-run kaniti yok.

### Browser ve cihaz

- Config yalniz Chromium Desktop Chrome.
- Edge ayri kanal, Firefox ve WebKit/Safari yok.
- Fiziksel Android/iOS veya ikinci LAN bilgisayari yok.
- Onceki dokuz viewport olcumu runtime geometry scriptidir; tum E2E suite'in dokuz viewport projesinde kosmasi degildir.

### Accessibility

- Axe/WCAG otomasyonu yok.
- Modal initial focus, trap, restore ve screen-reader announcement testi yok.
- Her route keyboard-only tab order ve skip/navigation testi yok.
- Contrast, zoom/reflow ve reduced-motion testi yok.

### Formlar

- Her input icin required/min/max/negative/zero/decimal/long/unicode/special/copy-paste matrisi yok.
- Valid date boundary, timezone/DST, money max precision ve currency policy matrisi yok.
- Cancel/reset ve dirty-form navigation confirmation tum formlarda test edilmez.
- Server 400/409/422 field error'in label/aria association ve first-focus davranisi yok.

### Butonlar ve concurrency

- Tum gorunur butonlarin role + status + owner kombinasyon inventory testi yok.
- Double-click/idempotency gercek API testi yok.
- Iki tab/browser paralel edit/accept/finalize/confirm/transition yok.
- Retry timeout, lost response ve optimistic rollback yok.

### Security

- Uc bagimsiz tenant full IDOR yok.
- JWT tampering/expiry clock boundary ve refresh replay gercek HTTP testi yok.
- Login rate-limit/lockout yok ve test edilemez.
- Recursive sensitive-field response scan tum endpointlerde yok.
- XSS stored/reflected, CSP runtime ve CSRF threat matrisi tamamlanmadi.
- Public bundle secret/credential scan release testinde yok; bu audit P0'yi manuel buldu.

### Files ve AI

- Gercek PDF/JPEG/PNG upload/download DB fixture'i yok.
- Polyglot, macro, malware ve zip bomb policy/fixture yok.
- Concurrent upload, expired capability ve multi-instance capability store yok.
- Gercek AI provider, timeout/retry/cost/PII retention E2E yok.

### Pricing ve cam domain

- Gercek zengin RequestItem + PriceCatalog + Calculation + Quotation E2E yok.
- Temper, lamine, Isicam, Low-E, renk, spacer ve ozel islem golden fixtures yok.
- Tax, nakliye, multiple currency ve rounding boundary golden totals yok.
- Approved measurement edit -> invalidation -> recalculate E2E yok.

### Notification

- Workflow event -> outbox -> Notification -> hedef panel delivery yok.
- Read/unread refresh, ikinci tab ve ikinci cihaz yok.
- Duplicate event, ordering, retry ve dead-letter yok.

### Performance

- Yetkili Request/Quotation/Order/Notification API p50/p95/p99 yok.
- Response byte budget ve serialization maliyeti yok.
- SQL query count/N+1 instrumentation yok.
- 100/1,000/10,000 gercek DB row testleri yok.
- Soak, concurrent user ve attachment bandwidth testi yok.
- Mevcut health `p95 22.30ms` sonucu is endpointi kapasitesi sayilmaz.

## Coverage kanit seviyeleri

| Domain | Unit/mock | UI mock | Gercek API | Gercek DB | Cross-panel real | Release sonucu |
|---|---|---|---|---|---|---|
| Auth | KISMEN | KISMEN | Onceki login | Membership read | KISMEN | BASARISIZ |
| Request | Guclu | Guclu | Controlled | 1 record | Eksen -> Nova | KISMEN |
| RequestItem | Guclu | Guclu | Yok | 0 | Yok | KANITLANMADI |
| Attachment | Guclu | Guclu | Yok | 0 | Yok | KANITLANMADI |
| Analysis | Guclu | Guclu | Yok | 0 | Yok | KANITLANMADI |
| Pricing/Calculation | Guclu | Guclu | Yok | 0 | Yok | KANITLANMADI |
| Quotation | Guclu | 1 fail | Controlled legacy | 1 record | Evet | KISMEN |
| Order | Guclu | 1 flaky | Controlled | 1 record | Evet | KISMEN |
| Production | Guclu | Passed | Controlled | 1 record | Evet | KISMEN |
| Shipment | Guclu | 2 flaky | Controlled | 1 record | Evet | KISMEN |
| Notification | Cok sinirli | Local-only | Yok | 0 | Yok | BASARISIZ |
| Tenant IDOR | Mock/unit | Mock | Sinirli random ID | 2 bagli company | Yok | KANITLANMADI |

## Test kalite karari

Mevcut testler degerli servis kurallarini ve frontend kontratlarini korur; ancak release certification degildir. Flaky testler passed kabul edilmedi. Standart backend test entrypointi duzelmeden, public bundle credential gate eklenmeden, real HTTP/DB suite ve independent tenant/browser/load katmanlari kurulmadan test paketi canli kabul kapisi olamaz.
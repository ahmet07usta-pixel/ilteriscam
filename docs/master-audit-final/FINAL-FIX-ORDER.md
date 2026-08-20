# Final Fix Order

Tarih: 2026-08-10

Bu belge uygulama emri degildir. Denetim sirasinda kod, veri, credential veya konfigurasyon degisikligi yapilmadi.

## Faz 0 - P0 olay mudahalesi

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Public artifact credential olayi ac, etkilenen hesaplari ve session'lari rotate/revoke et | Eski credential login/refresh yapamaz | FAIL |
| 2 | Demo credential materyalini source ve deploy bundle'dan kaldir | Bundle/source scan temiz | FAIL |
| 3 | Supheli auth/audit olaylarini deger sizdirmadan incele | Incident kaydi kapanir | NOT COVERED |
| 4 | Secret ve known-credential scan'i release gate yap | CI failure kaniti | NOT COVERED |

## Faz 1 - Auth, identity ve LAN

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Tum User response'larini public DTO allowlist'e al | Hash/secret response yok | FAIL |
| 2 | Login throttling/backoff ve auditli lockout ekle | Abuse testleri gecer | FAIL |
| 3 | Cookie-only, per-session rotation/reuse detection tasarla | Coklu cihaz izolasyonu gecer | FAIL |
| 4 | LAN cookie/CORS/dist API environment profilini duzelt | F5, direct URL, yeni tab gecer | FAIL |
| 5 | Forgot/reset lifecycle'i implemente et veya route'u kaldir | Enumeration-safe E2E gecer | FAIL |
| 6 | Nova/Eksen buyer-producer kararini urun sahibiyle kesinlestir | DB, UI ve kabul fixture'i ayni | FAIL |

## Faz 2 - Test ve release gate

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Backend `npm test` komutunu gercek runner'a bagla | 168+ test standart komutla gecer | FAIL |
| 2 | Playwright benzersiz port, server fingerprint ve fresh build kullansin | Yanlis server reuse edilemez | FAIL |
| 3 | Quotation authority/refetch kontratini tanimla | Kalici fail kapanir | FAIL |
| 4 | Notification seed ile workflowStore test yarisini ayir | Uc temiz kosu 0 flaky | FAIL |
| 5 | CI'da lint/type/test/secret/bundle gate kur | Pipeline executable | NOT COVERED |

## Faz 3 - Authoritative shared product

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Dashboard, pricing, profile, company, settings ve reports icin backend owner/API belirle | Iki browser ayni veriyi gorur | FAIL |
| 2 | Mesaj ve notification UI'yi durable event kaynagina bagla | Event, audience, read state senkron | FAIL |
| 3 | Notification User/Company FK, event key, read receipt ve delivery attempt ekle | Orphan/duplicate negatifleri gecer | FAIL |
| 4 | Transactional outbox ve audit correlation ekle | Tek mutation tek event/audit | FAIL |
| 5 | Imzasiz local role/user trust'ini kaldir | UI session backend ile dogrulanir | FAIL |

## Faz 4 - Cam, olcu ve fiyat butunlugu

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Typed cam kompozisyonu ve islem semantigi modelle | Golden recipe round-trip | FAIL |
| 2 | Catalog matching typed variantlari kullansin | Variant dogru catalog item secer | FAIL |
| 3 | Item editinde approved measurement lineage invalidate/recalculate et | Stale olcu fiyat uretemez | FAIL |
| 4 | Vergi, nakliye, currency ve rounding policy tanimla | UI/API/DB golden total ayni | FAIL |
| 5 | Calculation snapshot girdilerini UI'da goster | Kullanici sonucu denetler | FAIL |

## Faz 5 - Security ve tenant sertifikasi

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Iki buyer ve iki producer bagimsiz tenant fixture'i kur | Full known-ID IDOR matrisi | NOT COVERED |
| 2 | List/detail/nested/download/mutation scope testleri calistir | Yetkisiz istek 403/404 | NOT COVERED |
| 3 | Malware scan ve karantina lifecycle'i ekle | Malicious fixture AVAILABLE olmaz | FAIL |
| 4 | Swagger environment gate ve secret strength policy ekle | Production profile sert | FAIL |
| 5 | Company inactive/membership revoke davranisini sertifikala | Tum resource erisimi kapanir | NOT COVERED |

## Faz 6 - Scale, resilience ve recovery

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Cursor pagination ve server-side filter/search/sort | 10k row bounded response | FAIL |
| 2 | Business endpoint p50/p95/p99 ve payload budget | Tanimli SLO gecer | NOT COVERED |
| 3 | SQL query-count/N+1 instrumentation | Query budget gecer | NOT COVERED |
| 4 | Slow LAN ve servis outage/recovery testleri | Veri kaybi olmadan recovery | NOT COVERED |
| 5 | Backup restore ve migration rollback tatbikati | RPO/RTO kaniti | NOT COVERED |

## Faz 7 - UX, accessibility ve responsive

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Role/status/owner aksiyon gating envanteri | Gecersiz aksiyon yok | FAIL |
| 2 | Dialog role, aria-modal, focus trap/return ve required semantics | Keyboard/axe temiz | FAIL |
| 3 | Pricing/profile document overflow ve touch hedeflerini duzelt | 320-1440 matris temiz | FAIL |
| 4 | Her form boundary/unicode/error/reset/cancel matrisi | Tum alan testleri gecer | NOT COVERED |
| 5 | Chromium, Edge, Firefox ve WebKit projelerini calistir | 0 failed/flaky | NOT COVERED |

## Faz 8 - Son acceptance

| Sira | Is | Kabul kapisi | Mevcut |
|---:|---|---|---|
| 1 | Onayli identity ile yeni izole Request baslat | Dogru buyer/producer | BLOCKED |
| 2 | Rich item, attachment, AI review ve golden calculation ekle | Full lineage | BLOCKED |
| 3 | Request -> Delivery zincirini UI/API/DB/panel/notification ile tamamla | Her adim `PASS` | BLOCKED |
| 4 | F5/direct URL/ikinci cihaz/viewport/browser tekrarlarini yap | Session ve UX `PASS` | BLOCKED |
| 5 | P0/P1 ve release bosluklarini yeniden denetle | P0=0, P1=0, 0 failed/flaky | FAIL |

## Degistirilmemesi gereken kanitli alanlar

| Alan | Durum |
|---|---|
| Request/Quotation/Order/Production/Shipment relation sirasi | PASS |
| Version/CAS transition kurallari | PASS |
| Quotation accept ile tek Order olusumu | PASS |
| Production order uniqueness | PASS |
| Shipment production/order uniqueness | PASS |
| Calculation input hash/serializable finalize/active lock | PASS |
| Attachment ownership, key, MIME, magic, checksum ve size kontrolleri | PASS |
| Analysis lease/idempotency ve review-oncesi canonical koruma | PASS |

Mevcut karar: **CANLI KULLANIMA HAZIR DEGIL**.
# Data Integrity Full Audit

Tarih: 2026-08-10

## Authoritative veri envanteri

| Model | Kayit | Durum | Yorum |
|---|---:|---|---|
| User | 4 | PASS | Credential degerleri raporlanmadi |
| Company | 2 | PASS | Eksen ve Nova |
| CompanyUserMembership | 2 | PASS | ACTIVE OWNER |
| Request / RequestRecipient | 1 / 1 | PASS | Eksen -> Nova controlled routing |
| RequestItem | 0 | BLOCKED | Cam/olcu positive E2E yok |
| Attachment | 0 | BLOCKED | File positive E2E yok |
| AnalysisJob/Result | 0 | BLOCKED | Provider/review lifecycle yok |
| PriceCatalogItem | 0 | BLOCKED | Authoritative pricing fixture'i yok |
| QuotationCalculation/Item | 0 | BLOCKED | Legacy teklif; calculation yok |
| Quotation / Order / Production / Shipment | 1 / 1 / 1 / 1 | PASS | Controlled relation chain |
| Notification | 0 | FAIL | UI bildirimlerine karsilik durable row yok |
| AuditLog | Mevcut | PASS | Salt-okunur sayim; core context eksigi ayri bulgu |

Kayit sayilari onceki read-only DB kanitina dayanir. Bu final fazda yeni login veya DB mutation yapilmadi.

## Kimlik ve tenant relation'i

| Kullanici | Backend/UI rol | Membership | Durum |
|---|---|---|---|
| Selin | SALES / BUYER | Eksen / OWNER / ACTIVE | PASS |
| Emre | PRODUCER / MANUFACTURER | Nova / OWNER / ACTIVE | PASS |
| Istenen Nova Alici | Mevcut degil | Mevcut degil | FAIL |
| Istenen Eksen Uretici | Mevcut degil | Mevcut degil | FAIL |
| Bagimsiz ucuncu tenant | Fixture yok | Fixture yok | NOT COVERED |

DB kendi mevcut kimlikleri icinde tutarlidir; kabul metnindeki kimlik yonuyle tutarli degildir.

## Relation ve constraint matrisi

| Model | Koruma | Durum | Acik risk |
|---|---|---|---|
| Membership | Company/user FK ve unique pair | PASS | Yalniz iki relation; IDOR fixture'i yok |
| Request | Buyer company, creator, region, indexes | PASS | Unbounded list; rich glass yok |
| RequestRecipient | Request/producer unique, audit/index | PASS | Owner detail recipient'i gizliyor |
| RequestItem | Line unique, CAS, measurement state | PASS | Approved edit invalidation eksik |
| Attachment | Scope, size, MIME, magic, checksum, random key, CAS | PASS | Malware scan yok |
| Analysis | Idempotency ve lease kurallari | PASS | Gercek provider/DB lifecycle `BLOCKED` |
| PriceCatalog | Version ve active selection | PASS | Variant option matching eksik |
| Calculation | Input hash, serializable finalize, active lock | PASS | Tax sifir; stale measurement riski |
| Quotation | Request/producer unique, CAS | PASS | Calculation olmadan legacy accept mumkun |
| Order | Request/quotation/parties | PASS | Product line lineage zayif |
| Production | `orderId` unique, CAS | PASS | Parallel real DB test `BLOCKED` |
| Shipment | `productionId` ve `orderId` unique, CAS | PASS | Parallel real DB test `BLOCKED` |
| Notification | Status ve nullable userId | FAIL | FK, audience, event key, read state yok |
| AuditLog | Actor/resource indexes | PASS | Business IP/user-agent/correlation yok |

## Cam ve ticari veri

| Alan | Authoritative model | Hesap davranisi | Durum |
|---|---|---|---|
| Product type/code | Generic RequestItem string | Catalog match girdisi | PASS |
| Olcu/adet/kalinlik | Decimal alanlar | Approved item gerekir | BLOCKED |
| Katman/kompozisyon | Yok | Kullanilmiyor | FAIL |
| Low-E/kaplama/renk | Yok | Product code'a birakilmis | FAIL |
| Spacer/gaz | Yok | Kullanilmiyor | FAIL |
| Temper/lamine/Isicam semantics | First-class degil | Generic string | FAIL |
| Kenar/rodaj/CNC/delik | Yok | Kullanilmiyor | FAIL |
| m2/m/m3 | Derived alanlar | Unit test kaniti | BLOCKED |
| Fire/bolge/indirim | Engine/catalog | Unit test kaniti | PASS |
| Vergi | Alan var | Sabit sifir | FAIL |
| Nakliye fiyat kalemi | Yok | Shipment metadata ayri | FAIL |
| Currency | String validation | FX conversion yok | NOT COVERED |
| Rounding | 2 decimal engine | Gercek DB golden fixture yok | BLOCKED |

## State ayrisma noktalari

| Ayrisma | Durum |
|---|---|
| Dashboard ve yonetim yuzeyleri ile PostgreSQL | FAIL |
| UI notification/read state ile Notification tablosu | FAIL |
| Owner detail ile RequestRecipient relation'i | FAIL |
| Approved measurement ile sonraki RequestItem edit | FAIL |
| Legacy Quotation total ile item/calculation lineage | FAIL |
| Frontend demo company isimleri ile authoritative Company | FAIL |

## Integrity test bosluklari

| Test | Durum |
|---|---|
| FK cascade/restrict real DB matrix | NOT COVERED |
| Company inactive/suspended access | NOT COVERED |
| Retention/deactivate policy | NOT COVERED |
| Decimal boundary/golden totals | BLOCKED |
| Timezone/deadline boundary | NOT COVERED |
| Backup restore | NOT COVERED |
| Migration rollback | NOT COVERED |
| Parallel CAS/double create real DB | BLOCKED |

Veri karari: core relation omurgasi `PASS`; ticari cam, calculation, notification ve shared-state butunlugu canli kabul icin `FAIL` veya `BLOCKED`.

Sonuc: **CANLI KULLANIMA HAZIR DEGIL**.
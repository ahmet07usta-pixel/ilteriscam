# Data Integrity Matrix

Tarih: 2026-08-10

## Mevcut PostgreSQL envanteri

| Model | Kayit | Kanit yorumu |
|---|---:|---|
| User | 4 | 2 Admin, 1 Producer, 1 Sales; credential degerleri raporlanmadi |
| Company | 2 | Eksen Cam Sanayi ve Nova Cephe Sistemleri |
| CompanyUserMembership | 2 | Ikisi de ACTIVE OWNER |
| Request | 1 | Controlled chain |
| RequestRecipient | 1 | Eksen Request -> Nova recipient |
| RequestItem | 0 | Cam/olcu positive E2E yok |
| Attachment | 0 | File positive E2E yok |
| Quotation | 1 | Legacy/hesaplamasiz |
| QuotationCalculation | 0 | Pricing positive E2E yok |
| Order | 1 | Controlled chain |
| Production | 1 | Controlled chain |
| Shipment | 1 | Controlled chain |
| Notification | 0 | Durable event/delivery kaniti yok |
| AuditLog | 239 | Denetim basindaki read-only sayim; icerik/secret raporlanmadi |

## Kimlik ve firma relation'i

| Kullanici | Backend rol | Membership | Company type | UI role | Sonuc |
|---|---|---|---|---|---|
| Selin Kaya | SALES | Eksen Cam Sanayi / OWNER / ACTIVE | OTHER | BUYER | DB kendi icinde tutarli; istenen Nova Alici kimligine aykiri |
| Emre Tunali | PRODUCER | Nova Cephe Sistemleri / OWNER / ACTIVE | GLASS_PRODUCER | MANUFACTURER | DB kendi icinde tutarli; istenen Eksen Uretici kimligine aykiri |

## Model relation matrisi

| Model | Authoritative bag | Constraint/scope kaniti | Acik risk veya eksik kanit |
|---|---|---|---|
| User | Membership -> Company | FK ve unique membership | Raw User response hash exposure; bundled active credential P0 |
| Company | Region, memberships | Tenant list own membership; admin global | UI firma/profil local; istenen Nova Cam adi yok |
| CompanyMembership | Company + User | Unique company/user, ACTIVE scope | Yalniz 2 relation; bagimsiz tenant yok |
| Request | Buyer Company + creator + region | Company/status index, scoped reads | Unbounded list; zengin cam semantigi yok |
| RequestRecipient | Request + Producer Company | Unique request/company; update audit var | Owner detail scope recipient'i gizliyor; createdBy first-class degil |
| RequestItem | Request + source analysis | Line unique, CAS, measurement status | Kayit 0; approved edit invalidation eksik |
| Attachment | Request + optional item + uploader | Scope, size/MIME/magic/checksum, soft delete | Kayit 0; malware scan yok |
| AnalysisJob | Request/item/attachment | Idempotency unique, lease indexes | Gercek provider ve DB lifecycle yok |
| AnalysisResult | Job + detected measurements | Version unique, review state | Measurement lineage real fixture ile yok |
| MeasurementReview | Result + item + reviewer | Unique result/item | Review/cascade/retention operational policy kanitlanmadi |
| PriceCatalogItem | Company + regional adjustments | Version unique, ACTIVE select | Kayit 0; variant option matching yok; UI local |
| QuotationCalculation | Quotation + Request + items | Input hash/version unique, serializable finalize | Kayit 0; tax sifir; stale item invalidation yok |
| QuotationItem | Calculation + optional item/catalog | Snapshot ve line unique | Analysis/review origin first-class FK degil |
| Quotation | Request + buyer + producer | Unique request/producer, CAS | Legacy total calculation olmadan kabul edilebilir |
| Order | Request + Quotation + parties | Relation ve single accepted path | State downstream completionle aggregate olmuyor; urun satiri izi yok |
| Production | Unique Order + producer | `orderId @unique`, CAS transition | Notification yok; real parallel test yok |
| Shipment | Unique Production + unique Order | `productionId/orderId @unique`, CAS | Notification yok; testler flaky |
| Notification | Nullable userId string | Yalniz userId/status index | User FK, audience, event key, read state yok |
| AuditLog | Optional actor FK | Actor SET NULL; resource indexes | Core operations IP/userAgent/correlation tasimiyor |

## Ticari veri butunlugu

| Alan | Authoritative model | Hesapta kullaniliyor | UI'da gorunuyor | Sonuc |
|---|---|---|---|---|
| Cam tipi/productType | Generic string | Catalog match | Evet | KISMEN |
| Kalinlik | RequestItem decimal | Snapshot | Kismen | Gercek fixture yok |
| Katman/kompozisyon | Yok | Hayir | Local katalog metni | BASARISIZ |
| Spacer/gaz | Yok | Hayir | Local metin | BASARISIZ |
| Renk/kaplama/Low-E | Yok | Hayir | Local katalog | BASARISIZ |
| Temper/lamine/Isicam semantigi | Yok | Hayir | Product string | BASARISIZ |
| Ozel islem/kenar/CNC/delik | Yok | Hayir | Kismen local | BASARISIZ |
| Olcu/adet | Decimal alanlar | Approved item gerekli | Evet | KANITLANMADI: 0 item |
| m2/m/m3 | Derived decimal | Engine basis | Snapshot UI eksik | KANITLANMADI: 0 calculation |
| Fire | Price catalog | Engine | Kismen | Unit test only |
| Bolge ayari | Catalog relation | Engine | Kismen | Unit test only |
| Indirim | Engine input | Evet | Kismen | Policy/authority kanitlanmadi |
| Vergi | Alan var | Sabit 0 | Kismen | BASARISIZ |
| Nakliye | First-class fiyat kalemi yok | Hayir | Shipment metadata ayri | BASARISIZ/KANITLANMADI |
| Para birimi | String/DTO regex | Toplamda tasinir | Evet | FX conversion yok; gereksinim kanitlanmadi |
| Yuvarlama | Money 2 decimal | Engine unit test | Iz sinirli | KISMEN |

## State ve database ayrisma noktalari

1. Dashboard, pricing, profile, company, report, settings, message ve UI notification local/static; PostgreSQL ile esitlik garantisi yok.
2. Login access token memory-only; local auth display ile backend session reload sonrasinda ayrisiyor.
3. Notification UI read keys browser-local; Notification tablosu ve cihazlar arasi state ile bag yok.
4. Request owner recipient relation'i DB'de var fakat scoped detail response/UI'da kayboluyor.
5. Approved RequestItem editinde measurement lineage invalidate edilmedigi icin item, snapshot ve fiyat ayrisabilir.
6. Legacy Quotation amount'i item/calculation olmadan Order'a tasinabilir.
7. Frontend static isimler authoritative Company relation'iyle ayni kelimeleri kullandigi icin demo ve gercek kayit kullanici tarafindan ayirt edilemez.

## Kanitlanmayan veri davranislari

- FK cascade/restrict davranislarinin gercek DB negatif matrisi.
- Company SUSPENDED/INACTIVE iken mevcut workflow erisimi.
- User veya Company silme/deactivate retention politikasi.
- Notification orphan ve duplicate davranisi.
- Decimal boundary ve PostgreSQL rounding golden totals.
- Timezone ve tarih siniri; Region timezone'in deadline/sevkiyata etkisi.
- Buyuk JSON metadata/payload limitleri ve PII retention.
- Backup restore, migration rollback ve disaster recovery.
# Master Audit Gaps

Tarih: 2026-08-10

Ortam: Development LAN frontend `192.168.110.20:4176`, API `192.168.110.20:4000/api/v1`, PostgreSQL `platform_core`, Redis ve izole frontend preview `127.0.0.1:4178`.

## Denetim siniri

- Uygulama kodu, schema, migration, seed ve mevcut is verileri degistirilmedi.
- Yeni login yapilmadi; login refresh hash ve audit kaydi yazacagi icin mutation sayildi.
- PostgreSQL sorgulari yalniz `count`, `findMany` ve credential degeri yazdirmayan boolean kontrollerdi.
- Playwright testleri mock API ve browser-local fixture kullanan mevcut `dist` uzerinde calistirildi.
- Production'a erisilmedi.
- Parola, hash, token, cookie degeri ve secret bu rapora alinmadi.

## Onceki denetimden farki

Bu rapor `AUD-001` - `AUD-V2-030` bulgularini yeniden adlandirmaz. Asagidaki kayitlar onceki denetimin disinda kalan yeni riskleri veya yeterli kaniti olmayan kabul alanlarini gosterir. Onceki acik P1/P2 bulgulari halen gecerlidir.

## Yeni bulgular

### GAP-001 - Aktif hesap credential'i public frontend bundle icinde

- Oncelik: P0
- Nerede: `apps/web/src/shared/data/auth.ts`, Ayarlar kullanici listesi ve mevcut `apps/web/dist` bundle.
- Nasil tekrar uretilir: Kaynaktaki `demoUsers` sabitlerinin Ayarlar sayfasinda import edildigi gorulur. Mevcut bundle icinde uc demo kimligi ve ortak parola literalinin varligi boolean olarak kontrol edilir. PostgreSQL User hashleri, degerleri yazdirilmadan bu literal ile bcrypt karsilastirilir.
- Beklenen: Frontend source ve deploy bundle hicbir calisan hesap parolasi tasimamalidir. Demo kimlikleri gercek hesaplarla eslesmemelidir.
- Gerceklesen: Bundle uc demo kullanici kimligini ve parola literalini iceriyor. Literal aktif ADMIN, PRODUCER ve SALES hesaplarinin ucunde de gecerli.
- Kanit: Bundle kontrolleri `demoUserIds=[true,true,true]`, `demoEmails=[true,true,true]`, `demoPasswordLiteral=true`; DB karsilastirmasi uc aktif rol icin `matchesBundledDemoPassword=true`.
- Kullanici etkisi: Frontend bundle'a erisebilen biri uc panelin calisan hesap credential'ini elde edebilir; tenant verisi, is akisi ve yonetim fonksiyonlari risk altindadir.
- Etkilenen moduller: Auth, Admin, Alici, Uretici, tum authoritative workflow, audit ve dosya erisimi.
- Cozum onerisi: Ayrica onaylanacak acil olay mudahalesinde hesaplari rotate/revoke et; frontend sabitlerini kaldir; demo veriyi production build'den ayir; secret scanning ve bundle regression gate ekle.
- Test edildi mi: Evet, salt-okunur source/bundle incelemesi ve hash degeri aciga cikarmayan bcrypt boolean karsilastirmasi ile.

### GAP-002 - Istenen Alici/Uretici kimlik matrisi mevcut authoritative veride yok

- Oncelik: P1
- Nerede: PostgreSQL User, Company ve CompanyUserMembership; frontend demo auth ve static workflow verileri.
- Nasil tekrar uretilir: Company membership relation'lari credential alanlari alinmadan okunur ve kullanicinin verdigi kabul kimligiyle karsilastirilir.
- Beklenen: Alici firmasi `Nova Cam Cephe Sistemleri`, Uretici firmasi `Eksen Cam Sanayi` olmali.
- Gerceklesen: SALES/Selin `Eksen Cam Sanayi`; PRODUCER/Emre `Nova Cephe Sistemleri`. DB'de `Nova Cam Cephe Sistemleri` adli firma yok. Frontend demo auth ve onceki raporlar da mevcut ters eslesmeyi kullaniyor.
- Kanit: DB'de 2 Company ve 2 ACTIVE OWNER membership; yukaridaki iki relation. Kaynakta demo Buyer Eksen, demo Manufacturer Nova.
- Kullanici etkisi: Talep edilen gercek hayat senaryosu bu veriyle baslatilamaz; hangi firmanin alici/uretici oldugu kabul dokumaniyla sistem arasinda belirsizdir.
- Etkilenen moduller: Profil, RequestRecipient, Quotation, Order, Production, Shipment, Notification ve tenant testleri.
- Cozum onerisi: Duzeltme fazindan once urun sahibi authoritative kimlik matrisini onaylamali; veri degisikligi ayrica migration/fixture planiyla yapilmali.
- Test edildi mi: Evet, DB ve kaynak karsilastirmasi. Kullanici tarafindan istenen eslesme mevcut olmadigi icin UI E2E kanitlanmadi.

### GAP-003 - Sifre kurtarma ekrani islevsiz

- Oncelik: P1
- Nerede: `/forgot-password`, `ForgotPasswordPage`, backend auth controller.
- Nasil tekrar uretilir: Forgot-password route acilir; form ve backend route'lari incelenir. Gecersiz e-posta ile native validation network mutation olmadan kontrol edilir.
- Beklenen: Gecerli e-posta submit'i kontrollu reset istegi olusturmali, kullaniciya enumeration-safe sonuc vermeli ve token lifecycle'i backend'de bulunmali.
- Gerceklesen: Formda `onSubmit` yok; backend'de forgot/reset endpointi yok. Ekran baglanti gonderecegini soyluyor fakat bunu yapacak entegrasyon bulunmuyor.
- Kanit: Runtime gecersiz formatta native email validation ve sifir network istegi; source ve backend route aramasinda reset implementasyonu yok.
- Kullanici etkisi: Parolasini unutan kullanici hesaba geri donemez; operasyon teknik ekip destegine bagimli kalir.
- Etkilenen moduller: Auth, onboarding, support ve hesap guvenligi.
- Cozum onerisi: Enumeration-safe request, tek kullanimlik kisa omurlu token, rate limit, revoke ve audit tasarimi yap.
- Test edildi mi: Kismen. Bos/gecersiz UI davranisi test edildi; gercek reset akisi implementasyon olmadigi icin test edilemedi.

### GAP-004 - Liste endpointleri server-side pagination, search, filter ve sort sunmuyor

- Oncelik: P2
- Nerede: Request, Quotation, Order, Production, Shipment, RequestItem, Attachment, Analysis, Company, Membership, Region ve User list servisleri.
- Nasil tekrar uretilir: Servis `findMany` cagrilarinda `skip`, `cursor` veya `take` aranir; controller query DTO'lari incelenir.
- Beklenen: Hacimli operasyon listeleri sinirli, deterministik cursor/page ve server-side search/filter/sort kontrati kullanmali.
- Gerceklesen: Audit ve Notification yalniz `limit` kullanir; ana listeler unbounded `findMany` doner. Frontend filtrelerinin cogu tum response uzerinde client-side calisir.
- Kanit: 14 servis dosyasinda 55 `findMany/orderBy` eslesmesi; audit/notification disinda pagination parametresi yok.
- Kullanici etkisi: Veri buyudukce response, serialization, browser memory ve render maliyeti sinirsiz artabilir. Mevcut tek kayitli DB hiz kaniti kapasite kaniti degildir.
- Etkilenen moduller: Tum liste ekranlari, API performansi, PostgreSQL ve LAN kullanim.
- Cozum onerisi: Kaynak bazli cursor pagination, allowlist filter/sort ve payload budget tanimla.
- Test edildi mi: Kodla evet; gercek hacim ve latency testi fixture olmadigi icin kanitlanmadi.

### GAP-005 - Standart backend test komutu sifir test calistiriyor

- Oncelik: P2
- Nerede: `apps/platform-core-api/package.json`.
- Nasil tekrar uretilir: `npm test` calistirilir.
- Beklenen: Standart test scripti mevcut servis testlerini calistirmali ve failure'da non-zero donmeli.
- Gerceklesen: Komut yalniz `No tests configured yet` yazip basarili cikiyor. Gercek 168 test ancak ayrica `node --test src/modules/**/*.test.js` ile calisiyor.
- Kanit: `npm test` no-op; dogrudan runner `168 pass, 0 fail, 0 skipped, 0 todo`.
- Kullanici etkisi: CI veya gelistirici sifir test calistirip yanlis yesil sonuc alabilir.
- Etkilenen moduller: Tum backend release guvencesi.
- Cozum onerisi: Standart scripti gercek runner'a bagla ve sifir test durumunu fail ettir.
- Test edildi mi: Evet.

### GAP-006 - Frontend E2E paketi deterministik degil ve flaky sayisi kosuya gore degisiyor

- Oncelik: P2
- Nerede: Quotation, Order ve Shipment Playwright testleri; `App.tsx` notification seed/localStorage effect'i.
- Nasil tekrar uretilir: Izole preview'da `npx playwright test --workers=1` calistirilir.
- Beklenen: Uc ardarda temiz kosuda sifir fail ve sifir flaky.
- Gerceklesen: Bu kosu `45 passed, 1 failed, 3 flaky`. Onceki izole kosu `46 passed, 1 failed, 2 flaky` idi. Quotation refetch assertion'i kalici fail; Order ve iki Shipment testi retry ile gecti.
- Kanit: Quotation testi iki liste GET bekliyor, create akisi bir explicit refetch yapiyor. Login sonrasi notification seed effect'i ayni `dijitalcam.workflowStore` anahtarini yaziyor ve local-state-degismedi assertion'lariyla yarisiyor.
- Kullanici etkisi: Retry gercek regression'i gizleyebilir; release sonucu kosudan kosuya degisir.
- Etkilenen moduller: Frontend CI, Quotation authoritative refresh, Order/Shipment regression guvencesi.
- Cozum onerisi: Refetch kontratini tanimla; seed state'i test/authoritative store'dan ayir; retry ile gecen testi passed saymayan release gate kur.
- Test edildi mi: Evet, iki farkli izole kosu kanitiyla.

### GAP-007 - Backend Notification modeli teslimat ve kullanici butunlugunu tamamlamiyor

- Oncelik: P2
- Nerede: Notification schema, controller ve service.
- Nasil tekrar uretilir: Notification relation, queue/list ve publisher akisi incelenir.
- Beklenen: Notification kaydi gecerli user/company/audience FK'sine, stable event key'e, read/unread durumuna, delivery retry/idempotency ve actor scope'a sahip olmali.
- Gerceklesen: `userId` nullable String ve User foreign key'i yok. Status yalniz PENDING/SENT/FAILED; read endpointi yok. Queue once DB kaydi olusturup sonra publisher cagiriyor; event key/unique idempotency yok. Liste notifications-manage icin globaldir.
- Kanit: Prisma schema ve `NotificationsService.queue/list`; frontend notification API client'i yok.
- Kullanici etkisi: Orphan, duplicate veya teslim edilmemis bildirim; cihazlar arasi unread state kurulamamasi; hedef kitle izinin kaybi.
- Etkilenen moduller: Tum workflow eventleri, header badge, Bildirimler ve audit.
- Cozum onerisi: Transactional outbox, audience relation, user/company FK, event key, delivery attempts ve read receipt modeli.
- Test edildi mi: Kodla evet; Notification tablosu bos oldugu icin gercek pozitif teslimat kanitlanmadi.

### GAP-008 - Backend yonetim API'leri ile gorunen UI ayni urun yuzeyi degil

- Oncelik: P2
- Nerede: Companies, Memberships, Regions, Users, Audit, Notifications ve Gateway backend controller'lari; frontend shared API klasoru ve local yonetim sayfalari.
- Nasil tekrar uretilir: 19 backend controller ile frontend API client/call-site envanteri karsilastirilir.
- Beklenen: Gorunen firma/kullanici/bildirim/ayar islemleri authoritative endpointlere bagli olmali; sahipsiz endpointler dokumante edilmeli.
- Gerceklesen: Frontend API klasoru yalniz core workflow, items, files, analysis ve calculation istemcilerini icerir. Login membership icin `/companies` dogrudan auth katmanindan kullanilir; yonetim ekranlari ise local/static kalir. Regions, memberships, users, audit, notifications ve gateway icin urun UI istemcisi yok.
- Kanit: Frontend API dosya listesi ve call-site aramasi; backend 19 controller envanteri.
- Kullanici etkisi: Backend capability varligi UI fonksiyonunun calistigini kanitlamaz; ayni kavram iki farkli veri kaynaginda farkli gorunebilir.
- Etkilenen moduller: Admin yonetimi, firma profili, ayarlar, bildirim ve audit gorunurlugu.
- Cozum onerisi: Her endpoint icin owner/UI/consumer karari; local demo yuzeylerini ayir; authoritative kontrat matrisi kur.
- Test edildi mi: Kodla evet; endpointlerin urun gereksinimi sahibi kanitlanmadi.

### GAP-009 - Islem auditleri request IP ve user-agent baglamini tasimiyor

- Oncelik: P3
- Nerede: AuditService ve core workflow servisleri.
- Nasil tekrar uretilir: Audit record payloadlari karsilastirilir.
- Beklenen: Kritik create/accept/confirm/transition olaylari correlation ve istemci baglamiyla izlenebilir olmali.
- Gerceklesen: Audit modeli IP/userAgent kabul ediyor ve auth olaylari bunlari tasiyor; core business servisleri actor/resource/status kaydederken HTTP baglamini tasimiyor.
- Kanit: Auth controller/service ile Request/Quotation/Order/Production/Shipment audit cagri farki.
- Kullanici etkisi: Olay mudahalesinde ayni kullanicinin hangi istemci veya agdan islem yaptigi ayirt edilemez.
- Etkilenen moduller: Audit, security investigation ve dispute resolution.
- Cozum onerisi: Request correlation context'ini servis sinirina guvenli metadata olarak aktar.
- Test edildi mi: Kodla evet; operasyonel audit gereksinimi urun sahibi tarafindan kanitlanmadi.

### GAP-010 - Swagger ve secret kalite kapilari environment'a gore sertlestirilmemis

- Oncelik: P3
- Nerede: `main.ts`, `env.validation.ts`.
- Nasil tekrar uretilir: Bootstrap ve environment validator incelenir.
- Beklenen: API docs production'da kapali veya ayrica yetkili; JWT secret'lari minimum entropy/uzunluk politikasina tabi olmali.
- Gerceklesen: Swagger `/docs` her environment'ta kosulsuz kurulur. JWT secret validator yalniz string olmasini ister.
- Kanit: Bootstrap ve validation source.
- Kullanici etkisi: Production yanlis konfigurasyonunda endpoint kesfi kolaylasir ve zayif secret kabul edilebilir.
- Etkilenen moduller: Deployment ve auth.
- Cozum onerisi: Environment gate, docs auth ve secret strength validation.
- Test edildi mi: Kodla evet; production ortam konfigurasyonu incelenmedi.

## Onceki rapordan devreden kritik engeller

- `AUD-V2-017`: Raw User response credential hash exposure.
- `AUD-011` ve `AUD-001`: LAN session/cookie ve dist API target.
- `AUD-006`, `AUD-003`, `AUD-012`: local/static yonetim, dashboard ve notification.
- `AUD-V2-018` - `AUD-V2-020`, `AUD-V2-024`: cam semantigi, variant esleme, stale measurement ve vergi.
- `AUD-V2-026`, `AUD-V2-027`: auth rate limit ve malware scan.
- `AUD-014`, `AUD-V2-023`: responsive ve modal accessibility.

## Executable test sonucu

| Paket | PASSED | FAILED | FLAKY | SKIPPED | NOT COVERED |
|---|---:|---:|---:|---:|---|
| Backend direct Node runner | 168 | 0 | 0 | 0 | Gercek DB/API, load, outage |
| Backend `npm test` | 0 | 0 | 0 | 0 | Tum testler; script no-op |
| Frontend izole Chromium | 45 | 1 | 3 | 0 | Firefox, WebKit, Edge, gercek API/DB |
| Backend typecheck | 1 komut | 0 | 0 | 0 | Runtime behavior |
| Frontend lint | 1 komut | 0 | 0 | 0 | Runtime behavior |

## A) Kesin calistigi kanitlananlar

- Backend servis test runner'i 168 testi hatasiz tamamliyor.
- Backend TypeScript typecheck ve frontend oxlint temiz.
- Login ve forgot-password route'lari LAN frontend'de aciliyor.
- Login inputlari label ve native required semantigi tasiyor.
- Global Helmet, credential CORS allowlist ve ValidationPipe bootstrap'ta mevcut.
- User/Company ACTIVE OWNER membership relation'lari DB'de tutarli; ancak istenen taraf isimleriyle uyusmuyor.
- Core Request -> Quotation -> Order -> Production -> Shipment relation zinciri DB'de halen mevcut.

## B) Sorunlu / basarisiz olanlar

- P0 public bundle credential exposure.
- Kullanici tarafindan istenen Alici/Uretici kimligi mevcut authoritative verinin tersi.
- Sifre kurtarma ekrani gercek islem yapmiyor.
- Backend standart test scripti test calistirmiyor.
- Frontend E2E paketi bir kalici fail ve kosuya gore 2-3 flaky uretiyor.
- Liste endpointleri server-side pagination/search/filter/sort sunmuyor.
- Notification lifecycle/user relation/read-state/idempotency eksik.
- Onceki V2 P1/P2 bulgulari kapatilmadi.

## C) Henuz kanitlanmayanlar

- Her panelde her butonun success/error/loading/double-click/DB/other-panel matrisi.
- Her inputun tum boundary, unicode, uzunluk, copy/paste, reset ve cancel matrisi.
- Istenen Nova Alici -> Eksen Uretici gercek E2E senaryosu.
- Uc bagimsiz tenant ile full list/detail/IDOR matrisi.
- Gercek RequestItem + zengin cam + Attachment + Analysis + Calculation + tax zinciri.
- Gercek Notification delivery, read-state, refresh ve ikinci cihaz davranisi.
- Yetkili temel is endpointlerinde API latency, payload budget, N+1 ve load.
- Firefox, WebKit/Safari, Edge ve fiziksel mobil cihazlar.
- Slow network, 500/503, PostgreSQL/Redis/storage outage ve recovery.
- Tum route'larda direct URL/reload/back/forward/expired session kombinasyonu.
- Tum sayfa ve durumlarin 390/768/820/1024/1280/1440 responsive matrisi.
- Production build freshness ve production security configuration.

## Karar

**CANLI KULLANIMA HAZIR DEGIL**

P0 credential exposure tek basina canli kullanimi engeller. Buna ek olarak onceki P1 bulgular aciktir ve istenen firma kimligi ile gercek full-chain fixture mevcut degildir. Bu rapor duzeltme emri degildir; herhangi bir duzeltme baslatilmadi.
# Master Sistem Denetimi V2 Final Raporu

Tarih: 2026-08-10

Ortam: Development, LAN frontend `192.168.110.20:4176`, API `192.168.110.20:4000/api/v1`, PostgreSQL `platform_core`, Redis. Production'a erisilmedi ve uygulama/veri degisikligi yapilmadi.

## A. Denetlenen paneller

- Admin: 13 gorunur route, global operasyon ve yonetim yuzeyleri.
- Uretici: Nova Cephe Sistemleri OWNER membership'i ile 13 route.
- Alici: Eksen Cam Sanayi OWNER membership'i ile 8 route.
- Kimlikler, backend roller, company ID'leri ve membership relation'lari PostgreSQL'den dogrulandi.

## B. Denetlenen ana sayfalar

Kontrol Paneli, Talepler, Teklifler, Siparisler, Uretim Takibi, Sevkiyat, Fiyat/Urun, Firma Profili/Kapasite, Mesajlar, Bildirimler, Firmalar/Firma Bilgileri, Raporlar ve Ayarlar/Profilim incelendi. Login, forgot-password linki, unknown route, direct URL ve logout davranislari kapsandi.

Core workflow sayfalari API/DB kayitlarini tasiyor. Dashboard ve core disi yonetim ekranlarinin onemli bolumu static veya `dijitalcam.workflowStore` localStorage kaynaginda kaliyor.

## C. Denetlenen workflow'lar

- Request -> selected RequestRecipient -> Quotation -> Order -> Production -> Shipment zinciri relation/status/version olarak tekrar okundu.
- Controlled zincir: Request `AWARDED v4`, Quotation `ACCEPTED v3`, Order `CONFIRMED v2`, Production `COMPLETED v3`, Shipment `DELIVERED v3`.
- RequestItem, Attachment, Analysis, PriceCatalog ve QuotationCalculation tablolari bos oldugu icin bunlarin gercek pozitif E2E zinciri kanitlanamadi.
- Controlled teklif `TRY 125000`, `activeCalculationId=null`; UI `Legacy / hesaplamasiz` gosteriyor.

## D. Test edilen kritik buton/form/islemler

- Uc rol login, F5/direct URL, SPA navigation, unknown route ve logout.
- Alici request list/detail, embedded quotation detail, recipient gorunurlugu, empty item/file state.
- Uretici AWARDED request aksiyonlari, fiyat ve profil responsive CRUD yuzeyi.
- Admin dashboard, core route'lar, Yeni Talep, Yeni Fiyat Kalemi, Yeni Firma Profili ve Sevkiyat Planla modal semantigi.
- Dokuz viewport: 390x844, 414x896, 768x1024, 820x1180, 1024x768, 1280x720, 1366x768, 1440x900, 1920x1080.
- Backend 168 servis testi, frontend lint, backend typecheck ve 49 Chromium Playwright testi.

## E. Tum problemler onem sirasiyla

### P1 - Canli kabul engelleri

1. `AUD-011`: LAN refresh cookie domain uyumsuz; reload/direct URL oturumu dusuruyor.
2. `AUD-V2-017`: `/auth/me` ve user create raw User ile credential hash alanlarini response'a tasiyor.
3. `AUD-006`: Core disi yonetim yuzeyleri ortak backend'e bagli degil.
4. `AUD-003`: Static/local dashboard verisi `Canli` olarak sunuluyor.
5. `AUD-012`: UI bildirimleri backend Notification/event zincirine bagli degil.
6. `AUD-001`: Mevcut dist LAN yerine localhost API hedefliyor.
7. `AUD-V2-018`: Cam urun recetesinin kritik semantikleri authoritative modelde yok.
8. `AUD-V2-019`: Katalog secimi cam varyant option'larini kullanmiyor.
9. `AUD-V2-020`: Onayli olcu draft edit sonrasi stale kalabilir.
10. `AUD-V2-026`: Login rate-limit yok; refresh token birden cok kanaldan kabul ediliyor.

### P2 - Yuksek operasyon ve UX riski

- `AUD-002`: Tek refresh hash coklu cihaz oturumunu eziyor.
- `AUD-007`, `AUD-V2-022`: Rol ve status disi aksiyonlar gosteriliyor.
- `AUD-009`: Alici Profilim platform Ayarlar ekranini aciyor.
- `AUD-013`: Global user directory company scope olmadan normal rollere acik.
- `AUD-014`: Uretici fiyat/profil ekranlari 9/9 viewport'ta tasiyor.
- `AUD-V2-021`: Alici kendi RequestRecipient kaydini detayda goremiyor.
- `AUD-V2-023`: Modal dialog/focus/required semantigi yok.
- `AUD-V2-024`: Vergi hesaplamasi uygulanmiyor.
- `AUD-V2-027`: Attachment malware taramasi yok.
- `AUD-V2-028`: Playwright mevcut yanlis sunucuyu test sunucusu sanabiliyor.

### P3-P4 - Kalite ve izlenebilirlik

- `AUD-004` production duplicate GET davranisi kanitlanamadi.
- `AUD-005`, `AUD-015`: Desktop overflow ve 44px alti hedefler.
- `AUD-008`: Form required semantigi yok.
- `AUD-010`: Unknown route 404 yerine dashboard'a gidiyor.
- `AUD-016`: Logout response istemcide abort ediliyor.
- `AUD-V2-025`: Calculation snapshot teknik kaniti UI'da eksik.
- `AUD-V2-029`: Quotation create refetch testi deterministik fail.
- `AUD-V2-030`: Iki Shipment testi localStorage yarisi nedeniyle flaky.

## F. Onceki bulgularin regresyon durumu

- Hala var: 14 (`AUD-001`, `002`, `005`-`016`).
- Kismen cozulmus: 1 (`AUD-003`).
- Kanitlanamadi: 1 (`AUD-004`).
- Tam cozuldugu kanitlanan: 0.

Detayli kanit matrisi [findings.md](findings.md) dosyasindadir.

## G. Test edilemeyen alanlar

- Ucuncu bagimsiz tenant ile full HTTP/DB IDOR.
- Fiziksel ikinci cihaz ve gercek coklu browser/device session.
- Safari/WebKit ve Firefox.
- Gercek servis kesintisi, yavas ag ve geri kazanma.
- Buyuk veri, pagination, soak ve paralel load.
- Gercek malware fixture'i ve antivirus entegrasyonu.

Bu alanlar basarili kabul edilmedi; `kanitlanamadi` olarak kaldi.

## H. Eksik test fixture'lari

- Izole ucuncu buyer/manufacturer tenant cifti.
- DRAFT Request + zengin cam RequestItem seti.
- Authoritative PriceCatalog variantlari ve regional adjustment seti.
- APPROVED measurement, stale edit ve correction fixture'i.
- PDF/JPEG/PNG, bozuk, polyglot, buyuk ve malware test dosyalari.
- Vergi/yuvarlama sinir degerleri ve birden cok para birimi.
- 500/503, Redis/PostgreSQL outage ve slow-network kontrollu fixture'lari.

## I. Guvenlik bulgulari

- En kritik yeni bulgu raw User response ile hash alanlarinin ifsasidir.
- Global user listesi email/telefon/rol bilgisini tenant scope olmadan verir.
- Login throttling/rate limiting yoktur.
- Refresh token cookie, body ve Authorization header'dan kabul edilir.
- Main workflow servislerinde membership/party scope, CAS ve 404 hiding kodlari genel olarak gucludur; 168 servis testi bunu destekler.
- Bagimsiz tenant fixture'i olmadigi icin full-chain IDOR sertifikasi verilemez.
- Attachment tarafinda ownership, path traversal, MIME, magic byte, checksum, size, random key, quarantine ve CAS korumalari vardir; malware scan yoktur.

## J. UX/UI bulgulari

- Gercek ve demo/local veri ayni dilde sunuluyor.
- Alici ve Ureticiye rol/status disi aksiyonlar gosteriliyor.
- Alici Profilim yanlis ekran aciyor; recipient bilgisi kayboluyor.
- Modal focus, dialog ve required semantigi eksik.
- Uretici responsive tablolar kritik aksiyonlari viewport disina atiyor.
- Unknown URL sessiz redirect ve abort olan logout geri bildirimi zayiflatiyor.

## K. Veri butunlugu bulgulari

- Controlled core relation ve version zinciri tutarlidir; bu alan korunmalidir.
- Controlled Request'te 0 item/file/calculation oldugundan tutar urun/fiyat izi tasimaz.
- Cam recetesi first-class alanlardan yoksundur.
- Approved measurement stale kalabilir.
- Tax sifirdir; snapshot'in bir bolumu UI'da gorunmez.
- Notification tablosu bosken UI uc bildirim gosterir.

## L. Entegrasyon bulgulari

- Request, Quotation, Order, Production ve Shipment API/DB ile authoritative calisir.
- RequestItem, Attachment, Analysis ve Calculation modulleri ile guclu servis/mock testleri vardir; gercek DB fixture'i yoktur.
- Pricing, profile, dashboard, message, UI notification, report ve settings ortak backend zincirine dahil degildir.
- Request detail recipient scope filtresi UI ile domain ihtiyacini uyumsuz hale getirir.
- Frontend test config yanlis 4176 server'ini reuse ederek 29 yalanci failure uretebilir.

## M. Performans bulgulari

- `/api/v1/health`: 30/30 HTTP 200; p50 19.73ms, p95 22.30ms, max 32.60ms.
- PostgreSQL ve Redis container'lari healthy.
- Bu sonuc tek health endpointidir; is sorgusu veya load kapasitesi degildir.
- Buyuk fixture yoktur. Production duplicate GET ve bundle maliyeti bu V2'de tam sertifikalanmadi.
- Uretici sayfalarinda devasa document width render/layout maliyeti ve kullanilabilirlik riski yaratir.

## N. Is akisi bulgulari

- Core Request -> Shipment zinciri state/relation bakimindan calisir ve degistirilmemelidir.
- UI state gating backend is kurallarini yansitmiyor.
- Recipient secimi DB'de dogru, Alici detail response'unda kayip.
- Teklif tutari calculation/item olmadan kabul edilebiliyor; legacy akisin siniri UI'da gorunse de fiyat dogrulugu yok.
- Notification/event audience zinciri yoktur.

## O. Canli kullanima engeller

1. LAN session persistence ve dist API hedefi.
2. Credential hash response riski ve auth rate-limit eksigi.
3. Static/local yuzeylerin gercek ortak sistem gibi sunulmasi.
4. Backend notification/event entegrasyonunun olmamasi.
5. Cam recetesi, varyant esleme ve stale measurement butunluk aciklari.
6. Vergi ve gercek fiyat fixture'i olmadan ticari hesap dogrulugu.
7. Uretici responsive kullanilamazlik ve modal accessibility.
8. Kirmizi/flaky frontend test paketi ve eksik cross-tenant/browser/load sertifikasi.

## P. Degistirilmemesi gereken calisan alanlar

- Request/Quotation/Order/Production/Shipment foreign key ve taraf sirasi.
- Version/CAS transition kurallari ve transactional audit yazimi.
- Quotation accept'in tek Order olusturma ve competing quotation davranisi.
- Calculation snapshot hash, unique input, serializable finalize ve active calculation kilidi.
- RequestItem line number concurrency korumasi.
- Attachment ownership, storage key, MIME/magic-byte/checksum/size ve quarantine kontrolleri.
- Analysis worker lease/idempotency ve canonical veriyi review oncesi degistirmeme kurali.
- Mevcut 168 backend testinin kapsadigi negatif izin ve concurrency davranislari.

## Q. Kanitli canli kullanim karari

**CANLI KULLANIMA HAZIR DEGIL**

Core workflow omurgasi tutarli ve korunmaya degerdir. Ancak urun butunu ayni authoritative veri kaynagini kullanmiyor; LAN oturumu kalici degil; credential response riski var; cam urun recetesi ve ticari fiyat zinciri yeterli degil; bildirimler paneller arasi calismiyor; responsive ve accessibility engelleri suruyor. P1 bulgular kapatilmadan, gercek cam/fiyat/dosya fixture'i ve bagimsiz tenant matrisiyle yeniden kanit uretilmeden canli kabul verilemez.

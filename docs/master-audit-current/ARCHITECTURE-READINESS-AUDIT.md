# Ilteris Cam - Mimari ve Olceklenebilirlik Denetimi

Tarih: 2026-09-05
Kapsam: Git tarafindan takip edilen 293 dosya. Backend 179, frontend 82, mevcut denetim dokumanlari 28, kok yapilandirma 4 dosya.
Hedef: Talep -> AI analiz -> teklif -> siparis -> uretim -> sevkiyat akisini bugun guvenilir, ileride yuz binlerce kullanici icin yonetilebilir hale getirmek.

## 1. Denetim Karari

Sistem iki farkli konuda iyilestirme gerektiriyor:

1. Frontend duzeni: `apps/web/src/pages/workspace-pages.tsx` tum operasyon panellerini, formlari ve API/yerel-demo dallarini tek dosyada topluyor. Bu dosya yaklasik 477 KB. Bir ekran degisikliginin baska akisi etkileme riski burada yuksek.
2. Uretim altyapisi: Backend modulleri ayrilmis durumda; fakat tek container, yerel dosya depolama, bellek ici rate-limit sayaclari, merkezi izleme eksikligi ve CI eksikligi 500.000 kullanici hedefi icin yeterli degil.

Bu nedenle dosya tasima tek basina cozum degildir. Once kritik is akislarini koruyan test/izleme sinirlari kurulacak, sonra frontend modulleri asamali ayrilacak, en son yatay buyumeyi destekleyen altyapi uygulanacak.

## 2. Mevcut Yapi Envanteri

### Frontend

- `src/App.tsx`: oturum hydration, gercek API/yerel demo workflow secimi, aktivite durumu.
- `src/app/app-router.tsx`: role gore rota korumasi.
- `src/app/app-shell.tsx`: ortak navigasyon, baslik, bildirim gorunumu.
- `src/pages/auth-pages.tsx` ve `legal-pages.tsx`: giris/kayit/hukuki ekranlar.
- `src/pages/workspace-pages.tsx`: Dashboard, Talep, AI dosya/olcu akisi, Teklif/Snapshot, Siparis, Uretim, Sevkiyat, Fiyat Listesi, Mesaj, Bildirim, Firma, Rapor ve Ayarlar.
- `src/shared/api/`: 18 API istemci modulu. HTTP/auth altyapisi `http-client.ts` icinde.
- `tests/e2e/`: 19 Playwright dosyasi. Varsayilan paket sahte API ile, gercek-backend paketi ayri config ile calisiyor.
- `server.js`: production static server ve ayni-origin `/api/*` reverse proxy.

### Backend

- `auth`, `users`, `rbac`, `audit`: kimlik ve yetki.
- `company-foundation`, `manufacturer-customers`: firma/uye/bolge ve ureticinin musteri portfoyu.
- `requests`, `request-items`, `attachments`, `analysis`, `messages`: talep ve AI analizi.
- `pricing`, `quotations`, `quotation-calculations`: fiyat listesi, teklif ve Snapshot.
- `orders`, `productions`, `shipments`, `notifications`: operasyon zinciri.
- `storage`, `redis`, `health`, `gateway`: altyapi modulleri.
- Prisma semasi, 15 migration ve PostgreSQL/Redis Docker duzeni mevcut.

## 3. Dogrulanmis Guclu Noktalar

- Backend is kurallari modullere ayrilmis; controller/service/DTO sinirlari var.
- Fiyat hesaplamasi `Prisma.Decimal` ile yurutuluyor; teklif Snapshot islemleri serializable transaction ve optimistic version alanlari kullaniyor.
- Talep, teklif, siparis, uretim ve sevkiyat durum gecisleri enum + servis kontrolleri ile sinirli.
- AI analiz isleri lease/attempt sayaci ile kuyruklanmis; dosya yukleme sonrasinda analiz otomatik tetiklenebiliyor.
- JWT refresh token rotasyonu ve kisa grace period uygulanmis.
- Production tarayici/arayuz API cagrilari ayni-origin proxy uzerinden gidiyor; iOS cookie sorunu bu yolla giderildi.
- Backend unit testleri son calismada 205/205 gecti. Frontend varsayilan Playwright paketi 47 ana testi geciyor; gercek-backend auth testi ayri calistirilmasi gereken bir test.

## 4. Dogrulanmis Riskler

### P0 - Uretim oncesi altyapi riski

1. Yerel dosya depolama
   - Kanit: `storage/local-storage.adapter.ts` ve `STORAGE_ROOT`.
   - Risk: Birden fazla backend instance'a gecilince yuklenen dosya sadece bir makinede kalir. Yuz binlerce kullanici ve milyonlarca PDF/gorsel icin uygun degil.
   - Karar: S3 uyumlu object storage (Cloudflare R2, AWS S3 veya esdegeri) adapteri eklenmeli. Mevcut `STORAGE_PORT` soyutlamasi bu gecis icin dogru baslangic noktasi.

2. Bellek ici rate limiting
   - Kanit: `ThrottlerModule` mevcut, Redis tabanli storage yapilandirilmamis.
   - Risk: Birden fazla API instance'i kendi sayacini tutar; rate limiting instance bazli kalir.
   - Karar: Redis-backed throttler yapisina gecilecek.

3. Merkezi izleme ve alarm yok
   - Kanit: request logging ve health endpoint var; merkezi metrics, trace id, hata alarmi yok.
   - Risk: Buyurken hata/artis, AI provider problemi, kuyruk birikmesi veya DB yavaslamasi gec fark edilir.
   - Karar: JSON structured logging, request correlation id, uptime/health alarmi ve metrics endpointi eklenecek.

4. Otomatik CI yok
   - Kanit: `.github/workflows` yok. Backend `package.json` icindeki `test` komutu halen gercek test suite yerine bilgi mesaji donduruyor.
   - Risk: Bir commit test calistirilmadan production'a gidebilir.
   - Karar: Once package test komutlari gercek komutlara baglanacak; sonra GitHub Actions ile lint/build/unit/e2e kosacak.

### P1 - Is akisi ve veri butunlugu riski

5. AI urun adi ve fiyat listesi eslestirmesi
   - Kanit: `pricing.service.ts` urun turunu guvenli token siralamasi ile eslestiriyor; `Isicam Konfor` ile `Isicam` gibi farkli isimler kasitli olarak eslesmiyor.
   - Durum: Eslesen kalemlerin hesaplanip eslesmeyenlerin Snapshot'ta uyarilmasi eklendi.
   - Risk: Farkli ureticilerin katalog isimlendirmeleri AI sonucundan farkli olacaktir.
   - Karar: Sonraki asamada ortak urun sozlugu + katalog alias/haritalama ekranı kurulacak. Rastgele fuzzy eslestirme ile yanlis fiyat uygulanmayacak.

6. AI is basarisizligi kullaniciya yeterince operasyonel gorunur degil
   - Kanit: dosya tamamlama sonrasi analiz best-effort basliyor; hata durumlari job kaydinda tutuluyor.
   - Risk: Provider kota/ag hatasi alici tarafinda ne yapilacagini belirsiz birakabilir.
   - Karar: Talep ayrintisina acik analiz durumu, tekrar dene ve alternatif manuel kalem olusturma aksiyonu eklenecek.

7. Bildirim yayinlama gercek push/email katmanina henuz bagli degil
   - Kanit: Notification kayitlari olusuyor; harici publisher altyapisi placeholder niteliginde.
   - Risk: 500 bin kullanici olceginde mobil push/e-posta/SMS ihtiyaci kuyruk, retry ve teslim raporu olmadan guvenilir olmaz.
   - Karar: Mesaj/bildirim DB kaydi ile outbox tablosu; ayri worker ve retry/backoff ile publisher mimarisi kurulacak.

8. Eski demo ve gercek API dallari ayni frontend yuzeyinde
   - Kanit: `workspace-pages.tsx` ve `App.tsx` icinde `backendRole/apiEnabled` dallari.
   - Risk: Gercek hesaba demo verisinin karismasi veya bir duzeltmenin iki dali farkli etkilemesi.
   - Karar: Demo workflow ve API workflow ayri page feature modullerine tasinacak; production role'lerinde demo veri dalina giris engellenecek.

### P2 - Bakim ve performans riski

9. Devasa frontend sayfa dosyasi
   - Kanit: `workspace-pages.tsx` yaklasik 9.000+ satir / 477 KB.
   - Risk: Degisiklik kapsami gorunmez hale geliyor; build bundle buyuyor; HMR ve code review zorlasiyor.
   - Karar: Asamali feature-slice ayirma (asagida).

10. Tek frontend JavaScript bundle'i buyuk
   - Kanit: production build tek ana JS parcasi yaklasik 610 KB (gzip yaklasik 148 KB), Vite uyari veriyor.
   - Risk: Ilk yukleme, dusuk cihazli mobil kullanicilar ve 500 bin kullanicida CDN maliyeti.
   - Karar: Route bazli `React.lazy` ile code split, agir ekranlar sadece acildiginda yuklenecek.

11. Production Docker imajinda devDependencies
   - Kanit: backend Dockerfile production stage'i build stage `node_modules` klasorunun tamamini kopyaliyor.
   - Risk: Daha buyuk imaj, daha yavas deploy, daha genis saldiri yuzeyi.
   - Karar: Build sonrasi production dependency katmani veya `npm ci --omit=dev` ile kucultme.

12. Gecmis migration'larda eski veri tasima riski
   - Kanit: eski ManufacturerCustomer migration'lari NOT NULL kolon ve iliski degisimleri iceriyor.
   - Risk: Yeni bir production DB'ye eski veriyle gecis yapilacaksa migration once veri tasima/backfill ister.
   - Karar: Yeni migration'larda expand -> backfill -> validate -> enforce sirasi zorunlu olacak. Gecmis migration'lar degistirilmeyecek.

## 5. Hedef Klasor Yapisi

Frontend hedefi:

```
src/features/
  requests/             # talep formu, kalem, recipient, detail
  attachments-analysis/ # upload, AI job, review, glass grouping
  quotations/           # teklif formu, liste, detail, Snapshot
  pricing/              # fiyat katalogu ve catalog mapping UI
  orders/
  productions/
  shipments/
  dashboard/
  companies/
  notifications/
  messages/
  reports/
shared/
  api/
  ui/
  auth/
  workflow/             # sadece demo/test modu; production feature'larindan ayrik
```

Backend hedefi:

```
src/modules/
  workflow/             # request, request-items, quotations, orders sinir sozlesmeleri
  analysis/             # provider + job runner + worker queue
  storage/              # local adapter + S3 adapter
  notifications/        # DB outbox + publisher worker
  observability/        # structured logger, metrics, correlation id
  platform/             # auth, users, rbac, companies, regions
```

Backend'in bugunku modulleri tasinmadan once API kontratlari ve servis testleri sabitlenecek. Buyuk dosya tasima ile is kurali degisimi ayni committe yapilmayacak.

## 6. Uygulama Sirasi

### Faz 1 - Degisiklik guvenligi

1. Gercek backend unit test komutunu `npm test`e bagla.
2. CI: frontend lint/build/mock E2E + backend lint/build/unit test.
3. Kritik gercek akislara test matrisi ekle:
   - PDF/gorsel -> AI -> kalem/gruplama
   - coklu uretici -> ayri teklif -> Snapshot
   - kismi katalog eslesmesi
   - teklif kabul -> siparis -> uretim -> sevkiyat
   - dosya upload relative API URL production modu
4. Uygulama hata siniri ve standard error/correlation response.

### Faz 2 - Ticari cekirdegi ayir

1. `quotations` + `pricing` feature slice ayirma.
2. `requests` + `attachments-analysis` feature slice ayirma.
3. Bu iki slice icin API kontrat testleri ve ekran bazli e2e testleri.
4. Route lazy loading.

### Faz 3 - Operasyon ekranlarini ayir

1. orders
2. productions
3. shipments
4. dashboard/reports
5. companies/settings/messages/notifications

Her slice sonrasi full test paketi, responsive kontrol ve production smoke check zorunlu.

### Faz 4 - 500.000 kullanici altyapisi

1. S3/R2 object storage'a gecis.
2. Redis-backed throttling, kuyruk ve outbox worker.
3. Metrics/logging/tracing/alerting.
4. Managed PostgreSQL, connection pooling, read replica ve yedek geri-donus tatbikati.
5. Load test: once 1.000, sonra 10.000 eszamanli istek; production benzeri ortamda p95/p99, DB pool ve kuyruk gecikmesi olcumu.

## 7. Degisiklik Kurallari

- Bir is kuralini degistiren commit ile dosya tasima ayni committe olmayacak.
- Her API kontrati frontend/backend ayri testle korunacak.
- Production deploy oncesi: `git status`, ilgili test, tam test, production smoke check.
- AI fiyat eslestirmesinde belirsiz urune otomatik fiyat verilmez; ureticiye acik secim sunulur.
- Yeni migration: geri alma/runbook, backfill ve buyuk tablo lock etkisi belirtilmeden uygulanmaz.
- Buyuk olcekli isler HTTP request icinde degil, Redis-backed worker uzerinde calisir.

## 8. Bir Sonraki Uygulama Karari

Ilk uygulanacak teknik is: Faz 1'in test/CI temelini kurmak. Bunun nedeni, mevcut frontend modullerini ayirmaya baslamadan once her tasimanin talep->AI->teklif->siparis zincirini bozmadigini otomatik kanitlayacak bir guvenlik agi olusturmaktir.

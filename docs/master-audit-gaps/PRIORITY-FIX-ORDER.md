# Priority Fix Order

Tarih: 2026-08-10

Bu dosya uygulama emri degildir. Kod, konfigurasyon, migration, seed, credential veya is verisi degisikligi yapilmadi. Asagidaki sira ancak ayri kullanici onayi sonrasinda uygulanabilir.

## Faz 0 - P0 olay mudahalesi

1. Public bundle credential exposure icin olay kaydi ac.
2. Etkilenen aktif hesaplari ve tum refresh session'lari rotate/revoke et.
3. Demo credential sabitlerini source ve deploy bundle'dan kaldir.
4. Bundle/source secret scan ve known credential regression gate ekle.
5. AuditLog uzerinden supheli login/aksiyon incelemesi yap; degerleri rapora sizdirma.

Kabul: Public artifact'ta identity/parola/secret yok; eski credential'lar login/refresh yapamaz; uc rol yeni ayri credential politikasi ile calisir.

## Faz 1 - Auth ve identity kabul kapisi

1. `/auth/me`, `POST /users` ve tum User response'larini public DTO allowlist'e al.
2. Login throttling/backoff ve auditli lockout politikasi ekle.
3. Refresh'i cookie-only, rotation/reuse detection ve per-session modele tasarla.
4. LAN cookie, CORS ve dist API target environment profilini duzelt.
5. Forgot-password'i enumeration-safe token lifecycle ile gercek implemente et veya islevsiz route'u kaldir.
6. Urun sahibiyle Alici Nova / Uretici Eksen mi, yoksa mevcut ters eslesme mi authoritative karari ver; ancak sonra fixture/veri plani hazirla.

Kabul: Hash/secret response yok; rate-limit gecer; F5/direct URL/yeni tab calisir; sifre kurtarma E2E; kimlik matrisi tek dokumanda DB/UI ile eslesir.

## Faz 2 - Test kapisi ve determinism

1. Backend `npm test` scriptini 168 test runner'ina bagla ve sifir testte fail ettir.
2. Playwright benzersiz port/server fingerprint ve build freshness kullansin.
3. Quotation refetch authority sozlesmesini netlestir.
4. Notification seed/local workflowStore yarisini test state'inden ayir.
5. Clean ortamda uc ardarda `0 failed / 0 flaky / 0 skipped` kosu iste.
6. Public bundle credential ve sensitive response scan'i CI gate yap.

Kabul: Retry olmadan deterministik suite; standart komutlar tum testleri calistirir.

## Faz 3 - Authoritative kimlik, yonetim ve event kaynagi

1. Dashboard, pricing, profile, companies, settings, reports, messages ve notifications icin owner/API karari ver.
2. Frontend-only ve backend-only duplicate yuzeyleri tek authoritative kontrata indir.
3. Notification'a User/Company/Audience relation, event key, read receipt ve delivery attempt ekle.
4. Workflow transaction'larindan outbox eventleri uret.
5. Audit correlation ve business request context'i ekle.

Kabul: Iki ayri browser ayni company/profile/price/notification verisini gorur; localStorage silinmesi is verisini degistirmez.

## Faz 4 - Cam ve ticari hesap butunlugu

1. Cam kompozisyonu, katman, temper, Low-E, kaplama, renk, spacer/gaz, lamine, kenar/CNC/delik/ozel islem typed modele tasinsin.
2. PriceCatalog variant matching typed option'lari kullansin.
3. RequestItem editinde approved measurement lineage invalidate/recalculate edilsin.
4. Vergi, nakliye, para birimi ve rounding policy authoritative olsun.
5. UI snapshot input, m2, price, waste, region, discount, tax ve rounding izini gostersin.

Kabul: En az 12 golden cam fixture'inda elle hesap, API, DB ve UI ayni sonucu verir; stale measurement teklif uretemez.

## Faz 5 - Tenant ve gercek entegrasyon sertifikasi

1. Iki bagimsiz buyer ve iki bagimsiz producer tenant fixture'i olustur.
2. Tum resource list/detail/nested/download/mutation IDOR matrisi calistir.
3. Real Nest HTTP + PostgreSQL + Redis + storage integration suite kur.
4. FK/cascade, transaction rollback, stale CAS, double-click ve paralel accept/finalize/transition testleri ekle.
5. Company inactive/suspended ve membership revoke davranisini sertifikala.

Kabul: Yetkisiz her known-ID denemesi bilgi sizdirmadan 403/404; tek olay tek row/order/event/audit olusturur.

## Faz 6 - Pagination, performans ve resilience

1. Tum ana listelere cursor pagination ve server-side filter/search/sort ekle.
2. 100/1,000/10,000 row fixture'inda API p50/p95/p99 ve response byte budget tanimla.
3. SQL query count/N+1 instrumentation ve slow query budget ekle.
4. Slow LAN, 500/503, PostgreSQL/Redis/storage outage ve recovery testleri yap.
5. Attachment concurrent upload ve capability multi-instance davranisini test et.

Kabul: Tanimli SLO'lar gercek is endpointlerinde saglanir; UI loading/retry/error davranisi veri kaybetmez.

## Faz 7 - UX, accessibility, responsive ve browser

1. Role + status + owner bazli buton inventory/gating yap.
2. Her form icin boundary, unicode, uzunluk, cancel/reset ve server error matrisi kur.
3. Modal dialog/focus/required/error association'i tamamla.
4. 390, 768, 820, 1024, 1280 ve 1440 dahil dokuz viewport'ta her sayfa/durum geometry testi yap.
5. Chromium, Edge, Firefox ve WebKit/Safari projelerini calistir.
6. Uretici pricing/profile overflow ve tum 44px alti hedefleri kapat.

Kabul: Kritik aksiyon viewport disinda degil; keyboard-only ve automated a11y temiz; browser matrisi sifir flaky.

## Faz 8 - Son gercek hayat kabul zinciri

1. Onayli Alici/Uretici kimligiyle yeni izole request olustur.
2. Zengin cam item, olcu, attachment, AI review ve golden calculation ekle.
3. UI + network + authoritative GET + DB + diger panel + notification + refresh/navigation + responsive kanitlarini her adimda kaydet.
4. Talep -> Teklif -> Kabul -> Siparis -> Uretim -> Sevkiyat -> Teslimat tamamla.
5. Ayni zincirin cross-tenant negatiflerini calistir.

Kabul: Tum zorunlu katmanlar birlikte dogru; P0/P1 sifir; failed/flaky/skipped sifir; kanitlanmayan release blocker kalmamis.

## Oncelik ozeti

| Sira | Risk | Neden once |
|---:|---|---|
| 1 | P0 bundle credential | Tum panel ve veriyi dogrudan riske atar |
| 2 | Raw User response + auth/session | Credential ve LAN kullanilabilirlik |
| 3 | Identity karari | Yanlis firmaya fixture/akisi kurmayi engeller |
| 4 | Test determinism | Sonraki her duzeltmenin kanit guvenilirligi |
| 5 | Authoritative data/notification | Cok kullanicili urunun temel sozlesmesi |
| 6 | Cam/pricing integrity | Ticari ve uretim dogrulugu |
| 7 | Tenant/real integration | Veri gizliligi ve transaction kaniti |
| 8 | Pagination/resilience | Hacim ve operasyon surekliligi |
| 9 | UX/a11y/browser | Gercek cihaz kullanilabilirligi |
| 10 | Final E2E | Canli kararinin son kapisi |

## Mevcut karar

**CANLI KULLANIMA HAZIR DEGIL**

Bu sira yalniz rapordur. Duzeltme calismasi baslatilmadi.
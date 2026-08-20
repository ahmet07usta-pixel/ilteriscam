# Master Denetim V2 Duzeltme Plani

Bu plan uygulama emri degildir. Kod, schema veya veri degisikligi ancak ayri kullanici onayi sonrasinda baslatilir.

## Faz 0 - Kanit ve guvenlik freni

1. `/auth/me`, `POST /users` ve tum User response'lari icin allowlist public DTO kullan; hash alanlarina regression testi ekle.
2. Login throttling, auditli lockout/backoff ve refresh token icin cookie-only politika uygula.
3. LAN cookie/domain/CORS/secure ayarlarini environment profiline tasi; direct URL, F5 ve yeni tab testini gercek ikinci cihazda calistir.
4. Dist build'i zorunlu `VITE_API_BASE_URL` olmadan fail ettir; build metadata ve health endpointi ile server kimligini gosterebilir hale getir.

Kabul: Hash alanlari hicbir response'ta yok; 30+ hatali login throttled; uc rol F5/direct URL/yeni tab sonrasinda oturumunu korur; ikinci cihaz ortak API'ye baglanir.

## Faz 1 - Tek authoritative veri kaynagi

1. Dashboard metriklerini backend aggregate endpointlerine bagla; `Canli` etiketi timestamp/source ile gercek veri icin kullanilsin.
2. Notification event/outbox, audience, delivery ve read-state modelini workflow transaction'lariyla entegre et.
3. Fiyat/katalog, firma profili/kapasite, mesaj, rapor ve settings yuzeylerini backend company scope'una tasi.
4. Local demo veriyi production bundle'dan ayir veya acik `Demo` etiketiyle izole et.

Kabul: Iki ayri browser ayni kaydi gorur; localStorage temizligi is verisini silmez; PostgreSQL, API ve UI sayilari esit olur.

## Faz 2 - Cam domain ve hesaplama butunlugu

1. Cam kompozisyonu, temper, Low-E/kaplama, renk, spacer/gaz, lamine katman, kenar/rodaj, CNC/delik ve ozel islem semantigini versiyonlu authoritative modele ekle.
2. PriceCatalog option/variant eslemesini typed yap; productCode fallback'ine bagimliligi kaldir.
3. Draft RequestItem editinde approval lineage'i invalidate et ve turetilmis alanlari server-side yeniden hesapla.
4. Vergi kurali, dahil/haric semantigi, tarih/bolge/musteri kapsami ve rounding politikasini uygula.
5. UI calculation snapshot'inda teknik girdi, m2, base, waste, bolge, discount, tax ve rounding izini goster.

Kabul: Temperli, lamine ve Isicam icin en az 12 gercek fixture; elle hesaplanan golden totals ile API/DB/UI eslesir; stale edit hesap uretemez.

## Faz 3 - Workflow ve rol gorunurlugu

1. UI aksiyonlarini permission + role + owner company + entity status ile gate et.
2. Request owner detail response'unda secili recipient'leri goster; baska recipient tenant verisini gereksiz acma.
3. Alici `Profilim` icin gercek personal/company profile route'u olustur.
4. AWARDED/ACCEPTED/CONFIRMED/COMPLETED/DELIVERED kayitlarda yalniz gecerli komutlari goster.

Kabul: Her rol-route-status matrisi hem gorunurluk hem backend 403/409 ile test edilir; owner recipient'i gorur.

## Faz 4 - Dosya guvenligi

1. AVAILABLE oncesi malware/content scanning ve scan status ekle.
2. Download response'unda guvenli disposition/CSP/nosniff ve signed capability expiry testleri ekle.
3. Polyglot, macro, zip bomb benzeri riskli fixture politikasini belirle.

Kabul: Temiz dosya AVAILABLE; zararli/supheli dosya QUARANTINED; tenant disi upload/download/delete 404/403 ve auditli.

## Faz 5 - Responsive ve accessibility

1. Uretici pricing/profile tablolarini contained responsive layout veya mobile card/action menu yapisina cevir.
2. Tum hedefleri en az 44x44 yap; 1280/1366 desktop document overflow'u gider.
3. Modal yuzeylerine `role=dialog`, `aria-modal`, accessible name, initial focus, focus trap ve focus restore ekle.
4. Required/invalid/error association ve ilk invalid alana focus uygula.
5. Unknown route icin anlamli 404; logout icin awaited lifecycle ve hata geri bildirimi ekle.

Kabul: Dokuz viewport'ta document overflow/offscreen critical action sifir; keyboard-only modal matrisi ve axe benzeri otomasyon temiz.

## Faz 6 - Test ve release kapisi

1. Playwright icin benzersiz port, `reuseExistingServer:false` veya server fingerprint; build freshness kontrolu ekle.
2. Quotation refetch sozlesmesini netlestir; Shipment localStore seed yarisini kaldir.
3. Chromium, Edge, Firefox ve WebKit projelerini CI'a ekle.
4. Ucuncu tenant, buyuk dataset, stale CAS, double-click, paralel accept/finalize ve outage fixture'larini ekle.
5. Real backend E2E'yi mock browser testlerinden ayri suite ve rapor olarak calistir.

Kabul: Izole clean checkout'ta 3 ardışık kosu sifir fail/sifir flaky; cross-tenant full chain negatif; p95 hedefleri gercek is endpointlerinde tanimli ve saglanmis.

## Onerilen Sira

1. P1 security ve LAN session.
2. Authoritative data/event entegrasyonu.
3. Cam domain, stale measurement ve vergi.
4. Rol/status UI ve recipient gorunurlugu.
5. Dosya tarama.
6. Responsive/accessibility.
7. Cross-browser, tenant, load ve release certification.

Her faz kendi migration geri alma plani, veri backfill dry-run'i, feature flag'i ve once/sonra kanit paketiyle ayri onaylanmalidir.
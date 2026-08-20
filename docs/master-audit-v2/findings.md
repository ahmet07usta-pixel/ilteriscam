# Master Denetim V2 Bulgulari

Tarih: 2026-08-10

Kapsam development ortami ile sinirlidir. Production'a erisilmedi. Uygulama kodu, schema, migration, seed ve is verisi degistirilmedi.

## Onceki Bulgular Regresyon Matrisi

| ID | V2 durumu | V2 kaniti |
|---|---|---|
| AUD-001 | Hala var | Frontend fallback ve mevcut dist `127.0.0.1:4000/api/v1` kullaniyor. |
| AUD-002 | Hala var | User modelinde tek `refreshTokenHash`; yeni login/refresh ayni alani eziyor. |
| AUD-003 | Kismen cozulmus | Bazi KPI'lar local workflow state'ten turetiliyor; `148/62/19/128`, grafikler ve `Canli` sunumu hala static. |
| AUD-004 | Kanitlanamadi | SPA rota gecisinde yeni duplicate response gorulmedi. StrictMode ve mount GET yapisi suruyor; production build network olcumu yok. |
| AUD-005 | Hala var | Alici 1280x720 ve 1366x768'de 8/8 sayfa; 1440x900'de Siparis ve Sevkiyat document overflow uretti. |
| AUD-006 | Hala var | Fiyat, profil, mesaj, UI bildirimi, firma, rapor ve ayarlar local/static workflow store kullaniyor. |
| AUD-007 | Hala var | Uretici AWARDED talepte `Teklife Donustur` goruyor; backend kapali talebi reddediyor. |
| AUD-008 | Hala var | Dort Admin modalinda 55 alan, `required/aria-required=0`. |
| AUD-009 | Hala var | Alici `Profilim` yine `/app/ayarlar`; platform ayari ve kullanici yonetimi icerigi gorunuyor. |
| AUD-010 | Hala var | `/app/does-not-exist` sessizce `/app/kontrol-paneli` adresine gitti. |
| AUD-011 | Hala var | Direct `/app/talepler` bes `401` sonrasi login'e dondu; `COOKIE_DOMAIN=localhost`, API host `192.168.110.20`. |
| AUD-012 | Hala var | UI badge `3`, PostgreSQL Notification sayisi `0`; controlled workflow notification sayisi `0`. |
| AUD-013 | Hala var | Normal rollerde `users.read`; global `/users` sorgusu company scope uygulamiyor. |
| AUD-014 | Hala var | Uretici fiyat/profil sayfalari 9/9 viewport'ta document overflow ve offscreen aksiyon uretti. |
| AUD-015 | Hala var | Dokuz viewport'un tamaminda 44px alti etkileşim hedefleri olculdu. |
| AUD-016 | Hala var | UI logout sonrasi `POST /auth/logout` `net::ERR_ABORTED`; state response beklenmeden temizleniyor. |

## Yeni Bulgular

### AUD-V2-017 - Raw User response credential hash alanlarini sizdiriyor

- Oncelik: P1
- Alan: Authentication / excessive data exposure
- Roller: Tum roller; user create icin yetkili roller
- Kanit: `GET /auth/me`, `UsersService.findById()` sonucunu dogrudan donduruyor. Bu sorgu Prisma User nesnesinin `passwordHash` ve `refreshTokenHash` alanlarini secim siniri olmadan aliyor. `POST /users` da raw create sonucunu donduruyor. Global serializer veya `@Exclude` yok.
- Kok neden: Login/refresh'te bulunan `sanitizeUser` yalniz AuthService icinde kullaniliyor; ortak public User DTO yok.
- Etki: Credential materyali gereksiz yere istemciye tasinir ve log/browser/devtool katmanlarina yayilabilir.
- Tekrar: Kod yolu deterministik; response degerleri audit raporuna alinmadi.

### AUD-V2-018 - Authoritative cam urun modeli temel semantikleri tasimiyor

- Oncelik: P1
- Alan: Cam domain / veri butunlugu
- Kanit: RequestItem yalniz generic productType/code, miktar, birim, geometri ve kalinlik tasiyor. Kompozisyon, Low-E, temper, renk, spacer, kaplama, kenar, rodaj, CNC ve delik alanlari yok.
- Kok neden: Zengin cam ozellikleri local frontend katalog dizilerinde kalmis; authoritative RequestItem/PriceCatalog/Calculation sozlesmesine modellenmemis.
- Etki: Ayni urun kodu altindaki teknik olarak farkli camlar ayirt edilemez, dogru uretim recetesi ve fiyat izi kurulamaz.

### AUD-V2-019 - Katalog secimi varyant semantiklerini kullanmiyor

- Oncelik: P1
- Alan: Pricing / matching
- Kanit: Katalog secimi company, productType, currency ve productCode ile yapiliyor. `optionConfig` JSON mevcut olsa da secim motoru kullanmiyor.
- Etki: Renk, Low-E, spacer, kaplama veya isleme farki productCode'a elle gomulmezse fiyat secimini etkileyemez.

### AUD-V2-020 - Onayli olcu, taslak kalem duzenlemesinden sonra stale kalabilir

- Oncelik: P1
- Alan: Measurement / calculation integrity
- Kanit: AI review APPROVED durumunu ve turetilmis alanlari yazar. Sonraki draft update geometri/miktari degistirirken measurementStatus, sourceAnalysisResultId ve turetilmis alanlari sifirlamiyor veya yeniden hesaplamiyor. Calculation yalniz APPROVED kalemleri aliyor.
- Etki: Degisen olcu, eski onay ve eski hesaplanan m2 ile fiyatlandirilabilir.

### AUD-V2-021 - Talep sahibi yonlendirilen Ureticiyi detayda goremiyor

- Oncelik: P2
- Alan: Request routing visibility
- Kanit: PostgreSQL'de controlled RequestRecipient Nova'yi gosteriyor; Alici UI `Yonlendirilen Ureticiler` alanini bos gosterdi. Non-manager request detail include, recipient'i actor'un recipient firmadaki membership'i ile filtreliyor.
- Etki: Alici kendi yonlendirme kararini dogrulayamiyor.

### AUD-V2-022 - Rol ve durum disi UI aksiyonlari gosteriliyor

- Oncelik: P2
- Alan: Authorization UX / workflow
- Kanit: Alici dashboard `Teklif Ver`, `Siparis Olustur`, `Sevkiyat Planla` gosteriyor. Uretici Talepler sayfasi `Yeni Talep Olustur`, AWARDED kayitta `Teklife Donustur`, `Duzenle`, `Sil` gosteriyor. Alici AWARDED kayitta da `Duzenle` ve `Sil` goruyor.
- Koruma: Backend permission/status kontrolleri bazi mutasyonlari reddediyor.
- Etki: Kullanici tamamlanamayacak forma yoneltiliyor; backend guvenligi UI sahipligi sorununu gidermiyor.

### AUD-V2-023 - Modal semantigi ve focus yonetimi yok

- Oncelik: P2
- Alan: Accessibility
- Kanit: Yeni Talep, Yeni Fiyat Kalemi, Yeni Firma Profili ve Sevkiyat Planla yuzeylerinde `role=dialog=0`; acilista focus tetikleyici butonda kaldi. Toplam 55 alanda required semantigi yok. Escape ile kapanma calisiyor.
- Etki: Klavye ve ekran okuyucu kullanicisi modal baglamini ve zorunlu alanlari guvenilir bicimde algilayamaz.

### AUD-V2-024 - Hesaplama vergi mantigi uygulanmiyor

- Oncelik: P2
- Alan: Pricing / tax
- Kanit: Quotation calculation satir ve toplam `taxRate/taxAmount` degerleri sabit sifir. Engine waste, bolge ve discount hesapliyor; tax hesaplamiyor.
- Etki: Vergi dahil teklif beklenen kullanimda toplam tutar eksik veya yanlis olur.

### AUD-V2-025 - Hesap snapshot kanitinin bir bolumu UI'da kayboluyor

- Oncelik: P3
- Alan: Pricing auditability
- Kanit: Backend snapshot geometri, kalinlik, turetilmis m2, base ve regional adjustment bilgisi tasiyor; frontend mapper/UI bunlarin cogunu gostermiyor.
- Etki: Kullanici fiyat sonucunun teknik girdilerini ekrandan denetleyemiyor.

### AUD-V2-026 - Login brute-force ve session hardening eksik

- Oncelik: P1
- Alan: Authentication security
- Kanit: Uygulamada throttler/rate-limit middleware bulunmuyor. Refresh token cookie disinda body ve Authorization header'dan da kabul ediliyor. Cookie development'ta secure degil; LAN domain ayari ayrica bozuk.
- Etki: Login denemeleri sinirlanmiyor; refresh credential'in tasinma yuzeyi gereksiz genis.

### AUD-V2-027 - Attachment malware taramasi yok

- Oncelik: P2
- Alan: File security
- Kanit: MIME allowlist, boyut, basename/path traversal, magic-byte, checksum, random storage key, ownership, CAS ve quarantine kontrolleri var. Ancak dogrulanan dosya malware/content scan olmadan AVAILABLE oluyor.
- Etki: Gecerli PDF/JPEG/PNG icine gomulu zararli icerik paylasilabilir.

### AUD-V2-028 - Frontend test sunucusu yanlis ortami yeniden kullanabiliyor

- Oncelik: P2
- Alan: Test reliability
- Kanit: Default Playwright calismasi aktif 4176 sunucusunu `reuseExistingServer:true` nedeniyle kullandi ve 29/49 test fail oldu. Izole 4177 preview'da sonuc 46 pass, 1 fail, 2 flaky oldu.
- Kok neden: Port/server kimligi ve build freshness kontrol edilmiyor.
- Etki: Yanlis kirmizi veya yanlis yesil CI/local sonuc uretebilir.

### AUD-V2-029 - Quotation create refetch sozlesmesi kirik

- Oncelik: P3
- Alan: Frontend test / authoritative refresh
- Kanit: Izole ve seri calismada test iki liste GET bekledi, yalniz bir GET aldi. POST body dogru ve UI yeni teklifi gosteriyor; test veya implementasyonun refetch sozlesmesi uyumsuz.
- Etki: Hangi response'un authoritative kabul edildigi belirsiz; regression testi kirmizi.

### AUD-V2-030 - Shipment testlerinde local workflowStore yarisi var

- Oncelik: P3
- Alan: Frontend state / test determinism
- Kanit: Iki Shipment testi ilk denemede workflowStore'un seed activity ile degismesi nedeniyle fail, retry'da pass oldu.
- Etki: Authoritative API akisinin local store'a dokunmadigi garantisi deterministik test edilemiyor.

## Veri ve Executable Kanit Ozeti

- PostgreSQL: 1 Request, 0 RequestItem, 0 Attachment, 0 AnalysisJob, 0 AnalysisResult, 0 QuotationCalculation, 0 QuotationItem, 0 PriceCatalogItem, 0 Notification, 229 AuditLog.
- Controlled chain: Request AWARDED v4, Quotation ACCEPTED v3, Order CONFIRMED v2, Production COMPLETED v3, Shipment DELIVERED v3.
- Controlled teklif: TRY 125000, `activeCalculationId=null`, `Legacy / hesaplamasiz`.
- Backend: 168/168 test gecti; TypeScript lint temiz.
- Frontend: oxlint temiz. Izole preview Playwright: 46 pass, 1 fail, 2 flaky. Default 4176 reuse calismasi: 20 pass, 29 fail.
- Health: `/api/v1/health` 30/30 HTTP 200; p50 19.73ms, p95 22.30ms, max 32.60ms.
- PostgreSQL ve Redis container health: healthy.

## Kanitlanamayanlar

- Bagimsiz ucuncu tenant ile gercek HTTP/DB IDOR matrisi.
- Fiziksel ikinci/ucuncu cihaz ve ayni hesabın gercek coklu cihaz politikasi.
- Gercek RequestItem + PriceCatalog + Calculation + Attachment pozitif E2E zinciri.
- Safari/WebKit ve Firefox runtime davranisi; config yalniz Chromium projesi tanimliyor.
- Servis kesintisi, yavas ag, gercek 500/503 ve geri kazanma matrisi.
- Buyuk veri, pagination, uzun sureli soak ve paralel mutation load testi.
# Master Denetim Duzeltme Plani

Bu plan denetim bulgularindan sonra olusturulmustur. Siralama bagimlilik ve risk esaslidir; bu dosya uygulama degisikligi yapmaz.

## Faz 0 - Canliya cikis kapisi

1. `AUD-011` cookie domain/session persistence duzeltilecek.
2. `AUD-001` icin ortama bagli API base ve tekrarlanabilir build/deploy konfigurasyonu tanimlanacak.
3. Gercek ikinci LAN bilgisayarinda login, refresh, direct URL, yeni tab, back/forward ve logout kabul testi calistirilacak.

Kabul: Uc rol her istemcide reload sonrasi oturumunu korur; refresh cookie dogru host/path/security degerleriyle calisir; build hicbir istemcide `127.0.0.1` API'yi hedeflemez.

## Faz 1 - Authoritative urun butunlugu

1. Dashboard metrikleri gercek API sorgularina baglanacak; static degerler ve yaniltici `Canli` etiketi kaldirilacak.
2. Fiyat/katalog, firma profili/kapasite, firmalar, raporlar ve ayarlar icin backend ownership sinirlari ve API kontratlari tasarlanacak.
3. Alici icin gercek kisisel profil/firma profili route'u ayrilacak.
4. Global arama authoritative kaynaklarda role/company scope ile calisacak.

Kabul: Bir bilgisayarda yapilan kontrollu degisiklik ikinci bilgisayarda authoritative GET ile gorulur; refresh/localStorage temizligi veriyi kaybettirmez; her kaydin company/user sahipligi PostgreSQL'de kanitlanir.

## Faz 2 - Event ve bildirim altyapisi

1. Request/Quotation/Order/Production/Shipment transition'lari durable domain event veya transactional outbox uretecek.
2. Backend Notification audience'i user/company/role bazinda tanimlanacak.
3. Frontend badge, liste, read state ve deep link backend Notification API'ye baglanacak.
4. Stable event key/idempotency ile duplicate bildirim engellenecek.

Kabul: Bir paneldeki event dogru diger panelde tek bildirim olusturur; yetkisiz firma gormez; refresh ve baska cihazda unread/read state korunur.

## Faz 3 - Authorization ve veri minimizasyonu

1. `/users` urun gereksinimi netlestirilecek; tenant scope ve field allowlist uygulanacak.
2. Bagimsiz ucuncu firma, ikinci kullanici ve iliskisiz workflow fixture'i olusturulacak.
3. Her resource icin list/detail/random ID/other-company/method matrisi calistirilacak.
4. Audit response'larinda secret ve gereksiz PII alanlari otomatik test edilecek.

Kabul: Yetkili roller yalniz gerekli kayit/alanlari gorur; cross-tenant denemeler bilgi sizdirmadan `403/404` verir.

## Faz 4 - Workflow ve concurrency sertifikasyonu

1. UI aksiyonlari Request status ve permission ile birlikte kosullandirilecek (`AUD-007`).
2. Stale version, iki paralel istemci, double-click, request retry ve duplicate create senaryolari her mutation icin test edilecek.
3. Idempotency gereken create/transition endpoint'leri belirlenecek.
4. Coklu cihaz refresh session politikasi tanimlanacak; gerekiyorsa per-session refresh token modeli uygulanacak.

Kabul: Stale/duplicate istekler deterministik `409` veya tanimli idempotent sonucu verir; tek is olayi tek authoritative kayit ve tek audit/event olusturur.

## Faz 5 - UX, form ve responsive

1. Uretici fiyat/profil sayfalarindaki document overflow ve offscreen aksiyonlar giderilecek.
2. Tablet aksiyonlari en az 44x44px olacak; tablolarin horizontal scroll davranisi gorunur ve klavye erisilebilir olacak.
3. Zorunlu alanlar label, `required`/`aria-required`, inline hata ve ilk hataya focus ile belirtilecek.
4. Alici `Profilim`, authenticated 404 ve logout lifecycle duzeltilecek.

Kabul: Desktop/mobile/tablet screenshot, geometry, keyboard ve touch-target testleri gecer; kritik aksiyon viewport disinda kalmaz.

## Faz 6 - Hata, hacim ve release kabulü

1. Tum sayfalarda loading/empty/401/403/404/409/422 veya urunun standart validation status'u/500/retry matrisi calistirilacak.
2. Production build ile duplicate request, bundle/chunk ve ilk acilis olculecek.
3. Gercekci Request/Quotation/Order hacminde pagination, search, sort ve payload sureleri test edilecek.
4. Uc fiziksel/ayri browser istemcisiyle sifirdan yeni kabul zinciri calistirilacak.

Kabul: P0/P1 sifir; P2'ler yazili risk kabulune veya duzeltmeye sahip; A-AB raporu yeni kanitlarla tekrar yayinlanir. Nihai canli karari ancak bu kapidan sonra yeniden verilir.
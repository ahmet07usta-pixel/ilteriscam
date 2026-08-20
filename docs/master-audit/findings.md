# Master Audit Bulgulari

Bu dosya denetim sirasinda capraz dogrulanan bulgulari kaydeder. Kayit bulunmasi otomatik olarak kod degisikligi yapilacagi anlamina gelmez.

## AUD-001 - Build ciktisi LAN API adresini kullanmiyor

- Onem: P1 adayi
- Alan: Frontend deployment / frontend-backend entegrasyonu
- Etkilenen roller: Admin, Uretici, Alici
- Birinci kanit: Aktif Vite dev oturumunda login `http://192.168.110.20:4000/api/v1` adresine gitti ve basarili oldu.
- Ikinci kanit: Mevcut `apps/web/dist` bundle icinde API base `http://127.0.0.1:4000/api/v1` olarak derlenmis.
- Etki: Frontend `dist` veya preview baska bir is arkadasinin bilgisayarinda acilirsa browser API'yi sunucu bilgisayari yerine kendi localhost'unda arar. Uc panel ortak backend'e ulasamayabilir.
- Kok neden adayi: Build alinirken `VITE_API_BASE_URL` LAN API adresiyle verilmemis; fallback localhost.
- Durum: Acik. Deployment bicimi ve gercek istemci bilgisayarinda ikinci kanit gerekiyor.

## AUD-002 - Ayni hesapla yeni login onceki refresh oturumunu gecersiz kiliyor

- Onem: P2 adayi
- Alan: Authentication / session / coklu cihaz kullanimi
- Etkilenen roller: Admin, Uretici, Alici
- Birinci kanit: Admin browser login basarili olduktan sonra ayni hesapla API login yapildi. Sonraki full-page route gecisinde browser access token bellegi sifirlandi ve refresh istekleri `401` donerek login ekranina yonlendirdi.
- Ikinci kanit: Kullanici modelinde tek `refreshTokenHash` alani bulunuyor; yeni login ayni kullanicinin onceki refresh token'ini degistiriyor.
- Etki: Ayni kullanici hesabi iki cihazda veya iki browser'da kullanilirsa son login onceki oturumu beklenmedik sekilde dusurebilir.
- Not: Bu davranis denetim sirasinda ayni Admin hesabi iki istemci kanalinda kullanilarak tetiklendi. Backend login'in kendisi uc hesapta da `201` verdi.
- Durum: Acik. Beklenen urun politikasi ve coklu cihaz kabul kriteri netlestirilmeli.

## AUD-003 - Dashboard verileri authoritative workflow verisi degil

- Onem: P1 adayi
- Alan: Dashboard / veri tutarliligi / UX
- Etkilenen roller: Admin, Uretici, Alici
- Birinci kanit: Gercek Admin oturumunda Dashboard acilirken workflow API cagrisi yapilmadi.
- Ikinci kanit: Dashboard bekleyen isler, grafikler ve bolgesel oranlar frontend kaynak kodunda sabit dizilerden uretiliyor; ekranda yine de `Canli` etiketi kullaniliyor.
- Ornekler: `Teklif Bekleyen Talepler 148`, `Onay Bekleyen Siparisler 62`, `Aylik Ciro TRY 1.552.000`.
- Etki: Kullanici gercek operasyon durumunu gordugunu sanabilir ve yanlis is karari verebilir.
- Durum: Acik. Uc rolde gorunum ve gercek PostgreSQL sayilariyla fark ayrica olculecek.

## AUD-004 - Bazi authoritative liste GET istekleri duplicate calisiyor

- Onem: P3 adayi
- Alan: Frontend performans / API verimliligi
- Etkilenen roller: Admin; Uretici ve Alici ayrica olculecek
- Birinci kanit: Admin SPA menusuyle acilan cekirdek sayfalarda resource timing ayni liste istegini iki kez kaydetti. Ornekler: `/requests` iki, `/quotations` iki, `/orders` iki, `/productions` iki ve `/shipments` iki kez.
- Ikinci kanit: Siparis ve Sevkiyat sayfalari bagli aggregate listelerini de iki kez cagirdi.
- Etki: Gereksiz API ve veritabani yuku; buyuk veri setlerinde gecikme ve maliyet artisi.
- Durum: Acik. React StrictMode/dev etkisi ile production build davranisi ayrica karsilastirilacak.

## AUD-005 - Genis desktop'ta dokuman seviyesinde yatay tasma

- Onem: P3 adayi
- Alan: Responsive / UI
- Etkilenen roller: Admin; Uretici ve Alici ayrica olculecek
- Birinci kanit: `1440x1000` viewport'ta `documentElement.scrollWidth > window.innerWidth` sonucu Siparisler, Fiyat ve Urun Yonetimi, Firma Profili ve Kapasite ve Sevkiyat sayfalarinda `true` oldu.
- Ikinci kanit: Ayni olcum diger dokuz Admin sayfasinda `false` oldu; sorun viewport aracindan genel olarak kaynaklanmiyor.
- Etki: Tum sayfanin yatay kaymasi, sidebar/header konumunun bozulmasi ve kritik aksiyonlara erisim zorlugu.
- Durum: Acik. Tablet ve mobilde eleman sinirlari ve kullanilabilir aksiyonlar ayrica olculecek.

## AUD-006 - Cekirdek disi yonetim yuzeyleri ortak backend'e bagli degil

- Onem: P1 adayi
- Alan: Frontend-backend entegrasyonu / cok kullanicili veri
- Etkilenen roller: Admin ve Uretici agirlikli; bildirim/mesaj icin tum roller
- Birinci kanit: Gercek Admin oturumunda Fiyat/Urun, Firma Profili/Kapasite, Mesajlar, Bildirimler, Firmalar, Raporlar ve Ayarlar sayfalari acilirken API istegi olmadi.
- Ikinci kanit: Bu sayfa bilesenleri `workflow` ve `workflowActions` aliyor; `App.tsx` bu store'u `dijitalcam.workflowStore` localStorage anahtarindan okuyor ve yaziyor.
- Etki: Bir bilgisayarda yapilan degisiklik diger bilgisayara dusmez; UI gercek ortak B2B/ERP verisi izlenimi verirken browser-local kalabilir.
- Durum: Acik. Her aksiyonun localStorage mutasyonu ve refresh/diger browser davranisi tek tek sinanacak.

## AUD-007 - Tamamlanmis Request icin gecersiz teklif aksiyonlari gosteriliyor

- Onem: P2
- Alan: Request / Quotation workflow UX ve is kurali gorunurlugu
- Etkilenen roller: Admin ve teklif olusturma yetkili Uretici
- Birinci kanit: `REQ-20260810-7BA9538D` authoritative olarak `AWARDED` olmasina ragmen Admin listesinde `Teklife Donustur`, detayinda `+ Teklif Olustur` gorundu.
- Ikinci kanit: Satir aksiyonu yalniz `quotations.create` permission kontrol ediyor. Embedded Quotation aksiyonu da `canCreate && requestId` kosulunu kullaniyor; Request status kosulu yok.
- Etki: Kullanici tamamlanmis is akisinda gecersiz bir sonraki adima yonlendirilir; form sonunda backend conflict alma veya gereksiz veri girme riski vardir.
- Durum: Acik. Buton mutation riski nedeniyle mevcut kontrollu kayitta tiklanmadi; backend status kurali koddan ayrica dogrulandi.

## AUD-008 - Olusturma formlarinda zorunlu alan semantigi yok

- Onem: P3
- Alan: Form UX / accessibility / validation
- Etkilenen roller: Tum roller
- Birinci kanit: Admin'de acilan yedi olusturma modalinda 78 form kontrolu bulundu; `required` attribute tasiyan kontrol sayisi sifirdi.
- Ikinci kanit: Formlarin mevcut testleri zorunlu alan hatalarini ancak Kaydet/Gonder sonrasinda ozel mesajla kontrol ediyor.
- Etki: Browser validation, ekran okuyucu zorunluluk bildirimi ve ilk bakista alan beklentisi zayif; kullanici submit sonrasina kadar hangi alanlarin zorunlu oldugunu anlayamayabilir.
- Durum: Acik. Alan bazli validasyon ve hata odagi daha sonraki negatif test fazinda olculecek.

## AUD-009 - Alici `Profilim` menusu platform ayarlari CRUD ekranini aciyor

- Onem: P2
- Alan: Alici paneli / role visibility / UX
- Etkilenen rol: Alici
- Birinci kanit: Alici sidebar'indaki `Profilim` menusu `/app/ayarlar` route'una gidiyor ve baslik `Ayarlar`, aciklama `Platform Yapilandirmasi` oluyor.
- Ikinci kanit: Alici `Kullanici Rol Sabitleri` ve `Yeni Kullanici Onayi` gibi platform kayitlarini goruyor; satirlarda `Duzenle` ve `Sil`, ustte `+ Ayar Kaydet` aksiyonlari bulunuyor.
- Veri kaynagi: Sayfa API cagirmiyor ve local workflow state kullaniyor. Bu nedenle backend privilege escalation kaniti degil; yanlis urun yetkisi ve veri sahipligi algisidir.
- Etki: Alici kisisel profilini bulamiyor, platform yonetim verisi gordugunu ve degistirebildigini dusunuyor; browser-local degisiklikler gercek ayar sanilabilir.
- Durum: Acik. Local mutation ve diger browser gorunurlugu kontrollu kayitla ayrica test edilecek.

## AUD-010 - Bilinmeyen uygulama URL'si 404 gostermeden dashboard'a gidiyor

- Onem: P4
- Alan: Navigation / error handling
- Etkilenen roller: Tum roller
- Birinci kanit: Alici oturumunda `/app/does-not-exist` istegi `/app/kontrol-paneli` adresine yonlendi.
- Ikinci kanit: Router wildcard authenticated kullaniciyi `Navigate` ile varsayilan route'a gonderiyor.
- Etki: Hatali veya eski deep link sessizce kaybolur; kullanici neden bekledigi kaydi goremedigini anlayamaz.
- Durum: Acik.

## AUD-011 - LAN istemcisinde refresh cookie kaydedilmiyor ve reload oturumu dusuruyor

- Onem: P1 blocker
- Alan: Authentication / LAN deployment / session persistence
- Etkilenen roller: Admin, Uretici, Alici
- Birinci kanit: Gercek Alici login'i SPA icinde basarili oldu. Dashboard reload sonrasi `/app/talepler` direct URL acilisinda dort veri GET'i `401` aldi, tek `/auth/refresh` kurtaramadi ve uygulama `/login` sayfasina gitti.
- Tekrar uretim: Yeni browser login'inden hemen sonra ayni sonuc tekrarlandi; disaridan ayni hesapla ikinci login yapilmadi.
- Ikinci kanit: API gelistirme `.env` ayari `COOKIE_DOMAIN=localhost`; kullanilan API host'u `192.168.110.20`. Backend refresh cookie'yi bu domain ile yaziyor.
- Kok neden: `192.168.110.20` yanitinda `Domain=localhost` cookie browser tarafindan LAN host'u icin kullanilabilir degil. Access token yalniz module memory'de oldugu icin full reload tokeni kaybediyor.
- Etki: Kullanici refresh, direct URL, yeni tab veya browser geri/ileri senaryolarinda oturumunu kaybedebilir. Gercek is arkadaslariyla LAN kullanimini engeller.
- Durum: Acik. Denetim geregi konfigurasyon degistirilmedi.

## AUD-012 - UI bildirimleri backend kaynakli degil

- Onem: P1
- Alan: Bildirimler / frontend-backend entegrasyonu
- Etkilenen roller: Admin, Uretici, Alici
- Birinci kanit: Uc gercek rolde header badge ve Bildirimler sayfasi uc okunmamis/canli bildirim gosterdi; sayfa acilisinda Notification API cagrisi olmadi.
- Ikinci kanit: Admin yetkili `GET /notifications?limit=500` sonucu sifir kayit; kontrollu Request/Quotation/Order zinciriyle eslesen backend bildirimi sifir.
- Kok neden: UI `workflow.activityLog` localStorage state'ini kullaniyor. Backend `NotificationsService` ayri bir tabloya yaziyor fakat workflow servisleriyle ve frontend bildirim UI'iyla baglantili degil.
- Etki: Bir paneldeki event diger bilgisayara gercek bildirim olarak dusmez; okunmamis sayisi ve read state browser-local olabilir. UI'daki `Canli Bildirimler` ifadesi yanilticidir.
- Durum: Acik.

## AUD-013 - Alici tum kullanici dizinini okuyabiliyor

- Onem: P2 adayi
- Alan: Authorization / veri minimizasyonu / tenant privacy
- Etkilenen rol: Alici; ayni permission Uretici ve temel User rollerinde de bulunuyor
- Birinci kanit: SALES roluyle `GET /users` `200` dondu ve dort kullanicinin `email`, `phone`, `fullName`, `role`, `permissions`, aktiflik ve tarih alanlarini verdi.
- Ikinci kanit: `ROLE_PERMISSIONS` SALES, PRODUCER ve USER rollerine `users.read` veriyor; endpoint tenant/company filtresi uygulamadan global liste donuyor.
- Olumlu not: `passwordHash` ve `refreshTokenHash` response alanlarinda yok.
- Etki: Firmalar arasi kullanici iletisim ve rol bilgilerinin gereksiz ifsasi olabilir. Bir is dizini gereksinimiyse kapsam ve alan allowlist'i acikca tanimlanmali.
- Durum: Acik; urun gereksinimiyle karar verilmeli.

## AUD-014 - Uretici fiyat ve kapasite ekranlarinda mobil aksiyonlar viewport disinda

- Onem: P2
- Alan: Responsive / Uretici paneli
- Etkilenen rol: Uretici
- Birinci kanit: `390x844` ve `820x1180` boyutlarinda Fiyat/Urun ve Firma Profili/Kapasite sayfalarinda document-level horizontal overflow olustu.
- Ikinci kanit: Goruntule, Duzenle ve Sil butonlarinin bounding box'i viewport sag sinirinin disinda kaldi. Mobile'da buton yuksekligi 44px olsa da gorunur/tiklanabilir alanda degildi.
- Etki: Uretici kritik katalog ve kapasite CRUD aksiyonlarini mobil/tablet cihazda dogal sekilde kullanamaz.
- Durum: Acik.

## AUD-015 - Tablet aksiyon hedefleri 44px altinda

- Onem: P3
- Alan: Responsive / touch usability
- Etkilenen roller: Tum roller
- Birinci kanit: `820x1180` olcumunde cok sayida Goruntule/Duzenle/Sil aksiyonu 37-42px yukseklikteydi; ust olusturma butonlari 43px idi.
- Ikinci kanit: `390x844` kritik Alici workflow ekranlarinda ayni aksiyonlar kart donusumuyle 44px'e ulasirken tablet breakpoint'inde tablo stili devam etti.
- Etki: Dokunmatik tabletlerde yanlis tiklama ve erisilebilirlik riski.
- Durum: Acik.

## AUD-016 - Logout response istemci tarafinda abort ediliyor

- Onem: P4
- Alan: Auth / network lifecycle
- Etkilenen roller: Tum roller
- Birinci kanit: Tek bir kontrollu UI logout tiklamasinda `POST /auth/logout` request olustu fakat response yerine `net::ERR_ABORTED` kaydedildi; ayni durum rol degistirme sirasinda iki kez daha tekrarlandi.
- Ikinci kanit: Backend `LOGOUT` audit sayisi 9'dan 10'a cikti ve ilgili kullanicinin `refreshTokenHash` degeri icerigi okunmadan `null` olarak dogrulandi.
- Kok neden: `handleLogout`, `currentUser` state'ini hemen temizleyip `logoutFromBackend()` promise'ini fire-and-forget calistiriyor. Auth agacinin kapanmasi request response lifecycle'ini istemcide abort ediyor.
- Etki: Mevcut testte server-side session iptali basarili; ancak istemci basari/hata sonucunu bilemiyor, failed-request telemetrisi uretiyor ve yavas/kararsiz agda davranis deterministik degil.
- Durum: Acik.
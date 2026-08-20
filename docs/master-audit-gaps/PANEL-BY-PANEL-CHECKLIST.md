# Panel By Panel Checklist

Tarih: 2026-08-10

Durumlar:

- `KANITLI`: Ilgili davranis belirtilen kanit seviyesinde dogrulandi.
- `KISMEN`: Yalniz UI, mock, code veya tek rol/viewport kaniti var.
- `BASARISIZ`: Beklenen davranisa aykiri sonuc var.
- `KANITLANMADI`: Yeterli fixture, session veya mutation izni yok.

## Ortak route ve panel kurallari

| Kontrol | Sonuc | Kanit siniri |
|---|---|---|
| Authenticated role route matrisi | KISMEN | 13 route x 3 rol mock Playwright ile; gercek LAN reload session basarisiz |
| Unknown authenticated route | BASARISIZ | 404 yerine dashboard'a redirect |
| Direct URL ve reload | BASARISIZ | LAN cookie domain nedeniyle login'e donuyor |
| Back/forward | KANITLANMADI | Tum route/durum kombinasyonlari yok |
| Loading/empty/error | KISMEN | Core API sayfalarinda mock test; local sayfalarda backend state yok |
| Search/filter | KISMEN | Cogu client-side; gercek hacim ve server query yok |
| Sort | KANITLANMADI | Kullanici kontrollu server/client sort genel olarak yok |
| Pagination | BASARISIZ | Yalniz Request UI page state; backend listeleri unbounded |
| Refresh persistence | BASARISIZ | Auth kaybi; local sayfalar browser-local kalir |
| Mobile/tablet/desktop | KISMEN | Dokuz viewport geometry olcumu var; her sayfa x her durum yok |
| Keyboard/focus | KISMEN | Escape calisiyor; modal role/focus trap/restore eksik |
| Tum buton success/error/double-click | KANITLANMADI | Mevcut testler onemli aksiyonlari kapsar, tum gorunur kontrolleri kapsamaz |
| Tum input boundary matrisi | KANITLANMADI | Her alan icin min/max/negatif/unicode/uzun/copy-paste/reset yok |

## Admin paneli

| Sayfa / sekme | Acilma | Veri kaynagi | Ana kontroller | Sonuc |
|---|---|---|---|---|
| Login | KANITLI | Auth API | Label, required ve invalid login onceki testlerde | Credential bundle P0; rate-limit yok |
| Kontrol Paneli | KANITLI | Static + local workflow | KPI, grafik, quick action | BASARISIZ: static degerler `Canli` sunuluyor |
| Talepler / liste | KANITLI | Request API | Search/filter/page/detail | KISMEN: client pagination; backend unbounded |
| Talepler / detay | KANITLI | Request API | View, edit, cancel, submit | KISMEN: status disi aksiyonlar; tum error/double-click yok |
| Talepler / kalemler | KISMEN | RequestItem API | CRUD, CAS | Gercek DB fixture 0; mock ve unit kaniti |
| Talepler / ekler | KISMEN | Attachment/Storage API | Upload/download/delete | Gercek DB fixture 0; malware scan yok |
| Talepler / AI ve olcu | KISMEN | Analysis API | Start/poll/review | Gercek provider/DB fixture yok; stale approval riski |
| Talepler / yonlendirme | KISMEN | RequestRecipient API | List/replace | DB relation var; owner detail recipient'i gizliyor |
| Teklifler / liste-detay | KANITLI | Quotation API | Search/filter/view/actions | Core kayit gorunuyor; role/status gating sorunlu |
| Teklif / hesaplamalar | KISMEN | Calculation API | Generate/finalize/snapshot | DB fixture 0; tax 0; UI snapshot eksik |
| Siparisler | KANITLI | Order API | View/confirm/cancel/plan | Core kayit kanitli; tum state/error matrisi yok |
| Uretim Takibi | KANITLI | Production API | View/plan/transition | Core kayit kanitli; paralel mutation runtime yok |
| Sevkiyat | KANITLI | Shipment API | View/plan/transition | Core kayit kanitli; 2 test flaky |
| Fiyat ve Urun | KANITLI | localStorage | CRUD/filter | BASARISIZ: backend PriceCatalog'a bagli degil |
| Firma Profili/Kapasite | KANITLI | localStorage | CRUD/filter/capacity | BASARISIZ: backend Company'ye bagli degil |
| Mesajlar | KANITLI | local activityLog | Compose/read | BASARISIZ: backend delivery yok |
| Bildirimler | KANITLI | local activityLog | Read/read-all | BASARISIZ: Notification API ile bag yok |
| Firmalar | KANITLI | local manufacturerCustomers | CRUD/invite/filter | BASARISIZ: Company/Membership API ile bag yok |
| Raporlar | KANITLI | local/static aggregate | Filter/detail | BASARISIZ: authoritative rapor backend'i yok |
| Ayarlar / platform | KANITLI | local rows | CRUD | BASARISIZ: ortak backend ayari degil |
| Ayarlar / kullanicilar | KANITLI | bundled demoUsers | View/create/edit/delete gorunumu | P0: gercek credential ile eslesen bundle sabitleri |
| Audit | KANITLANMADI | Backend Audit API | UI yok | Backend endpointi var, panel yuzeyi yok |
| Region yonetimi | KANITLANMADI | Backend Region API | UI yok | Backend endpointi var, panel yuzeyi yok |
| Membership yonetimi | KANITLANMADI | Backend Membership API | UI yok | Backend endpointi var, panel yuzeyi yok |

Admin sonucu: 13/13 gorunur route acilma kaniti vardir. Bu, sayfalarin authoritative ve operasyonel oldugunu kanitlamaz. Core disi yedi yuzey local/static; backend yonetim endpointlerinin bir bolumu UI'sizdir.

## Alici paneli

Authoritative mevcut kimlik: SALES/Selin Kaya -> Eksen Cam Sanayi. Kullanici kabul kimligi olan Nova Alici mevcut degildir.

| Sayfa / adim | Acilma | Veri kaynagi | Sonuc |
|---|---|---|---|
| Login | KANITLI | Auth API | SPA login onceki denetimde; reload BASARISIZ |
| Dashboard | KANITLI | Static/local | BASARISIZ: yaniltici KPI ve rol disi quick action |
| Profilim | KANITLI | Local Ayarlar | BASARISIZ: kisisel/firma profili degil |
| Taleplerim liste | KANITLI | Request API | KISMEN: owner scope olumlu; hacim/pagination yok |
| Yeni Talep temel bilgiler | KISMEN | Request API | Controlled create onceki denetimde; tum validation matrisi yok |
| Cam ozellikleri | BASARISIZ | Generic RequestItem | Kompozisyon/Low-E/temper/renk/spacer authoritative degil |
| Olculer/adet/m2 | KISMEN | RequestItem/Analysis | Mock/unit guclu; gercek fixture 0 ve stale approval riski |
| Dosya/ekler | KISMEN | Attachment API | Mock/unit; gercek positive fixture 0 |
| Uretici secimi | KISMEN | Recipient API | Eksen -> Nova DB relation var; istenen Nova -> Eksen yok |
| Otomatik eslestirme | BASARISIZ | Local routing matrix | Backend authoritative matching degil |
| Talep gonderme | KANITLI | Request submit API | Onceki controlled zincirde Eksen -> Nova |
| Talep detayi | KISMEN | Request API | Recipient DB'de var, owner response/UI'da kayip |
| Teklif listesi/detayi | KANITLI | Quotation API | Controlled teklif goruldu; hesaplama izi yok |
| Kabul/reddet | KISMEN | Quotation API | Accept controlled; tum race/expiry/reject E2E yok |
| Siparis | KANITLI | Order API | Controlled relation goruldu |
| Uretim | KANITLI | Production API read | Controlled durum goruldu |
| Sevkiyat/teslimat | KANITLI | Shipment API read | Controlled delivered goruldu |
| Bildirimler | BASARISIZ | local activityLog | Uretici eventinden backend bildirimi yok |

Alici sonucu: Mevcut Eksen Alici core zinciri kismen kanitlaniyor. Kullanici tarafindan istenen Nova Alici kimligi, zengin cam recetesi, gercek hesaplama/dosya ve durable notification zinciri kanitlanmadi.

## Uretici paneli

Authoritative mevcut kimlik: PRODUCER/Emre Tunali -> Nova Cephe Sistemleri. Kullanici kabul kimligi olan Eksen Uretici mevcut degildir.

| Sayfa / adim | Acilma | Veri kaynagi | Sonuc |
|---|---|---|---|
| Login | KANITLI | Auth API | SPA login onceki denetimde; reload BASARISIZ |
| Dashboard | KANITLI | Static/local | BASARISIZ: authoritative degil |
| Atanmis Talepler | KANITLI | Request API | Mevcut Nova recipient kaydi goruldu |
| Talep detay/cam/olcu/ek | KISMEN | Core alt API'ler | Talep var; item/file/analysis fixture 0 |
| Musteri bilgisi | KANITLI | Request company relation | Controlled zincirde Eksen Alici goruldu |
| Teklif olusturma | KANITLI | Quotation API | Legacy total ile controlled teklif olustu |
| Fiyat hesaplama | KANITLANMADI | Calculation API | Gercek item/catalog/calculation 0 |
| m2/ozel islem/vergi | KANITLANMADI | Generic model | Zengin semantik/vergi yok |
| Termin ve teklif gonderme | KANITLI | Quotation API | Controlled send/accept zinciri |
| Teklif guncelleme/revise | KISMEN | Quotation API | Mock/unit; gercek tum durum E2E yok |
| Siparis kabul | KANITLI | Order API | Controlled confirm |
| Uretim planlama/durum | KANITLI | Production API | Planned -> In progress -> Completed |
| Sevkiyat/teslim | KANITLI | Shipment API | Planned -> In transit -> Delivered |
| Firma profili | BASARISIZ | localStorage | Backend Company ile bagli degil |
| Urun gami/fiyat listesi | BASARISIZ | localStorage | Backend PriceCatalog ile bagli degil |
| Kapasite/calisma bolgesi | BASARISIZ | localStorage | Authoritative degil |
| Musteri firmalari | BASARISIZ | localStorage | Backend Company/Membership ile bagli degil |
| Mesaj/bildirim | BASARISIZ | local activityLog | Diger panel/backend delivery yok |

Uretici sonucu: Mevcut Nova Uretici controlled core state gecislerini tamamlamistir. Ticari dogruluk, istenen Eksen Uretici kimligi, zengin cam/fiyat/dosya ve bildirim zinciri kanitlanmadi.

## Buton ve form kapsam siniri

Mevcut testler Request, Item, Attachment, Analysis, Quotation, Calculation, Order, Production ve Shipment ana aksiyonlarini mock API ile dener. Buna ragmen asagidakiler tum panel icin kanitlanmamistir:

- Her gorunur butonun tekil inventory ID'si ve her role/status kombinasyonu.
- Double-click, slow response ve response sonrasi modal/toast/list/DB eslesmesi.
- Her form alaninda required, min/max, negatif, sifir, decimal, cok uzun, Turkce karakter, ozel karakter, paste, cancel ve reset.
- Her error statusunda ilk invalid alana focus ve screen-reader error association.
- Local CRUD aksiyonlarinin ikinci browser/cihazda gorunurlugu; kaynak geregi beklenen sonuc basarisizdir.

## Responsive kapsam siniri

Dokuz viewport'ta onceki geometry olcumleri vardir. Ancak her sayfa icin loading, empty, error, uzun firma adi, uzun aciklama, uzun urun adi, acik modal/dropdown ve keyboard focus kombinasyonlari ayrica olculmemistir. Bu nedenle panel genelinde responsive kabul `KISMEN`dir.
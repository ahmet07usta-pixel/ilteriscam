# Panel By Panel Full Audit

Tarih: 2026-08-10

## Kapsam ve sayim

| Kalem | Sonuc | Durum |
|---|---:|---|
| Panel | 3 | PASS |
| Authenticated route | 13 | PASS |
| Admin menu route | 13 | PASS |
| Uretici menu route | 13 | PASS |
| Alici menu route | 8 | PASS |
| Alici direct-denied route | 5 | PASS |

Route acilmasi bir sayfanin authoritative, guvenli veya islevsel oldugu anlamina gelmez. Yeni authenticated runtime testi mutation-free session bulunmadigi icin `BLOCKED` durumundadir; route sonuclari onceki gercek oturum kaniti ve mevcut kaynak uzlastirmasidir.

## Ortak route matrisi

| Route | Admin | Uretici | Alici | Veri kaynagi | Final |
|---|---|---|---|---|---|
| Kontrol Paneli | PASS | PASS | PASS | Local/static workflow metrikleri | FAIL |
| Talepler | PASS | PASS | PASS | Backend role varsa API | PASS |
| Teklifler | PASS | PASS | PASS | Backend role varsa API | PASS |
| Siparisler | PASS | PASS | PASS | Backend role varsa API | PASS |
| Fiyat/Urun | PASS | PASS | PASS | Local workflow; Alici route denied | FAIL |
| Firma Profili/Kapasite | PASS | PASS | PASS | Local workflow; Alici route denied | FAIL |
| Uretim Takibi | PASS | PASS | PASS | Backend role varsa API; Alici route denied | PASS |
| Sevkiyat | PASS | PASS | PASS | Backend role varsa API | PASS |
| Mesajlar | PASS | PASS | PASS | Local activity | FAIL |
| Bildirimler | PASS | PASS | PASS | Local activity/read state | FAIL |
| Firmalar | PASS | PASS | PASS | Local workflow; Alici route denied | FAIL |
| Raporlar | PASS | PASS | PASS | Local workflow; Alici route denied | FAIL |
| Ayarlar/Profilim | PASS | PASS | PASS | Local/static | FAIL |

`PASS` panel hucreleri route erisimini; `Final` kolonu sayfanin urun kabulunu ifade eder.

## Admin paneli

| Yuzey | Durum | Kanit |
|---|---|---|
| 13 route navigation | PASS | Onceki gercek Admin oturumunda acildi |
| Core Request -> Shipment gorunurlugu | PASS | Controlled chain list/detail ve DB relation kaniti |
| Dashboard canli veri iddiasi | FAIL | API cagrisi olmadan static/local metrikler |
| Firma, pricing, profile, report, settings yonetimi | FAIL | Browser-local state; diger bilgisayara authoritative yansima yok |
| Backend audit/notification/user yonetim capability'sinin UI karsiligi | FAIL | Frontend API client/call-site yok |
| User response veri minimizasyonu | FAIL | `/auth/me` ve `POST /users` raw User riski |
| Her Admin butonunun runtime matrisi | NOT COVERED | Rol/state/kayit kombinasyonlu exhaustive test yok |

## Uretici paneli

| Yuzey | Durum | Kanit |
|---|---|---|
| 13 route navigation | PASS | Mevcut Nova/Producer kimligiyle onceki kanit |
| Request recipient -> Quotation | PASS | Controlled Eksen -> Nova zinciri |
| Order confirm -> Production -> Shipment | PASS | Controlled status/version zinciri |
| Istenen Eksen Uretici kimligi | FAIL | Mevcut producer Nova'dir |
| AWARDED Request aksiyonlari | FAIL | Teklif/duzenle/sil gibi durum disi aksiyonlar gorunuyor |
| Fiyat ve kapasite shared data | FAIL | Local workflow store |
| Fiyat/profile responsive aksiyonlari | FAIL | Onceki dokuz viewport kanitinda overflow/offscreen |
| Zengin cam + calculation pozitif E2E | BLOCKED | DB fixture'i yok; mutation yasakli |

## Alici paneli

| Yuzey | Durum | Kanit |
|---|---|---|
| 8 gorunur route navigation | PASS | Mevcut Eksen/Sales kimligiyle onceki kanit |
| 5 yetkisiz route UI engeli | PASS | AccessDenied ve ilgili mock API cagrisinin olmamasi |
| Istenen Nova Alici kimligi | FAIL | Mevcut buyer Eksen'dir |
| Request create/routing/accept omurgasi | PASS | Controlled ters-identity zinciri |
| Kendi recipient secimini detayda gorme | FAIL | Scoped detail recipient'i owner'dan gizliyor |
| `Profilim` urun sahipligi | FAIL | Platform Ayarlari CRUD ekrani aciliyor |
| Dashboard hizli aksiyon sahipligi | FAIL | Teklif Ver/Siparis Olustur/Sevkiyat Planla gibi rol disi aksiyonlar |
| Global user directory privacy | FAIL | SALES dahil normal roller `users.read` aliyor |

## Ortak panel engelleri

| Engel | Admin | Uretici | Alici | Durum |
|---|---|---|---|---|
| LAN F5/direct URL session | Etkilenir | Etkilenir | Etkilenir | FAIL |
| Public credential exposure | Etkilenir | Etkilenir | Etkilenir | FAIL |
| Backend notification | Etkilenir | Etkilenir | Etkilenir | FAIL |
| Gercek ikinci cihaz senkronizasyonu | Local yuzeylerde yok | Local yuzeylerde yok | Local yuzeylerde yok | FAIL |
| Fiziksel uc cihaz kabul testi | Yok | Yok | Yok | NOT COVERED |

Panel karari: **CANLI KULLANIMA HAZIR DEGIL**.
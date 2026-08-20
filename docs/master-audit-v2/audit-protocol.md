# Master Denetim V2 Protokolu

Tarih: 2026-08-10

## Amac

Bu denetim urunu siradan bir CRUD uygulamasi olarak degil; Alici -> Talep -> Eslesme -> Teklif -> Karar -> Siparis -> Uretim -> Sevkiyat -> Teslimat B2B zinciri olarak degerlendirir. Admin, Uretici ve Alici panelleri ilk kez kullanan, deneyimli, mobile, tablet ve desktop kullanici bakislarindan ayri ayri incelenir.

Onceki master denetim baslangic kanitidir; bu denetimin yerine gecmez. Onceki her bulgu `hala var`, `cozulmus`, `kismen cozulmus` veya `kanitlanamadi` olarak yeniden siniflandirilir.

## Degisiklik ve Mutation Siniri

- Production ortamina erisilmez.
- Uygulama kodu, schema, migration, seed ve mevcut is verileri denetim tamamlanmadan degistirilmez.
- Ilk faz read-only kod, UI, API ve PostgreSQL incelemesidir.
- Development mutation gerekirse onceden kayit numarasi/fixture, amac, method/route, beklenen sonuc ve geri alma yontemi raporlanir.
- Acik izin olmadan yeni firma, kullanici, tenant, workflow veya dosya fixture'i olusturulmaz.
- Secret, parola, token, cookie degeri veya hash rapora yazilmaz.

## Kanit Standardi

Bir ozellik yalniz ilgili kanitlar birlikte mevcutsa calisiyor kabul edilir:

1. Gercek rol oturumunda UI aksiyonu.
2. Network method, route, status, payload sinifi ve duplicate sayisi.
3. Mutation sonrasi authoritative GET.
4. PostgreSQL relation, owner company/user, status ve version.
5. Diger yetkili panelde ayni kayit ve yetkisiz panel/tenant'ta gorunmezlik.
6. Refresh, direct URL, logout/login, back/forward ve ikinci tab kaliciligi.
7. Bos, hatali, uzun, unicode, negatif, sifir, buyuk deger, stale CAS, duplicate ve yetkisiz negatif davranis.
8. Loading, empty, success ve error UI geri bildirimi.
9. Mobile/tablet/desktop element geometry ve gercek kullanilabilirlik.

Kodun mevcut olmasi, endpoint `200`, mock response, localStorage testi veya butonun gorunmesi tek basina kabul kaniti degildir.

## Zorunlu Roller ve Kimlik Dogrulama

- Admin: Platform/global yonetim.
- Uretici: Nova Cephe Sistemleri ile gercek membership relation'i.
- Alici: Eksen Cam Sanayi ile gercek membership relation'i.

Gorunen isimler hard-code dogrulama sayilmaz. User, Company ve Membership ID relation'lari API ve PostgreSQL'den karsilastirilir.

## Zorunlu Teknik Kapsam

- Auth/session: login, logout, refresh, F5, direct URL, expiry, iki cihaz/tab ve rol degisikligi.
- Authorization: role, permission, ownership, company scope ve bagimsiz tenant IDOR.
- Workflow: Request, RequestItem, RequestRecipient, Quotation, Order, Production, Shipment, Notification ve Audit.
- Cam domain: olcu, adet, kalinlik, kombinasyon, kaplama, renk, temper, Low-E, lamine, ara bosluk, ozel islemler ve termin.
- Hesaplama: m2, adet carpani, fiyat, yuvarlama, vergi ve urun/fiyat listesi baglantisi.
- Dosya: upload, download, tip, boyut, bozuk dosya, ownership ve delete.
- Durumlar: loading, empty, data, validation, network error ve success.
- Guvenlik: IDOR, broken access control, excessive data exposure, XSS/CSRF/rate-limit yuzeyi ve token handling.
- Accessibility: keyboard, focus, label, aria, modal focus/Escape, contrast ve disabled state.
- Browser: Chromium/Chrome, Edge, Firefox ve mevcut ortam izin verirse Safari/WebKit.

## Zorunlu Viewport Matrisi

- 390x844
- 414x896
- 768x1024
- 820x1180
- 1024x768
- 1280x720
- 1366x768
- 1440x900
- 1920x1080

Document overflow tek metrik degildir. Her etkileşimli elementin viewport/kapsayici icinde erisilebilirligi, touch hedefi, modal/dropdown tasmasi, metin kesilmesi ve overlap olculur.

## Onceki Bulgu Regresyon Listesi

`AUD-001` ile `AUD-016` arasindaki tum kayitlar yeniden uretilir. Kullanici tarafindan ozel istenen on bes alan icin ayri durum matrisi tutulur: LAN session, direct URL, dashboard kaynagi, Notification baglantisi, local/static ekranlar, global user directory, Uretici mobile CRUD, tablet tablolar, Eksen/Nova mapping, Request routing, Quotation visibility, Order visibility, Production visibility, Shipment visibility ve notification audience.

## Test Edilemeyen Alan Kurali

Fiziksel ikinci cihaz, bagimsiz tenant fixture'i, Safari/WebKit, servis kesintisi veya guvenli geri alma fixture'i yoksa sonuc `kanitlanamadi` olarak yazilir. Bu alanlar basarili kabul edilmez.

## Bulgu Kayit Formati

Her yeni veya yeniden dogrulanan problem su alanlari tasir:

- ID
- Baslik
- Panel
- Sayfa
- Rol
- Adimlar
- Beklenen
- Gerceklesen
- Tekrar uretilebilirlik
- Etki
- Kok neden
- Katman
- Oncelik P0-P4
- Onerilen cozum
- Kanit

## Final Rapor Sozlesmesi

Final rapor asagidaki A-Q bolumlerini eksiksiz icerir:

A. Denetlenen paneller
B. Denetlenen ana sayfalar
C. Denetlenen workflow'lar
D. Test edilen kritik buton/form/islemler
E. Tum problemler onem sirasiyla
F. Onceki bulgularin regresyon durumu
G. Test edilemeyen alanlar
H. Eksik test fixture'lari
I. Guvenlik bulgulari
J. UX/UI bulgulari
K. Veri butunlugu bulgulari
L. Entegrasyon bulgulari
M. Performans bulgulari
N. Is akisi bulgulari
O. Canli kullanima engeller
P. Degistirilmemesi gereken calisan alanlar
Q. Kanitli canli kullanim karari

Son karar yalniz sunlardan biri olabilir:

1. `CANLI KULLANIMA HAZIR`
2. `DUZELTMELERDEN SONRA HAZIR`
3. `CANLI KULLANIMA HAZIR DEGIL`
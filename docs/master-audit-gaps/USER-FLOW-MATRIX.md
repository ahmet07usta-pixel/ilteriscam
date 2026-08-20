# User Flow Matrix

Tarih: 2026-08-10

Kabul kurali: Bir adim ancak UI + frontend state + API + authorization + DB + ilgili diger panel + notification + refresh/navigation + responsive kanitlari ilgili oldugu olcude birlikte saglarsa `TAMAM` sayilir.

## Kimlik kapisi

| Kabul kimligi | Mevcut authoritative kimlik | Sonuc |
|---|---|---|
| Alici: Nova Cam Cephe Sistemleri | Alici: Eksen Cam Sanayi | BASARISIZ |
| Uretici: Eksen Cam Sanayi | Uretici: Nova Cephe Sistemleri | BASARISIZ |

Bu nedenle kullanicinin tarif ettigi tam senaryo baslatilamadi. Asagidaki core kanit, onceki denetimdeki ters yonlu Eksen Alici -> Nova Uretici controlled zinciridir.

## Alici -> Uretici -> Teslimat matrisi

| Adim | UI | State | API | AuthZ | DB | Diger panel | Notification | Refresh/nav | Responsive | Sonuc |
|---|---|---|---|---|---|---|---|---|---|---|
| Alici login | Evet | Memory token | Evet | Origin/role | User/membership | N/A | N/A | Hayir | Kismen | BASARISIZ |
| Alici profil | Yanlis ekran | Local | Hayir | UI role | Eslesmiyor | N/A | Hayir | Local | Kismen | BASARISIZ |
| Yeni talep temel bilgi | Evet | Form | Evet | Buyer owner | Request var | Ureticiye routing sonrasi | Hayir | Session bozuk | Kismen | KISMEN |
| Cam recetesi | Eksik | Generic | Eksik | Var | Item 0 | Yok | Yok | Yok | Kismen | KANITLANMADI |
| Olcu/adet/m2 | UI mevcut | Local form/API mapper | API mevcut | Scope var | Item 0 | Yok | Yok | Yok | Kismen | KANITLANMADI |
| Dosya upload | UI mevcut | API state | API mevcut | Scope var | Attachment 0 | Yok | Yok | Yok | Kismen | KANITLANMADI |
| AI analysis/review | UI mevcut | Poll state | API mevcut | Scope var | Analysis 0 | Yok | Yok | Yok | Kismen | KANITLANMADI |
| Uretici secimi | Evet | Form | Recipient API | Owner scope | Eksen -> Nova var | Nova UI onceki denetimde gordu | Hayir | Session bozuk | Kismen | KISMEN |
| Talep submit | Evet | Refetch | Evet | Buyer | OPEN/AWARDED history | Evet | Hayir | Session bozuk | Kismen | KISMEN |
| Uretici talep detay | Evet | API state | Evet | Recipient scope | Relation var | Alici recipient'i kendi detail'da goremiyor | Hayir | Session bozuk | Kismen | KISMEN |
| Teklif olustur | Evet | API state | Evet | Producer recipient | Quotation var | Alici gordu | Hayir | Session bozuk | Kismen | KISMEN |
| Fiyat hesapla | UI mevcut | API state | API mevcut | Producer | Calculation 0 | Yok | Yok | Yok | Kismen | KANITLANMADI |
| Teklif gonder | Evet | Refetch | Evet | Producer/status | SENT/ACCEPTED history | Alici gordu | Hayir | Session bozuk | Kismen | KISMEN |
| Alici teklif kabul | Evet | Refetch | Evet | Buyer/status | Order atomik olustu | Uretici gordu | Hayir | Session bozuk | Kismen | KISMEN |
| Uretici siparis confirm | Evet | Refetch | Evet | Producer/status | CONFIRMED | Alici okudu | Hayir | Session bozuk | Kismen | KISMEN |
| Uretim planla/baslat/tamamla | Evet | Refetch | Evet | Producer/CAS | COMPLETED | Alici/Admin okudu | Hayir | Session bozuk | Kismen | KISMEN |
| Sevkiyat planla/yola cikar | Evet | Refetch | Evet | Producer/CAS | IN_TRANSIT | Alici/Admin okudu | Hayir | Session bozuk | Kismen | KISMEN |
| Teslim et | Evet | Refetch | Evet | Producer/CAS | DELIVERED | Alici/Admin okudu | Hayir | Session bozuk | Kismen | KISMEN |

Tam `TAMAM` satiri yoktur. Core state/relation gecisleri calismistir; notification, refresh, istenen identity ve zengin ticari veri katmanlari tamamlanmadigi icin butun kullanici akisi kabul edilemez.

## Notification olay matrisi

| Olay | Beklenen alici | Backend event/row | UI kaynagi | Sonuc |
|---|---|---|---|---|
| Talep gonderildi | Secili Uretici | 0 controlled row | local seed/activity | BASARISIZ |
| Teklif gonderildi | Talep sahibi Alici | 0 controlled row | local activity | BASARISIZ |
| Teklif kabul edildi | Teklif Ureticisi | 0 controlled row | local activity | BASARISIZ |
| Siparis onaylandi | Alici ve ilgili taraf | 0 controlled row | local activity | BASARISIZ |
| Uretim basladi/tamamlandi | Alici | 0 controlled row | local activity | BASARISIZ |
| Sevkiyat basladi | Alici | 0 controlled row | local activity | BASARISIZ |
| Teslim edildi | Ilgili taraflar | 0 controlled row | local activity | BASARISIZ |

## Route yasam dongusu

| Senaryo | Kanit | Sonuc |
|---|---|---|
| SPA menu navigation | Uc rolde route acilma | KANITLI |
| Direct authenticated URL | Refresh cookie LAN host'a kaydedilmiyor | BASARISIZ |
| F5 reload | Access token memory'den kayboluyor, refresh kurtaramiyor | BASARISIZ |
| Unknown URL | Dashboard'a sessiz redirect | BASARISIZ |
| Unauthorized role route | AccessDenied ve mock API call engeli | KISMEN |
| Expired access token + valid refresh | LAN cookie yok | BASARISIZ |
| Invalid token | Backend strategy kodu ve unit davranisi | KISMEN |
| Back/forward her route | Sistematik matris yok | KANITLANMADI |
| Ikinci tab | Session cookie sorunu nedeniyle kabul yok | KANITLANMADI |
| Logout -> tekrar login | Logout server mutation onceki denetimde; response browser'da abort | KISMEN |

## Mutation gerektirdigi icin calistirilmayanlar

- Istenen yeni Nova Alici -> Eksen Uretici fixture'i.
- Yeni RequestItem, PriceCatalog, Attachment, Analysis ve Calculation zinciri.
- Ucuncu bagimsiz tenant, ikinci buyer/producer kullanicilari.
- Yeni login; refresh hash ve AuditLog yazacagi icin bu fazda yapilmadi.
- Paralel accept/finalize/transition ve double-click gercek API testleri.

Bu alanlar `calisiyor` kabul edilmedi.
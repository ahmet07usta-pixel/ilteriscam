# Master Sistem Denetimi Protokolu

Tarih: 2026-08-10

## Amac

Bu denetim Admin, Uretici ve Alici panellerinin gercek kullanicilar tarafindan teknik ekip destegi olmadan kullanilabilirligini; ortak backend, yetki, firma kapsami ve baglantili is akislariyla birlikte kanitlamak icin yurutulur.

Denetim tamamlanmadan sistem icin `CANLI KULLANIMA HAZIR` karari verilemez.

## Degisiklik Siniri

- Ilk analiz ve test asamalarinda uygulama kodu, schema, migration, seed ve mevcut is verileri degistirilmez.
- Production ortamina erisilmez.
- Mutasyon gerektiren kabul senaryolari yalniz gelistirme ortaminda, onceden tanimli tek kontrollu kayit zinciriyle yurutulur.
- Bulgu goruldugunde hemen duzeltme yapilmaz. Tekrar uretim, kok neden, etki alani ve ikinci kanit kaydedilir.
- Secret, parola, access token, refresh token veya hash rapora yazilmaz.

## Kanit Seviyeleri

Bir ozellik ancak asagidaki kanitlardan ilgili olanlar birlikte mevcutsa basarili sayilir:

1. UI kaniti: Gercek rol oturumunda kullanici aksiyonu ve gorunur sonuc.
2. Network kaniti: Beklenen API methodu, route, status ve tekrar cagri sayisi.
3. Authoritative GET kaniti: Mutasyon sonrasi ekran verisinin backend'den yeniden alinmasi.
4. Database kaniti: Kaydin dogru relation, firma, kullanici, status ve version ile PostgreSQL'de bulunmasi.
5. Capraz panel kaniti: Yetkili diger rollerin ayni kaydi gormesi, yetkisiz rol/firmanin gormemesi.
6. Kalicilik kaniti: Refresh, direct URL, logout/login ve browser back/forward sonrasinda dogru durum.
7. Negatif kanit: Bos, hatali, uzun, duplicate, stale version ve yetkisiz istek davranisi.

Yalniz API `200`, ekranda buton bulunmasi veya mock/localStorage testi yeterli kanit degildir.

## Veri Kaynagi Siniflari

| Sinif | Tanim | Kabuldeki degeri |
| --- | --- | --- |
| Authoritative API | NestJS API ve PostgreSQL kaynakli veri | Cok kullanicili kabul kaniti olabilir |
| Backend session + local feature | Gercek login, fakat ozellik verisi localStorage/mock | Ortak sistem kaniti degildir |
| Mocked API test | Playwright route interception ile sahte response | UI kontrat/regresyon kanitidir, canli entegrasyon kaniti degildir |
| Static demo | Sabit kart, metrik veya arama indeksi | Yalniz sunum kanitidir |

## Ilk Veri Kaynagi Envanteri

| Yuzey | Ilk siniflandirma | Denetimde kanitlanacak konu |
| --- | --- | --- |
| Login/logout/session | Authoritative API + local session cache | Cookie yenileme, 401, expiry, tekrar login |
| Talepler | Backend-role kullanicida Authoritative API | Alici sahipligi, recipient scope, CRUD/CAS |
| Teklifler | Backend-role kullanicida Authoritative API | Uretici kapsami, revizyon, karar ve Order olusumu |
| Siparisler | Backend-role kullanicida Authoritative API | Alici/uretici scope, confirm/cancel ve aggregate izolasyonu |
| Uretim | Backend-role kullanicida Authoritative API | Uretici scope, status sirasi, CAS ve Order izolasyonu |
| Sevkiyat | Backend-role kullanicida Authoritative API | Uretici scope, status sirasi, CAS ve aggregate izolasyonu |
| Dashboard | Static/local workflow gostergeleri supheli | API ve PostgreSQL ile uyum ayrica kanitlanacak |
| Global arama | Static arama indeksi | Gercek kayitlari bulup bulmadigi kanitlanacak |
| Mesajlar/Bildirimler | `activityLog` ve local read state | Backend kaynakli olup olmadigi kanitlanacak |
| Fiyat ve urun | local workflow store supheli | Ortak firma verisi ve persistence kanitlanacak |
| Firma profili/kapasite | local workflow store supheli | Backend company modeliyle baglantisi kanitlanacak |
| Firmalar | local ve backend yuzey karisimi supheli | CRUD'nin authoritative olup olmadigi kanitlanacak |
| Raporlar | local/static supheli | Gercek workflow verisini kullanip kullanmadigi kanitlanacak |
| Ayarlar/kullanici yonetimi | local ve backend yuzey karisimi supheli | Profil, kullanici ve firma kaynaginin dogrulugu kanitlanacak |

## Faz Gecis Kurali

Her faz icin envanter, pozitif test, negatif test, runtime gozlemi, veri kaynagi ve acik bulgular kaydedilmeden sonraki faz tamamlanmis sayilmaz. P0 veya P1 bulgu varken `CANLI KULLANIMA HAZIR` karari verilemez.

## Onem Siniflari

- P0: Sistem kullanilamiyor, veri kaybi veya kritik guvenlik ihlali.
- P1: Ana is akisi tamamlanamiyor veya yanlis firmaya/veriye islem yapiliyor.
- P2: Onemli fonksiyon, rol, bildirim veya veri tutarliligi hatasi.
- P3: UX, performans, hata yonetimi veya ikincil islev problemi.
- P4: Kozmetik sorun veya dusuk riskli iyilestirme.
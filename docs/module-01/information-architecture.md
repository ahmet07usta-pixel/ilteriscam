# Modul 01 - Bilgi Mimarisi

## 1. Urun Konumlandirma
- Hedef: Cam tedarik surecinde talep, teklif, siparis ve uretim takibini tek platformda birlestirmek.
- Kisi tipleri:
  - Alici
  - Uretici
  - Yonetici

## 2. Alan Sinirlari (Bounded Context)
- Identity & Access:
  - Kullanici, rol, oturum, yetki denetimi.
- Company Network:
  - Firma kaydi, firma tipi, dogrulama, durum yonetimi.
- Demand & Quotation:
  - Talep olusturma, teklif verme, teklif karsilastirma.
- Order Lifecycle:
  - Siparis onayi, asama gecisleri, zaman cizelgesi.
- Notification Center:
  - In-app bildirimler, kritik olay uyarilari.
- Admin Control:
  - Kullanici/firma yonetimi, sistem sagligi, denetim gunlukleri.

## 3. Navigasyon Yapisi
- Ortak:
  - Giris
  - Sifre sifirlama
  - Bildirim merkezi
  - Profil ve firma bilgileri
- Alici Paneli:
  - Genel bakis
  - Taleplerim
  - Gelen teklifler
  - Siparisler ve canli uretim takibi
- Uretici Paneli:
  - Genel bakis
  - Atanan talepler
  - Teklif yonetimi
  - Uretim emri ve asama guncelleme
- Yonetici Paneli:
  - Genel bakis
  - Kullanici yonetimi
  - Firma yonetimi
  - Sistem metrikleri ve olaylar

## 4. Cekirdek Ekran Katalogu
- Authentication:
  - Login
  - Forgot Password
- Alici:
  - Buyer Overview
  - Buyer Requests List
  - Buyer Request Detail
  - Buyer Offers Compare
  - Buyer Orders List
  - Buyer Order Tracking
- Uretici:
  - Manufacturer Overview
  - Manufacturer Demand Inbox
  - Manufacturer Quote Composer
  - Manufacturer Production Board
- Yonetici:
  - Admin Overview
  - Admin Users
  - Admin Companies
  - Admin System

## 5. Durum Katmanlari
- Her ekran icin zorunlu durumlar:
  - Initial/loading
  - Empty
  - Error
  - Success/steady
  - Action feedback (toast)

## 6. Modul 02 Icin Hazir Altyapi
- API katmani role ve domain bazli ayrildi.
- UI token sistemi olusturuldu.
- Durum yonetimi (store) ekranlardan ayrik tasarlandi.
- Veri modeli Modul 02'de gercek backend kontrati ile eslenebilecek sekilde normalize edildi.

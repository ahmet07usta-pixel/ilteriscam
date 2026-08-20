# Modul 01 - Bilesen Mimarisi

## 1. Tasarim Dili Prensipleri
- Premium, kurumsal, net bilgi yogunlugu.
- Hafif glassmorphism: yuksek blur yerine katmanli yarim saydam paneller.
- Rol bazli renk vurgu sistemi:
  - Alici: mavi-yesil
  - Uretici: amber-celik
  - Yonetici: grafit-kirmizi vurgu

## 2. Tasarim Tokenlari
- Color Tokens
  - bg.base
  - bg.elevated
  - border.soft
  - text.primary
  - text.secondary
  - state.success/warning/error/info
- Radius Tokens
  - r.sm, r.md, r.lg, r.xl
- Spacing Tokens
  - s.1 ... s.10
- Typography Tokens
  - font.display
  - font.body
  - size.xs ... size.2xl

## 3. UI Bilesenleri
- Layout
  - AppShell
  - TopBar
  - SideNav
  - MobileNav
- Data Display
  - StatCard
  - StageTimeline
  - OfferComparisonTable
  - ActivityFeed
- Form
  - TextField
  - SelectField
  - DateField
  - NumberField
  - TextArea
- Feedback
  - EmptyState
  - LoadingState
  - ErrorState
  - ToastStack
- Domain Blocks
  - DemandCard
  - QuoteCard
  - OrderTrackingPanel
  - AdminAuditPanel

## 4. Mimari Katmanlar
- app:
  - route tanimlari, shell kompozisyonu.
- pages:
  - ekran kompozisyonlari.
- widgets:
  - ekran parcaciklari.
- features:
  - is kurali ve UI etkileşimleri.
- entities:
  - domain tipleri ve adapterler.
- shared:
  - tasarim sistemi, util fonksiyonlar, API istemcisi.

## 5. Modul 02 Icin Uyum
- Domain tipleri API DTO'larindan ayrik tutuldu.
- Store selector'lari mobilde yeniden kullanilabilir olacak sekilde tanimlandi.
- UI bilesenleri platformdan bagimsiz primitive katmanina bolunebilir tasarlandi.

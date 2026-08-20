# Modul 01 - Veri Modeli (Uygulama Seviyesi)

## 1. Rol ve Kimlik
- User
  - id: string
  - fullName: string
  - email: string
  - role: BUYER | MANUFACTURER | ADMIN
  - companyId: string
  - status: active | suspended
  - createdAt: ISODate

- Company
  - id: string
  - legalName: string
  - tradeName: string
  - type: GLASS_PRODUCER | ALUMINUM | PVC | BALCONY | FURNITURE | OTHER
  - city: string
  - verificationStatus: pending | verified | rejected
  - createdAt: ISODate

## 2. Talep ve Teklif
- Demand
  - id: string
  - buyerCompanyId: string
  - title: string
  - glassType: ISICAM | TEMPERLI | LAMINE | DIGER
  - quantity: number
  - unit: m2 | adet
  - targetDeliveryDate: ISODate
  - note: string
  - status: open | quoting | closed
  - createdAt: ISODate

- Quote
  - id: string
  - demandId: string
  - manufacturerCompanyId: string
  - totalAmount: number
  - currency: TRY
  - leadTimeDays: number
  - validUntil: ISODate
  - status: submitted | revised | accepted | rejected
  - createdAt: ISODate

## 3. Siparis ve Uretim
- Order
  - id: string
  - demandId: string
  - acceptedQuoteId: string
  - buyerCompanyId: string
  - manufacturerCompanyId: string
  - status: OrderStage
  - eta: ISODate
  - createdAt: ISODate

- OrderStage (enum)
  - TALEP_ALINDI
  - TEKLIF_HAZIRLANIYOR
  - SIPARIS_ONAYLANDI
  - URETIME_ALINDI
  - KESIM
  - ISLEME
  - TEMPER
  - LAMINASYON
  - KALITE_KONTROL
  - PAKETLEME
  - SEVKE_HAZIR
  - YOLDA
  - TESLIM_EDILDI

- OrderTimelineEvent
  - id: string
  - orderId: string
  - stage: OrderStage
  - happenedAt: ISODate
  - actorUserId: string
  - note: string

## 4. Bildirim
- Notification
  - id: string
  - userId: string
  - type: info | warning | success | error
  - title: string
  - description: string
  - isRead: boolean
  - createdAt: ISODate

## 5. Modul 02 Hazirligi
- Tum id alanlari UUIDv7 uyumlu dusunuldu.
- Role tabanli endpoint ayristirmasi icin entity baglari net tutuldu.
- Uretim zaman cizelgesi event tabanli tasarlandi; websocket/sse entegrasyonuna uygundur.

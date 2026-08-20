# User Flow Full Matrix

Tarih: 2026-08-10

Kabul kurali: Bir adim gerekli oldugu olcude UI, state, API, AuthZ, DB, diger panel, notification, refresh/navigation ve responsive kanitlarini birlikte saglamadan `PASS` olmaz.

## Identity kapisi

| Kabul kimligi | Authoritative kimlik | Durum |
|---|---|---|
| Alici: Nova Cam Cephe Sistemleri | Alici: Eksen Cam Sanayi | FAIL |
| Uretici: Eksen Cam Sanayi | Uretici: Nova Cephe Sistemleri | FAIL |

Istenen akisin fixture kapisi `FAIL` oldugu icin yeni full-chain runtime testi `BLOCKED` durumundadir. Mevcut controlled zincir Eksen Alici -> Nova Uretici yonundedir.

## A-Z is akisi

| Adim | UI | API/AuthZ | DB | Diger panel | Bildirim | Refresh | Final |
|---|---|---|---|---|---|---|---|
| Login | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |
| Forgot password | FAIL | FAIL | NOT COVERED | NOT COVERED | NOT COVERED | NOT COVERED | FAIL |
| Alici profil | FAIL | NOT COVERED | NOT COVERED | NOT COVERED | NOT COVERED | FAIL | FAIL |
| Yeni Request temel bilgi | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Zengin cam recetesi | FAIL | FAIL | BLOCKED | BLOCKED | NOT COVERED | FAIL | FAIL |
| Olcu/adet/derived unit | PASS | PASS | BLOCKED | BLOCKED | NOT COVERED | FAIL | BLOCKED |
| Attachment upload/download | PASS | PASS | BLOCKED | BLOCKED | NOT COVERED | FAIL | BLOCKED |
| AI analysis/review | PASS | PASS | BLOCKED | BLOCKED | NOT COVERED | FAIL | BLOCKED |
| Uretici secimi | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Request submit | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Uretici Request detail | PASS | PASS | PASS | FAIL | FAIL | FAIL | FAIL |
| Quotation create | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Calculation generate/finalize | PASS | PASS | BLOCKED | BLOCKED | NOT COVERED | FAIL | BLOCKED |
| Quotation send | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Buyer accept | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Order confirm | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Production plan/start/complete | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Shipment plan/in-transit | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |
| Delivery complete | PASS | PASS | PASS | PASS | FAIL | FAIL | FAIL |

## Controlled chain state kaniti

| Resource | State/version | Relation | Durum |
|---|---|---|---|
| Request | AWARDED v4 | Buyer Eksen, recipient Nova | PASS |
| Quotation | ACCEPTED v3 | Request + buyer/producer | PASS |
| Order | CONFIRMED v2 | Request + quotation + parties | PASS |
| Production | COMPLETED v3 | Unique order + producer | PASS |
| Shipment | DELIVERED v3 | Unique production + order | PASS |
| RequestItem | 0 row | Cam/olcu fixture'i yok | BLOCKED |
| Attachment | 0 row | File fixture'i yok | BLOCKED |
| QuotationCalculation | 0 row | Legacy quotation | BLOCKED |
| Notification | 0 row | Controlled event teslimi yok | FAIL |

## Notification olaylari

| Olay | Beklenen hedef | Backend event/row | UI kaynagi | Durum |
|---|---|---|---|---|
| Request submit | Secili Uretici | Yok | Local activity | FAIL |
| Quotation send | Talep sahibi Alici | Yok | Local activity | FAIL |
| Quotation accept | Uretici | Yok | Local activity | FAIL |
| Order confirm | Ilgili taraflar | Yok | Local activity | FAIL |
| Production transition | Alici | Yok | Local activity | FAIL |
| Shipment transition | Alici | Yok | Local activity | FAIL |
| Delivery | Ilgili taraflar | Yok | Local activity | FAIL |

## Navigation ve session

| Senaryo | Durum | Kanit |
|---|---|---|
| SPA menu navigation | PASS | Onceki uc rol route kaniti |
| Direct authenticated URL | FAIL | LAN refresh cookie kullanilamiyor |
| F5 reload | FAIL | Memory access token kayboluyor |
| Unknown authenticated URL | FAIL | Dashboard'a sessiz redirect |
| Unauthorized role route | PASS | UI AccessDenied; backend full IDOR sertifikasi degil |
| Expired access + refresh | FAIL | LAN cookie kapisi |
| Back/forward tum route/state | NOT COVERED | Sistematik runtime matrisi yok |
| Ikinci tab | BLOCKED | Gecerli mutation-free session yok |
| Coklu cihaz | NOT COVERED | Fiziksel ikinci cihaz testi yok |
| Logout completion | FAIL | UI response'u beklemiyor |

## Calistirilmayan mutation senaryolari

| Senaryo | Durum | Neden |
|---|---|---|
| Nova Alici -> Eksen Uretici fixture'i | BLOCKED | DB mutation gerekir |
| RequestItem + PriceCatalog + Calculation | BLOCKED | DB mutation gerekir |
| Attachment + AI positive lifecycle | BLOCKED | Storage/DB mutation gerekir |
| Parallel accept/finalize/transition | BLOCKED | Is kaydi mutation'i gerekir |
| Double-click idempotency real HTTP | BLOCKED | Is kaydi mutation'i gerekir |

Akis karari: tam `PASS` A-Z zinciri yoktur; **CANLI KULLANIMA HAZIR DEGIL**.
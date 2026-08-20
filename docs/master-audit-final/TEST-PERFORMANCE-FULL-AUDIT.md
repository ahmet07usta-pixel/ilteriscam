# Test Performance Full Audit

Tarih: 2026-08-10

## Executable test sonucu

| Paket | Sonuc | Durum |
|---|---|---|
| Backend direct Node runner | 168 passed, 0 failed | PASS |
| Backend `npm test` | 0 test; success exit | FAIL |
| Backend typecheck | Hata yok | PASS |
| Frontend lint | Hata yok | PASS |
| Frontend isolated Chromium | 45 passed, 1 failed, 3 flaky | FAIL |
| Frontend onceki isolated run | 46 passed, 1 failed, 2 flaky | FAIL |
| Default reused 4176 server run | 20 passed, 29 failed | FAIL |
| CI pipeline | Config bulunmadi | NOT COVERED |

## Test guvenilirligi

| Alan | Durum | Kanit |
|---|---|---|
| Backend servis unit/negative davranisi | PASS | 168 direct test |
| Standart backend test entrypoint | FAIL | No-op script |
| Quotation create/refetch | FAIL | Beklenen iki liste GET yerine bir explicit refetch |
| Order/Shipment local store determinism | FAIL | Notification seed ayni localStorage anahtariyla yarisiyor |
| Test server identity | FAIL | `reuseExistingServer:true` yanlis ortami kabul edebiliyor |
| Build freshness gate | FAIL | Preview artifact fingerprint kontrolu yok |
| Retry-free frontend release | FAIL | 1 fail ve 3 flaky |
| Real Nest HTTP + PostgreSQL integration | NOT COVERED | Mevcut testler servis/mock agirlikli |
| Cross-tenant security suite | NOT COVERED | Fixture yok |
| Browser matrix | NOT COVERED | Chromium disi proje yok |

## Performans

| Olcum | Sonuc | Durum |
|---|---|---|
| Health availability | 30/30 HTTP 200 | PASS |
| Health p50 | 19.73 ms | PASS |
| Health p95 | 22.30 ms | PASS |
| Health max | 32.60 ms | PASS |
| PostgreSQL health | Healthy | PASS |
| Redis health | Healthy | PASS |
| Authenticated business endpoint latency | Session mutation kapisi | BLOCKED |
| 100/1,000/10,000 row latency | Fixture yok | NOT COVERED |
| API payload byte budget | Tanim yok | NOT COVERED |
| p99/SLO | Tanim yok | NOT COVERED |
| SQL query count/N+1 | Instrumentation yok | NOT COVERED |
| Concurrent mutation/load | Mutation yasagi | BLOCKED |
| Soak test | Calistirilmadi | NOT COVERED |

Health sonucu business kapasitesi anlamina gelmez.

## Scale ve resilience

| Kontrol | Durum | Risk |
|---|---|---|
| Core list pagination | FAIL | Unbounded response |
| Server-side search/filter/sort | FAIL | Client-side ve tum response |
| Slow LAN behavior | NOT COVERED | Controlled network profile yok |
| HTTP 500/503 recovery | NOT COVERED | Fault injection yok |
| PostgreSQL outage/recovery | NOT COVERED | Calistirilmadi |
| Redis outage/recovery | NOT COVERED | Calistirilmadi |
| Storage outage/recovery | NOT COVERED | Calistirilmadi |
| Backup restore | NOT COVERED | Restore tatbikati yok |
| Migration rollback | NOT COVERED | Tatbikat yok |
| Multi-instance notification/storage | NOT COVERED | Ortam yok |

## Coverage siniri

| Yuzey | Sayim | Durum |
|---|---:|---|
| Backend HTTP URL | 78 | PASS |
| Frontend API method | 50 | PASS |
| HTTP URL bazli exhaustive positive/negative test | Eksik | NOT COVERED |
| 175 button declaration exhaustive behavior test | Eksik | NOT COVERED |
| 219 input/select/textarea exhaustive boundary test | Eksik | NOT COVERED |
| 15 route x role x state x viewport x browser | Eksik | NOT COVERED |

Test/performance karari: unit omurgasi degerlidir; release test ve business performance kapilari `FAIL`, `BLOCKED` veya `NOT COVERED` durumundadir.

Sonuc: **CANLI KULLANIMA HAZIR DEGIL**.
# Security Gap Matrix

Tarih: 2026-08-10

Secret, parola, hash, access/refresh token ve cookie degeri rapora alinmamistir.

## Auth ve credential

| ID | Kontrol | Kanit | Sonuc | Oncelik |
|---|---|---|---|---|
| SEC-001 | Frontend bundle credential icermemeli | Uc demo identity ve parola literal bundle'da; literal uc aktif DB hesabinin hash'iyle eslesiyor | BASARISIZ | P0 |
| SEC-002 | User response allowlist | `/auth/me` ve create User raw Prisma User donduruyor | BASARISIZ | P1 |
| SEC-003 | Login brute-force limiti | Throttler/rate-limit middleware yok | BASARISIZ | P1 |
| SEC-004 | Refresh credential tek kanal | Cookie, body ve Authorization extraction var | BASARISIZ | P1 |
| SEC-005 | Refresh expiry | JWT strategy `ignoreExpiration:false` | KANITLI | Pozitif |
| SEC-006 | Refresh rotation concurrency | Tek User hash, transaction/lock/session row yok | KISMEN/BASARISIZ | P2 |
| SEC-007 | Coklu cihaz session | Tek refresh hash yeni loginle oncekini ezer | BASARISIZ | P2 |
| SEC-008 | LAN cookie domain | Runtime host ile `COOKIE_DOMAIN=localhost` uyumsuz | BASARISIZ | P1 |
| SEC-009 | Access token reload | Token module memory'de; refresh cookie yok | BASARISIZ | P1 |
| SEC-010 | Logout lifecycle | Server revoke olurken browser response abort | KISMEN | P4 |
| SEC-011 | Forgot password | UI var, backend/token/rate limit yok | BASARISIZ | P1 |
| SEC-012 | Secret config kalite | JWT secret yalniz string olarak validate ediliyor | BASARISIZ | P3 |

## Authorization ve tenant

| ID | Kontrol | Kanit | Sonuc | Oncelik |
|---|---|---|---|---|
| SEC-020 | Global auth guard | JwtAuthGuard + PermissionsGuard global | KANITLI | Pozitif |
| SEC-021 | Request list/detail ownership | Service scope ve unit negatif test | KISMEN | Gercek uc tenant yok |
| SEC-022 | Quotation parties | Buyer/manufacturer assertions ve unit test | KISMEN | Gercek uc tenant yok |
| SEC-023 | Order/Production/Shipment parties | Company scope, 404 hiding, unit test | KISMEN | Gercek full-chain IDOR yok |
| SEC-024 | RequestItem/Attachment/Analysis parent scope | Request scope devralma ve unit test | KISMEN | Gercek DB record 0 |
| SEC-025 | Random Request ID | Onceki runtime 404 | KANITLI | Tek random ID |
| SEC-026 | Known other-tenant ID | Bagimsiz unrelated tenant fixture yok | KANITLANMADI | P1 release gap |
| SEC-027 | URL ID mutation all resources | Sistematik resource/method matrisi yok | KANITLANMADI | P1 release gap |
| SEC-028 | Global user directory minimization | SALES/PRODUCER/USER `users.read`; global PII list | BASARISIZ | P2 |
| SEC-029 | Company list scope | Normal actor yalniz active membership company | KANITLI (code) | Runtime third tenant yok |
| SEC-030 | Request owner recipient visibility | Actor recipient membership filtresi owner relation'i gizliyor | BASARISIZ | P2 |
| SEC-031 | Suspended/inactive company behavior | Kod bazi scope'larda ACTIVE ister | KANITLANMADI | Tam method matrisi yok |

## API ve platform hardening

| ID | Kontrol | Kanit | Sonuc | Oncelik |
|---|---|---|---|---|
| SEC-040 | Security headers | Global Helmet | KANITLI (code) | Runtime header matrisi yok |
| SEC-041 | CORS | Environment origin allowlist + credentials | KANITLI (code) | LAN/prod origin matrisi eksik |
| SEC-042 | DTO validation | Transform + whitelist ValidationPipe | KANITLI (code) | `forbidNonWhitelisted` yok; tum DTO negatifleri yok |
| SEC-043 | Swagger production exposure | `/docs` kosulsuz setup | BASARISIZ/KONFIG RISK | P3 |
| SEC-044 | API error secret redaction | Global exception filter mevcut | KISMEN | 500/provider/DB error runtime yok |
| SEC-045 | Response sensitive-field scan | Onceki runtime `/users` temiz; `/auth/me` code raw | BASARISIZ | P1 |
| SEC-046 | Audit correlation | Actor/resource audit var | KISMEN | Business IP/userAgent/correlation yok |
| SEC-047 | Business endpoint request limits | Listeler unbounded | BASARISIZ | P2 |

## File ve AI security

| ID | Kontrol | Kanit | Sonuc | Oncelik |
|---|---|---|---|---|
| SEC-060 | File name/path traversal | Service validation + unit test | KANITLI (mock/unit) | Pozitif |
| SEC-061 | MIME/magic/size/checksum | Service validation + unit test | KANITLI (mock/unit) | Gercek fixture 0 |
| SEC-062 | Random capability token | UUID + expiry + one-time consume | KANITLI (adapter test) | Multi-instance davranisi kanitlanmadi |
| SEC-063 | Download disposition/cache | Attachment disposition + private/no-store | KANITLI (code) | Runtime header matrisi yok |
| SEC-064 | Malware/content scan | AVAILABLE oncesi scan yok | BASARISIZ | P2 |
| SEC-065 | Polyglot/macro/zip bomb | Fixture/policy yok | KANITLANMADI | P2 |
| SEC-066 | Tenant disi upload/download/delete | Unit scope testleri | KISMEN | Gercek independent tenant yok |
| SEC-067 | AI secret serialization | Provider unit tests | KANITLI (unit) | Gercek provider yok |
| SEC-068 | Prompt/file content privacy | Gercek provider ve retention testi yok | KANITLANMADI | P2 |

## Notification security

| ID | Kontrol | Kanit | Sonuc | Oncelik |
|---|---|---|---|---|
| SEC-080 | Queue/list permission | `notifications.manage` Admin/Manager | KANITLI (code) | Pozitif |
| SEC-081 | Notification target FK | `userId` nullable string, User relation yok | BASARISIZ | P2 |
| SEC-082 | Audience/tenant model | user/company/role audience relation yok | BASARISIZ | P2 |
| SEC-083 | Read receipt | Backend endpoint/model yok | BASARISIZ | P2 |
| SEC-084 | Idempotency | Stable event key/unique yok | BASARISIZ | P2 |
| SEC-085 | Publish atomicity | DB create sonra publisher; outbox yok | BASARISIZ | P2 |

## Sensitive response matrisi

| Endpoint/yuzey | Runtime scan | Code scan | Sonuc |
|---|---|---|---|
| Login response | Onceki UI kullanimi | AuthService sanitize path | KISMEN |
| Refresh response | LAN runtime basarisiz | AuthService sanitize path | KISMEN |
| `/auth/me` | Deger alinmadi | Raw User select | BASARISIZ |
| `POST /users` | Mutation yapilmadi | Raw create return | BASARISIZ |
| `GET /users` | Onceki runtime alan taramasi | Service explicit select | Hash yok, fakat global PII BASARISIZ |
| Core workflow responses | Controlled runtime | Nested user summary selectleri | KISMEN; tum secret-name recursive scan yok |
| Error responses | 401/403/404 var | Filter var | 409/422/500 provider/DB matrisi KANITLANMADI |

## Cross-tenant negatif test ihtiyaci

Mevcut DB yalniz iki is firmasina ve birbirine bagli tek workflow'a sahiptir. Gercek sertifika icin en az su ayrik fixture gerekir:

1. Buyer A + request/attachment/item/order.
2. Buyer B + tamamen iliskisiz request/attachment/item/order.
3. Producer A, yalniz A recipient kaydi.
4. Producer B, yalniz B recipient kaydi.
5. Her resource icin list, detail, nested detail, download capability, patch/delete/transition ve ID substitution.
6. Beklenen `403/404` ile response body/timing bilgi sizintisi kontrolu.

Bu fixture mutation gerektirdigi icin bu fazda olusturulmadi. Sonuc `KANITLANMADI`dir.
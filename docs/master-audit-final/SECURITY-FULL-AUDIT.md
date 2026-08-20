# Security Full Audit

Tarih: 2026-08-10

Secret, credential, token, cookie ve hash degerleri bu belgeye alinmamistir.

## Kritik bulgular

| ID | P | Kontrol | Durum | Kanit |
|---|---|---|---|---|
| FIN-001 | P0 | Client artifact secret-free | FAIL | Public source/bundle credential materyali aktif uc hesapla eslesiyor |
| FIN-002 | P1 | Sensitive response allowlist | FAIL | `/auth/me` ve `POST /users` raw User yolu |
| FIN-003 | P1 | LAN session cookie | FAIL | Domain localhost, API LAN host |
| FIN-011 | P1 | Login abuse control | FAIL | Throttler/rate-limit yok |
| FIN-013 | P2 | Per-device session | FAIL | User basina tek refresh hash |
| FIN-014 | P2 | Tenant user privacy | FAIL | Normal roller global user directory okuyabiliyor |
| FIN-019 | P2 | Malware scanning | FAIL | AVAILABLE oncesi content scan yok |
| FIN-029 | P3 | Deployment hardening | FAIL | Swagger kosulsuz; secret strength validation yok |
| FIN-032 | P3 | Client auth trust | FAIL | Imzasiz localStorage role/user UI auth icin kabul ediliyor |

## Authentication

| Kontrol | Durum | Not |
|---|---|---|
| Password hash kullanimi | PASS | Hash degerleri raporlanmadi |
| Access JWT expiry | PASS | Expiry issue/strategy tarafinda uygulanmis |
| Backend JWT guard | PASS | API yetkisi localStorage UI rolune dayanmaz |
| Login rate limit/backoff | FAIL | Kontrol bulunmadi |
| Refresh cookie HttpOnly tasarimi | PASS | Cookie yolu mevcut |
| Refresh cookie LAN uyumu | FAIL | Domain uyusmazligi |
| Refresh cookie-only | FAIL | Body ve Authorization da kabul ediliyor |
| Refresh rotation/reuse detection | FAIL | Tek hash modeli |
| Forgot/reset lifecycle | FAIL | Endpoint/token/audit akisi yok |
| Logout server revoke | PASS | Onceki audit/hash-null kaniti |
| Logout client completion | FAIL | Response beklenmiyor |

## Authorization ve tenant izolasyonu

| Kontrol | Durum | Not |
|---|---|---|
| Unauthenticated API | PASS | Onceki 401 kontrolleri |
| Permission guard negatifleri | PASS | Audit, notification, company, production vb. 403 kaniti |
| Random resource ID hiding | PASS | Request 404 kaniti |
| Workflow party/membership scope | PASS | Servis testleri ve controlled chain |
| Bagimsiz tenant full IDOR | NOT COVERED | Ucuncu tenant fixture'i yok |
| Known-ID nested/download IDOR | NOT COVERED | Tam HTTP matrisi yok |
| Global user directory scope | FAIL | Company filter yok |
| UI role gating | FAIL | Role/status disi aksiyonlar ve local role trust |

UI role trust bulgusu backend privilege escalation kaniti degildir. Sentetik local Admin nesnesi local/static Admin yuzeylerini acar; backend JWT guard'lari API verisini korur.

## Data exposure

| Endpoint/yuzey | Durum | Not |
|---|---|---|
| `GET /users` sensitive hash | PASS | Allowlist response; onceki hash iddiasi yanlis kapsamliydi |
| `GET /users` tenant PII minimization | FAIL | Global email/phone/role bilgisi |
| `GET /auth/me` sensitive hash | FAIL | Raw `findById()` sonucu |
| `POST /users` sensitive hash | FAIL | Raw create sonucu |
| Credential in frontend artifact | FAIL | P0 |
| Log/report secret redaction | PASS | Bu denetimde deger yazdirilmadi |

## File security

| Kontrol | Durum |
|---|---|
| Ownership/scope | PASS |
| Path traversal/basename | PASS |
| MIME allowlist | PASS |
| Magic-byte validation | PASS |
| Size limit | PASS |
| Checksum/random storage key | PASS |
| Soft delete/CAS/quarantine | PASS |
| Malware/content scan | FAIL |
| Real malicious fixture | BLOCKED |

## Platform ve operations

| Kontrol | Durum | Not |
|---|---|---|
| Helmet | PASS | Bootstrap'ta mevcut |
| Credential CORS allowlist | PASS | Kaynak kaniti |
| ValidationPipe | PASS | Bootstrap'ta mevcut |
| Swagger production gate | FAIL | Her environment'ta aciliyor |
| JWT secret strength policy | FAIL | String disinda kalite kapisi yok |
| Business audit actor/resource | PASS | Core servislerde mevcut |
| Business audit IP/UA/correlation | FAIL | HTTP context tasinmiyor |
| CI secret scan | NOT COVERED | CI config yok |
| Dependency vulnerability scan | NOT COVERED | Bu fazda calistirilmadi |
| Production security config | NOT COVERED | Production erisimi yok |

Guvenlik karari: P0 ve P1 acikken **CANLI KULLANIMA HAZIR DEGIL**.
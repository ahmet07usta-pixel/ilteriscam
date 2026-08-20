# Module 02 - Domain Architecture Report

## 1. Amaç ve Kapsam

Bu belge, cam sektörüne odaklı Platform Core için domain ve business layer mimarisini açıklar. Amaç, gelecekteki tüm geliştirmeler için ortak bir kavramsal çerçeve, veri modeli, API sınırları, güvenlik gereklilikleri ve genişleme noktaları sunmaktır.

Bu belge, kullanıcı arayüzü değişikliklerinden bağımsız olarak, iş alanlarının sorumluluklarını, ilişkilerini ve gelecekteki sistem genişletme ihtiyaçlarını tanımlar.

---

## 2. Genel Mimari İlkeleri

1. Domain-driven separation
   - Her domain kendi sorumluluğunu üstlenir.
   - Domain'ler birbirinden bağımsız iş kuralları taşır, ancak ortak servis ve event akışları üzerinden etkileşir.

2. Clear ownership
   - Her entity ve aggregate için tek bir sorumlu domain vardır.
   - Cross-cutting concerns (audit, notification, security, file handling, reporting) ortak servisler aracılığıyla yönetilir.

3. API-first business boundaries
   - Her domain, kendi iş süreçlerini açıkça tanımlayan API kontratlarına sahiptir.
   - UI, domain mantığını doğrudan bilmez; API katmanı üzerinden erişir.

4. Secure-by-default
   - Tüm kritik operasyonlar rol, yetki ve hedef firma bağlamı ile korunur.
   - Hassas veriler yalnızca gerekli yetkili kullanıcılar tarafından erişilebilir.

5. Extensible by design
   - Yeni iş akışları, yeni domainler ve yeni entegrasyonlar mevcut yapı üzerinde kolayca eklenebilir olmalıdır.

---

## 3. Domain Listesi ve Sorumlulukları

### 3.1 Firma (Company)

Sorumluluk:
- Firma kayıtlarını ve kurumsal kimlik bilgilerini yönetmek.
- Firma tipini, coğrafi konumunu, doğrulama durumunu ve kurumsal profilini temsil etmek.
- Alıcı, üretici ve yönetici rolleri arasındaki kurumsal bağlamı sağlamak.

Veri modeli:
- id
- legalName
- tradeName
- taxNumber
- companyType
- regionId
- address
- contactEmail
- contactPhone
- verificationStatus
- status
- createdAt
- updatedAt

İlişkiler:
- Bir firma birçok kullanıcıya sahip olabilir.
- Bir firma birçok talep, teklif, sipariş ve dokümana bağlı olabilir.
- Bir firma bir bölgeye ait olabilir.

API ihtiyaçları:
- Firma oluşturma/güncelleme/silme.
- Firma doğrulama akışı.
- Firma profili görüntüleme.
- Firma bazlı kullanıcı listesi.

Güvenlik gereksinimleri:
- Yalnızca yetkili kullanıcılar firma profilini düzenleyebilir.
- Firma verisi kurumsal gizliliği korumalıdır.

Gelecekte genişleme ihtimali:
- Çok firma/çok şube modeli.
- Firma sertifikaları, kalite belgeleri ve üretim kapasite bilgileri.

### 3.2 Kullanıcı (User)

Sorumluluk:
- Platform erişimini, kimlik doğrulamasını ve kullanıcı profillerini yönetmek.
- Kullanıcıların rol, yetki ve firma bağlamına göre erişimini kontrol etmek.

Veri modeli:
- id
- companyId
- fullName
- email
- phone
- passwordHash
- roleId
- status
- isActive
- lastLoginAt
- createdAt
- updatedAt

İlişkiler:
- Bir kullanıcı bir firmaya aittir.
- Bir kullanıcı bir veya daha fazla role sahip olabilir.
- Bir kullanıcı birçok işlemde actor olarak yer alabilir.
- Bir kullanıcı birçok bildirim ve mesaj alır/verir.

API ihtiyaçları:
- Giriş, refresh, logout.
- Profil görüntüleme ve güncelleme.
- Kullanıcı oluşturma, aktivasyon, pasif hale getirme.
- Kullanıcıya rol ve yetki atama.

Güvenlik gereksinimleri:
- Şifreler hashlenmiş saklanmalı.
- Session/refresh token güvenli şekilde korunmalı.
- Her işlemde kullanıcı kimliği ve yetki bağlamı doğrulanmalı.

Gelecekte genişleme ihtimali:
- MFA.
- Davetli kullanıcı yönetimi.
- SSO entegrasyonu.

### 3.3 Rol ve Yetki (Role & Permission)

Sorumluluk:
- Erişim kontrol politikasını tanımlamak.
- Domain bazlı yetki ayrımını sağlamak.
- RBAC ve fine-grained access control mantığını desteklemek.

Veri modeli:
- Role
  - id
  - name
  - description
  - isSystemRole
  - createdAt
- Permission
  - id
  - key
  - description
  - domain
- RolePermission
  - roleId
  - permissionId

İlişkiler:
- Bir role birden fazla yetkiye sahip olabilir.
- Bir yetki birden fazla role bağlanabilir.
- Kullanıcılar role üzerinden yetki alır.

API ihtiyaçları:
- Rol listesi ve detayları.
- Yetki atama/çıkarma.
- Kullanıcıya rol atama.
- Yetki kontrolü için policy endpointleri.

Güvenlik gereksinimleri:
- Yetki kontrolü her kritik endpoint üzerinde zorunlu olmalı.
- Sistem rolü ve kullanıcı rolü ayrımı korunmalı.

Gelecekte genişleme ihtimali:
- Attribute-based access control (ABAC).
- Firma bazlı özel yetki grupları.

### 3.4 Bölge (Region)

Sorumluluk:
- Coğrafi yapı ve operasyonel kapsamı yönetmek.
- Firma, dağıtım ve üretim organizasyonunu coğrafi olarak modellemek.

Veri modeli:
- id
- name
- parentRegionId
- type
- code
- country
- city
- timezone
- status

İlişkiler:
- Bir bölge alt bölgelere ayrılabilir.
- Bir firma bir bölgeye ait olabilir.
- Sipariş ve sevkiyat bölgesel bağlam taşır.

API ihtiyaçları:
- Bölge listesi ve hiyerarşi.
- Bölge bazlı filtreleme.
- Coğrafi raporlama desteği.

Güvenlik gereşinimleri:
- Bölgesel veriler yanlış erişimden korunmalı.
- Yönetici dışı kullanıcılar yalnızca yetkili bölgelerle sınırlı olmalı.

Gelecekte genişleme ihtimali:
- Bölgesel stok ve kapasite yönetimi.
- Dağıtım rotası optimizasyonu.

### 3.5 Talep (Request)

Sorumluluk:
- Alıcı tarafının ürün ihtiyacını ve iş gereksinimini tanımlamak.
- Teklif süreçlerinin başlangıç noktasını oluşturmak.

Veri modeli:
- id
- companyId
- regionId
- title
- description
- productType
- quantity
- unit
- targetDeliveryDate
- budgetRange
- status
- priority
- createdAt
- updatedAt

İlişkiler:
- Bir talep bir firmaya aittir.
- Bir talep birden çok teklife konu olabilir.
- Bir talep bir veya daha fazla siparişe dönüşebilir.

API ihtiyaçları:
- Talep oluşturma/güncelleme.
- Durum değişikliği.
- Teklif listesi ile ilişkili sorgu.

Güvenlik gereşinimleri:
- Talep verisi yalnızca ilgili firma kullanıcıları ve yetkili üreticiler tarafından erişilebilir olmalı.
- Hassas fiyat/teklif bilgileri korumalıdır.

Gelecekte genişleme ihtimali:
- Talep şablonları.
- Otomatik teklif önerileri.
- AI destekli talep sınıflandırma.

### 3.6 Teklif (Quotation)

Sorumluluk:
- Üreticinin talebe cevap vermesini ve fiyat/şart teklif etmesini sağlar.
- Sipariş akışına geçiş için temel belge olur.

Veri modeli:
- id
- requestId
- manufacturerCompanyId
- buyerCompanyId
- currency
- totalAmount
- leadTimeDays
- validUntil
- status
- notes
- createdAt
- updatedAt

İlişkiler:
- Bir teklif bir talebe bağlıdır.
- Bir teklif tek bir siparişe dönüşebilir.
- Teklif tarihçesi ve revizyon geçmişi tutulabilir.

API ihtiyaçları:
- Teklif oluşturma, revizyon, kabul/red.
- Teklife ait detay satırları.
- Teklif geçmişi.

Güvenlik gereşinimleri:
- Fiyat ve maliyet bilgileri gizlenmelidir.
- Sadece ilgili taraflar erişebilir.

Gelecekte genişleme ihtimali:
- Otomatik fiyatlama kuralları.
- Üretim kapasite bazlı teklif optimizasyonu.

### 3.7 Sipariş (Order)

Sorumluluk:
- Kabul edilen teklifi iş emri haline getirmek.
- Üretim, sevkiyat ve teslimat akışını bağlamak.

Veri modeli:
- id
- requestId
- quotationId
- buyerCompanyId
- manufacturerCompanyId
- orderNumber
- status
- scheduledStartDate
- promisedDeliveryDate
- currency
- totalAmount
- createdAt
- updatedAt

İlişkiler:
- Bir sipariş bir talep ve bir teklife bağlıdır.
- Bir sipariş üretim ve sevkiyat süreçlerini destekler.
- Siparişe zaman çizelgesi ve notlar eklenebilir.

API ihtiyaçları:
- Sipariş oluşturma ve durum güncelleme.
- Sipariş detayları.
- Sipariş zaman çizelgesi.

Güvenlik gereşinimleri:
- Sipariş verileri yalnızca ilgili taraflar ve yetkili operasyon ekipleri tarafından görünür olmalı.
- Kritik durum değişiklikleri audit log’a yazılmalı.

Gelecekte genişleme ihtimali:
- Sipariş planlama, kapasite atama ve üretim çizelgeleme.

### 3.8 Üretim (Production)

Sorumluluk:
- Siparişin üretim aşamalarını yönetmek.
- Üretim durumu, kalite kontrol ve operasyonel ilerlemeyi izlemek.

Veri modeli:
- id
- orderId
- stage
- startedAt
- completedAt
- assignedOperatorId
- qualityStatus
- notes
- createdAt
- updatedAt

İlişkiler:
- Bir üretim kaydı bir siparişe bağlıdır.
- Bir üretim adımı birden fazla event ile izlenebilir.
- Üretim sonucu sevkiyata bağlanabilir.

API ihtiyaçları:
- Üretim adımı güncelleme.
- Üretim ilerleme takibi.
- Operatör bazlı görev atama.

Güvenlik gereşinimleri:
- Operasyon ekiplerine göre kısıtlı erişim.
- Değişiklikler denetlenmeli ve audit’e yazılmalı.

Gelecekte genişleme ihtimali:
- Makine bağlantısı.
- Gerçek zamanlı üretim izleme.
- AI destekli kalite tahmini.

### 3.9 Sevkiyat (Shipment)

Sorumluluk:
- Üretilen ürünün teslimat ve lojistik sürecini yönetmek.
- Taşıma, durum, takip ve teslim bilgilerini temsil etmek.

Veri modeli:
- id
- orderId
- carrier
- trackingNumber
- shipmentDate
- deliveryDate
- status
- destinationAddress
- createdAt
- updatedAt

İlişkiler:
- Bir sevkiyat bir siparişe bağlıdır.
- Sevkiyat raporlamaya ve bildirim sistemine bağlanır.

API ihtiyaçları:
- Sevkiyat başlatma/güncelleme.
- Takip numarası ve durum değişikliği.
- Teslim raporu.

Güvenlik gereşinimleri:
- Teslimat koordinasyonu baskı altında olabileceğinden erişim kısıtlı olmalı.
- Yetki dışı kullanıcılar lojistik veriyi görmemeli.

Gelecekte genişleme ihtimali:
- Harita ve rota entegrasyonu.
- Carrier API bağlanmaları.

### 3.10 Bildirim (Notification)

Sorumluluk:
- İşleyiş sırasında kullanıcıya ilgili olayları iletmek.
- Etkinlik bazlı uyarı sistemini oluşturmak.

Veri modeli:
- id
- userId
- type
- title
- message
- payload
- isRead
- createdAt
- updatedAt

İlişkiler:
- Bir bildirim bir kullanıcıya aittir.
- İş akışı event’leri üzerinden tetiklenir.
- Mesaj ve raporlama sistemine bağlanabilir.

API ihtiyaçları:
- Bildirim listesi.
- Okundu işareti.
- Bildirim filtreleme.

Güvenlik gereşinimleri:
- Hassas olaylar yalnızca ilgili kullanıcıya iletilmeli.
- Kişisel veri içeren bildirimlerde gizlilik korunmalı.

Gelecekte genişleme ihtimali:
- WebSocket/SSE push.
- Bildirim tercihleri.
- Çoklu kanal (e-posta, SMS, push).

### 3.11 Mesajlaşma (Messaging)

Sorumluluk:
- Kullanıcılar ve firmalar arasındaki iş ve koordinasyon iletişimini yönetmek.
- Talep, sipariş ve üretim süreçlerinde belge ve tartışma akışını sağlar.

Veri modeli:
- id
- threadId
- senderUserId
- recipientUserId
- message
- attachmentIds
- createdAt

İlişkiler:
- Bir mesaj bir thread’e aittir.
- Bir thread bir iş akışına bağlanabilir.
- Ekler dosya yönetim sistemine referans verir.

API ihtiyaçları:
- Thread oluşturma.
- Mesaj gönderme/okuma.
- Ekli dosya desteği.

Güvenlik gereşinimleri:
- Mesaj içeriği gizli ve yetki kontrollü olmalı.
- İletişim kayıtları audit edilebilir olmalı.

Gelecekte genişleme ihtimali:
- Grup sohbetleri.
- AI destekli otomatik yanıtlar.

### 3.12 Dosya Yönetimi (Files)

Sorumluluk:
- Doküman, resim, teklif, sipariş ve üretim eklerini yönetmek.
- İçerik ve metadata saklamak.

Veri modeli:
- id
- ownerType
- ownerId
- fileName
- mimeType
- storagePath
- checksum
- sizeBytes
- uploadedByUserId
- createdAt
- updatedAt

İlişkiler:
- Bir dosya bir talep, teklif, sipariş, mesaj veya firma ile ilişkili olabilir.
- OCR ve AI servisleri bu dosyalara erişebilir.

API ihtiyaçları:
- Yükleme, indirme, silme, yeniden adlandırma.
- İzinli erişim ve görsel önizleme.

Güvenlik gereşinimleri:
- Yalnızca yetkili kullanıcılar dosyaya erişebilir.
- Köken ve sahiplik doğrulanmalı.

Gelecekte genişleme ihtimali:
- Object storage entegrasyonu.
- Versiyonlama ve watermarking.

### 3.13 Yapay Zeka (AI)

Sorumluluk:
- Otomatik sınıflandırma, özetleme, öneri ve karar destek süreçlerini yönetmek.
- İş akışlarında insan onayı ile çalışan AI işlevlerini desteklemek.

Veri modeli:
- id
- ownerType
- ownerId
- taskType
- inputReferenceId
- outputSummary
- confidenceScore
- status
- createdAt
- updatedAt

İlişkiler:
- AI çıktıları talep, teklif, üretim ve belge işleme süreçlerine bağlanabilir.
- OCR çıktıları AI iş akışlarına beslenebilir.

API ihtiyaçları:
- AI iş başlatma.
- Sonuç alma.
- İnsan onaylı akışlar.

Güvenlik gereşinimleri:
- Hassas veriler maskelenmeli.
- AI çıktıları insan doğrulamasına tabi olmalı.

Gelecekte genişleme ihtimali:
- Üretim tahmini.
- Fiyat önerisi.
- Talep/teklif özetleme.

### 3.14 OCR

Sorumluluk:
- Görsel ve PDF belgelerden yapılandırılmış veri çıkarmak.
- Talep, sipariş, fatura ve doküman işleme süreçlerini otomatikleştirmek.

Veri modeli:
- id
- fileId
- sourceType
- status
- extractedText
- extractedFields
- confidenceScore
- createdAt
- updatedAt

İlişkiler:
- OCR sonucu bir dosyaya bağlıdır.
- AI servisleri ile entegre çalışabilir.

API ihtiyaçları:
- OCR başlatma.
- Sonuç okuma.
- Hata/yeniden işleme akışı.

Güvenlik gereşinimleri:
- Belge içeriği korumalıdır.
- OCR çıktıları sadece yetkili kullanıcılar tarafından erişilebilir olmalı.

Gelecekte genişleme ihtimali:
- Çok dilli belge işleme.
- Şablon bazlı veri çıkarma.

### 3.15 Raporlama

Sorumluluk:
- İş süreçleri ve operasyonel metrikleri özetlemek.
- Yönetici ve operasyon ekibine görünürlük sağlamak.

Veri modeli:
- id
- reportType
- scopeType
- scopeId
- generatedAt
- parameters
- resultSummary
- createdAt

İlişkiler:
- Raporlar şirket, kullanıcı, sipariş, üretim ve sevkiyat verisini birleştirebilir.
- Özel rapor şablonları ileride eklenebilir.

API ihtiyaçları:
- Rapor oluşturma.
- Özelleştirilebilir filtreleme.
- Exports (CSV/PDF).

Güvenlik gereşinimleri:
- Rapor erişimi rol ve firma bağlamı ile kontrol edilmeli.
- Hassas bilgilerin görünürlüğü kısıtlanmalı.

Gelecekte genişleme ihtimali:
- Dashboard, KPI, trend analizi ve otomatik rapor gönderimi.

---

## 4. Domain İlişki Haritası

- Company birden fazla User, Request, Quotation, Order, File ve Notification’a sahiptir.
- User, Company, Role/Permission, Notification, Messaging ve Audit üzerinden güvenlik ve iş akışı bağlamını oluşturur.
- Request, Quotation ve Order birbirine bağlı iş süreçleri oluşturur.
- Order, Production ve Shipment üretim ve teslim sürecinin ana zincirini oluşturur.
- Files, OCR ve AI cross-domain servisler olarak tüm süreçlerde ortak kullanım sağlar.
- Reporting tüm bu domainlerin görünürlük ve analitik çıktısını sağlar.

---

## 5. API Katmanı Önerisi

### 5.1 Core domain APIs
- Company API
- User API
- Role/Permission API
- Region API

### 5.2 Workflow domain APIs
- Request API
- Quotation API
- Order API
- Production API
- Shipment API

### 5.3 Support domain APIs
- Notification API
- Messaging API
- File API
- OCR API
- AI API
- Reporting API

### 5.2 Güvenlik Katmanı
- Tüm endpoint’ler için auth guard ve permission guard uygulanmalı.
- Firma bazlı scope kontrolü zorunlu olmalı.
- Kritik işlem değişiklikleri audit log’a yazılmalı.

---

## 6. Gelecek Geliştirme Sırası

1. Core identity and company domain
2. Request and quotation flow
3. Order and production tracking
4. Shipment and delivery flow
5. Supporting services: notification, messaging, files, OCR, AI
6. Reporting and analytics

---

## 7. Sonuç

Bu mimari, cam sektörüne özgü bir iş platformunda domainlerin net ayrışmasını, iş süreçleri arasındaki bağımlılıkları ve güvenli genişletilebilir bir sistem yapısını destekler. Bu belge, ileri safhalarda modüler geliştirme ve teknik tasarım için temel referans olacaktır.

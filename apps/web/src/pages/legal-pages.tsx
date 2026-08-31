import { Link } from 'react-router-dom'

export function KvkkAydinlatmaMetniPage() {
  return (
    <main className="auth-layout legal-layout">
      <section className="glass-card auth-card legal-card">
        <div>
          <p className="eyebrow">İlteriş Cam</p>
          <h1>KVKK Aydınlatma Metni</h1>
          <p>6698 Sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu sıfatıyla aydınlatma yükümlülüğümüz</p>
        </div>

        <article className="legal-content">
          <section>
            <h2>1. Veri Sorumlusunun Kimliği</h2>
            <p>
              İşbu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) uyarınca veri sorumlusu sıfatıyla{' '}
              <strong>İlteriş Cam</strong> platformunu işleten [Şirket/Şahıs Unvanı — kuruluş işlemleri tamamlandıktan sonra doldurulacaktır] tarafından,
              platform üzerinden kişisel verilerinizin işlenmesine ilişkin usul ve esaslar hakkında sizi bilgilendirmek amacıyla hazırlanmıştır.
            </p>
            <p>
              Vergi Dairesi / Vergi No: [kuruluş sonrası doldurulacaktır] · Adres: [kuruluş sonrası doldurulacaktır] · KVKK başvuruları için
              e-posta: kvkk@ilteriscam.com (bu adres alan adı ve kurumsal e-posta altyapısı devreye alındığında aktif olacaktır; o ana kadar
              platform üzerindeki iletişim kanallarından ulaşılabilir).
            </p>
          </section>

          <section>
            <h2>2. İşlenen Kişisel Verileriniz</h2>
            <ul>
              <li><strong>Kimlik ve iletişim bilgileri:</strong> ad-soyad, e-posta adresi, telefon numarası</li>
              <li><strong>Firma bilgileri:</strong> firma unvanı, ticari unvan/marka, vergi numarası, firma türü/meslek bilgisi</li>
              <li><strong>Hesap ve işlem güvenliği bilgileri:</strong> şifrenin şifrelenmiş (hash) hâli, oturum/giriş kayıtları, IP adresi, tarayıcı/cihaz (user-agent) bilgisi, işlem tarih-saat kayıtları</li>
              <li><strong>Talep, teklif, sipariş ve üretim süreci verileri:</strong> talep detayları, yüklenen fotoğraf/ölçü belgeleri, teklif ve fiyat bilgileri, mesajlaşma içerikleri</li>
              <li><strong>Bildirim tercihleri ve kullanım kayıtları:</strong> platform içi bildirim ve aktivite geçmişi</li>
            </ul>
          </section>

          <section>
            <h2>3. Kişisel Verilerin İşlenme Amaçları</h2>
            <ul>
              <li>Kullanıcı hesabının oluşturulması, kimlik doğrulama ve yetkilendirme işlemlerinin yürütülmesi</li>
              <li>Talep, teklif, sipariş, üretim ve sevkiyat süreçlerinin uçtan uca yürütülmesi</li>
              <li>Alıcı ve üretici firmalar arasında mesajlaşma ve bildirim hizmetlerinin sağlanması</li>
              <li>Yüklenen ölçü/fotoğraf belgelerinin yapay zekâ destekli analiz ile otomatik ölçü ve ürün tipi tespiti yapılması</li>
              <li>Platform güvenliğinin sağlanması, kötüye kullanımın önlenmesi ve denetim (audit) kayıtlarının tutulması</li>
              <li>Yasal yükümlülüklerin yerine getirilmesi ve yetkili mercilerin taleplerinin karşılanması</li>
              <li>Hizmet kalitesinin ölçülmesi ve platformun geliştirilmesi</li>
            </ul>
          </section>

          <section>
            <h2>4. Kişisel Verilerin Toplanma Yöntemi ve Hukuki Sebebi</h2>
            <p>
              Kişisel verileriniz, web ve mobil uygulama üzerinden doğrudan sizin tarafınızdan girilmesi, platformun otomatik olarak ürettiği
              işlem/güvenlik kayıtları ve karşı tarafın (alıcı/üretici firma) sizinle ilgili paylaştığı talep-teklif-sipariş verileri yoluyla
              elektronik ortamda toplanmaktadır. Bu veriler KVKK&apos;nın 5. maddesinde belirtilen; bir sözleşmenin kurulması veya ifasıyla
              doğrudan ilgili olması, hukuki yükümlülüğün yerine getirilmesi, veri sorumlusunun meşru menfaati ve gerekli hâllerde açık
              rızanızın bulunması hukuki sebeplerine dayanılarak işlenmektedir.
            </p>
          </section>

          <section>
            <h2>5. Kişisel Verilerin Aktarılabileceği Taraflar</h2>
            <p>Kişisel verileriniz, yukarıda belirtilen amaçlarla sınırlı olarak aşağıdaki taraflarla paylaşılabilir:</p>
            <ul>
              <li>Platformun barındırıldığı sunucu/bulut altyapısı ve teknik hizmet sağlayıcıları</li>
              <li>Talep oluşturduğunuz veya teklif verdiğiniz karşı taraf firma (yalnızca ilgili iş süreciyle sınırlı bilgiler)</li>
              <li>Yasal olarak yetkili kamu kurum ve kuruluşları, talep hâlinde</li>
            </ul>
            <p>
              <strong>Yurt dışına aktarım:</strong> Yüklediğiniz ölçü/fotoğraf belgelerinin yapay zekâ destekli analizi, yurt dışında konumlanmış
              sunuculara sahip yapay zekâ servis sağlayıcıları (ör. Google, OpenAI) üzerinden gerçekleştirilebilmektedir. Bu aktarım, KVKK&apos;nın
              yurt dışına veri aktarımına ilişkin hükümleri kapsamında ve mevzuatın öngördüğü güvenceler çerçevesinde yapılmaktadır.
            </p>
          </section>

          <section>
            <h2>6. Kişisel Verilerin Saklanma Süresi</h2>
            <p>
              Kişisel verileriniz, işlenme amaçlarının gerektirdiği süre boyunca ve ilgili mevzuatta öngörülen zamanaşımı süreleri dikkate
              alınarak saklanır; bu sürelerin sona ermesi hâlinde silinir, yok edilir veya anonim hâle getirilir.
            </p>
          </section>

          <section>
            <h2>7. İlgili Kişi Olarak Haklarınız (KVKK m.11)</h2>
            <p>KVKK&apos;nın 11. maddesi uyarınca bize başvurarak;</p>
            <ul>
              <li>Kişisel verinizin işlenip işlenmediğini öğrenme,</li>
              <li>İşlenmişse buna ilişkin bilgi talep etme,</li>
              <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
              <li>Yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme,</li>
              <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme,</li>
              <li>KVKK&apos;nın 7. maddesindeki şartlar çerçevesinde silinmesini veya yok edilmesini isteme,</li>
              <li>Düzeltme/silme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,</li>
              <li>İşlenen verilerin münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme,</li>
              <li>Kanuna aykırı işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme</li>
            </ul>
            <p>haklarına sahipsiniz.</p>
          </section>

          <section>
            <h2>8. Başvuru Yöntemi</h2>
            <p>
              Yukarıda sayılan haklarınıza ilişkin taleplerinizi, kimliğinizi tevsik edici belgelerle birlikte kvkk@ilteriscam.com adresine
              veya platform üzerindeki iletişim kanallarından tarafımıza iletebilirsiniz. Talepleriniz, niteliğine göre en kısa sürede ve
              en geç yasal azami süre içinde sonuçlandırılır.
            </p>
          </section>

          <section>
            <h2>9. Değişiklikler</h2>
            <p>
              İşbu Aydınlatma Metni, yasal düzenlemeler veya platform hizmetlerindeki değişiklikler doğrultusunda güncellenebilir. Güncel
              metin her zaman bu sayfada yayımlanır.
            </p>
            <p className="legal-updated-at">Son güncelleme: 31 Ağustos 2026 (taslak)</p>
          </section>
        </article>

        <p className="auth-switch">
          <Link to="/register" className="inline-link">
            Kayıt sayfasına dön
          </Link>
        </p>
      </section>
    </main>
  )
}

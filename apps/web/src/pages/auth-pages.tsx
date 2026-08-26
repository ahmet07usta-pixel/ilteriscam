import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import type { RegisterAccountInput } from '../shared/api/contracts'

interface AuthPageProps {
  onLogin: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>
}

interface RegisterPageProps {
  onRegister: (input: RegisterAccountInput) => Promise<{ success: boolean; error?: string }>
}

interface ForgotPasswordPageProps {
  onRequestPasswordReset: (identifier: string) => Promise<{ success: boolean; error?: string }>
}

function isStrongPassword(password: string): boolean {
  return password.length >= 12 && !/\s/.test(password) && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
}

export function LoginPage({ onLogin }: AuthPageProps) {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    const result = await onLogin(identifier, password)
    if (!result.success) {
      setError(result.error ?? 'Giris basarisiz. Bilgilerinizi kontrol edin.')
      return
    }

    setError('')
    navigate('/app')
  }

  return (
    <main className="login-layout">
      <section className="login-showcase" aria-label="Platform tanitim alani">
        <div className="showcase-decor" aria-hidden="true">
          <span className="glass-facade" />
          <span className="glass-orb orb-a" />
          <span className="glass-orb orb-b" />
          <span className="glass-orb orb-c" />
          <span className="beam beam-a" />
          <span className="beam beam-b" />
          <span className="glass-ridge ridge-a" />
          <span className="glass-ridge ridge-b" />
        </div>

        <div className="showcase-content">
          <p className="eyebrow">Dijital Cam Platformu</p>
          <h1>Cam Sektorunun Yeni Nesil B2B Platformu</h1>
          <p className="showcase-copy">
            Cam ureticileri, aluminyum ve PVC dogramacilar, cam balkon ve cephe firmalari ile mobilyacilari tek dijital ticaret merkezinde birlestirir.
          </p>
          <ul className="showcase-list">
            <li>
              <span className="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 12h16M12 4v16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span>Tek platformdan teklif topla</span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M5 6h14v5H5zM5 13h9v5H5z" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </span>
              <span>Ureticileri karsilastir</span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span>Termin surelerini gor</span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 16l4-4 3 3 5-6 4 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Uretimi canli takip et</span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M5 7h14v10H5z" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M9 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span>Siparislerini yonet</span>
            </li>
          </ul>

          <div className="industry-illustration glass-card" aria-hidden="true">
            <div className="tower tower-a" />
            <div className="tower tower-b" />
            <div className="tower tower-c" />
            <div className="glass-floor floor-a" />
            <div className="glass-floor floor-b" />
            <div className="glass-floor floor-c" />
            <div className="label-row">
              <span>Temperli Cam</span>
              <span>Isicam</span>
              <span>Cam Balkon</span>
              <span>Endustriyel Uretim</span>
            </div>
          </div>

          <div className="live-metrics" aria-label="Canli sektor metrikleri">
            <article className="metric-card glass-card">
              <span>Aktif Uretici</span>
              <strong>1.245</strong>
            </article>
            <article className="metric-card glass-card">
              <span>Aktif Alici Firma</span>
              <strong>3.980</strong>
            </article>
            <article className="metric-card glass-card">
              <span>Gunluk Teklif</span>
              <strong>8.420</strong>
            </article>
            <article className="metric-card glass-card">
              <span>Ortalama Termin</span>
              <strong>4 Gun</strong>
            </article>
            <article className="metric-card glass-card">
              <span>Tamamlanan Siparis</span>
              <strong>128.400</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <article className="glass-card login-card">
          <header className="login-head">
            <div className="logo-mark" aria-hidden="true">
              <svg viewBox="0 0 80 80" fill="none">
                <defs>
                  <linearGradient id="glassLogoGradient" x1="8" y1="10" x2="72" y2="70" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#67B9EA" />
                    <stop offset="1" stopColor="#2F5A87" />
                  </linearGradient>
                </defs>
                <path d="M10 18c0-4.4 3.6-8 8-8h44c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8H18c-4.4 0-8-3.6-8-8V18Z" stroke="url(#glassLogoGradient)" strokeWidth="4" />
                <path d="M24 20h12c3.3 0 6 2.7 6 6v32c0 3.3-2.7 6-6 6H24c-3.3 0-6-2.7-6-6V26c0-3.3 2.7-6 6-6Z" fill="#69B7EA" fillOpacity="0.16" stroke="url(#glassLogoGradient)" strokeWidth="3" />
                <path d="M44 20h12c3.3 0 6 2.7 6 6v32c0 3.3-2.7 6-6 6H44c-3.3 0-6-2.7-6-6V26c0-3.3 2.7-6 6-6Z" fill="#69B7EA" fillOpacity="0.1" stroke="url(#glassLogoGradient)" strokeWidth="3" />
                <path d="M21 34h38M21 46h38" stroke="url(#glassLogoGradient)" strokeWidth="2.6" strokeLinecap="round" opacity="0.75" />
              </svg>
            </div>
            <div>
              <p className="eyebrow">Dijital Cam Platformu</p>
              <h2>Hos geldiniz</h2>
              <p>Kurumsal hesabiniza giris yaparak teklif ve siparis surecini yonetin.</p>
            </div>
          </header>

          <form
            className="auth-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void handleLogin()
            }}
          >
            <label>
              E-posta veya Telefon
              <input
                type="text"
                required
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="ornek: ad@firma.com veya +905XXXXXXXXX"
              />
            </label>
            <label>
              Sifre
              <div className="password-input-row">
                <input
                  type={isPasswordVisible ? 'text' : 'password'}
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 8 karakter"
                />
                <button type="button" className="ghost-btn password-visibility-toggle" onClick={() => setIsPasswordVisible((current) => !current)}>
                  {isPasswordVisible ? 'Gizle' : 'Goster'}
                </button>
              </div>
            </label>
            {error ? <p className="ui-feedback-message settings-form-error">{error}</p> : null}
            <div className="auth-row">
              <Link to="/forgot-password" className="inline-link">
                Sifremi unuttum
              </Link>
            </div>
            <button type="button" className="solid-btn login-btn" onClick={() => void handleLogin()}>
              Giris Yap
            </button>
            <p className="auth-switch">
              Hesabiniz yok mu?{' '}
              <Link to="/register" className="inline-link">
                Kayit Ol
              </Link>
            </p>
          </form>
        </article>
      </section>
    </main>
  )
}

export function RegisterPage({ onRegister }: RegisterPageProps) {
  const navigate = useNavigate()
  const [companyLegalName, setCompanyLegalName] = useState('')
  const [companyTradeName, setCompanyTradeName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleRegister = async () => {
    if (!companyLegalName.trim() || !businessDescription.trim() || !fullName.trim() || !email.trim() || !password) {
      setError('Lutfen zorunlu alanlari doldurun.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('E-posta adresi gecersiz.')
      return
    }

    const normalizedPassword = password.trim()

    if (normalizedPassword !== confirmPassword.trim()) {
      setError('Sifreler eslesmiyor.')
      return
    }

    if (!isStrongPassword(normalizedPassword)) {
      setError('Sifre en az 12 karakter olmali, buyuk/kucuk harf ve rakam icermeli, bosluk barindirmamalidir.')
      return
    }

    setIsSubmitting(true)
    setError('')

    const result = await onRegister({
      companyLegalName: companyLegalName.trim(),
      companyTradeName: companyTradeName.trim() || undefined,
      businessDescription: businessDescription.trim(),
      taxNumber: taxNumber.trim() || undefined,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      password: normalizedPassword,
    })

    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error ?? 'Kayit islemi basarisiz. Bilgilerinizi kontrol edin.')
      return
    }

    navigate('/app')
  }

  return (
    <main className="auth-layout">
      <section className="glass-card auth-card">
        <div>
          <p className="eyebrow">Dijital Cam Platformu</p>
          <h1>Firma hesabinizi olusturun</h1>
          <p>Uretici tekliflerini karsilastirmak ve talep olusturmak icin firma hesabinizi birkac adimda acin.</p>
        </div>
        <form
          className="auth-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void handleRegister()
          }}
        >
          <label>
            Firma Unvani
            <input type="text" required value={companyLegalName} onChange={(event) => setCompanyLegalName(event.target.value)} placeholder="Orn: Ege Aluminyum Dograma Ltd." />
          </label>
          <label>
            Ticari Unvan / Marka (opsiyonel)
            <input type="text" value={companyTradeName} onChange={(event) => setCompanyTradeName(event.target.value)} placeholder="Orn: Ege Aluminyum" />
          </label>
          <label>
            Firma Turu / Meslek
            <input type="text" required value={businessDescription} onChange={(event) => setBusinessDescription(event.target.value)} placeholder="Orn: PVC Dogramaci, Cam Balkon Ustasi, Mobilyaci" />
          </label>
          <label>
            Vergi No (opsiyonel)
            <input type="text" value={taxNumber} onChange={(event) => setTaxNumber(event.target.value)} placeholder="Orn: 1234567890" />
          </label>
          <label>
            Ad Soyad
            <input type="text" required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Yetkili adi soyadi" />
          </label>
          <label>
            E-posta
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ad@firma.com" />
          </label>
          <label>
            Telefon (opsiyonel)
            <input type="text" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+905XXXXXXXXX" />
          </label>
          <label>
            Sifre
            <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 12 karakter" />
          </label>
          <label>
            Sifre Tekrar
            <input type="password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Sifrenizi tekrar girin" />
          </label>
          {error ? <p className="ui-feedback-message settings-form-error">{error}</p> : null}
          <button type="button" className="solid-btn login-btn" onClick={() => void handleRegister()} disabled={isSubmitting}>
            {isSubmitting ? 'Kaydediliyor...' : 'Hesap Olustur'}
          </button>
          <p className="auth-switch">
            Zaten hesabiniz var mi?{' '}
            <Link to="/login" className="inline-link">
              Giris Yap
            </Link>
          </p>
        </form>
      </section>
    </main>
  )
}

export function ForgotPasswordPage({ onRequestPasswordReset }: ForgotPasswordPageProps) {
  const [identifier, setIdentifier] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!identifier.trim()) {
      setError('Lutfen kurumsal e-posta adresinizi girin.')
      return
    }

    setIsSubmitting(true)
    setError('')
    setFeedback('')

    const result = await onRequestPasswordReset(identifier)

    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error ?? 'Talep gonderilemedi. Lutfen tekrar deneyin.')
      return
    }

    setFeedback('Talebiniz alindi. Hesabiniz bulunuyorsa yoneticimiz sizinle iletisime gecerek sifrenizi sifirlayacaktir.')
  }

  return (
    <main className="auth-layout">
      <section className="glass-card auth-card">
        <div>
          <p className="eyebrow">Hesap Kurtarma</p>
          <h1>Sifre yenileme talebi gonder</h1>
          <p>
            Kurumsal e-posta adresinizi girin; talebiniz platform yoneticisine iletilir ve yoneticimiz sizinle iletisime gecerek sifrenizi sifirlar.
          </p>
        </div>
        {feedback ? <p className="ui-feedback-message">{feedback}</p> : null}
        {error ? <p className="ui-feedback-message settings-form-error">{error}</p> : null}
        <form
          className="auth-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <label>
            Kurumsal e-posta
            <input type="email" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="ad@firma.com" />
          </label>
          <button type="submit" className="solid-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Gonderiliyor...' : 'Sifirlama talebi gonder'}
          </button>
        </form>
        <Link to="/login" className="inline-link">
          Giris ekranina don
        </Link>
      </section>
    </main>
  )
}

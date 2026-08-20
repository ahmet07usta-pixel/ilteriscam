import type { ReactNode } from 'react'
import type { ScreenState } from '../../entities/domain'

interface ScreenStateGateProps {
  state: ScreenState
  retryLabel?: string
  onRetry?: () => void
  children: ReactNode
}

export function LoadingState() {
  return (
    <div className="state-card">
      <div className="state-icon loading" aria-hidden="true" />
      <h3>Veriler yukleniyor</h3>
      <p>Guncel operasyon verileri aliniyor. Bir kac saniye icinde ekran hazir olacak.</p>
    </div>
  )
}

export function EmptyState() {
  return (
    <div className="state-card">
      <div className="state-icon" aria-hidden="true">0</div>
      <h3>Gosterilecek kayit yok</h3>
      <p>Filtreleri genisleterek veya yeni bir islem baslatarak bu alani doldurabilirsiniz.</p>
    </div>
  )
}

export function ErrorState({ retryLabel = 'Yeniden dene', onRetry }: Pick<ScreenStateGateProps, 'retryLabel' | 'onRetry'>) {
  return (
    <div className="state-card error">
      <div className="state-icon" aria-hidden="true">!</div>
      <h3>Gecici bir hata olustu</h3>
      <p>Baglanti veya servis kaynagi nedeniyle islem tamamlanamadi.</p>
      <button type="button" className="ghost-btn" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  )
}

export function SuccessState() {
  return (
    <div className="state-card success">
      <div className="state-icon success" aria-hidden="true">✓</div>
      <h3>Islem basariyla tamamlandi</h3>
      <p>Guncel operasyon adimlari sorunsuz olarak kaydedildi.</p>
    </div>
  )
}

export function ScreenStateGate({ state, children, onRetry, retryLabel }: ScreenStateGateProps) {
  if (state === 'loading') {
    return <LoadingState />
  }

  if (state === 'empty') {
    return <EmptyState />
  }

  if (state === 'error') {
    return <ErrorState onRetry={onRetry} retryLabel={retryLabel} />
  }

  if (state === 'success') {
    return <SuccessState />
  }

  return <>{children}</>
}

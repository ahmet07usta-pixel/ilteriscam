import { useEffect, useRef, useState } from 'react'

export interface ToastItem {
  id: string
  type: 'success' | 'warning' | 'info' | 'error'
  title: string
  description: string
}

interface ToastStackProps {
  items: ToastItem[]
  onDismiss: (id: string) => void
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [remainingMs, setRemainingMs] = useState(4000)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (paused) {
      return
    }

    timerRef.current = window.setTimeout(() => {
      onDismiss(item.id)
    }, remainingMs)

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [item.id, onDismiss, paused, remainingMs])

  return (
    <div
      className={`toast ${item.type}`}
      onMouseEnter={() => {
        const spent = Date.now() - startedAt
        setRemainingMs((old) => Math.max(0, old - spent))
        setPaused(true)
      }}
      onMouseLeave={() => {
        setStartedAt(Date.now())
        setPaused(false)
      }}
    >
      <div className="toast-head">
        <strong>{item.title}</strong>
        <button type="button" className="toast-close" aria-label="Kapat" onClick={() => onDismiss(item.id)}>
          x
        </button>
      </div>
      <p>{item.description}</p>
    </div>
  )
}

export function ToastStack({ items, onDismiss }: ToastStackProps) {
  return (
    <aside className="toast-stack" aria-live="polite" aria-label="Bildirimler">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </aside>
  )
}

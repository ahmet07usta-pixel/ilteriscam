import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ViewKey } from '../data/navigation'

interface BreadcrumbItem {
  label: string
  view?: ViewKey
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  onNavigate: (view: ViewKey) => void
}

export function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  return (
    <nav className="ui-breadcrumb" aria-label="Gezinim">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={`${item.label}-${index}`} className="ui-breadcrumb-item">
            {item.view && !isLast ? (
              <button type="button" onClick={() => onNavigate(item.view as ViewKey)}>
                {item.label}
              </button>
            ) : (
              <strong>{item.label}</strong>
            )}
            {!isLast && <em aria-hidden="true">/</em>}
          </span>
        )
      })}
    </nav>
  )
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="ui-tooltip-wrap">
      {children}
      <span className="ui-tooltip" role="tooltip">
        {text}
      </span>
    </span>
  )
}

interface SearchableView {
  key: ViewKey
  label: string
}

interface GlobalSearchBoxProps {
  items: SearchableView[]
  onNavigate: (view: ViewKey) => void
}

// Searches only the pages this user can actually reach (navItems, already role-scoped by the caller) -
// this used to search a hardcoded list of fake request/order/company records that were never real data.
export function GlobalSearchBox({ items, onNavigate }: GlobalSearchBoxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ top: 0, left: 0, width: 460 })
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) {
      return items
    }

    return items.filter((item) => item.label.toLowerCase().includes(keyword))
  }, [items, query])

  useEffect(() => {
    if (!open) {
      return
    }

    const updatePosition = () => {
      if (!wrapRef.current) {
        return
      }

      const rect = wrapRef.current.getBoundingClientRect()
      const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24)
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))
      setPanelStyle({
        top: rect.bottom + 10,
        left,
        width,
      })
    }

    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape)
    document.addEventListener('keydown', onShortcut)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEscape)
      document.removeEventListener('keydown', onShortcut)
    }
  }, [open])

  return (
    <div className="global-search" ref={wrapRef}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        placeholder="Global Arama"
        aria-label="Global Arama"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
      />
      <kbd>Ctrl K</kbd>

      {open &&
        createPortal(
          <section ref={panelRef} className="search-results top-dropdown-panel" style={panelStyle} aria-label="Arama Sonuclari">
            {results.length ? (
              <ul className="search-group-block">
                {results.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(item.key)
                        setOpen(false)
                        setQuery('')
                      }}
                    >
                      <strong>{item.label}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Sonuc bulunamadi</p>
            )}
          </section>,
          document.body,
        )}
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Iptal', danger, onConfirm, onClose }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return createPortal(
    <div className="dialog-overlay" onClick={onClose}>
      <section className="dialog-card" onClick={(event) => event.stopPropagation()} aria-label={title}>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="dialog-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? 'solid-btn dialog-danger' : 'solid-btn'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function DeleteConfirmationModal({ open, onConfirm, onClose }: { open: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <ConfirmDialog
      open={open}
      title="Kaydi silmek istediginize emin misiniz?"
      description="Bu islem geri alinamaz. Kayit ve iliskili tum gecmis veriler kaldirilir."
      confirmLabel="Sil"
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )
}

export function FileUploadField({ onFileChange }: { onFileChange: (file: File | null) => void }) {
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')

  const setFile = (file: File | null) => {
    setFileName(file?.name ?? '')
    onFileChange(file)
  }

  return (
    <label
      className={dragging ? 'upload-dropzone dragging' : 'upload-dropzone'}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        setFile(event.dataTransfer.files[0] ?? null)
      }}
    >
      <input
        type="file"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null)
        }}
      />
      <strong>Dosya Yukle</strong>
      <p>{fileName || 'Dosyayi surukleyip birakin veya secin'}</p>
    </label>
  )
}

export function FilterPanel({
  onApply,
}: {
  onApply: (filters: { status: string; date: string; segment: string }) => void
}) {
  const [status, setStatus] = useState('all')
  const [date, setDate] = useState('')
  const [segment, setSegment] = useState('all')
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ top: 0, left: 0, width: 680 })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const updatePosition = () => {
      if (!triggerRef.current) {
        return
      }

      const rect = triggerRef.current.getBoundingClientRect()
      const width = Math.min(740, window.innerWidth - 24)
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))
      setPanelStyle({
        top: rect.bottom + 10,
        left,
        width,
      })
    }

    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <div className="filter-panel">
      <button
        ref={triggerRef}
        type="button"
        className="ghost-btn filter-dropdown-trigger"
        aria-label="Filtreler"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Filtreler
      </button>

      {open &&
        createPortal(
          <section ref={panelRef} className="filter-dropdown-panel top-dropdown-panel" style={panelStyle} aria-label="Filtreler">
            <header>
              <strong>Filtreler</strong>
            </header>
            <div className="filter-grid">
              <label>
                Durum
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="all">Tum Durumlar</option>
                  <option value="open">Acik</option>
                  <option value="progress">Islemde</option>
                  <option value="done">Tamamlandi</option>
                </select>
              </label>
              <label>
                Tarih
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label>
                Segment
                <select value={segment} onChange={(event) => setSegment(event.target.value)}>
                  <option value="all">Tum Segmentler</option>
                  <option value="cam">Cam Balkon</option>
                  <option value="mimari">Mimari Cam</option>
                  <option value="endustri">Endustriyel Cam</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="solid-btn"
              onClick={() => {
                onApply({ status, date, segment })
                setOpen(false)
              }}
            >
              Uygula
            </button>
          </section>,
          document.body,
        )}
    </div>
  )
}

interface GridColumn<T> {
  key: keyof T
  label: string
}

interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  return (
    <footer className="ui-pagination">
      <button type="button" className="ghost-btn" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
        Geri
      </button>
      <span>
        {page} / {pageCount}
      </span>
      <button type="button" className="ghost-btn" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>
        Ileri
      </button>
    </footer>
  )
}

export function DataGrid<T extends Record<string, string>>({
  columns,
  rows,
  page,
  pageSize,
  onPageChange,
}: {
  columns: Array<GridColumn<T>>
  rows: T[]
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  const visibleRows = rows.slice(start, start + pageSize)

  return (
    <section className="data-grid-wrap glass-card">
      <table className="data-grid">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {columns.map((column) => (
                <td key={`${String(column.key)}-${rowIndex}`}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={safePage} pageCount={pageCount} onPageChange={onPageChange} />
    </section>
  )
}

const suiteRows = [
  { siparis: 'SP-9021', firma: 'Eksen Cam', durum: 'Islemde', termin: '08.08.2026' },
  { siparis: 'SP-9022', firma: 'Nova Cephe', durum: 'Beklemede', termin: '09.08.2026' },
  { siparis: 'SP-9023', firma: 'Marmara Cam', durum: 'Tamamlandi', termin: '10.08.2026' },
  { siparis: 'SP-9024', firma: 'Atlas Cam', durum: 'Islemde', termin: '12.08.2026' },
  { siparis: 'SP-9025', firma: 'Delta Cam', durum: 'Beklemede', termin: '13.08.2026' },
  { siparis: 'SP-9026', firma: 'Pera Yapı', durum: 'Tamamlandi', termin: '14.08.2026' },
]

interface GlobalUiSuiteProps {
  view: ViewKey
  onNavigate: (view: ViewKey) => void
}

export function GlobalUiSuite({ view, onNavigate }: GlobalUiSuiteProps) {
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [selectedDate, setSelectedDate] = useState('')

  return (
    <section className="global-ui-suite">
      <Breadcrumbs items={[{ label: 'Kontrol Paneli', view: 'dashboard' }, { label: 'Calisma Alani', view }, { label: 'Ortak Arayuz' }]} onNavigate={onNavigate} />

      <section className="glass-card panel ui-stack">
        <header className="panel-header ui-stack-head">
          <h3>Operasyon Gorunumu</h3>
          <span className="eyebrow">Calisma Alani</span>
        </header>

        <div className="ui-form-grid">
          <FilterPanel
            onApply={(filters) => {
              setMessage(`Filtre uygulandi: ${filters.status} / ${filters.segment}`)
            }}
          />

          <section className="glass-card panel ui-tools">
            <header>
              <strong>Filtre ve Girdi Alanlari</strong>
            </header>
            <label>
              Tarih Secici
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <FileUploadField
              onFileChange={(file) => {
                setMessage(file ? `${file.name} secildi` : 'Dosya temizlendi')
              }}
            />
            {message && <p className="ui-feedback-message">{message}</p>}
          </section>
        </div>

        <DataGrid
          columns={[
            { key: 'siparis', label: 'Siparis' },
            { key: 'firma', label: 'Firma' },
            { key: 'durum', label: 'Durum' },
            { key: 'termin', label: 'Termin' },
          ]}
          rows={suiteRows}
          page={page}
          pageSize={4}
          onPageChange={setPage}
        />
      </section>
    </section>
  )
}

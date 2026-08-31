import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { AuthenticatedUser, ScreenState, UserRole } from '../entities/domain'
import type { ApiNotification } from '../shared/api/contracts'
import { GlobalSearchBox, Tooltip } from '../shared/ui/global-components'
import type { ToastItem } from '../shared/ui/toast'
import { ToastStack } from '../shared/ui/toast'
import { navByRole, type ViewKey } from '../shared/data/navigation'
import type { WorkflowActivity } from '../pages/workspace-pages'

const navIconByKey: Record<ViewKey, string> = {
  dashboard: 'grid',
  requests: 'request',
  offers: 'offer',
  orders: 'order',
  pricing: 'report',
  production: 'production',
  shipment: 'shipment',
  messages: 'message',
  alerts: 'alert',
  companies: 'company',
  reports: 'report',
  settings: 'settings',
}

function NavIcon({ name }: { name: string }) {
  if (name === 'grid') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'request') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 4h12v16H6z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9h6M9 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'offer') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16v10H4z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 11h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'order') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 10h10M7 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'production') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="8" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11 12h2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'shipment') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 7h12v8H3zM15 10h4l2 2v3h-6z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'message') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16v10H9l-5 4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'alert') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4a4 4 0 0 1 4 4v3l2 3H6l2-3V8a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'company') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20V5h10v15M14 10h6v10" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'report') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 4h12v16H6z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 15V9M12 15v-4M15 15v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v3M12 18v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

interface AppShellProps {
  currentUser: AuthenticatedUser | null
  role: UserRole
  state: ScreenState
  view: ViewKey
  toasts: ToastItem[]
  activityLog: WorkflowActivity[]
  activityReadIds: string[]
  onMarkActivityRead: (activityId: string) => void
  onMarkAllActivitiesRead: (channel: 'notification' | 'message') => void
  apiNotifications: ApiNotification[]
  onMarkApiNotificationRead: (notificationId: string) => void
  onMarkAllApiNotificationsRead: () => void
  onDismissToast: (id: string) => void
  onViewChange: (view: ViewKey) => void
  onLogout: () => void
  children: ReactNode
}

type TopPanel = 'notifications' | 'messages' | 'profile' | null

export function AppShell({
  currentUser,
  role,
  state,
  view,
  toasts,
  activityLog,
  activityReadIds,
  onMarkActivityRead,
  onMarkAllActivitiesRead,
  apiNotifications,
  onMarkApiNotificationRead,
  onMarkAllApiNotificationsRead,
  onDismissToast,
  onViewChange,
  onLogout,
  children,
}: AppShellProps) {
  const apiEnabled = Boolean(currentUser?.backendRole)
  const navItems = navByRole[role]
  const [activePanel, setActivePanel] = useState<TopPanel>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ top: 0, left: 0, width: 320 })
  const notificationRef = useRef<HTMLButtonElement | null>(null)
  const messagesRef = useRef<HTMLButtonElement | null>(null)
  const profileRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const _debugState = state
  void _debugState
  const initials = useMemo(() => {
    if (!currentUser?.fullName) {
      return 'UK'
    }

    return currentUser.fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0]?.toUpperCase())
      .join('')
  }, [currentUser?.fullName])

  const legacyNotificationItems = useMemo(
    () =>
      activityLog
        .filter((item) => item.channel === 'notification' && (item.audience === 'ALL' || item.audience === role))
        .map((item) => ({
          ...item,
          status: activityReadIds.includes(item.id) ? 'okundu' : 'okunmamis',
          tone: item.title.toLowerCase().includes('teslim') ? 'success' : item.title.toLowerCase().includes('gecik') ? 'warning' : 'info',
        })),
    [activityLog, activityReadIds, role],
  )

  const apiNotificationItems = useMemo(
    () =>
      apiNotifications.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.body ?? '',
        status: item.readAt ? 'okundu' : 'okunmamis',
        tone: item.type.includes('DELIVERED') || item.type.includes('COMPLETED') || item.type.includes('CONFIRMED')
          ? 'success'
          : item.type.includes('CANCELLED') || item.type.includes('REJECTED')
            ? 'warning'
            : 'info',
      })),
    [apiNotifications],
  )

  const notificationItems = apiEnabled ? apiNotificationItems : legacyNotificationItems

  const messagePreviewItems = useMemo(
    () =>
      activityLog
        .filter((item) => item.channel === 'message' && (item.audience === 'ALL' || item.audience === role))
        .map((item) => ({
          ...item,
          status: activityReadIds.includes(item.id) ? 'okundu' : 'okunmamis',
        })),
    [activityLog, activityReadIds, role],
  )

  const unreadCount = useMemo(() => notificationItems.filter((item) => item.status === 'okunmamis').length, [notificationItems])
  const unreadMessageCount = useMemo(() => messagePreviewItems.filter((item) => item.status === 'okunmamis').length, [messagePreviewItems])
  useEffect(() => {
    if (!activePanel) {
      return
    }

    const updatePosition = () => {
      const trigger = activePanel === 'notifications' ? notificationRef.current : activePanel === 'messages' ? messagesRef.current : profileRef.current
      if (!trigger) {
        return
      }

      const rect = trigger.getBoundingClientRect()
      const panelWidth = activePanel === 'notifications' ? Math.min(360, window.innerWidth - 24) : Math.min(300, window.innerWidth - 24)
      const left = Math.min(window.innerWidth - panelWidth - 12, Math.max(12, rect.right - panelWidth))

      setPanelStyle({
        top: rect.bottom + 10,
        left,
        width: panelWidth,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [activePanel])

  useEffect(() => {
    if (!activePanel) {
      return
    }

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      const currentTrigger = activePanel === 'notifications' ? notificationRef.current : activePanel === 'messages' ? messagesRef.current : profileRef.current
      if (panelRef.current?.contains(target) || currentTrigger?.contains(target)) {
        return
      }
      setActivePanel(null)
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePanel(null)
        setMobileNavOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onEscape)

    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [activePanel])

  return (
    <div className={`app-shell role-${role.toLowerCase()}`}>
      <div className="workspace-grid">
        <aside className="side-nav glass-card" aria-label="Kontrol paneli menusu">
          <div className="brand sidebar-brand">
            <span className="brand-pill" />
            <div>
              <strong>İlteriş Cam</strong>
              <p>Ust Duzey Is Platformu</p>
            </div>
          </div>
          <nav>
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={item.key === view ? 'nav-item active' : 'nav-item'}
                onClick={() => {
                  onViewChange(item.key)
                  setMobileNavOpen(false)
                }}
              >
                <NavIcon name={navIconByKey[item.key]} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="ghost-btn side-logout" onClick={onLogout}>
            Cikis Yap
          </button>
        </aside>

        <section className="workspace-column">
          <header className="top-bar glass-card">
            <div className="top-search">
              <button type="button" className="mobile-menu-btn" aria-label="Mobil menu" onClick={() => setMobileNavOpen(true)}>
                <span />
                <span />
                <span />
              </button>
              <GlobalSearchBox onNavigate={onViewChange} />
            </div>
            <div className="top-actions">
              <div className="top-action-buttons">
                <Tooltip text="Bildirimler">
                  <button
                    ref={notificationRef}
                    type="button"
                    className="icon-btn"
                    aria-label="Bildirimler"
                    aria-expanded={activePanel === 'notifications'}
                    onClick={() => setActivePanel((current) => (current === 'notifications' ? null : 'notifications'))}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 4a4 4 0 0 1 4 4v3l2 3H6l2-3V8a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    <span>Bildirimler</span>
                    <em>{unreadCount}</em>
                  </button>
                </Tooltip>

                <Tooltip text="Mesajlar">
                  <button
                    ref={messagesRef}
                    type="button"
                    className="icon-btn"
                    aria-label="Mesajlar"
                    aria-expanded={activePanel === 'messages'}
                    onClick={() => setActivePanel((current) => (current === 'messages' ? null : 'messages'))}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 5h16v10H9l-5 4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                    <span>Mesajlar</span>
                    <em>{unreadMessageCount}</em>
                  </button>
                </Tooltip>
              </div>

              <div className="top-user-cards">
                <div className="company-chip" aria-label="Firma Bilgisi">
                  <span className="company-logo" aria-hidden="true">{initials}</span>
                  <div>
                    <strong>{currentUser?.company ?? 'İlteriş Cam Platformu'}</strong>
                    <small>{role === 'ADMIN' ? 'Platform Sahibi' : 'Firma Bilgisi'}</small>
                  </div>
                </div>
                <Tooltip text="Profil Menusu">
                  <button
                    ref={profileRef}
                    type="button"
                    className="profile-chip"
                    aria-label="Profil"
                    aria-expanded={activePanel === 'profile'}
                    onClick={() => setActivePanel((current) => (current === 'profile' ? null : 'profile'))}
                  >
                    <span className="avatar" aria-hidden="true">{initials}</span>
                    <span>{currentUser?.fullName ?? 'Kullanici'}</span>
                  </button>
                </Tooltip>
              </div>
            </div>
          </header>

          {children}
        </section>
      </div>

      {mobileNavOpen &&
        createPortal(
          <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}>
            <aside className="mobile-nav-drawer glass-card" onClick={(event) => event.stopPropagation()} aria-label="Mobil Menu">
              <header>
                <strong>İlteriş Cam</strong>
                <button type="button" className="ghost-btn" onClick={() => setMobileNavOpen(false)}>
                  Kapat
                </button>
              </header>
              <nav>
                {navItems.map((item) => (
                  <button
                    key={`m-${item.key}`}
                    type="button"
                    className={item.key === view ? 'nav-item active' : 'nav-item'}
                    onClick={() => {
                      onViewChange(item.key)
                      setMobileNavOpen(false)
                    }}
                  >
                    <NavIcon name={navIconByKey[item.key]} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
              <button
                type="button"
                className="ghost-btn side-logout mobile-nav-logout"
                onClick={() => {
                  onLogout()
                  setMobileNavOpen(false)
                }}
              >
                Cikis Yap
              </button>
            </aside>
          </div>,
          document.body,
        )}

      {activePanel &&
        createPortal(
          <section
            ref={panelRef}
            className={`top-dropdown-panel panel-${activePanel}`}
            style={panelStyle}
            aria-label={activePanel === 'notifications' ? 'Bildirim Merkezi' : activePanel === 'messages' ? 'Mesajlar' : 'Profil Menusu'}
          >
            {activePanel === 'notifications' && (
              <>
                <header className="dropdown-head">
                  <strong>Bildirim Merkezi</strong>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => (apiEnabled ? onMarkAllApiNotificationsRead() : onMarkAllActivitiesRead('notification'))}
                  >
                    Tumunu Okundu Isaretle
                  </button>
                </header>
                <ul className="dropdown-list scroll-list">
                  {notificationItems.map((item) => (
                    <li key={item.id} className={`nc-${item.tone}`}>
                      <div className="nc-row">
                        <strong>{item.title}</strong>
                        <span className={item.status === 'okunmamis' ? 'status-pill unread' : 'status-pill read'}>
                          {item.status === 'okunmamis' ? 'Okunmamis' : 'Okundu'}
                        </span>
                      </div>
                      <p>{item.description}</p>
                      {item.status === 'okunmamis' ? (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => (apiEnabled ? onMarkApiNotificationRead(item.id) : onMarkActivityRead(item.id))}
                        >
                          Okundu Isaretle
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {activePanel === 'messages' && (
              <>
                <header className="dropdown-head">
                  <strong>Mesajlar</strong>
                  <button type="button" className="ghost-btn" onClick={() => onMarkAllActivitiesRead('message')}>
                    Tumunu Okundu Isaretle
                  </button>
                </header>
                <ul className="dropdown-list scroll-list message-preview-list">
                  {messagePreviewItems.map((item) => (
                    <li key={item.id}>
                      <div className="msg-row">
                        <span className="msg-logo" aria-hidden="true">
                          {item.senderRole?.slice(0, 2) ?? 'MS'}
                        </span>
                        <div className="msg-main">
                          <div className="msg-head">
                            <strong>{item.title}</strong>
                            <small>{item.createdAt}</small>
                          </div>
                          <p>{item.description}</p>
                        </div>
                        {item.status === 'okunmamis' && (
                          <button type="button" className="ghost-btn" onClick={() => onMarkActivityRead(item.id)}>
                            Okundu
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {activePanel === 'profile' && (
              <>
                <header className="dropdown-head">
                  <strong>Profil Menusu</strong>
                </header>
                <div className="dropdown-actions">
                  <button type="button" className="menu-row" onClick={() => setActivePanel(null)}>
                    Profilim
                  </button>
                  <button type="button" className="menu-row" onClick={() => setActivePanel(null)}>
                    Firma Bilgileri
                  </button>
                  <button type="button" className="menu-row" onClick={() => setActivePanel(null)}>
                    Hesap Ayarlari
                  </button>
                  <button type="button" className="menu-row" onClick={() => setActivePanel(null)}>
                    Bildirim Tercihleri
                  </button>
                  <button type="button" className="menu-row" onClick={() => setActivePanel(null)}>
                    Yardim Merkezi
                  </button>
                  <button
                    type="button"
                    className="menu-row danger"
                    onClick={() => {
                      setActivePanel(null)
                      onLogout()
                    }}
                  >
                    Guvenli Cikis
                  </button>
                </div>
              </>
            )}
          </section>,
          document.body,
        )}

      <ToastStack items={toasts} onDismiss={onDismissToast} />
    </div>
  )
}

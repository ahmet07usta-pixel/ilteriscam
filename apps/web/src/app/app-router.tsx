import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { AuthenticatedUser, ScreenState, UserRole } from '../entities/domain'
import type { ApiNotification, RegisterAccountInput } from '../shared/api/contracts'
import { LoginPage, ForgotPasswordPage, RegisterPage } from '../pages/auth-pages'
import { KvkkAydinlatmaMetniPage } from '../pages/legal-pages'
import {
  AccessDeniedPage,
  AyarlarPage,
  BildirimlerPage,
  DashboardPage,
  FiyatUrunYonetimiPage,
  FirmalarPage,
  MesajlarPage,
  RaporlarPage,
  SevkiyatPage,
  SiparislerPage,
  TaleplerPage,
  TekliflerPage,
  UretimTakibiPage,
  type WorkflowActions,
  type WorkflowStore,
  type WorkspacePageProps,
} from '../pages/workspace-pages'
import { isViewAllowedForRole, toAppPath, viewPathByKey, type ViewKey } from '../shared/data/navigation'
import { AppShell } from './app-shell'
import type { ToastItem } from '../shared/ui/toast'

interface AppRouterProps {
  isAuthenticated: boolean
  isAuthHydrated: boolean
  currentUser: AuthenticatedUser | null
  role: UserRole
  state: ScreenState
  notifications: ToastItem[]
  activityLog: WorkflowStore['activityLog']
  activityReadIds: string[]
  onMarkActivityRead: (activityId: string) => void
  onMarkAllActivitiesRead: (channel: 'notification' | 'message') => void
  apiNotifications: ApiNotification[]
  onMarkApiNotificationRead: (notificationId: string) => void
  onMarkAllApiNotificationsRead: () => void
  onDismissToast: (id: string) => void
  onLogin: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>
  onRegister: (input: RegisterAccountInput) => Promise<{ success: boolean; error?: string }>
  onRequestPasswordReset: (identifier: string) => Promise<{ success: boolean; error?: string }>
  onLogout: () => void
  onRetryState: () => void
  workflow: WorkflowStore
  workflowActions: WorkflowActions
}

export function AppRouter({
  isAuthenticated,
  isAuthHydrated,
  currentUser,
  role,
  state,
  notifications,
  activityLog,
  activityReadIds,
  onMarkActivityRead,
  onMarkAllActivitiesRead,
  apiNotifications,
  onMarkApiNotificationRead,
  onMarkAllApiNotificationsRead,
  onDismissToast,
  onLogin,
  onRegister,
  onRequestPasswordReset,
  onLogout,
  onRetryState,
  workflow,
  workflowActions,
}: AppRouterProps) {
  const navigate = useNavigate()

  const handleNavigate = (view: ViewKey) => {
    navigate(toAppPath(view))
  }

  const pageProps: Pick<
    WorkspacePageProps,
    'state' | 'onRetry' | 'onNavigate' | 'role' | 'currentUser' | 'workflow' | 'workflowActions' | 'activityReadIds' | 'onMarkActivityRead' | 'onMarkAllActivitiesRead' | 'apiNotifications' | 'onMarkApiNotificationRead' | 'onMarkAllApiNotificationsRead'
  > = {
    state,
    onRetry: onRetryState,
    onNavigate: handleNavigate,
    role,
    currentUser,
    workflow,
    activityReadIds,
    onMarkActivityRead,
    onMarkAllActivitiesRead,
    apiNotifications,
    onMarkApiNotificationRead,
    onMarkAllApiNotificationsRead,
    workflowActions,
  }

  const defaultView = 'dashboard'
  const defaultPath = toAppPath(defaultView)

  if (!isAuthHydrated && !isAuthenticated) {
    return (
      <Routes>
        <Route path="*" element={<div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#dfe9f8' }}>Yukleniyor...</div>} />
      </Routes>
    )
  }

  const renderRoute = (view: ViewKey, content: ReactNode) => {
    return (
      <AppShell
        currentUser={currentUser}
        role={role}
        state={state}
        view={view}
        toasts={notifications}
        activityLog={activityLog}
        activityReadIds={activityReadIds}
        onMarkActivityRead={onMarkActivityRead}
        onMarkAllActivitiesRead={onMarkAllActivitiesRead}
        apiNotifications={apiNotifications}
        onMarkApiNotificationRead={onMarkApiNotificationRead}
        onMarkAllApiNotificationsRead={onMarkAllApiNotificationsRead}
        onDismissToast={onDismissToast}
        onViewChange={handleNavigate}
        onLogout={onLogout}
      >
        {content}
      </AppShell>
    )
  }

  const renderAuthorizedRoute = (view: ViewKey, content: ReactNode) => {
    if (!isViewAllowedForRole(role, view)) {
      return renderRoute(view, <AccessDeniedPage {...pageProps} />)
    }

    return renderRoute(view, content)
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={defaultPath} replace /> : <LoginPage onLogin={onLogin} />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to={defaultPath} replace /> : <RegisterPage onRegister={onRegister} />} />
      <Route path="/forgot-password" element={isAuthenticated ? <Navigate to={defaultPath} replace /> : <ForgotPasswordPage onRequestPasswordReset={onRequestPasswordReset} />} />
      <Route path="/kvkk-aydinlatma-metni" element={<KvkkAydinlatmaMetniPage />} />
      {isAuthenticated ? (
        <>
          <Route path="/app" element={<Navigate to={defaultPath} replace />} />
          <Route path={`/app/${viewPathByKey.dashboard}`} element={renderAuthorizedRoute('dashboard', <DashboardPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.requests}`} element={renderAuthorizedRoute('requests', <TaleplerPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.offers}`} element={renderAuthorizedRoute('offers', <TekliflerPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.orders}`} element={renderAuthorizedRoute('orders', <SiparislerPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.pricing}`} element={renderAuthorizedRoute('pricing', <FiyatUrunYonetimiPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.production}`} element={renderAuthorizedRoute('production', <UretimTakibiPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.shipment}`} element={renderAuthorizedRoute('shipment', <SevkiyatPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.messages}`} element={renderAuthorizedRoute('messages', <MesajlarPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.alerts}`} element={renderAuthorizedRoute('alerts', <BildirimlerPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.companies}`} element={renderAuthorizedRoute('companies', <FirmalarPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.reports}`} element={renderAuthorizedRoute('reports', <RaporlarPage {...pageProps} />)} />
          <Route path={`/app/${viewPathByKey.settings}`} element={renderAuthorizedRoute('settings', <AyarlarPage {...pageProps} />)} />
          <Route path="*" element={<Navigate to={defaultPath} replace />} />
        </>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  )
}

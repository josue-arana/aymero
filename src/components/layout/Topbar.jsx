import { Bell, ChevronDown, Menu, Plus, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRoutes } from '../../config/appRoutes'
import { USE_AUTH } from '../../config/backendConfig'
import { useAuth } from '../../contexts/AuthContext'
import { ActionMenu } from '../common/ActionMenu'
import { BrandLogo } from '../common/BrandLogo'
import { useToast } from '../common/ToastProvider'
import { LanguageToggleButton } from '../common/LanguageToggleButton'
import { ModalShell } from '../common/ModalShell'
import { AccountMenu } from './AccountMenu'
import { NotificationCenter } from './NotificationCenter'
import { getFriendlyAuthErrorMessage } from '../../utils/authErrors'
import { buildLanguageOptions, normalizeSupportedLanguage } from '../../utils/language'

export function Topbar({
  onMenuClick,
  language,
  setLanguage,
  t,
  notifications = [],
  onMarkAllNotificationsRead,
  onClearNotifications,
  userProfile,
  onSaveUserProfile,
  onOpenSettings,
  onCreateLead,
  onCreateJob,
}) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { showToast } = useToast()
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [accountScreen, setAccountScreen] = useState(null)
  const [profileDraft, setProfileDraft] = useState(userProfile)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const unreadCount = notifications.filter((notification) => !notification.read).length
  const languageOptions = buildLanguageOptions(t)
  const quickAddItems = [
    {
      id: 'addLead',
      label: t('addLead'),
      icon: <Plus className="mr-2 h-4 w-4" />,
      onClick: onCreateLead,
    },
    {
      id: 'scheduleJob',
      label: t('scheduleJob'),
      icon: <Plus className="mr-2 h-4 w-4" />,
      onClick: onCreateJob,
    },
  ].filter((item) => typeof item.onClick === 'function')

  useEffect(() => {
    setProfileDraft(userProfile)
  }, [userProfile])

  useEffect(() => {
    setProfileDraft((current) => (
      current
        ? { ...current, preferredLanguage: normalizeSupportedLanguage(language, current.preferredLanguage || 'en') }
        : current
    ))
  }, [language])

  function openNotifications() {
    setIsNotificationsOpen(true)
    setIsAccountOpen(false)
    setAccountScreen(null)
  }

  function closeNotifications() {
    setIsNotificationsOpen(false)
  }

  function openAccountScreen(screen) {
    setProfileDraft(userProfile)
    setIsAccountOpen(false)
    setIsNotificationsOpen(false)
    setAccountScreen(screen)
  }

  function closeAccountScreen() {
    setAccountScreen(null)
  }

  function saveProfile() {
    onSaveUserProfile({
      ...profileDraft,
      preferredLanguage: normalizeSupportedLanguage(profileDraft?.preferredLanguage, language),
    })
    closeAccountScreen()
  }

  async function confirmSignOut() {
    if (isSigningOut) return

    setIsSigningOut(true)

    try {
      const result = await logout()

      setIsAccountOpen(false)
      setIsNotificationsOpen(false)
      closeAccountScreen()

      if (result?.error && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Sign out completed locally with a remote auth warning.', result.error)
      }

      showToast(t(USE_AUTH ? 'authSignOutSuccess' : 'authMockSignOutSuccess'))

      if (USE_AUTH) {
        navigate(appRoutes.login, { replace: true })
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[dev] Sign out failed unexpectedly.', error)
      }

      showToast(getFriendlyAuthErrorMessage(error, t, 'authSignOutFailed'), 'error')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/92 pb-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:pl-[max(2rem,env(safe-area-inset-left))] lg:pr-[max(2rem,env(safe-area-inset-right))]">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 lg:hidden" onClick={onMenuClick} aria-label={t('menu')}>
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden flex-1 items-center gap-4 lg:flex">
            <div className="flex max-w-2xl flex-1 items-center gap-3 rounded-[1.6rem] border border-slate-200 bg-slate-50 px-5 py-3.5 shadow-sm">
              <Search className="h-4 w-4 text-slate-400" />
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder={t('searchPlaceholder')} />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <LanguageToggleButton
              language={language}
              setLanguage={setLanguage}
              t={t}
              className="px-2.5 py-2 text-[11px] sm:px-3 sm:py-3 sm:text-xs lg:px-3 lg:py-3"
            />
            <button type="button" onClick={openNotifications} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-[1.35rem] border border-slate-200 bg-white p-3 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label={t('notificationCenter')}>
              <Bell className="h-5 w-5 text-slate-600" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <div className="hidden xl:block">
              <ActionMenu
                label={<><Plus className="h-4 w-4" /> {t('quickAdd')}</>}
                ariaLabel={t('quickAdd')}
                items={quickAddItems}
                buttonClassName="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
              />
            </div>
            <button type="button" onClick={() => { setIsAccountOpen((value) => !value); setIsNotificationsOpen(false); setAccountScreen(null) }} className="flex min-h-11 items-center gap-3 rounded-[1.35rem] border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label={t('accountMenu')}>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">{userProfile?.initials || t('userInitials')}</div>
              <div className="hidden text-left lg:block">
                <p className="text-sm font-semibold text-slate-950">{userProfile?.name || t('userName')}</p>
                <p className="text-xs text-slate-500">{t('ownerAdmin')}</p>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 lg:block" />
            </button>
          </div>
        </div>
      </header>

      <NotificationCenter
        isOpen={isNotificationsOpen}
        notifications={notifications}
        onClose={closeNotifications}
        onMarkAllRead={onMarkAllNotificationsRead}
        onClearNotifications={onClearNotifications}
        t={t}
      />
      <AccountMenu
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        userProfile={userProfile}
        onOpenScreen={openAccountScreen}
        onOpenSettings={onOpenSettings}
        t={t}
      />

      <ModalShell isOpen={accountScreen === 'profile'} onBackdropClick={closeAccountScreen} panelClassName="max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-950">{t('myProfile')}</h2>
          <button onClick={closeAccountScreen} className="rounded-2xl border border-slate-200 p-2 hover:bg-slate-50" aria-label={t('close')}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            ['name', t('name')],
            ['email', t('email')],
            ['phone', t('phone')],
            ['timezone', t('timezone')],
          ].map(([field, label]) => (
            <label key={field} className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
              <input value={profileDraft?.[field] || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400" />
            </label>
          ))}
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('preferredLanguage')}</span>
            <select value={profileDraft?.preferredLanguage || language} onChange={(event) => setProfileDraft((current) => ({ ...current, preferredLanguage: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400">
              {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={closeAccountScreen} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">{t('cancel')}</button>
          <button onClick={saveProfile} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">{t('save')}</button>
        </div>
      </ModalShell>

      <ModalShell isOpen={accountScreen === 'language'} onBackdropClick={closeAccountScreen} panelClassName="max-w-md">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-950">{t('language')}</h2>
          <button onClick={closeAccountScreen} className="rounded-2xl border border-slate-200 p-2 hover:bg-slate-50" aria-label={t('close')}><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-2 text-sm text-slate-500">{t('languageHelp')}</p>
        <div className="mt-5 grid gap-3">
          {languageOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => { setLanguage(option.value); closeAccountScreen() }}
              className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold ${language === option.value ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </ModalShell>

      <ModalShell isOpen={accountScreen === 'storage'} onBackdropClick={closeAccountScreen} panelClassName="max-w-md">
        <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold text-slate-950">{t('storage')}</h2><button onClick={closeAccountScreen} className="rounded-2xl border border-slate-200 p-2 hover:bg-slate-50" aria-label={t('close')}><X className="h-4 w-4" /></button></div>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between text-sm font-bold text-slate-700"><span>{t('storageUsed')}</span><span>1.2 GB / 5 GB</span></div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[24%] rounded-full bg-slate-950" /></div>
          <p className="mt-3 text-xs text-slate-500">{t('storageHelp')}</p>
        </div>
      </ModalShell>

      <ModalShell isOpen={accountScreen === 'help'} onBackdropClick={closeAccountScreen} panelClassName="max-w-lg">
        <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold text-slate-950">{t('help')}</h2><button onClick={closeAccountScreen} className="rounded-2xl border border-slate-200 p-2 hover:bg-slate-50" aria-label={t('close')}><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid gap-3">
          {['helpCreateLead', 'helpCreateEstimate', 'helpSendInvoice', 'helpScheduleJob'].map((key) => <div key={key} className="rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">{t(key)}</div>)}
        </div>
      </ModalShell>

      <ModalShell isOpen={accountScreen === 'about'} onBackdropClick={closeAccountScreen} panelClassName="max-w-md">
        <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold text-slate-950">{t('aboutContractorFlow')}</h2><button onClick={closeAccountScreen} className="rounded-2xl border border-slate-200 p-2 hover:bg-slate-50" aria-label={t('close')}><X className="h-4 w-4" /></button></div>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <BrandLogo variant="horizontal" tone="light" className="h-10 w-32" imageClassName="object-left" />
          <p className="mt-3 text-base font-bold text-slate-950">{t('appName')}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('version')} 1.9</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t('aboutDescription')}</p>
        </div>
      </ModalShell>

      <ModalShell isOpen={accountScreen === 'signOut'} onBackdropClick={closeAccountScreen} panelClassName="max-w-md">
        <h2 className="text-lg font-bold text-slate-950">{t('confirmSignOut')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{t(USE_AUTH ? 'signOutHelpAuth' : 'signOutHelpMock')}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={closeAccountScreen} disabled={isSigningOut} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('cancel')}</button>
          <button onClick={confirmSignOut} disabled={isSigningOut} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">{t('signOut')}</button>
        </div>
      </ModalShell>
    </>
  )
}

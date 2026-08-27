import { Building2, CircleHelp, CreditCard, Database, Info, Languages, LogOut, User, X } from 'lucide-react'

function AccountMenuItem({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${danger ? 'text-rose-600' : 'text-slate-700'}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{label}</span>
    </button>
  )
}

export function AccountMenu({ isOpen, onClose, userProfile, onOpenScreen, onOpenSettings, onOpenSubscription, t }) {
  if (!isOpen) return null

  function chooseScreen(screen) {
    onClose()
    window.setTimeout(() => onOpenScreen(screen), 0)
  }

  function chooseSettings() {
    onClose()
    window.setTimeout(onOpenSettings, 0)
  }

  function chooseSubscription() {
    onClose()
    window.setTimeout(onOpenSubscription, 0)
  }

  return (
    <div className="fixed inset-0 z-[70] bg-transparent" onClick={onClose}>
      <aside className="absolute right-3 top-20 w-[calc(100vw-1.5rem)] max-w-[26rem] rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl sm:right-6 sm:top-24 sm:w-[24rem]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 p-3">
          <div>
            <p className="text-sm font-bold text-slate-950">{userProfile?.name || t('userName')}</p>
            <p className="mt-1 text-xs text-slate-500">{userProfile?.email || t('notAvailable')}</p>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-slate-200 p-2 hover:bg-slate-50" aria-label={t('close')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="py-2">
          <AccountMenuItem icon={User} label={t('myProfile')} onClick={() => chooseScreen('profile')} />
          <AccountMenuItem icon={Building2} label={t('companySettingsMenu')} onClick={chooseSettings} />
          <AccountMenuItem icon={CreditCard} label={t('aymeroSubscription')} onClick={chooseSubscription} />
          <AccountMenuItem icon={Languages} label={t('language')} onClick={() => chooseScreen('language')} />
          <AccountMenuItem icon={Database} label={t('storage')} onClick={() => chooseScreen('storage')} />
          <AccountMenuItem icon={CircleHelp} label={t('help')} onClick={() => chooseScreen('help')} />
          <AccountMenuItem icon={Info} label={t('aboutContractorFlow')} onClick={() => chooseScreen('about')} />
          <AccountMenuItem icon={LogOut} label={t('signOut')} onClick={() => chooseScreen('signOut')} danger />
        </div>
      </aside>
    </div>
  )
}

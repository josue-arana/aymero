import { CreditCard } from 'lucide-react'
import { SaasBillingCard } from '../components/settings/SaasBillingCard'

export function SubscriptionPage({ language, t }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 overflow-hidden">
      <header className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl sm:p-7">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200 ring-1 ring-blue-300/30">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">{t('subscriptionAccount')}</p>
            <h1 className="mt-2 break-words text-3xl font-bold tracking-tight">{t('aymeroSubscription')}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{t('aymeroSubscriptionHelp')}</p>
          </div>
        </div>
      </header>

      <SaasBillingCard language={language} t={t} />
    </div>
  )
}

export default SubscriptionPage

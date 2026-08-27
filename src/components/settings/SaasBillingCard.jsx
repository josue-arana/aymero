import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useToast } from '../common/ToastProvider'
import { useAuth } from '../../contexts/AuthContext'
import {
  AYMERO_MANAGED_PLAN_KEY,
  createSaasBillingCheckout,
  getSaasBillingSubscription,
} from '../../services/saasBillingService'

const manageableRoles = new Set(['owner', 'admin'])
const paymentAttentionStatuses = new Set(['past_due', 'unpaid'])
const terminalSubscriptionStatuses = new Set(['canceled', 'incomplete_expired'])

function getReturnState() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('billing') || ''
}

function clearBillingReturnState() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('billing')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function getStatusTranslationKey(status) {
  const normalizedStatus = String(status || '').toLowerCase()
  const keys = {
    active: 'billingStatusActive',
    trialing: 'billingStatusTrialing',
    past_due: 'billingStatusPastDue',
    canceled: 'billingStatusCanceled',
    unpaid: 'billingStatusUnpaid',
    paused: 'billingStatusPaused',
    incomplete: 'billingStatusIncomplete',
    incomplete_expired: 'billingStatusIncompleteExpired',
  }
  return keys[normalizedStatus] || 'billingStatusUnknown'
}

export function SaasBillingCard({ language, t }) {
  const { contractorAccess, session } = useAuth()
  const { showToast } = useToast()
  const [subscription, setSubscription] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [returnState] = useState(getReturnState)
  const [isSyncPending, setIsSyncPending] = useState(returnState === 'success')

  const role = String(contractorAccess?.membership?.role || '').toLowerCase()
  const canManageBilling = manageableRoles.has(role)
  const formattedRenewalDate = useMemo(() => {
    if (!subscription?.current_period_end) return ''
    const date = new Date(subscription.current_period_end)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }, [language, subscription?.current_period_end])

  async function loadBillingStatus({ quiet = false } = {}) {
    if (!quiet) setIsLoading(true)
    const result = await getSaasBillingSubscription()
    if (result.error) {
      setLoadError(t('billingLoadFailed'))
    } else {
      setSubscription(result.data)
      setLoadError('')
    }
    if (!quiet) setIsLoading(false)
    return result
  }

  useEffect(() => {
    let canceled = false
    let timer = null

    async function loadAfterReturn(attempt = 0) {
      const result = await getSaasBillingSubscription()
      if (canceled) return

      if (!result.error && result.data) {
        setSubscription(result.data)
        setLoadError('')
        setIsLoading(false)
        setIsSyncPending(false)
        if (returnState === 'success') showToast(t('billingSubscriptionSynced'))
        return
      }

      if (returnState === 'success' && attempt < 6) {
        setIsLoading(false)
        timer = window.setTimeout(() => loadAfterReturn(attempt + 1), 2000)
        return
      }

      setLoadError(result.error ? t('billingLoadFailed') : '')
      setIsLoading(false)
      setIsSyncPending(returnState === 'success' && !result.error)
    }

    if (returnState === 'canceled') {
      showToast(t('billingCheckoutCanceled'))
      clearBillingReturnState()
    } else if (returnState === 'success') {
      clearBillingReturnState()
    }

    loadAfterReturn()
    return () => {
      canceled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [returnState, showToast, t])

  async function startCheckout() {
    if (isStartingCheckout || !canManageBilling) return
    setIsStartingCheckout(true)
    const result = await createSaasBillingCheckout({
      planKey: AYMERO_MANAGED_PLAN_KEY,
      accessToken: session?.access_token || '',
    })

    if (result.error) {
      const errorKey = result.error.code === 'BILLING_PERMISSION_REQUIRED'
        ? 'billingPermissionRequired'
        : result.error.code === 'UNKNOWN_BILLING_PLAN'
          ? 'billingPlanUnavailable'
          : 'billingCheckoutFailed'
      showToast(t(errorKey), 'error')
      setIsStartingCheckout(false)
      return
    }

    if (result.data?.existingSubscription) {
      await loadBillingStatus({ quiet: true })
      showToast(t('billingExistingSubscription'))
      setIsStartingCheckout(false)
      return
    }

    if (!result.data?.url) {
      showToast(t('billingCheckoutFailed'), 'error')
      setIsStartingCheckout(false)
      return
    }

    window.location.assign(result.data.url)
  }

  const needsPaymentAttention = paymentAttentionStatuses.has(String(subscription?.status || '').toLowerCase())
  const canStartNewSubscription = !subscription || terminalSubscriptionStatuses.has(String(subscription.status || '').toLowerCase())

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-labelledby="saas-billing-heading">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="saas-billing-heading" className="text-base font-bold text-slate-950">{t('saasBilling')}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t('saasBillingHelp')}</p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {isLoading ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm font-semibold text-slate-500" aria-live="polite">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> {t('billingLoading')}
          </div>
        ) : (
          <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-xl font-bold text-slate-950">{t('aymeroManaged')}</h3>
                <p className="text-base font-bold text-blue-700">{t('aymeroManagedPrice')}</p>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t('aymeroManagedDescription')}</p>

              {subscription ? (
                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <dt className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{t('billingStatus')}</dt>
                    <dd className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                      {needsPaymentAttention ? <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
                      {t(getStatusTranslationKey(subscription.status))}
                    </dd>
                  </div>
                  {formattedRenewalDate ? (
                    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <dt className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{t(subscription.cancel_at_period_end ? 'billingAccessUntil' : 'billingNextRenewal')}</dt>
                      <dd className="mt-2 break-words text-sm font-bold text-slate-900">{formattedRenewalDate}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {isSyncPending ? (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900" role="status">
                  <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                  <span>{t('billingSyncPending')}</span>
                </div>
              ) : null}

              {needsPaymentAttention ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  {t('billingPaymentAttention')}
                </div>
              ) : null}

              {loadError ? (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <span>{loadError}</span>
                  <button type="button" onClick={() => loadBillingStatus()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 font-bold hover:bg-amber-100">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t('retry')}
                  </button>
                </div>
              ) : null}
            </div>

            {canStartNewSubscription && !isSyncPending ? (
              <div className="w-full md:w-56">
                {canManageBilling ? (
                  <button
                    type="button"
                    onClick={startCheckout}
                    disabled={isStartingCheckout || !session?.access_token}
                    aria-busy={isStartingCheckout}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isStartingCheckout ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
                    {isStartingCheckout ? t('billingOpeningCheckout') : t('billingSubscribeWithStripe')}
                  </button>
                ) : (
                  <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{t('billingOwnerAdminOnly')}</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}

export default SaasBillingCard

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CreditCard, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useToast } from '../common/ToastProvider'
import { AymeroLoader } from '../common/AymeroLoader'
import { useAuth } from '../../contexts/AuthContext'
import {
  AYMERO_MANAGED_PLAN_KEY,
  createSaasBillingCheckout,
  createSaasBillingPortal,
  getSaasBillingSubscription,
} from '../../services/saasBillingService'
import { formatDisplayDate } from '../../utils/formatters'
import {
  canStartSaasBillingCheckout,
  getSaasBillingPaymentPresentation,
  getSaasBillingStatusPresentation,
  isSaasBillingCancellationScheduled,
} from '../../utils/saasBilling'

const manageableRoles = new Set(['owner', 'admin'])
const billingSyncMaxRetries = 6
const billingSyncRetryDelayMs = 1500

const badgeToneClasses = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
}

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

function logBillingReadError(error, contractorId) {
  if (!import.meta.env.DEV) return
  // eslint-disable-next-line no-console
  console.error('[dev] Authoritative SaaS billing read failed.', {
    contractorId,
    code: error?.code || 'BILLING_READ_FAILED',
    status: error?.status || null,
  })
}

function BillingStatusBadge({ label, tone = 'neutral' }) {
  return (
    <span className={`inline-flex min-h-6 w-fit max-w-full items-center break-words rounded-full px-2.5 py-1 text-xs font-bold leading-none ring-1 ${badgeToneClasses[tone] || badgeToneClasses.neutral}`}>
      {label}
    </span>
  )
}

export function SaasBillingCard({ language, t }) {
  const { contractorAccess, session } = useAuth()
  const { showToast } = useToast()
  const [subscription, setSubscription] = useState(null)
  const [hasAuthoritativeResult, setHasAuthoritativeResult] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [returnState] = useState(getReturnState)
  const [isSyncPending, setIsSyncPending] = useState(['success', 'portal'].includes(returnState))
  const [isSyncDelayed, setIsSyncDelayed] = useState(false)
  const hasHandledReturnRef = useRef(false)

  const role = String(contractorAccess?.membership?.role || '').toLowerCase()
  const contractorId = String(contractorAccess?.contractorId || '').trim()
  const accessToken = String(session?.access_token || '').trim()
  const membershipStatus = String(contractorAccess?.membershipStatus || '').toLowerCase()
  const billingContextReady = membershipStatus === 'active' && Boolean(contractorId && accessToken)
  const canManageBilling = manageableRoles.has(role)
  const statusPresentation = getSaasBillingStatusPresentation(subscription?.status)
  const paymentPresentation = getSaasBillingPaymentPresentation(subscription?.last_payment_status)
  const needsPaymentAttention = Boolean(statusPresentation.needsAttention || paymentPresentation?.needsAttention)
  const canStartNewSubscription = canStartSaasBillingCheckout(subscription)
  const isCancellationScheduled = isSaasBillingCancellationScheduled(subscription)

  const formattedRenewalDate = useMemo(() => formatDisplayDate(
    subscription?.current_period_end,
    '',
    language === 'es' ? 'es-US' : 'en-US',
  ), [language, subscription?.current_period_end])

  const loadBillingStatus = useCallback(async ({ quiet = false } = {}) => {
    if (!billingContextReady) {
      if (!quiet) setIsLoading(false)
      setLoadError(t('billingContextUnavailable'))
      return {
        data: null,
        error: { code: 'BILLING_CONTEXT_MISSING' },
      }
    }

    if (!quiet) setIsLoading(true)
    const result = await getSaasBillingSubscription({ accessToken, contractorId })
    if (result.error) {
      logBillingReadError(result.error, contractorId)
      setLoadError(t('billingLoadFailed'))
    } else {
      setSubscription(result.data)
      setHasAuthoritativeResult(true)
      setLoadError('')
    }
    if (!quiet) setIsLoading(false)
    return result
  }, [accessToken, billingContextReady, contractorId, t])

  useEffect(() => {
    if (['', 'idle', 'loading'].includes(membershipStatus)) return undefined

    if (!billingContextReady) {
      setIsLoading(false)
      setLoadError(t('billingContextUnavailable'))
      return undefined
    }

    let canceled = false
    let timer = null
    const isSuccessReturn = returnState === 'success' && !hasHandledReturnRef.current
    const isCanceledReturn = returnState === 'canceled' && !hasHandledReturnRef.current
    const isPortalReturn = returnState === 'portal' && !hasHandledReturnRef.current

    if (isSuccessReturn || isCanceledReturn || isPortalReturn) {
      hasHandledReturnRef.current = true
      clearBillingReturnState()
    }

    async function loadAfterReturn(attempt = 0) {
      const result = await getSaasBillingSubscription({ accessToken, contractorId })
      if (canceled) return

      if (result.error) {
        logBillingReadError(result.error, contractorId)
        setLoadError(t('billingLoadFailed'))
        setIsLoading(false)
        setIsSyncPending(false)
        return
      }

      setSubscription(result.data)
      setHasAuthoritativeResult(true)
      setLoadError('')
      setIsLoading(false)

      if (isPortalReturn && attempt < billingSyncMaxRetries) {
        setIsSyncPending(true)
        timer = window.setTimeout(() => loadAfterReturn(attempt + 1), billingSyncRetryDelayMs)
        return
      }

      if (result.data) {
        setIsSyncPending(false)
        setIsSyncDelayed(false)
        if (isSuccessReturn) showToast(t('billingSubscriptionSynced'))
        return
      }

      if (isSuccessReturn && attempt < billingSyncMaxRetries) {
        setIsSyncPending(true)
        timer = window.setTimeout(() => loadAfterReturn(attempt + 1), billingSyncRetryDelayMs)
        return
      }

      setIsSyncPending(false)
      setIsSyncDelayed(isSuccessReturn)
    }

    if (isCanceledReturn) {
      showToast(t('billingCheckoutCanceled'))
    }

    loadAfterReturn()
    return () => {
      canceled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [accessToken, billingContextReady, contractorId, membershipStatus, returnState, showToast, t])

  async function retryDelayedSynchronization() {
    setIsSyncDelayed(false)
    setIsSyncPending(true)
    const result = await loadBillingStatus({ quiet: true })
    setIsSyncPending(false)

    if (result.data) {
      showToast(t('billingSubscriptionSynced'))
      return
    }
    if (!result.error) setIsSyncDelayed(true)
  }

  async function startCheckout() {
    if (isStartingCheckout || !canManageBilling) return
    setIsStartingCheckout(true)
    const result = await createSaasBillingCheckout({
      planKey: AYMERO_MANAGED_PLAN_KEY,
      accessToken,
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

  async function openSubscriptionManagement() {
    if (isOpeningPortal || !canManageBilling || !subscription) return
    setIsOpeningPortal(true)
    const result = await createSaasBillingPortal({ accessToken })

    if (result.error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[dev] Stripe subscription management session failed.', {
          contractorId,
          code: result.error.code || 'BILLING_PORTAL_FAILED',
          status: result.error.status || null,
        })
      }
      const errorKey = result.error.code === 'BILLING_PERMISSION_REQUIRED'
        ? 'billingManagePermissionRequired'
        : result.error.code === 'BILLING_CUSTOMER_MISSING'
          ? 'billingCustomerMissing'
          : 'billingPortalFailed'
      showToast(t(errorKey), 'error')
      setIsOpeningPortal(false)
      return
    }

    window.location.assign(result.data.url)
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-labelledby="saas-billing-heading">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="saas-billing-heading" className="text-base font-bold text-slate-950">{t('aymeroManaged')}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t('aymeroManagedDescription')}</p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {isLoading ? (
          <AymeroLoader variant="section" title={t('billingLoading')} accessibleLabel={t('billingLoading')} className="min-h-40" />
        ) : (
          <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-xl font-bold text-slate-950">{t('aymeroManaged')}</h3>
                <p className="text-sm font-semibold text-slate-500">{t('aymeroManagedPrice')}</p>
              </div>

              {subscription ? (
                <div className="mt-5">
                  <div className="flex min-w-0 flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
                    <BillingStatusBadge
                      label={isCancellationScheduled && formattedRenewalDate
                        ? t('billingCancellationScheduledStatus', { date: formattedRenewalDate })
                        : t(statusPresentation.labelKey)}
                      tone={isCancellationScheduled ? 'warning' : statusPresentation.tone}
                    />
                    <p className="min-w-0 text-sm leading-6 text-slate-700">
                      {isCancellationScheduled && formattedRenewalDate
                        ? t('billingCancellationScheduledMessage', { date: formattedRenewalDate })
                        : t(statusPresentation.descriptionKey)}
                    </p>
                  </div>

                  {(formattedRenewalDate || paymentPresentation) ? (
                    <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                      {formattedRenewalDate ? (
                        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                          <dt className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{t(subscription.cancel_at_period_end ? 'billingAccessUntil' : 'billingNextBillingDate')}</dt>
                          <dd className="mt-2 break-words text-sm font-bold text-slate-950">{formattedRenewalDate}</dd>
                        </div>
                      ) : null}
                      {paymentPresentation ? (
                        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                          <dt className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{t('billingPaymentStatus')}</dt>
                          <dd className="mt-2"><BillingStatusBadge label={t(paymentPresentation.labelKey)} tone={paymentPresentation.tone} /></dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </div>
              ) : null}

              {isSyncPending ? (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900" role="status">
                  <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                  <span>{t(returnState === 'portal' ? 'billingPortalSyncPending' : 'billingSyncPending')}</span>
                </div>
              ) : null}

              {isSyncDelayed ? (
                <div className="mt-4 flex min-w-0 flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between" role="status">
                  <span className="min-w-0 leading-6">{t('billingSyncDelayed')}</span>
                  <button type="button" onClick={retryDelayedSynchronization} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-4 font-bold hover:bg-blue-100">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t('billingRefreshStatus')}
                  </button>
                </div>
              ) : null}

              {needsPaymentAttention ? (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t('billingPaymentAttention')}</span>
                </div>
              ) : null}

              {loadError ? (
                <div className="mt-4 flex min-w-0 flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="alert">
                  <span className="min-w-0 leading-6">{loadError}</span>
                  <button type="button" onClick={() => loadBillingStatus()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 font-bold hover:bg-amber-100">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t('retry')}
                  </button>
                </div>
              ) : null}
            </div>

            {hasAuthoritativeResult && subscription && !canStartNewSubscription && !loadError ? (
              <div className="w-full md:w-56">
                {canManageBilling ? (
                  <button
                    type="button"
                    onClick={openSubscriptionManagement}
                    disabled={isOpeningPortal || !accessToken}
                    aria-busy={isOpeningPortal}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-center text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isOpeningPortal ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
                    {isOpeningPortal ? t('billingOpeningPortal') : t('manageSubscription')}
                  </button>
                ) : (
                  <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{t('billingManageOwnerAdminOnly')}</p>
                )}
              </div>
            ) : hasAuthoritativeResult && canStartNewSubscription && !isSyncPending && !isSyncDelayed && !loadError ? (
              <div className="w-full md:w-56">
                {canManageBilling ? (
                  <button
                    type="button"
                    onClick={startCheckout}
                    disabled={isStartingCheckout || !accessToken}
                    aria-busy={isStartingCheckout}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isStartingCheckout ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
                    {isStartingCheckout
                      ? t('billingOpeningCheckout')
                      : t(subscription?.status === 'canceled' ? 'billingSubscribeAgain' : 'billingSubscribeWithStripe')}
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

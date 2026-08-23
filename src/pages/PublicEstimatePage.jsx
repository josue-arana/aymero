import { useEffect, useMemo, useRef, useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { EstimatePdfTemplate } from '../components/estimates/EstimatePdfTemplate'
import { PaginatedEstimatePreview } from '../components/estimates/PaginatedEstimatePreview'
import { AymeroLoader } from '../components/common/AymeroLoader'
import { ModalShell } from '../components/common/ModalShell'
import { getPublicEstimateByToken, respondToPublicEstimate } from '../services/publicPortalService'
import { createTranslator } from '../translations'
import { normalizeEstimateDocument, resolveEstimatePricingMode, resolveEstimateValidUntil } from '../utils/estimateDocument'
import { getPaymentTermLabel } from '../utils/paymentTerms'
import { isPrintWindowBlockedError, printDocumentElement } from '../utils/printDocument'
import {
  ESTIMATE_DOCUMENT_SOURCE_PADDING,
  ESTIMATE_DOCUMENT_SOURCE_WIDTH,
  ESTIMATE_PAPER_MARGIN,
} from '../utils/estimatePagination'
import { normalizeSupportedLanguage, resolveInitialSupportedLanguage } from '../utils/language'
import { appRoutes } from '../config/appRoutes'
import { getEstimateClientResponseView } from '../utils/estimateClientResponse'

function formatClientAddress(client = {}, project = {}) {
  const locality = [client.city, client.state, client.postalCode].filter(Boolean).join(', ').replace(', ,', ',')
  return [client.address || project.address || '', locality].filter(Boolean).join('\n')
}

function PublicEstimateState({ title, message }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{message}</p>
      </section>
    </main>
  )
}

export function PublicEstimatePage() {
  const location = useLocation()
  const estimateToken = matchPath(appRoutes.publicEstimate, location.pathname)?.params?.estimateToken || ''
  const sourceRef = useRef(null)
  const initialLanguage = resolveInitialSupportedLanguage('contractorflow.portalLanguage', 'en')
  const [language, setLanguage] = useState(initialLanguage)
  const [state, setState] = useState({ loading: true, payload: null, error: null })
  const [printError, setPrintError] = useState('')
  const [confirmDecision, setConfirmDecision] = useState('')
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false)
  const [responseError, setResponseError] = useState('')
  const t = useMemo(() => createTranslator(language), [language])

  useEffect(() => {
    const abortController = new AbortController()
    let cancelled = false

    async function loadEstimate() {
      setState({ loading: true, payload: null, error: null })

      try {
        const response = await getPublicEstimateByToken(estimateToken, { signal: abortController.signal })
        if (cancelled) return

        if (response.error || !response.data?.estimate) {
          setState({ loading: false, payload: null, error: response.error || { code: 'ESTIMATE_NOT_FOUND' } })
          return
        }

        const payload = response.data
        const outputLanguage = normalizeSupportedLanguage(
          payload.estimate.estimateLanguage
            || payload.client?.preferredLanguage
            || payload.companySettings?.portal?.defaultLanguage,
          initialLanguage,
        )
        setLanguage(outputLanguage)
        setState({ loading: false, payload, error: null })
      } catch (error) {
        if (!cancelled && error?.name !== 'AbortError') {
          setState({ loading: false, payload: null, error: { code: 'ESTIMATE_LOAD_FAILED' } })
        }
      }
    }

    loadEstimate()
    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [estimateToken, initialLanguage])

  const previewProps = useMemo(() => {
    const payload = state.payload
    if (!payload?.estimate) return null

    const estimate = payload.estimate
    const client = payload.client || {}
    const project = payload.project || {}
    const companySettings = payload.companySettings || {}
    const lineItems = Array.isArray(estimate.lineItems) ? estimate.lineItems : []
    const pricingMode = resolveEstimatePricingMode(estimate.pricingMode, lineItems)
    const estimateDate = estimate.dateCreated || estimate.createdAt || ''
    const validUntil = resolveEstimateValidUntil(
      estimate,
      estimateDate,
      companySettings.defaults?.estimateExpirationDays,
    )
    const lead = {
      client: client.displayName || client.name || '',
      address: formatClientAddress(client, project),
      location: formatClientAddress(client, project),
      projectTitle: estimate.projectTitle || estimate.title || project.projectTitle || '',
      projectType: project.projectType || estimate.title || '',
    }
    const documentModel = normalizeEstimateDocument({
      pricingMode,
      scope: estimate.scopeOfWork || estimate.summary || '',
      lineItems,
      total: Number(estimate.total ?? estimate.totalAmount ?? 0),
      subtotal: Number(estimate.subtotal ?? 0),
      discountAmount: Number(estimate.discountAmount ?? 0),
      taxAmount: Number(estimate.taxAmount ?? 0),
      materialsIncluded: estimate.materialsIncluded !== false,
      validUntil,
    })

    return {
      company: companySettings.company || {},
      lead,
      estimateNumber: estimate.estimateNumber || estimate.number || '',
      estimateDate,
      documentModel,
      paymentTerms: getPaymentTermLabel(
        estimate.paymentTerms || companySettings.defaults?.paymentTerms || '',
        t,
      ),
      language,
      t,
    }
  }, [language, state.payload, t])

  async function handleSaveAsPdf() {
    setPrintError('')
    try {
      await printDocumentElement(sourceRef.current, {
        documentTitle: `${previewProps?.estimateNumber || t('estimate')} ${previewProps?.lead?.client || ''}`.trim(),
        pageMarginInches: ESTIMATE_PAPER_MARGIN / 72,
        safeInsetInches: 0,
        printLabel: t('print'),
      })
    } catch (error) {
      setPrintError(t(isPrintWindowBlockedError(error) ? 'printPreviewPopupBlocked' : 'estimatePdfGenerateFailed'))
    }
  }

  async function handleEstimateResponse() {
    if (!confirmDecision || isSubmittingResponse) return

    setIsSubmittingResponse(true)
    setResponseError('')
    try {
      const response = await respondToPublicEstimate(estimateToken, confirmDecision)
      if (response.error || !response.data?.estimate) {
        if (response.error?.code === 'ESTIMATE_NOT_FOUND') {
          setConfirmDecision('')
          setState({ loading: false, payload: null, error: response.error })
          return
        }

        if (response.error?.code === 'ESTIMATE_RESPONSE_CONFLICT') {
          const refreshed = await getPublicEstimateByToken(estimateToken)
          if (!refreshed.error && refreshed.data?.estimate) {
            setState({ loading: false, payload: refreshed.data, error: null })
            setConfirmDecision('')
            return
          }
        }

        setResponseError(t('publicEstimateResponseError'))
        return
      }

      setState({ loading: false, payload: response.data, error: null })
      setConfirmDecision('')
    } catch {
      setResponseError(t('publicEstimateResponseError'))
    } finally {
      setIsSubmittingResponse(false)
    }
  }

  if (state.loading) {
    return (
      <AymeroLoader
        variant="page"
        title={t('loadingEstimate')}
        message={t('loadingEstimateHelp')}
        accessibleLabel={t('loadingEstimate')}
      />
    )
  }

  if (state.error || !previewProps) {
    const unavailable = state.error?.code && state.error.code !== 'ESTIMATE_NOT_FOUND'
    return (
      <PublicEstimateState
        title={t(unavailable ? 'publicEstimateUnavailable' : 'publicEstimateNotFound')}
        message={t(unavailable ? 'publicEstimateUnavailableHelp' : 'publicEstimateNotFoundHelp')}
      />
    )
  }

  const responseView = getEstimateClientResponseView(state.payload?.estimate?.status)

  return (
    <main className="min-h-[100dvh] bg-slate-100 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t('estimate')}</p>
            <h1 className="mt-1 break-words text-lg font-bold text-slate-950 [overflow-wrap:anywhere]">{previewProps.lead.projectTitle || previewProps.estimateNumber}</h1>
          </div>
          <button type="button" onClick={handleSaveAsPdf} className="min-h-11 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            {t('saveAsPdf')}
          </button>
        </div>
        {printError ? <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{printError}</p> : null}
        {responseView.isApproved ? (
          <section role="status" className="mb-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-bold text-emerald-950">{t('publicEstimateApprovedTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-800">{t('publicEstimateApprovedHelp')}</p>
          </section>
        ) : null}
        {responseView.isRejected ? (
          <section role="status" className="mb-5 rounded-3xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-bold text-slate-950">{t('publicEstimateDeclinedTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t('publicEstimateDeclinedHelp')}</p>
          </section>
        ) : null}
        {responseView.isConverted ? (
          <section role="status" className="mb-5 rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-bold text-blue-950">{t('publicEstimateConvertedTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-blue-800">{t('publicEstimateConvertedHelp')}</p>
          </section>
        ) : null}
        <section aria-label={t('previewEstimate')} className="min-w-0 overflow-hidden rounded-3xl bg-white p-2 shadow-sm sm:p-3">
          <PaginatedEstimatePreview uiT={t}>
            <EstimatePdfTemplate {...previewProps} />
          </PaginatedEstimatePreview>
        </section>
        {responseView.isActionable ? (
          <section aria-labelledby="public-estimate-response-title" className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 id="public-estimate-response-title" className="text-xl font-bold text-slate-950">{t('publicEstimateResponseTitle')}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t('publicEstimateResponseHelp')}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => { setResponseError(''); setConfirmDecision('approve') }} className="min-h-12 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                {t('approveEstimate')}
              </button>
              <button type="button" onClick={() => { setResponseError(''); setConfirmDecision('decline') }} className="min-h-12 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                {t('declineEstimate')}
              </button>
            </div>
          </section>
        ) : null}
      </div>
      <div style={{ pointerEvents: 'none', position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
        <div
          ref={sourceRef}
          data-estimate-pdf-root="true"
          style={{
            width: `${ESTIMATE_DOCUMENT_SOURCE_WIDTH}px`,
            backgroundColor: '#ffffff',
            color: '#0f172a',
            padding: `${ESTIMATE_DOCUMENT_SOURCE_PADDING}px`,
            boxSizing: 'border-box',
          }}
        >
          <EstimatePdfTemplate {...previewProps} />
        </div>
      </div>
      <ModalShell
        isOpen={Boolean(confirmDecision)}
        onBackdropClick={isSubmittingResponse ? undefined : () => setConfirmDecision('')}
        panelClassName="max-w-md"
        ariaLabelledBy="public-estimate-confirm-title"
        ariaDescribedBy="public-estimate-confirm-help"
      >
        <h2 id="public-estimate-confirm-title" className="text-xl font-bold text-slate-950">
          {t(confirmDecision === 'approve' ? 'publicEstimateApproveConfirmTitle' : 'publicEstimateDeclineConfirmTitle')}
        </h2>
        <p id="public-estimate-confirm-help" className="mt-3 text-sm leading-6 text-slate-600">
          {t(confirmDecision === 'approve' ? 'publicEstimateApproveConfirmHelp' : 'publicEstimateDeclineConfirmHelp')}
        </p>
        {responseError ? <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{responseError}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={isSubmittingResponse} onClick={() => setConfirmDecision('')} className="min-h-12 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            {t('cancel')}
          </button>
          <button type="button" disabled={isSubmittingResponse} onClick={handleEstimateResponse} className={`min-h-12 rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${confirmDecision === 'approve' ? 'bg-slate-950 hover:bg-slate-800' : 'bg-red-600 hover:bg-red-700'}`}>
            {isSubmittingResponse ? t('saving') : t(confirmDecision === 'approve' ? 'approveEstimate' : 'declineEstimate')}
          </button>
        </div>
      </ModalShell>
    </main>
  )
}

export default PublicEstimatePage

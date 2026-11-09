import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { Download, Printer } from 'lucide-react'
import { AymeroLoader } from '../components/common/AymeroLoader'
import { ScaledDocumentPreview, defaultDocumentPreviewWidth } from '../components/common/ScaledDocumentPreview'
import { getPublicInvoiceByToken } from '../services/publicPortalService'
import { createTranslator } from '../translations'
import { normalizeSupportedLanguage, resolveInitialSupportedLanguage } from '../utils/language'
import { appRoutes } from '../config/appRoutes'
import { isPrintWindowBlockedError, printDocumentElement } from '../utils/printDocument'

const LazyInvoicePdfTemplate = lazy(() => import('../components/invoices/InvoicePdfTemplate').then((module) => ({ default: module.InvoicePdfTemplate })))

function PublicInvoiceState({ title, message }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-8">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{message}</p>
      </section>
    </main>
  )
}

export function PublicInvoicePage() {
  const location = useLocation()
  const invoiceToken = matchPath(appRoutes.publicInvoice, location.pathname)?.params?.invoiceToken || ''
  const initialLanguage = resolveInitialSupportedLanguage('contractorflow.portalLanguage', 'en')
  const [language, setLanguage] = useState(initialLanguage)
  const [state, setState] = useState({ loading: true, payload: null, error: null })
  const [actionError, setActionError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const documentRef = useRef(null)
  const t = useMemo(() => createTranslator(language), [language])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function loadInvoice() {
      setState({ loading: true, payload: null, error: null })
      try {
        const result = await getPublicInvoiceByToken(invoiceToken, { signal: controller.signal })
        if (cancelled) return
        if (result.error || !result.data?.invoice) {
          setState({ loading: false, payload: null, error: result.error || { code: 'INVOICE_NOT_FOUND' } })
          return
        }
        setLanguage(normalizeSupportedLanguage(
          result.data.invoice.invoiceLanguage || result.data.client?.preferredLanguage,
          initialLanguage,
        ))
        setState({ loading: false, payload: result.data, error: null })
      } catch (error) {
        if (!cancelled && error?.name !== 'AbortError') {
          setState({ loading: false, payload: null, error: { code: 'INVOICE_LOAD_FAILED' } })
        }
      }
    }

    loadInvoice()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [initialLanguage, invoiceToken])

  async function runDocumentAction(action) {
    if (isBusy) return
    setIsBusy(true)
    setActionError('')
    try {
      if (action === 'print') {
        await printDocumentElement(documentRef.current, { documentTitle: t('invoice') })
      } else {
        const { downloadInvoicePdf } = await import('../utils/invoicePdf')
        await downloadInvoicePdf({
          element: documentRef.current,
          invoiceNumber: state.payload?.invoice?.number,
          clientName: state.payload?.client?.name,
        })
      }
    } catch (error) {
      setActionError(t(isPrintWindowBlockedError(error) || action === 'print' ? 'invoicePrintPreparationError' : 'invoicePdfGenerationError'))
    } finally {
      setIsBusy(false)
    }
  }

  if (state.loading) return <AymeroLoader variant="page" title={t('loading')} accessibleLabel={t('loading')} />
  if (!state.payload?.invoice) {
    return <PublicInvoiceState title={t('invoiceNotFound')} message={t('invoiceNotFoundHelp')} />
  }

  const { invoice, client, project, company } = state.payload
  const statusKey = invoice.status === 'Partially Paid'
    ? 'partiallyPaid'
    : invoice.status === 'Paid'
      ? 'paid'
      : invoice.status === 'Overdue'
        ? 'overdue'
        : 'sent'
  return (
    <main className="min-h-[100dvh] bg-slate-100 px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[980px]">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3 print:hidden">
          <button type="button" disabled={isBusy} onClick={() => runDocumentAction('print')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm disabled:opacity-60">
            <Printer className="h-4 w-4" aria-hidden="true" />{t('printInvoice')}
          </button>
          <button type="button" disabled={isBusy} onClick={() => runDocumentAction('download')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-60">
            <Download className="h-4 w-4" aria-hidden="true" />{t('downloadPdf')}
          </button>
        </div>
        {actionError ? <p role="alert" className="mb-3 text-right text-sm font-medium text-rose-700 print:hidden">{actionError}</p> : null}
        <p className="mb-3 text-right text-sm font-semibold text-slate-600 print:hidden">{t('invoiceStatus')}: <span className="text-slate-900">{t(statusKey)}</span></p>
        <Suspense fallback={<AymeroLoader variant="document" title={t('invoicePreviewLoading')} accessibleLabel={t('invoicePreviewLoading')} />}>
          <ScaledDocumentPreview pageWidth={defaultDocumentPreviewWidth} pagePadding={0}>
            <LazyInvoicePdfTemplate ref={documentRef} invoice={invoice} client={client} project={project} company={company} t={t} language={language} />
          </ScaledDocumentPreview>
        </Suspense>
      </div>
    </main>
  )
}

export default PublicInvoicePage

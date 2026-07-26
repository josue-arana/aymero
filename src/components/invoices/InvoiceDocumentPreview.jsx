import { Component, lazy, Suspense } from 'react'
import { FileWarning, LoaderCircle } from 'lucide-react'
import { ScaledDocumentPreview, defaultDocumentPreviewWidth } from '../common/ScaledDocumentPreview'

const LazyInvoicePdfTemplate = lazy(() => import('./InvoicePdfTemplate'))

class InvoicePreviewErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}

function PreviewState({ icon: Icon, message, animate = false }) {
  return (
    <div
      role={animate ? 'status' : 'alert'}
      aria-live={animate ? 'polite' : 'assertive'}
      className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 text-center"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon className={`h-5 w-5 ${animate ? 'animate-spin' : ''}`} aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm font-semibold leading-6 text-slate-600">{message}</p>
    </div>
  )
}

export function InvoiceDocumentPreview({ invoice, company, client, project, t, uiT = t, language, documentRef }) {
  const resetKey = `${invoice?.id || ''}:${invoice?.updatedAt || invoice?.updated_at || ''}:${project?.updatedAt || project?.updated_at || ''}:${language || ''}`

  return (
    <InvoicePreviewErrorBoundary
      key={resetKey}
      fallback={<PreviewState icon={FileWarning} message={uiT('invoicePreviewUnavailable')} />}
    >
      <Suspense fallback={<PreviewState icon={LoaderCircle} message={uiT('invoicePreviewLoading')} animate />}>
        <ScaledDocumentPreview pageWidth={defaultDocumentPreviewWidth} pagePadding={0}>
          <LazyInvoicePdfTemplate
            ref={documentRef}
            invoice={invoice}
            company={company}
            client={client}
            project={project}
            t={t}
            language={language}
          />
        </ScaledDocumentPreview>
      </Suspense>
    </InvoicePreviewErrorBoundary>
  )
}

export default InvoiceDocumentPreview

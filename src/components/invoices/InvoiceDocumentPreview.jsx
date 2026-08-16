import { Component, lazy, Suspense } from 'react'
import { FileWarning } from 'lucide-react'
import { ScaledDocumentPreview, defaultDocumentPreviewWidth } from '../common/ScaledDocumentPreview'
import { AymeroLoader } from '../common/AymeroLoader'

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

function PreviewState({ icon: Icon, message }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 text-center"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" aria-hidden="true" />
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
      <Suspense fallback={<AymeroLoader variant="document" title={uiT('invoicePreviewLoading')} accessibleLabel={uiT('invoicePreviewLoading')} />}>
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

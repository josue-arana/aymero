import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, FileText, Images, Wallet, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { DetailRow } from '../ui/DetailRow'
import { InfoCard } from '../ui/InfoCard'
import { ModalShell } from '../common/ModalShell'
import { EstimatePdfTemplate } from '../estimates/EstimatePdfTemplate'
import { PaginatedEstimatePreview } from '../estimates/PaginatedEstimatePreview'
import { ContractPdfTemplate } from '../contracts/ContractPdfTemplate'
import { PaginatedContractPreview } from '../contracts/PaginatedContractPreview'
import { useToast } from '../common/ToastProvider'
import { currency } from '../../utils/formatters'
import { getContractDisplayNumber } from '../../utils/contractNumber'
import { getEstimateDisplayNumber } from '../../utils/estimateNumber'
import { isPrintWindowBlockedError, printDocumentElement } from '../../utils/printDocument'
import { createTranslator } from '../../translations'
import { tStatus } from '../../translations'
import { getPaymentTermLabel } from '../../utils/paymentTerms'
import { resolveEstimatePricingMode } from '../../utils/estimateDocument'
import { isUpcomingClientScheduleEvent } from '../../utils/scheduleEvents'
import {
  buildContractNotesAndTermsItems as buildCanonicalContractNotesAndTermsItems,
  buildContractWorkBreakdownFromEstimate,
  normalizeContractWorkBreakdown,
} from '../../utils/contractDocument'
import {
  ESTIMATE_DOCUMENT_SOURCE_PADDING,
  ESTIMATE_DOCUMENT_SOURCE_WIDTH,
  ESTIMATE_PAPER_MARGIN,
} from '../../utils/estimatePagination'

function EmptyState({ message }) {
  return (
    <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">
      {message}
    </p>
  )
}

function CenteredEmptyState({ icon: Icon, message, tone = 'slate' }) {
  const toneClassNames = {
    purple: 'bg-violet-50 text-violet-600 ring-violet-100',
    slate: 'bg-slate-100 text-slate-500 ring-slate-200',
  }

  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
      <span className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full ring-1 ${toneClassNames[tone] || toneClassNames.slate}`}>
        <Icon className="h-7 w-7" />
      </span>
      <p className="mx-auto mt-4 max-w-sm text-sm font-medium leading-6 text-slate-500">{message}</p>
    </div>
  )
}

function CalloutEmptyState({ icon: Icon, message }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-600">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sky-600 ring-1 ring-sky-100">
        <Icon className="h-4 w-4" />
      </span>
      <p className="leading-6">{message}</p>
    </div>
  )
}

function formatValue(value, fallback) {
  if (value === 0) return '0'
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function formatCurrencyValue(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback

  return currency.format(parsed)
}

function formatEventDate(value) {
  if (!value) return ''

  const parsedDate = new Date(`${value}T00:00:00`)

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatEventTimeRange(event = {}, t = (key) => key) {
  const startTime = event?.startTime || ''
  const endTime = event?.endTime || ''

  if (startTime && endTime) {
    return `${startTime} - ${endTime}`
  }

  if (startTime) {
    return startTime
  }

  if (event?.time) {
    return event.time
  }

  return t('notAdded')
}

function formatEventLabel(event = {}, t = (key) => key) {
  const sourceLabel = event?.title || event?.eventType || event?.type || ''
  return sourceLabel ? tStatus(t, sourceLabel) : t('scheduledVisit')
}

function formatDisplayDate(value) {
  if (!value) return ''

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function resolveExplicitContractSignedDate(contract = {}) {
  const signedDate = (
    contract?.signedDate
    || contract?.signed_date
    || contract?.signedAt
    || contract?.signed_at
    || ''
  )

  return String(signedDate).trim()
}

function resolveContractCardAmount(contract = {}) {
  const storedAmount = contract?.total ?? contract?.totalAmount ?? contract?.contractAmount
  const hasValidStoredAmount = storedAmount !== null
    && storedAmount !== undefined
    && storedAmount !== ''
    && Number.isFinite(Number(storedAmount))
  const hasStoredAmount = hasValidStoredAmount && contract?.hasStoredContractAmount !== false

  return hasStoredAmount ? Number(storedAmount) : null
}

function getPortalPhotoDisplayTitle(photo = {}, t = (key) => key) {
  const caption = typeof photo?.caption === 'string' ? photo.caption.trim() : ''
  return caption || t('projectPhoto')
}

function buildPreviewLead(project = {}, client = {}) {
  return {
    client: client?.displayName || client?.name || project?.client || project?.clientName || '',
    phone: client?.phone || project?.phone || '',
    email: client?.email || project?.email || '',
    address: project?.address || project?.location || client?.address || '',
    location: project?.location || project?.address || client?.address || '',
    projectTitle: project?.projectTitle || project?.projectType || '',
    projectType: project?.projectType || project?.projectTitle || '',
    billingAddress: client?.address || project?.address || project?.location || '',
    clientAddress: client?.address || project?.address || project?.location || '',
  }
}

function buildContractNotesAndTermsItems(contract = {}, t = (key) => key) {
  return buildCanonicalContractNotesAndTermsItems({
    paymentTerms: contract?.paymentTerms || '',
    total: Number(contract?.total ?? contract?.totalAmount ?? contract?.contractAmount ?? 0),
    depositAmount: contract?.depositAmount ?? contract?.deposit_amount ?? null,
    acceptanceLegalText: contract?.acceptanceLegalText || contract?.acceptance_legal_text || '',
    legacyAcceptanceText: contract?.warrantyDisclaimer || '',
    t,
  })
}

function DocumentPreviewModal({ isOpen, title, onClose, onPrimaryAction, primaryLabel, onDownload, downloadLabel, children, t = (key) => key }) {
  const showsStandaloneDownload = primaryLabel !== t('downloadPdf')

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={onClose} panelClassName="p-2 sm:max-w-[64rem] sm:p-3 lg:max-w-[68rem]">
      <div className="rounded-3xl bg-white text-slate-950">
        <div className="flex items-start justify-between gap-4 px-4 pb-2 pt-4 sm:px-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{t('documents')}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-slate-200 p-3 text-slate-600 hover:bg-slate-50" aria-label={t('close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-1">
          {children}
        </div>
        <div className={`mt-6 grid gap-3 px-4 pb-4 sm:px-5 sm:pb-5 ${showsStandaloneDownload ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <button onClick={onPrimaryAction} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">{primaryLabel}</button>
          {showsStandaloneDownload ? (
            <button onClick={onDownload} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">{downloadLabel || t('downloadPdf')}</button>
          ) : null}
          <button onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">{t('close')}</button>
        </div>
      </div>
    </ModalShell>
  )
}

function DocumentRow({ title, details = [], primaryAction = null, secondaryAction = null }) {
  const visibleDetails = details.filter((detail) => detail?.label && detail?.value)

  return (
    <div data-portal-document-card="true" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-950">{title}</p>
          {visibleDetails.length ? (
            <div data-portal-document-details="true" className="mt-2 grid gap-3 sm:grid-cols-2">
              {visibleDetails.map((detail) => (
                <div key={detail.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{detail.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{detail.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-col xl:flex-row">
          {primaryAction}
          {secondaryAction}
        </div>
      </div>
    </div>
  )
}

function SectionBadge({ icon: Icon, tone = 'slate' }) {
  const toneClassNames = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    orange: 'bg-orange-50 text-orange-700 ring-orange-100',
    purple: 'bg-violet-50 text-violet-700 ring-violet-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  }

  return (
    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${toneClassNames[tone] || toneClassNames.slate}`}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

function SectionTitle({ icon, tone, children }) {
  return (
    <span className="flex items-center gap-3">
      <SectionBadge icon={icon} tone={tone} />
      <span>{children}</span>
    </span>
  )
}

export function PortalSummary({
  project,
  client,
  estimate,
  contract,
  paymentSummary,
  scheduleEvents = [],
  upcomingEvents = [],
  projectPhotos = [],
  isLoadingPhotos = false,
  photosLoadFailed = false,
  company = {},
  showPayments = true,
  showPhotos = true,
  showDocuments = true,
  t = (key) => key,
}) {
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const estimatePreviewRef = useRef(null)
  const contractPreviewRef = useRef(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(-1)
  const hasEstimate = Boolean(estimate)
  const hasContract = Boolean(contract)
  const hasPayments = Boolean(paymentSummary?.payments?.length)
  const visibleScheduleEvents = scheduleEvents.length > 0 ? scheduleEvents : upcomingEvents
  const hasScheduleEvents = visibleScheduleEvents.length > 0
  const hasProjectPhotos = projectPhotos.length > 0
  const selectedPhoto = selectedPhotoIndex >= 0 ? projectPhotos[selectedPhotoIndex] || null : null
  const hasPreviousPhoto = selectedPhotoIndex > 0
  const hasNextPhoto = selectedPhotoIndex >= 0 && selectedPhotoIndex < projectPhotos.length - 1
  const previewLead = useMemo(() => buildPreviewLead(project, client), [client, project])
  const estimateNumber = estimate ? getEstimateDisplayNumber(estimate, project) : ''
  const contractNumber = contract ? getContractDisplayNumber(contract, project) : ''
  const contractSignedDate = resolveExplicitContractSignedDate(contract)
  const contractCardAmount = resolveContractCardAmount(contract)
  const contractOutputLanguage = contract?.contractLanguage && contract.contractLanguage !== 'match' ? contract.contractLanguage : null
  const contractDocumentT = useMemo(() => (
    contractOutputLanguage ? createTranslator(contractOutputLanguage) : t
  ), [contractOutputLanguage, t])
  const estimatePreviewProps = useMemo(() => ({
    company,
    lead: previewLead,
    estimateNumber,
    estimateDate: estimate?.dateCreated || estimate?.createdAt || estimate?.created_at || new Date(),
    pricingMode: resolveEstimatePricingMode(
      estimate?.pricingMode || estimate?.pricing_mode,
      estimate?.lineItems
    ),
    scope: estimate?.summary || estimate?.scopeOfWork || '',
    materialsIncluded: estimate?.materialsIncluded ?? estimate?.materials_included ?? true,
    paymentTerms: getPaymentTermLabel(estimate?.paymentTerms, t) || t('contractTermsText'),
    total: Number(estimate?.total ?? estimate?.totalAmount ?? estimate?.amount ?? 0),
    subtotal: estimate?.subtotal,
    discountAmount: estimate?.discountAmount ?? estimate?.discount_amount,
    taxAmount: estimate?.taxAmount ?? estimate?.tax_amount,
    messageFromContractor: (
      estimate?.messageFromContractor
      || estimate?.message_from_contractor
      || estimate?.customerMessage
      || estimate?.customer_message
      || estimate?.publicNotes
      || estimate?.public_notes
      || estimate?.notes
      || ''
    ),
    validUntil: (
      estimate?.validUntil
      || estimate?.valid_until
      || estimate?.expirationDate
      || estimate?.expiration_date
      || estimate?.expiresAt
      || estimate?.expires_at
      || ''
    ),
    lineItems: Array.isArray(estimate?.lineItems) ? estimate.lineItems : [],
    t,
  }), [company, estimate, estimateNumber, previewLead, t])
  const contractPreviewProps = useMemo(() => ({
    company,
    lead: previewLead,
    contractNumber,
    contractDate: contract?.signedDate || formatDisplayDate(contract?.updatedAt || contract?.updated_at || new Date()),
    notesAndTermsItems: buildContractNotesAndTermsItems(contract, contractDocumentT),
    scope: contract?.scope || contract?.scopeOfWork || estimate?.summary || '',
    workBreakdown: normalizeContractWorkBreakdown(contract?.workBreakdown || contract?.work_breakdown || []).length
      ? normalizeContractWorkBreakdown(contract?.workBreakdown || contract?.work_breakdown || [])
      : buildContractWorkBreakdownFromEstimate(estimate),
    total: Number(contract?.total ?? contract?.totalAmount ?? contract?.contractAmount ?? 0),
    t: contractDocumentT,
  }), [company, contract, contractDocumentT, contractNumber, estimate, previewLead])
  const openDocument = searchParams.get('document') || ''

  function setOpenDocument(nextDocument) {
    const nextParams = new URLSearchParams(searchParams)

    if (nextDocument) {
      nextParams.set('document', nextDocument)
    } else {
      nextParams.delete('document')
    }

    setSearchParams(nextParams, { replace: true })
  }

  async function handleDownloadEstimate() {
    if (!estimatePreviewRef.current) return

    try {
      await printDocumentElement(estimatePreviewRef.current, {
        documentTitle: `${estimateNumber} ${previewLead.client || ''}`.trim(),
        pageMarginInches: ESTIMATE_PAPER_MARGIN / 72,
        safeInsetInches: 0,
        printLabel: t('print'),
      })
    } catch (error) {
      showToast(isPrintWindowBlockedError(error) ? t('printPreviewPopupBlocked') : t('estimatePdfGenerateFailed'), 'error')
    }
  }

  async function handlePrintEstimate() {
    try {
      await printDocumentElement(estimatePreviewRef.current, {
        documentTitle: `${estimateNumber} ${previewLead.client || ''}`.trim(),
        pageMarginInches: ESTIMATE_PAPER_MARGIN / 72,
        safeInsetInches: 0,
        printLabel: t('print'),
      })
    } catch (error) {
      showToast(isPrintWindowBlockedError(error) ? t('printPreviewPopupBlocked') : t('estimatePdfGenerateFailed'), 'error')
    }
  }

  async function openContractPrintDialog() {
    if (!contractPreviewRef.current) return

    try {
      await printDocumentElement(contractPreviewRef.current, {
        documentTitle: `${contractNumber} ${previewLead.client || ''}`.trim(),
        pageMarginInches: ESTIMATE_PAPER_MARGIN / 72,
        safeInsetInches: 0,
        printLabel: t('print'),
      })
    } catch (error) {
      showToast(isPrintWindowBlockedError(error) ? t('printPreviewPopupBlocked') : t('contractPdfGenerateFailed'), 'error')
    }
  }

  function closePhotoPreview() {
    setSelectedPhotoIndex(-1)
  }

  function openPhotoPreview(index) {
    setSelectedPhotoIndex(index)
  }

  function showPreviousPhoto() {
    setSelectedPhotoIndex((current) => (current > 0 ? current - 1 : current))
  }

  function showNextPhoto() {
    setSelectedPhotoIndex((current) => (current >= 0 && current < projectPhotos.length - 1 ? current + 1 : current))
  }

  useEffect(() => {
    if (!selectedPhoto) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closePhotoPreview()
      }

      if (event.key === 'ArrowLeft' && hasPreviousPhoto) {
        showPreviousPhoto()
      }

      if (event.key === 'ArrowRight' && hasNextPhoto) {
        showNextPhoto()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [hasNextPhoto, hasPreviousPhoto, selectedPhoto])

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        {showPayments ? <InfoCard title={<SectionTitle icon={Wallet} tone="emerald">{t('paymentHistory')}</SectionTitle>}>
          <>
            <DetailRow label={t('projectValue')} value={formatCurrencyValue(paymentSummary?.projectValue ?? project?.value ?? 0, currency.format(0))} />
            <DetailRow label={t('amountPaid')} value={formatCurrencyValue(paymentSummary?.totalPaid ?? 0, currency.format(0))} />
            <div className="border-t border-slate-200 pt-3">
              <DetailRow label={t('balanceDue')} value={formatCurrencyValue(paymentSummary?.outstandingBalance ?? 0, currency.format(0))} />
            </div>
            {!hasPayments ? (
              <CalloutEmptyState icon={CircleAlert} message={t('portalPaymentHistoryEmptyState')} />
            ) : null}
          </>
        </InfoCard> : null}

        <InfoCard title={<SectionTitle icon={CalendarDays} tone="purple">{t('projectSchedule')}</SectionTitle>}>
          {hasScheduleEvents ? (
            <div className="space-y-3">
              {visibleScheduleEvents.map((event, index) => (
                <div key={event?.id || `${event?.date || ''}:${event?.startTime || ''}:${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-950">{formatEventLabel(event, t)}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isUpcomingClientScheduleEvent(event) ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'}`}>
                      {t(isUpcomingClientScheduleEvent(event) ? 'upcoming' : 'pastEvent')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{formatEventDate(event?.date)}</p>
                  <div className="mt-3 space-y-2">
                    <DetailRow label={t('time')} value={formatEventTimeRange(event, t)} />
                    <DetailRow label={t('location')} value={formatValue(event?.location || project?.address || project?.location, t('notAdded'))} />
                    {event?.notes ? (
                      <DetailRow label={t('notes')} value={event.notes} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CenteredEmptyState icon={CalendarDays} message={t('portalUpcomingVisitsEmptyState')} tone="purple" />
          )}
        </InfoCard>

        {showDocuments ? <div className="lg:col-span-2">
          <InfoCard title={<SectionTitle icon={FileText} tone="orange">{t('documents')}</SectionTitle>}>
            <div className="space-y-4">
              {hasEstimate ? (
                <DocumentRow
                  title={t('estimate')}
                  details={[
                    { label: t('estimateAmount'), value: formatCurrencyValue(estimate?.total ?? estimate?.totalAmount ?? estimate?.amount, t('notAdded')) },
                  ]}
                  primaryAction={(
                    <button onClick={() => setOpenDocument('estimate')} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-auto">
                      {t('view')}
                    </button>
                  )}
                  secondaryAction={(
                    <button onClick={handleDownloadEstimate} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 sm:w-auto">
                      {t('saveAsPdf')}
                    </button>
                  )}
                />
              ) : (
                <EmptyState message={t('noEstimateAvailableYet')} />
              )}

              {hasContract ? (
                <DocumentRow
                  title={t('contract')}
                  details={[
                    ...(contractCardAmount !== null ? [{ label: t('contractAmount'), value: currency.format(contractCardAmount) }] : []),
                    ...(contractSignedDate ? [{ label: t('signedDate'), value: contractSignedDate }] : []),
                  ]}
                  primaryAction={(
                    <button onClick={() => setOpenDocument('contract')} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-auto">
                      {t('view')}
                    </button>
                  )}
                  secondaryAction={(
                    <button onClick={openContractPrintDialog} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 sm:w-auto">
                      {t('saveAsPdf')}
                    </button>
                  )}
                />
              ) : (
                <EmptyState message={t('noContractAvailableYet')} />
              )}
            </div>
          </InfoCard>
        </div> : null}

        {showPhotos ? <div className="lg:col-span-2">
          <InfoCard title={<SectionTitle icon={Images} tone="purple">{t('projectPhotos')}</SectionTitle>}>
            {isLoadingPhotos ? (
              <EmptyState message={t('loading')} />
            ) : photosLoadFailed ? (
              <CalloutEmptyState icon={CircleAlert} message={t('unableToLoadProjectPhotos')} />
            ) : hasProjectPhotos ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {projectPhotos.map((photo, index) => (
                  <article key={photo.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => openPhotoPreview(index)}
                      className="relative block aspect-square w-full overflow-hidden bg-slate-200"
                      aria-label={t('viewPhoto')}
                    >
                      <img
                        src={photo.previewUrl || photo.url}
                        alt={getPortalPhotoDisplayTitle(photo, t)}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                      />
                      {photo.caption ? (
                        <span className="absolute bottom-2 left-2 inline-flex max-w-[calc(100%-1rem)] truncate rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                          {photo.caption}
                        </span>
                      ) : null}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <CenteredEmptyState icon={Images} message={t('noProjectPhotosUploadedYet')} tone="purple" />
            )}
          </InfoCard>
        </div> : null}
      </div>

      {hasEstimate ? (
        <div className="pointer-events-none fixed left-[-10000px] top-0 w-[850px] opacity-0">
          <div
            ref={estimatePreviewRef}
            data-estimate-pdf-root="true"
            style={{ width: `${ESTIMATE_DOCUMENT_SOURCE_WIDTH}px`, backgroundColor: '#ffffff', color: '#0f172a', padding: `${ESTIMATE_DOCUMENT_SOURCE_PADDING}px`, boxSizing: 'border-box' }}
          >
            <EstimatePdfTemplate {...estimatePreviewProps} />
          </div>
        </div>
      ) : null}

      {hasContract ? (
        <div className="pointer-events-none fixed left-[-10000px] top-0 w-[850px] opacity-0">
          <div
            ref={contractPreviewRef}
            data-contract-pdf-root="true"
            style={{ width: `${ESTIMATE_DOCUMENT_SOURCE_WIDTH}px`, backgroundColor: '#ffffff', color: '#0f172a', padding: 0, boxSizing: 'border-box' }}
          >
            <ContractPdfTemplate {...contractPreviewProps} />
          </div>
        </div>
      ) : null}

      {hasEstimate ? (
        <DocumentPreviewModal
          isOpen={openDocument === 'estimate'}
          title={t('viewEstimate')}
          onClose={() => setOpenDocument(null)}
          onPrimaryAction={handlePrintEstimate}
          primaryLabel={t('print')}
          onDownload={handleDownloadEstimate}
          downloadLabel={t('saveAsPdf')}
          t={t}
        >
          <PaginatedEstimatePreview t={t}>
            <EstimatePdfTemplate {...estimatePreviewProps} />
          </PaginatedEstimatePreview>
        </DocumentPreviewModal>
      ) : null}

      {hasContract ? (
        <DocumentPreviewModal
          isOpen={openDocument === 'contract'}
          title={t('viewContract')}
          onClose={() => setOpenDocument(null)}
          onPrimaryAction={openContractPrintDialog}
          primaryLabel={t('print')}
          onDownload={openContractPrintDialog}
          downloadLabel={t('saveAsPdf')}
          t={t}
        >
          <PaginatedContractPreview t={contractDocumentT}>
            <ContractPdfTemplate {...contractPreviewProps} />
          </PaginatedContractPreview>
        </DocumentPreviewModal>
      ) : null}

      <ModalShell isOpen={Boolean(selectedPhoto)} onBackdropClick={closePhotoPreview} panelClassName="sm:max-w-5xl sm:p-8">
        {selectedPhoto ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{t('projectPhotos')}</p>
                <h2 className="mt-2 truncate text-2xl font-bold text-slate-950">{getPortalPhotoDisplayTitle(selectedPhoto, t)}</h2>
                {selectedPhoto.createdAt ? (
                  <p className="mt-2 text-sm text-slate-500">{formatDisplayDate(selectedPhoto.createdAt)}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closePhotoPreview}
                className="rounded-2xl border border-slate-200 p-3 text-slate-600 hover:bg-slate-50"
                aria-label={t('closePhotoPreview')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative overflow-hidden rounded-3xl bg-slate-100">
              <img
                src={selectedPhoto.previewUrl || selectedPhoto.url}
                alt={getPortalPhotoDisplayTitle(selectedPhoto, t)}
                className="max-h-[72vh] w-full rounded-3xl object-contain"
              />
              <button
                type="button"
                onClick={showPreviousPhoto}
                disabled={!hasPreviousPhoto}
                aria-label={t('previousPhoto')}
                className={`absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-slate-950/55 text-white backdrop-blur-sm transition ${hasPreviousPhoto ? 'hover:bg-slate-950/75' : 'cursor-not-allowed opacity-35'}`}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={showNextPhoto}
                disabled={!hasNextPhoto}
                aria-label={t('nextPhoto')}
                className={`absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-slate-950/55 text-white backdrop-blur-sm transition ${hasNextPhoto ? 'hover:bg-slate-950/75' : 'cursor-not-allowed opacity-35'}`}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            {selectedPhoto.caption ? (
              <p className="text-sm leading-6 text-slate-600">{selectedPhoto.caption}</p>
            ) : null}
          </div>
        ) : null}
      </ModalShell>
    </>
  )
}

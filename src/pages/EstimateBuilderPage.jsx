import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Archive, ChevronDown, MapPin, Trash2, Undo2, UserRound } from 'lucide-react'
import { SelectField } from '../components/ui/SelectField'
import { AymeroLoader } from '../components/common/AymeroLoader'
import { InfoCard } from '../components/ui/InfoCard'
import { EstimatePdfTemplate } from '../components/estimates/EstimatePdfTemplate'
import { EstimateFormattedText } from '../components/estimates/EstimateFormattedText'
import { LightweightFormattedTextarea } from '../components/estimates/LightweightFormattedTextarea'
import { PaginatedEstimatePreview } from '../components/estimates/PaginatedEstimatePreview'
import { currency, formatDisplayDate } from '../utils/formatters'
import { getPortalData, resolvePublicEstimateShare, resolvePublicEstimateShareUrl } from '../utils/portal'
import { ESTIMATE_SHARE_RESOLUTION } from '../utils/estimateShare'
import { archivePanelButtonClasses } from '../utils/buttonStyles'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { SendToCustomerModal } from '../components/common/SendToCustomerModal'
import { ModalShell } from '../components/common/ModalShell'
import { RecordBackButton } from '../components/common/RecordBackButton'
import { useToast } from '../components/common/ToastProvider'
import dataProvider from '../services/dataProvider'
import { useAuth } from '../contexts/AuthContext'
import { USE_SUPABASE, USE_SUPABASE_ESTIMATES, USE_SUPABASE_PROJECTS } from '../config/backendConfig'
import { getProjectsContractorId } from '../services/system/projectsRuntimeService'
import { readLinkedEstimateDraft, writeLinkedEstimateDrafts } from '../utils/estimateLinks'
import { formatEstimateDisplayNumber, generateEstimateNumber } from '../utils/estimateNumber'
import { isPrintWindowBlockedError, printDocumentElement } from '../utils/printDocument'
import { createTranslator, tStatus } from '../translations'
import { findLeadByProjectLookup } from '../utils/projectIdentity'
import { findRelatedClient } from '../utils/clients'
import { resolveEstimateArchiveState } from '../utils/archiveLifecycle'
import {
  ESTIMATE_PRICING_DETAILED,
  ESTIMATE_PRICING_SIMPLE,
  getValidExplicitEstimateItems,
  hasMeaningfulEstimateFormattedText,
  normalizeEstimateDocument,
  normalizeEstimateFormattedTextForStorage,
  normalizeEstimateLineItemsForStorage,
  resolveEstimatePricingMode,
  resolveEstimateValidUntil,
} from '../utils/estimateDocument'
import { normalizeDocumentLanguageOverride, resolveClientFacingLanguage } from '../utils/language'
import { getPaymentTermLabel, getPaymentTermOptions, isKnownPaymentTermValue } from '../utils/paymentTerms'
import {
  ESTIMATE_DOCUMENT_SOURCE_PADDING,
  ESTIMATE_DOCUMENT_SOURCE_WIDTH,
  ESTIMATE_PAPER_MARGIN,
} from '../utils/estimatePagination'

const simplePricingMode = ESTIMATE_PRICING_SIMPLE
const detailedPricingMode = ESTIMATE_PRICING_DETAILED
const estimatePreviewPageWidth = ESTIMATE_DOCUMENT_SOURCE_WIDTH

function readEstimateScopeText(estimate = {}) {
  return estimate?.summary || estimate?.scopeOfWork || estimate?.scope_of_work || ''
}

function readEstimateContractorMessage(estimate = {}) {
  return (
    estimate?.messageFromContractor
    || estimate?.message_from_contractor
    || estimate?.customerMessage
    || estimate?.customer_message
    || estimate?.publicNotes
    || estimate?.public_notes
    || estimate?.notes
    || ''
  )
}

function resolveMaterialsIncludedDefault(...values) {
  const firstBoolean = values.find((value) => typeof value === 'boolean')
  return typeof firstBoolean === 'boolean' ? firstBoolean : false
}

function createEmptyLineItem(materialsIncluded = false) {
  return { name: '', amount: 0, materialsIncluded }
}

function normalizeLineItems(items = [], fallbackMaterialsIncluded = false) {
  return normalizeEstimateLineItemsForStorage(items, {
    fallbackMaterialsIncluded,
  })
}

function formatAmountInputValue(value) {
  if (!Number.isFinite(Number(value)) || Number(value) === 0) {
    return ''
  }

  return String(Number(value))
}

function sanitizeAmountInput(value) {
  const digitsAndDots = String(value || '').replace(/[^\d.]/g, '')
  const firstDotIndex = digitsAndDots.indexOf('.')

  if (firstDotIndex === -1) {
    const normalizedWhole = digitsAndDots.replace(/^0+(?=\d)/, '')
    return normalizedWhole
  }

  const wholePart = digitsAndDots.slice(0, firstDotIndex).replace(/^0+(?=\d)/, '') || '0'
  const decimalPart = digitsAndDots.slice(firstDotIndex + 1).replace(/\./g, '')

  return `${wholePart}.${decimalPart}`
}

function formatReliableDate(value) {
  if (!value) return ''

  const parsedDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''

  return formatDisplayDate(parsedDate)
}

function isArchivedProject(project = {}) {
  return Boolean(
    project?.archivedAt
    || project?.archived_at
    || project?.isArchived
    || project?.archived
    || String(project?.status || '').toLowerCase() === 'archived'
  )
}

function buildDefaultLineItems(leadValue, materialsIncluded, t) {
  return [
    { name: t('laborAndProjectSetup'), amount: Math.round(Number(leadValue || 0) * 0.35), materialsIncluded },
    { name: t('materialsAndFinishWork'), amount: Math.round(Number(leadValue || 0) * 0.65), materialsIncluded },
  ]
}

function logEstimateShareResolution(resolution, estimate = {}, { usedResolvedFallback = false } = {}) {
  if (!import.meta.env.DEV) return

  const diagnostic = {
    estimateId: estimate?.id || null,
    estimateNumber: estimate?.number || estimate?.estimateNumber || null,
    status: resolution?.status || ESTIMATE_SHARE_RESOLUTION.UNEXPECTED_ERROR,
    hasToken: Boolean(resolution?.token),
    hasUrl: Boolean(resolution?.url),
    usedResolvedFallback,
  }

  if (resolution?.status === ESTIMATE_SHARE_RESOLUTION.TOKEN_PRESENT) {
    // eslint-disable-next-line no-console
    console.info('[dev] Estimate client-link resolution succeeded.', diagnostic)
    return
  }

  // eslint-disable-next-line no-console
  console.warn('[dev] Estimate client-link resolution failed.', diagnostic, resolution?.error || '')
}

function buildEstimateDraftState({ savedEstimate = {}, lead, companySettings, t }) {
  const defaultMaterialsIncluded = resolveMaterialsIncludedDefault(
    savedEstimate.materialsIncluded,
    companySettings?.defaults?.materialsIncluded,
    false
  )
  const savedLineItems = normalizeLineItems(savedEstimate.lineItems, defaultMaterialsIncluded)
  const explicitSavedLineItems = getValidExplicitEstimateItems(savedLineItems)
  const hasSavedLineItems = explicitSavedLineItems.length > 0
  const defaultLineItems = buildDefaultLineItems(lead?.value, defaultMaterialsIncluded, t)
  const savedPricingMode = resolveEstimatePricingMode(
    savedEstimate.pricingMode || savedEstimate.pricing_mode,
    explicitSavedLineItems
  )

  return {
    scope: readEstimateScopeText(savedEstimate),
    total: Number(savedEstimate.total ?? lead?.value ?? 0),
    totalInput: formatAmountInputValue(savedEstimate.total ?? lead?.value ?? 0),
    materialsIncluded: defaultMaterialsIncluded,
    paymentTerms: savedEstimate.paymentTerms || companySettings?.defaults?.paymentTerms || t('defaultPaymentTerms'),
    estimateLanguage: normalizeDocumentLanguageOverride(savedEstimate.estimateLanguage),
    pricingMode: savedPricingMode,
    lineItems: hasSavedLineItems ? explicitSavedLineItems : defaultLineItems,
    lineItemAmountInputs: (hasSavedLineItems ? explicitSavedLineItems : defaultLineItems).map((item) => formatAmountInputValue(item.amount)),
  }
}

export function EstimateBuilderPage({ lead, clientRecord = null, t, appLanguage = 'en', companySettings, isArchived = false, archiveSource = null, projectAvailable = true, publicEstimateLink = '', isOrphanedProject = false, openSendOnLoad = false, onOpenSendConsumed, onBack, backLabel, onSaveEstimate, onConvert, onSyncContract, onOpenContract, onArchiveEstimate, onRestoreEstimate, onDeleteEstimate }) {
  const { showToast } = useToast()
  const pdfTemplateRef = useRef(null)
  const draftDirtyRef = useRef(false)
  const lastInitializedSourceKeyRef = useRef('')
  const lastInitializedOwnerKeyRef = useRef('')
  const portal = getPortalData(lead)
  const savedEstimate = lead.portal?.estimate || portal.estimate || {}
  const hasExistingEstimate = Boolean(savedEstimate?.id || savedEstimate?.number || savedEstimate?.estimateNumber)
  const settingsInteractionRef = useRef(false)
  const builderOpenedAtRef = useRef(new Date())
  const draftEstimateOutputLanguage = useMemo(() => resolveClientFacingLanguage({
    documentLanguage: savedEstimate?.estimateLanguage,
    client: clientRecord,
    lead,
    appLanguage,
  }), [appLanguage, clientRecord, lead, savedEstimate?.estimateLanguage])
  const draftEstimateT = useMemo(() => createTranslator(draftEstimateOutputLanguage), [draftEstimateOutputLanguage])
  const initialDraftState = useMemo(
    () => buildEstimateDraftState({ savedEstimate, lead, companySettings, t: draftEstimateT }),
    [companySettings, draftEstimateT, lead, savedEstimate]
  )
  const [scope, setScope] = useState(initialDraftState.scope)
  const [total, setTotal] = useState(initialDraftState.total)
  const [totalInput, setTotalInput] = useState(initialDraftState.totalInput)
  const [materialsIncluded, setMaterialsIncluded] = useState(initialDraftState.materialsIncluded)
  const [paymentTerms, setPaymentTerms] = useState(initialDraftState.paymentTerms)
  const [estimateLanguage, setEstimateLanguage] = useState(initialDraftState.estimateLanguage)
  const [pricingMode, setPricingMode] = useState(initialDraftState.pricingMode)
  const [isSettingsOpen, setIsSettingsOpen] = useState(!hasExistingEstimate)
  const [confirmAction, setConfirmAction] = useState(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendDocumentLink, setSendDocumentLink] = useState(publicEstimateLink)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [isEditing, setIsEditing] = useState(true)
  const [isSavingEstimate, setIsSavingEstimate] = useState(false)
  const estimateSaveGuardRef = useRef(false)
  const autoSendAttemptedRef = useRef(false)
  const [isConvertingEstimate, setIsConvertingEstimate] = useState(false)
  const estimateConvertGuardRef = useRef(false)
  const [lineItemAmountInputs, setLineItemAmountInputs] = useState(initialDraftState.lineItemAmountInputs)
  const [lineItems, setLineItems] = useState(initialDraftState.lineItems)
  const draftOwnerKey = useMemo(
    () => `${lead?.id || ''}:${lead?.projectId || lead?.project_id || ''}`,
    [lead?.id, lead?.projectId, lead?.project_id]
  )

  const draftSourceKey = useMemo(() => JSON.stringify({
    leadId: lead?.id || '',
    projectId: lead?.projectId || lead?.project_id || '',
    leadValue: Number(lead?.value ?? 0),
    estimateId: savedEstimate?.id || '',
    estimateUpdatedAt: savedEstimate?.updatedAt || savedEstimate?.createdAt || savedEstimate?.created_at || '',
    estimateStatus: savedEstimate?.status || '',
    estimateTotal: savedEstimate?.total ?? null,
    estimateSummary: readEstimateScopeText(savedEstimate),
    estimateLanguage: savedEstimate?.estimateLanguage || '',
    pricingMode: savedEstimate?.pricingMode || savedEstimate?.pricing_mode || '',
    paymentTerms: savedEstimate?.paymentTerms || '',
    materialsIncluded: savedEstimate?.materialsIncluded ?? null,
    lineItems: Array.isArray(savedEstimate?.lineItems) ? savedEstimate.lineItems : [],
    companyMaterialsIncluded: companySettings?.defaults?.materialsIncluded ?? null,
    companyPaymentTerms: companySettings?.defaults?.paymentTerms || '',
    defaultPaymentTermsLabel: draftEstimateT('defaultPaymentTerms'),
    defaultLaborLabel: draftEstimateT('laborAndProjectSetup'),
    defaultMaterialsLabel: draftEstimateT('materialsAndFinishWork'),
  }), [
    companySettings?.defaults?.materialsIncluded,
    companySettings?.defaults?.paymentTerms,
    draftEstimateT,
    lead?.id,
    lead?.projectId,
    lead?.project_id,
    lead?.value,
    savedEstimate,
  ])

  function markDraftDirty() {
    draftDirtyRef.current = true
  }

  useEffect(() => {
    setSendDocumentLink(publicEstimateLink || '')
  }, [publicEstimateLink])

  useEffect(() => {
    const sourceChanged = lastInitializedSourceKeyRef.current !== draftSourceKey
    const draftOwnerChanged = lastInitializedOwnerKeyRef.current !== draftOwnerKey

    if (!sourceChanged) {
      return
    }

    if (!draftOwnerChanged && draftDirtyRef.current) {
      return
    }

    const nextDraftState = buildEstimateDraftState({ savedEstimate, lead, companySettings, t: draftEstimateT })
    setScope(nextDraftState.scope)
    setTotal(nextDraftState.total)
    setTotalInput(nextDraftState.totalInput)
    setMaterialsIncluded(nextDraftState.materialsIncluded)
    setPaymentTerms(nextDraftState.paymentTerms)
    setEstimateLanguage(nextDraftState.estimateLanguage)
    setPricingMode(nextDraftState.pricingMode)
    setLineItems(nextDraftState.lineItems)
    setLineItemAmountInputs(nextDraftState.lineItemAmountInputs)

    lastInitializedSourceKeyRef.current = draftSourceKey
    lastInitializedOwnerKeyRef.current = draftOwnerKey
    draftDirtyRef.current = false
  }, [companySettings, draftEstimateT, draftOwnerKey, draftSourceKey, lead, savedEstimate])

  useEffect(() => {
    if (hasExistingEstimate && !settingsInteractionRef.current) {
      setIsSettingsOpen(false)
    }
  }, [hasExistingEstimate])

  useEffect(() => {
    if (!openSendOnLoad || !hasExistingEstimate || isArchived || autoSendAttemptedRef.current) return

    autoSendAttemptedRef.current = true
    onOpenSendConsumed?.()
    handleOpenSendModal()
  }, [hasExistingEstimate, isArchived, openSendOnLoad])

  const lineTotal = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const isDetailedPricing = pricingMode === detailedPricingMode
  const estimateTotal = Number(isDetailedPricing ? lineTotal : total || 0)
  const isEstimateActionPending = isSavingEstimate || isConvertingEstimate
  const estimateOutputLanguage = resolveClientFacingLanguage({
    documentLanguage: estimateLanguage,
    client: clientRecord,
    lead,
    appLanguage,
  })
  const linkedContract = lead?.portal?.contract || portal.contract || {}
  const linkedContractIsArchived = Boolean(linkedContract?.archivedAt || linkedContract?.archived_at || linkedContract?.isArchived || linkedContract?.archived)
  const estimateT = useMemo(() => createTranslator(estimateOutputLanguage), [estimateOutputLanguage])
  const paymentTermOptions = useMemo(() => getPaymentTermOptions(t, paymentTerms), [paymentTerms, t])
  const previewEstimateNumber = formatEstimateDisplayNumber(
    savedEstimate.number || savedEstimate.estimateNumber || generateEstimateNumber(lead),
    lead
  )
  const hasLinkedContract = Boolean(
    !linkedContractIsArchived && (
      linkedContract?.id
      || linkedContract?.number
      || linkedContract?.contractNumber
    )
  )
  const linkedContractIsSigned = Boolean(
    linkedContract?.status === 'Signed'
      || linkedContract?.signed
      || linkedContract?.signedDate
      || linkedContract?.signedAt
      || linkedContract?.signed_at
  )
  const previewEstimateDate = useMemo(
    () => (
      savedEstimate.dateCreated ||
      savedEstimate.createdAt ||
      savedEstimate.created_at ||
      lead?.portal?.estimate?.dateCreated ||
      lead?.portal?.estimate?.createdAt ||
      lead?.portal?.estimate?.created_at ||
      new Date()
    ),
    [lead?.portal?.estimate?.createdAt, lead?.portal?.estimate?.created_at, lead?.portal?.estimate?.dateCreated, savedEstimate.createdAt, savedEstimate.created_at, savedEstimate.dateCreated]
  )
  const estimateCreatedDate = formatReliableDate(
    savedEstimate.dateCreated
    || savedEstimate.createdAt
    || savedEstimate.created_at
    || builderOpenedAtRef.current
  )
  const estimateUpdatedDate = formatReliableDate(savedEstimate.updatedAt || savedEstimate.updated_at)
  const estimateStatus = tStatus(t, savedEstimate.status || 'Draft')
  const jobLocation = lead?.address || lead?.location || ''
  const estimateDocumentModel = useMemo(() => normalizeEstimateDocument({
    pricingMode,
    scope,
    lineItems,
    total: estimateTotal,
    subtotal: isDetailedPricing
      ? lineTotal
      : Number(savedEstimate?.subtotal || estimateTotal),
    discountAmount: savedEstimate?.discountAmount,
    taxAmount: savedEstimate?.taxAmount,
    materialsIncluded,
    messageFromContractor: readEstimateContractorMessage(savedEstimate),
    validUntil: resolveEstimateValidUntil(
      savedEstimate,
      previewEstimateDate,
      companySettings?.defaults?.estimateExpirationDays
    ),
  }), [
    companySettings?.defaults?.estimateExpirationDays,
    estimateTotal,
    isDetailedPricing,
    lineItems,
    lineTotal,
    materialsIncluded,
    previewEstimateDate,
    pricingMode,
    savedEstimate,
    scope,
  ])
  const estimatePreviewProps = useMemo(() => ({
    company: companySettings?.company,
    lead,
    estimateNumber: previewEstimateNumber,
    estimateDate: previewEstimateDate,
    documentModel: estimateDocumentModel,
    paymentTerms: getPaymentTermLabel(paymentTerms, estimateT),
    language: estimateOutputLanguage,
    t: estimateT,
  }), [companySettings?.company, estimateDocumentModel, estimateOutputLanguage, estimateT, lead, paymentTerms, previewEstimateDate, previewEstimateNumber])

  function getEstimatePayload() {
    const sanitizedScope = normalizeEstimateFormattedTextForStorage(scope)
    const sanitizedLineItems = normalizeEstimateLineItemsForStorage(lineItems, {
      fallbackMaterialsIncluded: materialsIncluded,
    }).map((item) => ({
      ...item,
      name: hasMeaningfulEstimateFormattedText(item.name) ? item.name : '',
    }))

    return {
      id: savedEstimate.id || undefined,
      number: savedEstimate.number || generateEstimateNumber(lead),
      total: estimateTotal,
      summary: hasMeaningfulEstimateFormattedText(sanitizedScope) ? sanitizedScope : '',
      lineItems: isDetailedPricing ? sanitizedLineItems : [],
      materialsIncluded,
      paymentTerms,
      estimateLanguage: estimateLanguage || '',
      pricingMode,
      updatedAt: new Date().toISOString(),
      status: 'Draft',
    }
  }

  async function persistEstimate(overrides = {}, { closeSendModal = false, stopEditing = false } = {}) {
    if (estimateSaveGuardRef.current) {
      return null
    }

    estimateSaveGuardRef.current = true
    setIsSavingEstimate(true)

    try {
      const result = await onSaveEstimate?.({
        ...getEstimatePayload(),
        ...overrides,
      })

      if (result) {
        if (stopEditing) {
          setIsEditing(false)
        }
        if (closeSendModal) {
          setShowSendModal(false)
        }
      }

      return result
    } finally {
      estimateSaveGuardRef.current = false
      setIsSavingEstimate(false)
    }
  }

  async function saveEstimate() {
    const result = await persistEstimate({}, { stopEditing: true })
    if (!result) {
      return null
    }
    return result
  }

  async function handleOpenSendModal() {
    if (isEstimateActionPending || estimateSaveGuardRef.current) return

    const result = await persistEstimate({ status: savedEstimate.status || 'Draft' })
    const persistedEstimate = result || (hasExistingEstimate ? savedEstimate : null)
    const shareResolution = resolvePublicEstimateShare(persistedEstimate)
    const nextShareLink = shareResolution.url || publicEstimateLink
    logEstimateShareResolution(shareResolution, persistedEstimate, {
      usedResolvedFallback: Boolean(nextShareLink && !shareResolution.url),
    })
    setSendDocumentLink(nextShareLink)
    setShowSendModal(true)
  }

  async function handleConvertToContract() {
    if (hasLinkedContract) {
      onOpenContract?.()
      return null
    }

    if (estimateConvertGuardRef.current) {
      return null
    }

    estimateConvertGuardRef.current = true
    setIsConvertingEstimate(true)

    try {
      return await onConvert?.(getEstimatePayload())
    } finally {
      estimateConvertGuardRef.current = false
      setIsConvertingEstimate(false)
    }
  }

  async function handleSyncContract(force = false) {
    if (!hasLinkedContract) {
      return null
    }

    if (estimateConvertGuardRef.current) {
      return null
    }

    estimateConvertGuardRef.current = true
    setIsConvertingEstimate(true)

    try {
      const result = await onSyncContract?.(getEstimatePayload(), { force })

      if (result?.blockedReason === 'signed' && !force) {
        setConfirmAction({ mode: 'sync-contract' })
        return null
      }

      return result?.contract || result || null
    } finally {
      estimateConvertGuardRef.current = false
      setIsConvertingEstimate(false)
    }
  }

  function updateLineItem(index, field, value) {
    markDraftDirty()
    setLineItems((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))
  }

  function addLineItem() {
    markDraftDirty()
    setLineItems((items) => [...items, createEmptyLineItem(materialsIncluded)])
    setLineItemAmountInputs((items) => [...items, ''])
    setPricingMode(detailedPricingMode)
  }

  function removeLineItem(index) {
    markDraftDirty()
    setLineItems((items) => {
      if (items.length === 1) return [createEmptyLineItem(materialsIncluded)]
      return items.filter((_, itemIndex) => itemIndex !== index)
    })
    setLineItemAmountInputs((items) => {
      if (items.length === 1) return ['']
      return items.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  function handleLineItemTextareaInput(index, value) {
    updateLineItem(index, 'name', value)
  }

  function handleLineItemAmountInput(index, rawValue) {
    const sanitizedValue = sanitizeAmountInput(rawValue)

    markDraftDirty()
    setLineItemAmountInputs((items) => items.map((item, itemIndex) => itemIndex === index ? sanitizedValue : item))
    updateLineItem(index, 'amount', sanitizedValue === '' ? 0 : Number(sanitizedValue))
  }

  function handleLineItemAmountBlur(index) {
    const currentDraftValue = lineItemAmountInputs[index] ?? ''
    const normalizedValue = sanitizeAmountInput(currentDraftValue)

    if (normalizedValue === '' || normalizedValue === '0' || normalizedValue === '0.') {
      updateLineItem(index, 'amount', 0)
      setLineItemAmountInputs((items) => items.map((item, itemIndex) => itemIndex === index ? '' : item))
      return
    }

    const numericValue = Number(normalizedValue)
    updateLineItem(index, 'amount', Number.isFinite(numericValue) ? numericValue : 0)
    setLineItemAmountInputs((items) => items.map((item, itemIndex) => itemIndex === index ? formatAmountInputValue(numericValue) : item))
  }

  function handleSimpleTotalInput(rawValue) {
    const sanitizedValue = sanitizeAmountInput(rawValue)
    markDraftDirty()
    setTotalInput(sanitizedValue)
    setTotal(sanitizedValue === '' ? 0 : Number(sanitizedValue))
  }

  function handleSimpleTotalBlur() {
    const normalizedValue = sanitizeAmountInput(totalInput)

    if (normalizedValue === '' || normalizedValue === '0' || normalizedValue === '0.') {
      setTotal(0)
      setTotalInput('')
      return
    }

    const numericValue = Number(normalizedValue)
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0
    setTotal(safeValue)
    setTotalInput(formatAmountInputValue(safeValue))
  }

  function useDetailedPricing() {
    markDraftDirty()
    setLineItems((items) => items.map((item) => ({
      ...item,
      materialsIncluded: item?.materialsIncluded ?? materialsIncluded,
    })))
    setPricingMode(detailedPricingMode)
  }

  function useSimplePricing() {
    markDraftDirty()
    setPricingMode(simplePricingMode)
  }

  async function handleDownloadPdf() {
    try {
      await printDocumentElement(pdfTemplateRef.current, {
        documentTitle: `${previewEstimateNumber} ${lead?.client || ''}`.trim(),
        pageMarginInches: ESTIMATE_PAPER_MARGIN / 72,
        safeInsetInches: 0,
        printLabel: t('print'),
      })
    } catch (error) {
      showToast(isPrintWindowBlockedError(error) ? t('printPreviewPopupBlocked') : t('estimatePdfGenerateFailed'), 'error')
    }
  }

  async function handlePrint() {
    try {
      await printDocumentElement(pdfTemplateRef.current, {
        documentTitle: `${previewEstimateNumber} ${lead?.client || ''}`.trim(),
        pageMarginInches: ESTIMATE_PAPER_MARGIN / 72,
        safeInsetInches: 0,
        printLabel: t('print'),
      })
    } catch (error) {
      showToast(isPrintWindowBlockedError(error) ? t('printPreviewPopupBlocked') : t('estimatePdfGenerateFailed'), 'error')
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden">
      <RecordBackButton label={backLabel} onClick={onBack} />
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-xl sm:p-7 lg:p-8">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">{t('estimateBuilder')}</p>
            <h1 className="mt-3 break-words text-3xl font-bold leading-tight sm:text-4xl">{lead.projectTitle || lead.projectType}</h1>
            <div className="mt-4 flex flex-col gap-2 text-sm text-slate-300 sm:flex-row sm:flex-wrap sm:gap-x-5">
              {lead?.client || clientRecord?.name ? (
                <p className="inline-flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-blue-200" /><span className="break-words">{lead?.client || clientRecord?.name}</span></p>
              ) : null}
              {jobLocation ? (
                <p className="inline-flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-blue-200" /><span className="break-words">{jobLocation}</span></p>
              ) : null}
            </div>
            {isArchived && <span className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{t('archived')}</span>}
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10">
            <div className="min-w-0 bg-white/[0.04] p-4">
              <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{t('estimateStatus')}</dt>
              <dd className="mt-1 break-words text-sm font-bold text-white">{estimateStatus}</dd>
            </div>
            <div className="min-w-0 bg-white/[0.04] p-4">
              <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{t('estimatedTotal')}</dt>
              <dd className="mt-1 break-words text-lg font-bold text-white">{currency.format(estimateTotal)}</dd>
            </div>
            <div className={`min-w-0 bg-white/[0.04] p-4 ${estimateUpdatedDate ? '' : 'col-span-2'}`}>
              <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{t('dateCreated')}</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-slate-100">{estimateCreatedDate}</dd>
            </div>
            {estimateUpdatedDate ? (
              <div className="min-w-0 bg-white/[0.04] p-4">
                <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{t('lastUpdated')}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-slate-100">{estimateUpdatedDate}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {isOrphanedProject ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {t('estimateProjectNoLongerLinked')}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0 space-y-5">
          <article className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              aria-expanded={isSettingsOpen}
              aria-controls="estimate-settings-panel"
              onClick={() => {
                settingsInteractionRef.current = true
                setIsSettingsOpen((current) => !current)
              }}
              className="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-100"
            >
              <span>
                <span className="block text-lg font-bold text-slate-950">{t('estimateSettings')}</span>
                <span className="mt-1 block text-sm text-slate-500">{t('estimateSettingsHelp')}</span>
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`} />
            </button>
            {isSettingsOpen ? (
              <div id="estimate-settings-panel" className="grid gap-5 border-t border-slate-200 px-5 py-5 sm:grid-cols-2">
                <div className="min-w-0 space-y-3">
                  <label className="block text-sm font-bold text-slate-800">{t('estimateLanguage')}</label>
                  <p className="text-sm leading-6 text-slate-500">{t('estimateLanguageHelp')}</p>
                  <SelectField value={estimateLanguage} onChange={(event) => { markDraftDirty(); setEstimateLanguage(event.target.value) }} className="bg-slate-50">
                    <option value="">{t('matchAppLanguage')}</option>
                    <option value="en">{t('english')}</option>
                    <option value="es">{t('spanish')}</option>
                  </SelectField>
                </div>
                <div className="min-w-0 space-y-3">
                  <label className="block text-sm font-bold text-slate-800">{t('paymentTerms')}</label>
                  {isEditing ? (
                    isKnownPaymentTermValue(paymentTerms) ? (
                      <SelectField value={paymentTerms} onChange={(event) => { markDraftDirty(); setPaymentTerms(event.target.value) }} className="bg-slate-50">
                        {paymentTermOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </SelectField>
                    ) : (
                      <textarea value={paymentTerms} onChange={(event) => { markDraftDirty(); setPaymentTerms(event.target.value) }} rows={4} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                    )
                  ) : (
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 whitespace-pre-line">{getPaymentTermLabel(paymentTerms, t)}</div>
                  )}
                </div>
                {!isDetailedPricing ? (
                  <div className="min-w-0 space-y-3 sm:col-span-2">
                    <p className="text-sm font-bold text-slate-800">{t('materialsIncluded')}</p>
                    {isEditing ? (
                      <button onClick={() => { markDraftDirty(); setMaterialsIncluded((current) => !current) }} className={`w-full rounded-2xl px-4 py-4 text-left text-sm font-bold ${materialsIncluded ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'}`}>
                        {materialsIncluded ? `${t('materialsIncluded')}: ${t('yes')}` : `${t('materialsIncluded')}: ${t('no')}`}
                      </button>
                    ) : (
                      <div className={`w-full rounded-2xl px-4 py-4 text-left text-sm font-bold ${materialsIncluded ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'}`}>
                        {materialsIncluded ? `${t('materialsIncluded')}: ${t('yes')}` : `${t('materialsIncluded')}: ${t('no')}`}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
          <InfoCard title={t('scopeOfWork')}>
            {isEditing ? (
              <LightweightFormattedTextarea
                value={scope}
                onChange={(nextValue) => { markDraftDirty(); setScope(nextValue) }}
                rows={8}
                minHeight={192}
                maxHeight={560}
                ariaLabel={t('scopeOfWork')}
                t={t}
                className="p-4 text-sm leading-6"
              />
            ) : hasMeaningfulEstimateFormattedText(scope) ? (
              <EstimateFormattedText value={scope} className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700" />
            ) : null}
          </InfoCard>

          <InfoCard
            title={t('pricing')}
            headerAction={isEditing ? (
              <button
                onClick={isDetailedPricing ? useSimplePricing : useDetailedPricing}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white sm:w-auto"
              >
                {isDetailedPricing ? t('useSimpleTotalInstead') : t('addDetailedLineItems')}
              </button>
            ) : null}
            bodyClassName="space-y-4"
          >
            <div className="space-y-4">
              {isDetailedPricing ? (
                <>
                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div key={index} className="min-w-0 rounded-2xl border border-slate-200 p-3">
                        {isEditing ? (
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_168px] sm:items-start">
                            <div className="min-w-0 space-y-2">
                              <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                                {t('lineItemDetails')}
                              </label>
                              <LightweightFormattedTextarea
                                value={item.name}
                                onChange={(nextValue) => handleLineItemTextareaInput(index, nextValue)}
                                placeholder={t('enterScopeDetails')}
                                rows={3}
                                minHeight={104}
                                maxHeight={400}
                                ariaLabel={t('lineItemDetails')}
                                t={t}
                                className="px-3 py-3 text-sm leading-6"
                              />
                            </div>
                            <div className="min-w-0 flex flex-col gap-2 sm:pt-6">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                  {t('lineItemAmount')}
                                </label>
                                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white pl-3 pr-2 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                                  <span className="mr-2 text-sm font-semibold text-slate-400">$</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={lineItemAmountInputs[index] ?? ''}
                                    onChange={(event) => handleLineItemAmountInput(index, event.target.value)}
                                    onBlur={() => handleLineItemAmountBlur(index)}
                                    placeholder={t('amount')}
                                    aria-label={t('lineItemAmount')}
                                    className="h-full w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300 sm:text-right"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                  {t('materialsIncluded')}
                                </span>
                                <div className="grid min-h-[40px] grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                                  <button
                                    type="button"
                                    onClick={() => updateLineItem(index, 'materialsIncluded', true)}
                                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${item.materialsIncluded ? 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100' : 'text-slate-600 hover:bg-white'}`}
                                  >
                                    {t('yes')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateLineItem(index, 'materialsIncluded', false)}
                                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${!item.materialsIncluded ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                                  >
                                    {t('no')}
                                  </button>
                                </div>
                              </div>
                              <button type="button" onClick={() => removeLineItem(index)} className="h-10 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                                {t('remove')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_168px] sm:items-start">
                            <EstimateFormattedText value={item.name || t('item')} className="rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700" />
                            <div className="space-y-2">
                              <div className="rounded-xl bg-slate-50 px-3 py-3 text-right text-sm font-bold text-slate-900">{currency.format(Number(item.amount || 0))}</div>
                              <div className={`rounded-xl px-3 py-2 text-xs font-bold ${item.materialsIncluded ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'}`}>
                                {item.materialsIncluded ? `${t('materialsIncluded')}: ${t('yes')}` : `${t('materialsIncluded')}: ${t('no')}`}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {isEditing ? (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button onClick={addLineItem} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">{t('addItem')}</button>
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-2xl bg-blue-50 px-4 py-4 text-blue-700">
                    <p className="text-xs font-bold uppercase tracking-wide">{t('calculatedTotal')}</p>
                    <p className="mt-1 text-2xl font-bold">{currency.format(lineTotal)}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-blue-700 ring-1 ring-blue-100">
                    {t('simpleTotal')}
                  </div>
                  {isEditing ? (
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm sm:p-5">
                      <label className="mb-2 block text-sm font-bold text-slate-700">{t('totalPrice')}</label>
                      <div className="flex min-h-14 items-center rounded-2xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                        <span className="mr-2 text-lg font-bold text-slate-400">$</span>
                        <input aria-label={t('totalPrice')} type="text" inputMode="decimal" value={totalInput} onChange={(event) => handleSimpleTotalInput(event.target.value)} onBlur={handleSimpleTotalBlur} className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-slate-950 outline-none focus:outline-none" />
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-200 pt-4">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t('estimatedTotal')}</span>
                        <span className="break-words text-right text-2xl font-bold text-slate-950 sm:text-3xl">{currency.format(estimateTotal)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-slate-50 px-5 py-5">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t('estimatedTotal')}</p>
                      <p className="mt-2 break-words text-3xl font-bold text-slate-950">{currency.format(estimateTotal)}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </InfoCard>
        </section>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <EstimatePreviewCard {...estimatePreviewProps} uiT={t} />
          {!isEditing && (
            <button disabled={isEstimateActionPending} onClick={() => setIsEditing(true)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('editEstimate')}</button>
          )}
          {isEditing && (
            <button disabled={isSavingEstimate} onClick={saveEstimate} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{isSavingEstimate ? t('saving') : t('saveEstimate')}</button>
          )}
          <button onClick={handlePrint} className="w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-bold text-white hover:bg-slate-800">{t('print')}</button>
          <button onClick={() => setShowPreviewModal(true)} className="hidden w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50 sm:block">{t('previewPdf')}</button>
          <button onClick={handleDownloadPdf} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50">{t('saveAsPdf')}</button>
          <button disabled={isEstimateActionPending} onClick={handleOpenSendModal} className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{t('sendToCustomer')}</button>
          {projectAvailable && (hasLinkedContract ? (
            <>
              <button disabled={isEstimateActionPending} onClick={onOpenContract} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('viewContract')}</button>
              <button disabled={isEstimateActionPending} onClick={() => { if (linkedContractIsSigned) { setConfirmAction({ mode: 'sync-contract' }); return } handleSyncContract(false) }} className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400">{isConvertingEstimate ? t('saving') : t('syncContractFromEstimate')}</button>
            </>
          ) : (
            <button disabled={isEstimateActionPending} onClick={handleConvertToContract} className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400">{isConvertingEstimate ? t('saving') : t('convertToContract')}</button>
          ))}
          {isArchived ? (
            <>
              <button disabled={isEstimateActionPending} onClick={onRestoreEstimate} className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"><Undo2 className="mr-2 inline h-4 w-4" />{t(archiveSource === 'lead' ? 'restoreLeadAndEstimate' : 'restore')}</button>
              <button disabled={isEstimateActionPending} onClick={() => setConfirmAction({ mode: 'delete' })} className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="mr-2 inline h-4 w-4" />{t('deletePermanently')}</button>
            </>
          ) : (
            <button disabled={isEstimateActionPending} onClick={() => setConfirmAction({ mode: 'archive' })} className={`w-full ${archivePanelButtonClasses} ${isEstimateActionPending ? 'cursor-not-allowed opacity-60' : ''}`.trim()}><Archive className="mr-2 inline h-4 w-4" />{t('archive')}</button>
          )}
        </aside>
      </div>
      <ConfirmRecordModal isOpen={Boolean(confirmAction)} mode={confirmAction?.mode === 'delete' ? 'delete' : 'archive'} title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : confirmAction?.mode === 'sync-contract' ? t('confirmSyncSignedContract') : t('confirmArchive')} message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : confirmAction?.mode === 'sync-contract' ? t('signedContractSyncWarning') : t('archiveHelp')} confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : confirmAction?.mode === 'sync-contract' ? t('syncContractFromEstimate') : t('archive')} onCancel={() => setConfirmAction(null)} onConfirm={async () => { if (confirmAction?.mode === 'archive') { await onArchiveEstimate?.() } if (confirmAction?.mode === 'delete') { await onDeleteEstimate?.(); onBack?.() } if (confirmAction?.mode === 'sync-contract') { await handleSyncContract(true) } setConfirmAction(null) }} t={t} />
      <SendToCustomerModal isOpen={showSendModal} documentType="estimate" customer={{ name: lead.client, phone: lead.phone, email: lead.email }} projectTitle={lead.projectTitle || lead.projectType} amountLabel={t('estimatedTotal')} amountValue={currency.format(estimateTotal)} documentLink={sendDocumentLink} companyName={companySettings?.company?.name || ''} onClose={() => setShowSendModal(false)} onSent={async () => {
        const result = await persistEstimate({ status: 'Sent', sentAt: savedEstimate.sentAt || savedEstimate.sent_at || new Date().toISOString() }, { closeSendModal: true })
        return Boolean(result)
      }} t={t} contentT={estimateT} />
      <ModalShell isOpen={showPreviewModal} onBackdropClick={() => setShowPreviewModal(false)} panelClassName="p-2 sm:max-w-[64rem] sm:p-3 lg:max-w-[68rem]">
        <div className="rounded-3xl bg-white text-slate-950">
          <div className="p-1">
            <PaginatedEstimatePreview uiT={t}>
              <EstimatePdfTemplate {...estimatePreviewProps} />
            </PaginatedEstimatePreview>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={handlePrint} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">{t('print')}</button>
            <button onClick={() => setShowPreviewModal(false)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">{t('close')}</button>
          </div>
        </div>
      </ModalShell>
      <div style={{ pointerEvents: 'none', position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
      <div
          ref={pdfTemplateRef}
          data-estimate-pdf-root="true"
          style={{ width: `${estimatePreviewPageWidth}px`, backgroundColor: '#ffffff', color: '#0f172a', padding: `${ESTIMATE_DOCUMENT_SOURCE_PADDING}px`, boxSizing: 'border-box' }}
        >
          <EstimatePdfTemplate {...estimatePreviewProps} />
        </div>
      </div>
    </div>
  )
}

function EstimatePreviewCard({ uiT, t: documentT, ...documentProps }) {
  return (
    <InfoCard title={uiT('previewEstimate')} bodyClassName="min-w-0 overflow-hidden">
      <div className="rounded-[28px] bg-slate-50 p-2 sm:p-3">
        <PaginatedEstimatePreview uiT={uiT}>
          <EstimatePdfTemplate {...documentProps} t={documentT} />
        </PaginatedEstimatePreview>
      </div>
    </InfoCard>
  )
}

export function EstimateBuilderRoute({ companySettings, leads, clients = [], estimates = [], archivedIds = [], onSaveEstimate, onConvertEstimate, onSyncEstimateContract, onArchiveEstimate, onRestoreEstimate, onDeleteEstimate, t, appLanguage = 'en' }) {
  const { id, leadId, estimateId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { contractor, company, session } = useAuth()
  const contractorId = getProjectsContractorId({ contractor, company, session })
  const projectId = id || leadId
  const isDirectEstimateRoute = Boolean(estimateId)
  const routeLead = isDirectEstimateRoute ? null : findLeadByProjectLookup(leads, projectId)
  const cachedDirectEstimate = isDirectEstimateRoute
    ? estimates.find((estimate) => estimate.id === estimateId) || null
    : null
  const estimateSource = location.state?.source
  const sourceLeadId = location.state?.leadId
  const sourceProjectId = location.state?.projectId || projectId
  const openSendOnLoad = location.state?.openSendEstimate === true
  const [loadedEstimate, setLoadedEstimate] = useState(cachedDirectEstimate)
  const [linkedProject, setLinkedProject] = useState(null)
  const [directLoadState, setDirectLoadState] = useState({ loading: isDirectEstimateRoute, error: '' })
  const [projectAvailable, setProjectAvailable] = useState(!isDirectEstimateRoute)
  const [isOrphanedProject, setIsOrphanedProject] = useState(false)
  const resolvedEstimate = loadedEstimate || cachedDirectEstimate
  const linkedLead = resolvedEstimate
    ? findLeadByProjectLookup(
        leads,
        resolvedEstimate.leadId,
        resolvedEstimate.lead_id,
        resolvedEstimate.projectId,
        resolvedEstimate.project_id,
      )
    : null
  const lead = routeLead || linkedLead || (resolvedEstimate
    ? {
        id: resolvedEstimate.leadId || resolvedEstimate.lead_id || `estimate-${resolvedEstimate.id}`,
        clientId: resolvedEstimate.clientId || resolvedEstimate.client_id || null,
        projectId: resolvedEstimate.projectId || resolvedEstimate.project_id || null,
        client: resolvedEstimate.client || t('customer'),
        projectTitle: resolvedEstimate.projectTitle || resolvedEstimate.title || t('estimate'),
        projectType: resolvedEstimate.projectTitle || resolvedEstimate.title || t('estimate'),
        value: Number(resolvedEstimate.total || resolvedEstimate.totalAmount || resolvedEstimate.amount || 0),
        portal: { estimate: resolvedEstimate },
      }
    : null)
  const backLabel = useMemo(() => {
    if (isDirectEstimateRoute) return t('backToEstimates')
    if (estimateSource === 'lead' && sourceLeadId) return t('backToLeadDetails')
    if (estimateSource === 'project' && sourceProjectId) return t('backToProjectWorkspace')
    return t('back')
  }, [estimateSource, isDirectEstimateRoute, sourceLeadId, sourceProjectId, t])

  function handleBack() {
    if (isDirectEstimateRoute) {
      navigate('/estimates')
      return
    }

    if (estimateSource === 'lead' && sourceLeadId) {
      navigate(`/leads/${sourceLeadId}`)
      return
    }

    if (estimateSource === 'project' && sourceProjectId) {
      navigate(`/projects/${sourceProjectId}`)
      return
    }

    navigate(-1)
  }

  function handleOpenSendConsumed() {
    const nextState = { ...(location.state || {}) }
    delete nextState.openSendEstimate
    navigate(location.pathname, { replace: true, state: nextState })
  }

  useEffect(() => {
    let isCancelled = false

    async function loadEstimate() {
      if (isDirectEstimateRoute) {
        setLinkedProject(null)
        setDirectLoadState({ loading: true, error: '' })
        let directEstimate = cachedDirectEstimate

        if (USE_SUPABASE || USE_SUPABASE_ESTIMATES) {
          const response = await dataProvider.estimates.getById(estimateId, { contractorId })

          if (response?.error) {
            if (!isCancelled && !directEstimate) {
              setDirectLoadState({ loading: false, error: response.error.message || t('estimateNotFound') })
              return
            }
          } else {
            directEstimate = response?.data || directEstimate
          }
        }

        if (isCancelled) return
        setLoadedEstimate(directEstimate)

        if (!directEstimate) {
          setLinkedProject(null)
          setProjectAvailable(false)
          setIsOrphanedProject(false)
          setDirectLoadState({ loading: false, error: t('estimateNotFound') })
          return
        }

        const relatedProjectId = directEstimate.projectId || directEstimate.project_id || null
        if (!relatedProjectId) {
          setLinkedProject(null)
          setProjectAvailable(false)
          setIsOrphanedProject(false)
        } else if (USE_SUPABASE || USE_SUPABASE_PROJECTS) {
          try {
            const projectResponse = await dataProvider.projects.getById(relatedProjectId, { contractorId })
            if (!isCancelled) {
              const hasActiveProject = Boolean(!projectResponse?.error && projectResponse?.data?.id && !isArchivedProject(projectResponse.data))
              setLinkedProject(hasActiveProject ? projectResponse.data : null)
              setProjectAvailable(hasActiveProject)
              setIsOrphanedProject(Boolean(!projectResponse?.error && !hasActiveProject))
            }
          } catch {
            if (!isCancelled) {
              setLinkedProject(null)
              setProjectAvailable(false)
              setIsOrphanedProject(false)
            }
          }
        } else {
          const relatedProject = findLeadByProjectLookup(leads, relatedProjectId)
          const hasActiveProject = Boolean(relatedProject && !isArchivedProject(relatedProject))
          setLinkedProject(hasActiveProject ? relatedProject : null)
          setProjectAvailable(hasActiveProject)
          setIsOrphanedProject(!hasActiveProject)
        }

        if (!isCancelled) setDirectLoadState({ loading: false, error: '' })
        return
      }

      if (!routeLead?.id) {
        setLoadedEstimate(null)
        return
      }

      const cachedEstimate = readLinkedEstimateDraft(routeLead || projectId, [projectId, routeLead.id])
      const relatedProjectId = routeLead.projectId || routeLead.project_id || projectId || null
      const relatedLeadId = routeLead.id || sourceLeadId || null
      const knownEstimateId = routeLead.estimateId || routeLead.portal?.estimate?.id || cachedEstimate?.id || null

      try {
        if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
          if (!isCancelled) {
            setLoadedEstimate(cachedEstimate)
          }
          return
        }

        if (knownEstimateId) {
          const response = await dataProvider.estimates.getById(knownEstimateId, {
            contractorId,
          })

          if (!isCancelled && !response?.error && response?.data) {
            const nextEstimate = { ...(cachedEstimate || {}), ...response.data }
            setLoadedEstimate(nextEstimate)
            writeLinkedEstimateDrafts([projectId, routeLead.id, nextEstimate.id], nextEstimate)
            return
          }
        }

        if (!relatedProjectId && !relatedLeadId) {
          if (!isCancelled) {
            setLoadedEstimate(cachedEstimate)
          }
          return
        }

        const response = await dataProvider.estimates.list({
          contractorId,
          ...(relatedProjectId && relatedProjectId !== routeLead.id ? { projectId: relatedProjectId } : {}),
          ...(relatedLeadId ? { leadId: relatedLeadId } : {}),
          includeArchived: true,
        })

        if (isCancelled || response?.error) {
          if (!isCancelled) {
            setLoadedEstimate(cachedEstimate)
          }
          return
        }

        const persistedEstimate = response?.data?.[0] || null
        const nextEstimate = persistedEstimate
          ? { ...(cachedEstimate || {}), ...persistedEstimate }
          : cachedEstimate

        setLoadedEstimate(nextEstimate)
        if (nextEstimate) {
          writeLinkedEstimateDrafts([projectId, routeLead.id, nextEstimate.id], nextEstimate)
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadedEstimate(cachedEstimate)
        }
      }
    }

    loadEstimate()

    return () => {
      isCancelled = true
    }
  }, [cachedDirectEstimate, contractorId, estimateId, isDirectEstimateRoute, leads, projectId, routeLead?.estimateId, routeLead?.id, routeLead?.portal?.estimate?.id, routeLead?.projectId, routeLead?.project_id, sourceLeadId, t])

  useEffect(() => {
    if (isDirectEstimateRoute) return undefined

    let isCancelled = false
    const relatedProjectId = routeLead?.projectId || routeLead?.project_id || projectId || null

    async function loadLinkedProject() {
      if (!routeLead?.id || !relatedProjectId) {
        setLinkedProject(null)
        setProjectAvailable(false)
        setIsOrphanedProject(false)
        return
      }

      if (USE_SUPABASE || USE_SUPABASE_PROJECTS) {
        setLinkedProject(null)
        setProjectAvailable(false)

        try {
          const response = await dataProvider.projects.getById(relatedProjectId, { contractorId })
          if (isCancelled) return

          const hasActiveProject = Boolean(!response?.error && response?.data?.id && !isArchivedProject(response.data))
          setLinkedProject(hasActiveProject ? response.data : null)
          setProjectAvailable(hasActiveProject)
          setIsOrphanedProject(Boolean(!response?.error && !hasActiveProject))
        } catch {
          if (!isCancelled) {
            setLinkedProject(null)
            setProjectAvailable(false)
            setIsOrphanedProject(false)
          }
        }
        return
      }

      const relatedProject = findLeadByProjectLookup(leads, relatedProjectId)
      const hasActiveProject = Boolean(relatedProject && !isArchivedProject(relatedProject))
      setLinkedProject(hasActiveProject ? relatedProject : null)
      setProjectAvailable(hasActiveProject)
      setIsOrphanedProject(!hasActiveProject)
    }

    loadLinkedProject()

    return () => {
      isCancelled = true
    }
  }, [contractorId, isDirectEstimateRoute, leads, projectId, routeLead?.id, routeLead?.projectId, routeLead?.project_id])

  if (isDirectEstimateRoute && directLoadState.loading && !resolvedEstimate) {
    return (
      <AymeroLoader
        variant="section"
        title={t('loadingEstimate')}
        message={t('loadingEstimateHelp')}
        accessibleLabel={t('loadingEstimate')}
        className="rounded-3xl border border-slate-200 bg-white shadow-sm"
      />
    )
  }

  if (!lead) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">{isDirectEstimateRoute ? t('estimateNotFound') : t('projectNotFound')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{directLoadState.error || t(isDirectEstimateRoute ? 'estimateNotFoundHelp' : 'projectNotFoundHelp')}</p>
        <button onClick={() => navigate(isDirectEstimateRoute ? '/estimates' : '/dashboard')} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
          {t(isDirectEstimateRoute ? 'backToEstimates' : 'backToDashboardAction')}
        </button>
      </section>
    )
  }

  const clientRecord = findRelatedClient(clients, lead || {})

  const mergedLead = loadedEstimate
    ? {
        ...lead,
        value: Number(loadedEstimate.total ?? lead.value ?? 0),
        estimatedValue: Number(loadedEstimate.total ?? lead.estimatedValue ?? lead.value ?? 0),
        portal: {
          ...(lead.portal || {}),
          estimate: loadedEstimate,
        },
      }
    : lead
  const publicEstimateLink = resolvePublicEstimateShareUrl(resolvedEstimate || loadedEstimate || lead?.portal?.estimate || {})
  const estimateArchiveState = resolveEstimateArchiveState({
    estimate: resolvedEstimate || loadedEstimate || lead?.portal?.estimate || {},
    lead,
    contract: lead?.portal?.contract || null,
    archivedLeadIds: archivedIds,
  })

  return (
    <EstimateBuilderPage
      lead={mergedLead}
      clientRecord={clientRecord}
      t={t}
      appLanguage={appLanguage}
      companySettings={companySettings}
      onBack={handleBack}
      backLabel={backLabel}
      isArchived={estimateArchiveState.isArchived}
      archiveSource={estimateArchiveState.source}
      projectAvailable={isDirectEstimateRoute ? projectAvailable : true}
      publicEstimateLink={publicEstimateLink}
      isOrphanedProject={isDirectEstimateRoute ? isOrphanedProject : false}
      openSendOnLoad={openSendOnLoad}
      onOpenSendConsumed={handleOpenSendConsumed}
      onSaveEstimate={async (estimate) => {
        const result = await onSaveEstimate?.(lead.id, estimate)
        if (result) {
          setLoadedEstimate(result)
        }
        return result
      }}
      onConvert={async (estimate) => onConvertEstimate?.(lead.id, estimate)}
      onSyncContract={async (estimate, options = {}) => onSyncEstimateContract?.(lead.id, estimate, options)}
      onOpenContract={() => navigate(`/projects/${lead.projectId || lead.id}/contract`, { state: { source: 'estimate', projectId: lead.projectId || lead.id, leadId: lead.id } })}
      onArchiveEstimate={async () => {
        const result = await onArchiveEstimate?.(resolvedEstimate?.id || lead.id, resolvedEstimate || lead.portal?.estimate || null)
        if (result) setLoadedEstimate(result)
        return result
      }}
      onRestoreEstimate={async () => {
        const result = await onRestoreEstimate?.(
          resolvedEstimate?.id || lead.id,
          resolvedEstimate || lead.portal?.estimate || null,
          { archiveSource: estimateArchiveState.source },
        )
        if (result && estimateArchiveState.source !== 'lead') setLoadedEstimate(result)
        return result
      }}
      onDeleteEstimate={() => onDeleteEstimate?.(resolvedEstimate?.id || lead.id, resolvedEstimate || lead.portal?.estimate || null)}
    />
  )
}

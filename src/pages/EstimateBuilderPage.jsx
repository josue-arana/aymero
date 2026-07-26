import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, Trash2, Undo2 } from 'lucide-react'
import { SelectField } from '../components/ui/SelectField'
import { InfoCard } from '../components/ui/InfoCard'
import { EstimatePdfTemplate } from '../components/estimates/EstimatePdfTemplate'
import { currency } from '../utils/formatters'
import { getPortalData } from '../utils/portal'
import { archivePanelButtonClasses } from '../utils/buttonStyles'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { SendToCustomerModal } from '../components/common/SendToCustomerModal'
import { ModalShell } from '../components/common/ModalShell'
import { ScaledDocumentPreview, defaultDocumentPreviewWidth } from '../components/common/ScaledDocumentPreview'
import { useToast } from '../components/common/ToastProvider'
import dataProvider from '../services/dataProvider'
import { useAuth } from '../contexts/AuthContext'
import { USE_SUPABASE, USE_SUPABASE_ESTIMATES } from '../config/backendConfig'
import { getProjectsContractorId } from '../services/system/projectsRuntimeService'
import { readLinkedEstimateDraft, writeLinkedEstimateDrafts } from '../utils/estimateLinks'
import { formatEstimateDisplayNumber, generateEstimateNumber } from '../utils/estimateNumber'
import { downloadEstimatePdf } from '../utils/estimatePdf'
import { printDocumentElement } from '../utils/printDocument'
import { shouldUseGeneratedPdfForPrint } from '../utils/documentOutput'
import { createTranslator } from '../translations'
import { findLeadByProjectLookup } from '../utils/projectIdentity'
import { findRelatedClient } from '../utils/clients'
import { normalizeEstimateDocument } from '../utils/estimateDocument'
import { normalizeDocumentLanguageOverride, resolveClientFacingLanguage } from '../utils/language'
import { getPaymentTermLabel, getPaymentTermOptions, isKnownPaymentTermValue } from '../utils/paymentTerms'

const simplePricingMode = 'simple'
const detailedPricingMode = 'detailed'
const estimatePreviewPageWidth = defaultDocumentPreviewWidth

function readEstimateScopeText(estimate = {}) {
  return estimate?.summary || estimate?.scopeOfWork || estimate?.scope_of_work || ''
}

function resolveMaterialsIncludedDefault(...values) {
  const firstBoolean = values.find((value) => typeof value === 'boolean')
  return typeof firstBoolean === 'boolean' ? firstBoolean : false
}

function createEmptyLineItem(materialsIncluded = false) {
  return { name: '', amount: 0, materialsIncluded }
}

function normalizeLineItems(items = [], fallbackMaterialsIncluded = false) {
  if (!Array.isArray(items)) {
    return []
  }

  return items.map((item) => ({
    ...(item && typeof item === 'object' ? item : {}),
    name: typeof item?.name === 'string' ? item.name : String(item?.name || ''),
    amount: Number(item?.amount || 0),
    materialsIncluded: item?.materialsIncluded ?? fallbackMaterialsIncluded,
  }))
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

function buildDefaultLineItems(leadValue, materialsIncluded, t) {
  return [
    { name: t('laborAndProjectSetup'), amount: Math.round(Number(leadValue || 0) * 0.35), materialsIncluded },
    { name: t('materialsAndFinishWork'), amount: Math.round(Number(leadValue || 0) * 0.65), materialsIncluded },
  ]
}

function buildEstimateDraftState({ savedEstimate = {}, lead, companySettings, t }) {
  const defaultMaterialsIncluded = resolveMaterialsIncludedDefault(
    savedEstimate.materialsIncluded,
    companySettings?.defaults?.materialsIncluded,
    false
  )
  const savedLineItems = normalizeLineItems(savedEstimate.lineItems, defaultMaterialsIncluded)
  const hasSavedLineItems = savedLineItems.some((item) => Number(item?.amount || 0) > 0 || String(item?.name || '').trim())
  const defaultLineItems = buildDefaultLineItems(lead?.value, defaultMaterialsIncluded, t)

  return {
    scope: readEstimateScopeText(savedEstimate),
    total: Number(savedEstimate.total ?? lead?.value ?? 0),
    totalInput: formatAmountInputValue(savedEstimate.total ?? lead?.value ?? 0),
    materialsIncluded: defaultMaterialsIncluded,
    paymentTerms: savedEstimate.paymentTerms || companySettings?.defaults?.paymentTerms || t('defaultPaymentTerms'),
    estimateLanguage: normalizeDocumentLanguageOverride(savedEstimate.estimateLanguage),
    pricingMode: hasSavedLineItems ? detailedPricingMode : simplePricingMode,
    lineItems: hasSavedLineItems ? savedLineItems : defaultLineItems,
    lineItemAmountInputs: (hasSavedLineItems ? savedLineItems : defaultLineItems).map((item) => formatAmountInputValue(item.amount)),
  }
}

export function EstimateBuilderPage({ lead, clientRecord = null, t, appLanguage = 'en', companySettings, isArchived = false, projectAvailable = true, onBack, backLabel, onSaveEstimate, onSendEstimate, onConvert, onSyncContract, onOpenContract, onArchiveEstimate, onRestoreEstimate, onDeleteEstimate }) {
  const { showToast } = useToast()
  const pdfTemplateRef = useRef(null)
  const scopeTextareaRef = useRef(null)
  const lineItemTextareaRefs = useRef([])
  const draftDirtyRef = useRef(false)
  const lastInitializedSourceKeyRef = useRef('')
  const lastInitializedOwnerKeyRef = useRef('')
  const portal = getPortalData(lead)
  const savedEstimate = lead.portal?.estimate || portal.estimate || {}
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
  const [confirmAction, setConfirmAction] = useState(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [isEditing, setIsEditing] = useState(true)
  const [isSavingEstimate, setIsSavingEstimate] = useState(false)
  const estimateSaveGuardRef = useRef(false)
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
  const paymentTermOptions = useMemo(() => getPaymentTermOptions(estimateT, paymentTerms), [estimateT, paymentTerms])
  const shouldUsePdfForPrint = useMemo(() => shouldUseGeneratedPdfForPrint(), [])
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
  const estimateDocumentModel = useMemo(() => normalizeEstimateDocument({
    scope,
    lineItems: isDetailedPricing ? lineItems : [],
    total: estimateTotal,
    materialsIncluded,
  }), [estimateTotal, isDetailedPricing, lineItems, materialsIncluded, scope])
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
    return {
      id: savedEstimate.id || undefined,
      number: savedEstimate.number || generateEstimateNumber(lead),
      total: estimateTotal,
      summary: scope,
      lineItems: isDetailedPricing ? lineItems : [],
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

  function autosizeLineItemTextarea(element) {
    if (!element) {
      return
    }

    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }

  function handleLineItemTextareaInput(index, value, element) {
    updateLineItem(index, 'name', value)
    autosizeLineItemTextarea(element)
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

  function insertBulletIntoTextarea(textarea, currentValue, onUpdate) {
    if (!textarea) {
      return
    }

    const selectionStart = textarea.selectionStart ?? textarea.value.length
    const selectionEnd = textarea.selectionEnd ?? selectionStart
    const prefix = currentValue.slice(0, selectionStart)
    const suffix = currentValue.slice(selectionEnd)
    const needsLeadingBreak = prefix.length > 0 && !prefix.endsWith('\n')
    const bulletText = `${needsLeadingBreak ? '\n' : ''}- `
    const nextValue = `${prefix}${bulletText}${suffix}`
    const nextCaretPosition = prefix.length + bulletText.length

    onUpdate(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCaretPosition, nextCaretPosition)
      autosizeLineItemTextarea(textarea)
    })
  }

  function insertBulletIntoScope() {
    insertBulletIntoTextarea(scopeTextareaRef.current, scope, (nextValue) => {
      markDraftDirty()
      setScope(nextValue)
    })
  }

  function insertBulletIntoLineItem(index) {
    const textarea = lineItemTextareaRefs.current[index]
    const currentValue = lineItems[index]?.name || ''
    insertBulletIntoTextarea(textarea, currentValue, (nextValue) => updateLineItem(index, 'name', nextValue))
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
      await downloadEstimatePdf({
        element: pdfTemplateRef.current,
        estimateNumber: previewEstimateNumber,
        estimateDate: previewEstimateDate,
        clientName: lead?.client,
        companyName: companySettings?.company?.name,
        company: companySettings?.company || {},
        lead,
        documentModel: estimateDocumentModel,
        paymentTerms,
        t: estimateT,
      })
      showToast(t('estimatePdfGenerated'))
    } catch (error) {
      showToast(error?.message || t('estimatePdfGenerateFailed'), 'error')
    }
  }

  async function handlePrint() {
    if (shouldUsePdfForPrint) {
      await handleDownloadPdf()
      return
    }

    try {
      await printDocumentElement(pdfTemplateRef.current, {
        documentTitle: `${previewEstimateNumber} ${lead?.client || ''}`.trim(),
      })
    } catch (error) {
      showToast(error?.message || t('estimatePdfGenerateFailed'), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-6xl max-w-full space-y-6 overflow-x-hidden">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> {backLabel}</button>
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-xl sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('estimateBuilder')}</p>
        <h1 className="mt-2 break-words text-3xl font-bold">{lead.projectTitle || lead.projectType}</h1>
        <p className="mt-2 text-sm text-slate-300">{t('estimateBuilderHelp')}</p>
        {isArchived && <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{t('archived')}</span>}
      </section>

      {!projectAvailable ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {t('projectNoLongerAvailable')}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0 space-y-5">
          <InfoCard title={t('estimateLanguage')}>
            <div className="space-y-3">
              <p className="text-sm leading-6 text-slate-500">{t('estimateLanguageHelp')}</p>
              <SelectField value={estimateLanguage} onChange={(event) => { markDraftDirty(); setEstimateLanguage(event.target.value) }} className="bg-slate-50">
                <option value="">{t('matchAppLanguage')}</option>
                <option value="en">{t('english')}</option>
                <option value="es">{t('spanish')}</option>
              </SelectField>
            </div>
          </InfoCard>
          <InfoCard title={t('scopeOfWork')}>
            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  ref={scopeTextareaRef}
                  value={scope}
                  onChange={(event) => { markDraftDirty(); setScope(event.target.value) }}
                  rows={8}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <div className="flex justify-end">
                  <button onClick={insertBulletIntoScope} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    {t('addBullet')}
                  </button>
                </div>
              </div>
            ) : String(scope || '').trim() ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 whitespace-pre-line">{scope}</div>
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
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                                  {t('lineItemDetails')}
                                </label>
                                <button type="button" onClick={() => insertBulletIntoLineItem(index)} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                                  {t('addBullet')}
                                </button>
                              </div>
                              <textarea
                                ref={(element) => {
                                  lineItemTextareaRefs.current[index] = element
                                  if (element) {
                                    autosizeLineItemTextarea(element)
                                  }
                                }}
                                value={item.name}
                                onChange={(event) => handleLineItemTextareaInput(index, event.target.value, event.target)}
                                placeholder={t('enterScopeDetails')}
                                rows={3}
                                className="min-h-[104px] w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
                            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700 whitespace-pre-line break-words">{item.name || t('item')}</div>
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
                  {isEditing ? (
                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">{t('totalPrice')}</label>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm ring-1 ring-slate-100">
                        <div className="flex items-center justify-between gap-3">
                          <input type="text" inputMode="decimal" value={totalInput} onChange={(event) => handleSimpleTotalInput(event.target.value)} onBlur={handleSimpleTotalBlur} className="min-w-0 flex-1 bg-transparent text-lg font-bold text-slate-900 outline-none focus:outline-none" />
                          <div className="shrink-0 rounded-xl bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 ring-1 ring-slate-200">
                            {currency.format(estimateTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-slate-50 px-4 py-4 text-lg font-bold text-slate-900">{currency.format(estimateTotal)}</div>
                  )}
                </>
              )}
            </div>
          </InfoCard>

          {!isDetailedPricing ? (
          <InfoCard title={t('materialsIncluded')}>
            {isEditing ? (
              <button onClick={() => { markDraftDirty(); setMaterialsIncluded((current) => !current) }} className={`w-full rounded-2xl px-4 py-4 text-left text-sm font-bold ${materialsIncluded ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'}`}>
                {materialsIncluded ? `${t('materialsIncluded')}: ${t('yes')}` : `${t('materialsIncluded')}: ${t('no')}`}
              </button>
            ) : (
              <div className={`w-full rounded-2xl px-4 py-4 text-left text-sm font-bold ${materialsIncluded ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'}`}>
                {materialsIncluded ? `${t('materialsIncluded')}: ${t('yes')}` : `${t('materialsIncluded')}: ${t('no')}`}
              </div>
            )}
          </InfoCard>
          ) : null}

          <InfoCard title={t('paymentTerms')}>
            {isEditing ? (
              isKnownPaymentTermValue(paymentTerms) ? (
                <SelectField value={paymentTerms} onChange={(event) => { markDraftDirty(); setPaymentTerms(event.target.value) }} className="bg-slate-50">
                  {paymentTermOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SelectField>
              ) : (
                <textarea value={paymentTerms} onChange={(event) => { markDraftDirty(); setPaymentTerms(event.target.value) }} rows={4} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              )
            ) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 whitespace-pre-line">{getPaymentTermLabel(paymentTerms, estimateT)}</div>
            )}
          </InfoCard>
        </section>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <EstimatePreviewCard {...estimatePreviewProps} />
          {!isEditing && (
            <button disabled={isEstimateActionPending} onClick={() => setIsEditing(true)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('editEstimate')}</button>
          )}
          {isEditing && (
            <button disabled={isSavingEstimate} onClick={saveEstimate} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{isSavingEstimate ? t('saving') : t('saveEstimate')}</button>
          )}
          <button onClick={handlePrint} className="w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-bold text-white hover:bg-slate-800">{shouldUsePdfForPrint ? t('downloadPdf') : t('print')}</button>
          <button onClick={() => setShowPreviewModal(true)} className="hidden w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50 sm:block">{t('previewPdf')}</button>
          <button onClick={handleDownloadPdf} className="hidden w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50 sm:block">{t('downloadPdf')}</button>
          <button disabled={isEstimateActionPending} onClick={() => setShowSendModal(true)} className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{t('sendToCustomer')}</button>
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
              <button disabled={isEstimateActionPending} onClick={onRestoreEstimate} className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"><Undo2 className="mr-2 inline h-4 w-4" />{t('restore')}</button>
              <button disabled={isEstimateActionPending} onClick={() => setConfirmAction({ mode: 'delete' })} className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="mr-2 inline h-4 w-4" />{t('deletePermanently')}</button>
            </>
          ) : (
            <button disabled={isEstimateActionPending} onClick={() => setConfirmAction({ mode: 'archive' })} className={`w-full ${archivePanelButtonClasses} ${isEstimateActionPending ? 'cursor-not-allowed opacity-60' : ''}`.trim()}><Archive className="mr-2 inline h-4 w-4" />{t('archive')}</button>
          )}
        </aside>
      </div>
      <ConfirmRecordModal isOpen={Boolean(confirmAction)} mode={confirmAction?.mode === 'delete' ? 'delete' : 'archive'} title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : confirmAction?.mode === 'sync-contract' ? t('confirmSyncSignedContract') : t('confirmArchive')} message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : confirmAction?.mode === 'sync-contract' ? t('signedContractSyncWarning') : t('archiveHelp')} confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : confirmAction?.mode === 'sync-contract' ? t('syncContractFromEstimate') : t('archive')} onCancel={() => setConfirmAction(null)} onConfirm={async () => { if (confirmAction?.mode === 'archive') { await onArchiveEstimate?.() } if (confirmAction?.mode === 'delete') { await onDeleteEstimate?.(); onBack?.() } if (confirmAction?.mode === 'sync-contract') { await handleSyncContract(true) } setConfirmAction(null) }} t={t} />
      <SendToCustomerModal isOpen={showSendModal} documentType="estimate" customer={{ name: lead.client, phone: lead.phone, email: lead.email }} projectTitle={lead.projectTitle || lead.projectType} amountLabel={t('estimatedTotal')} amountValue={currency.format(estimateTotal)} onClose={() => setShowSendModal(false)} onSent={async () => {
        const result = await persistEstimate({ status: 'Sent' }, { closeSendModal: true })
        return Boolean(result)
      }} t={t} contentT={estimateT} />
      <ModalShell isOpen={showPreviewModal} onBackdropClick={() => setShowPreviewModal(false)} panelClassName="p-2 sm:max-w-[64rem] sm:p-3 lg:max-w-[68rem]">
        <div className="rounded-3xl bg-white text-slate-950">
          <div className="p-1">
            <ScaledDocumentPreview pageWidth={estimatePreviewPageWidth} pagePadding={18}>
              <EstimatePdfTemplate {...estimatePreviewProps} />
            </ScaledDocumentPreview>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={handlePrint} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">{shouldUsePdfForPrint ? t('downloadPdf') : t('print')}</button>
            <button onClick={() => setShowPreviewModal(false)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">{t('close')}</button>
          </div>
        </div>
      </ModalShell>
      <div style={{ pointerEvents: 'none', position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
      <div
          ref={pdfTemplateRef}
          data-estimate-pdf-root="true"
          style={{ width: `${estimatePreviewPageWidth}px`, backgroundColor: '#ffffff', color: '#0f172a', padding: '18px', boxSizing: 'border-box' }}
        >
          <EstimatePdfTemplate {...estimatePreviewProps} />
        </div>
      </div>
    </div>
  )
}

function EstimatePreviewCard(props) {
  return (
    <InfoCard title={props.t('previewEstimate')} bodyClassName="min-w-0 overflow-hidden">
      <div className="rounded-[28px] bg-slate-50 p-2 sm:p-3">
        <ScaledDocumentPreview pageWidth={estimatePreviewPageWidth} pagePadding={18}>
          <EstimatePdfTemplate {...props} />
        </ScaledDocumentPreview>
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
  const [loadedEstimate, setLoadedEstimate] = useState(cachedDirectEstimate)
  const [directLoadState, setDirectLoadState] = useState({ loading: isDirectEstimateRoute, error: '' })
  const [projectAvailable, setProjectAvailable] = useState(!isDirectEstimateRoute)
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

  useEffect(() => {
    let isCancelled = false

    async function loadEstimate() {
      if (isDirectEstimateRoute) {
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
          setProjectAvailable(false)
          setDirectLoadState({ loading: false, error: t('estimateNotFound') })
          return
        }

        const relatedProjectId = directEstimate.projectId || directEstimate.project_id || null
        if (!relatedProjectId) {
          setProjectAvailable(false)
        } else if (USE_SUPABASE || USE_SUPABASE_ESTIMATES) {
          const projectResponse = await dataProvider.projects.getById(relatedProjectId, { contractorId })
          if (!isCancelled) setProjectAvailable(Boolean(!projectResponse?.error && projectResponse?.data?.id))
        } else {
          setProjectAvailable(Boolean(findLeadByProjectLookup(leads, relatedProjectId)))
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

  if (isDirectEstimateRoute && directLoadState.loading && !resolvedEstimate) {
    return <div className="min-h-64 rounded-3xl border border-slate-200 bg-white shadow-sm" aria-busy="true" />
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

  return (
    <EstimateBuilderPage
      lead={mergedLead}
      clientRecord={clientRecord}
      t={t}
      appLanguage={appLanguage}
      companySettings={companySettings}
      onBack={handleBack}
      backLabel={backLabel}
      isArchived={Boolean(resolvedEstimate?.archivedAt || resolvedEstimate?.archived_at || archivedIds.includes(lead.id))}
      projectAvailable={isDirectEstimateRoute ? projectAvailable : true}
      onSaveEstimate={async (estimate) => {
        const result = await onSaveEstimate?.(lead.id, estimate)
        if (result) {
          setLoadedEstimate(result)
        }
        return result
      }}
      onSendEstimate={async (estimate) => {
        const result = await onSaveEstimate?.(lead.id, estimate)
        if (result) {
          setLoadedEstimate(result)
        }
        return result
      }}
      onConvert={async (estimate) => onConvertEstimate?.(lead.id, estimate)}
      onSyncContract={async (estimate, options = {}) => onSyncEstimateContract?.(lead.id, estimate, options)}
      onOpenContract={() => navigate(`/projects/${lead.projectId || lead.id}/contract`, { state: { source: 'estimate', projectId: lead.projectId || lead.id, leadId: lead.id } })}
      onArchiveEstimate={() => onArchiveEstimate?.(resolvedEstimate?.id || lead.id, resolvedEstimate || lead.portal?.estimate || null)}
      onRestoreEstimate={() => onRestoreEstimate?.(resolvedEstimate?.id || lead.id, resolvedEstimate || lead.portal?.estimate || null)}
      onDeleteEstimate={() => onDeleteEstimate?.(resolvedEstimate?.id || lead.id, resolvedEstimate || lead.portal?.estimate || null)}
    />
  )
}

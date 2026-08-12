import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, MoreVertical } from 'lucide-react'
import { ActionMenu } from '../components/common/ActionMenu'
import { ContractPdfTemplate } from '../components/contracts/ContractPdfTemplate'
import { PaginatedContractPreview } from '../components/contracts/PaginatedContractPreview'
import { SelectField } from '../components/ui/SelectField'
import { currency } from '../utils/formatters'
import { getPortalData } from '../utils/portal'
import { SendToCustomerModal } from '../components/common/SendToCustomerModal'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import dataProvider from '../services/dataProvider'
import { ModalShell } from '../components/common/ModalShell'
import { defaultDocumentPreviewWidth } from '../components/common/ScaledDocumentPreview'
import { useToast } from '../components/common/ToastProvider'
import { useAuth } from '../contexts/AuthContext'
import { USE_SUPABASE, USE_SUPABASE_CONTRACTS } from '../config/backendConfig'
import { getProjectsContractorId } from '../services/system/projectsRuntimeService'
import { readLinkedContractDraft } from '../utils/contractLinks'
import { formatContractDisplayNumber, generateContractNumber } from '../utils/contractNumber'
import { printDocumentElement } from '../utils/printDocument'
import { dedupeById, findLeadByProjectLookup, resolveLinkedProjectId } from '../utils/projectIdentity'
import { createTranslator } from '../translations'
import { findRelatedClient } from '../utils/clients'
import { buildContractNotesAndTermsItems, buildContractWorkBreakdownFromEstimate, buildGeneratedContractPaymentTerms, hasContractWorkBreakdown, normalizeContractWorkBreakdown, resolveContractAcceptanceLegalText, stripLeadingBulletMarker } from '../utils/contractDocument'
import { normalizeDocumentLanguageOverride, resolveClientFacingLanguage } from '../utils/language'
import { ESTIMATE_PAPER_MARGIN } from '../utils/estimatePagination'

function formatContractDate(value, language = 'en') {
  const locale = language === 'es' ? 'es-ES' : 'en-US'

  if (!value) {
    return new Date().toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })
}

const contractPreviewPageWidth = defaultDocumentPreviewWidth

function isArchivedContractRecord(contract = {}) {
  return Boolean(
    contract?.archivedAt
      || contract?.archived_at
      || contract?.isArchived
      || contract?.archived
  )
}

function selectPreferredContractRecord(contracts = []) {
  if (!Array.isArray(contracts) || contracts.length === 0) {
    return null
  }

  return contracts.find((contract) => !isArchivedContractRecord(contract)) || contracts[0]
}

function buildContractEditorState({ lead, portal, savedContract, estimate, contractTotal, t }) {
  const savedWorkBreakdown = normalizeContractWorkBreakdown(savedContract.workBreakdown || [])
  const estimateWorkBreakdown = buildContractWorkBreakdownFromEstimate(estimate)
  const workBreakdown = savedWorkBreakdown.length > 0
    ? savedWorkBreakdown
    : savedContract?.id
      ? []
      : estimateWorkBreakdown
  const depositAmount = savedContract.depositAmount ?? savedContract.deposit_amount ?? null
  const acceptanceLegalText = resolveContractAcceptanceLegalText({
    acceptanceLegalText: savedContract.acceptanceLegalText,
    legacyAcceptanceText: savedContract.warrantyDisclaimer,
    t,
  })

  return {
    scope: savedContract.scope || savedContract.scopeOfWork || estimate.summary || estimate.scopeOfWork || '',
    workBreakdown,
    paymentTerms: buildGeneratedContractPaymentTerms({
      paymentTerms: savedContract.paymentTerms || estimate.paymentTerms || '',
      total: contractTotal,
      depositAmount,
      t,
    }),
    acceptanceLegalText,
    materials: savedContract.materials || t('materialsText'),
    timeline: savedContract.timeline || `${t('timelineTextPrefix')} ${portal.startDate}. ${t('estimatedCompletion')} ${portal.estimatedCompletion}.`,
    changeOrders: savedContract.changeOrders || t('changeOrdersText'),
    clientResponsibilities: savedContract.clientResponsibilities || t('clientResponsibilitiesText'),
    warrantyDisclaimer: savedContract.warrantyDisclaimer || t('warrantyDisclaimerText'),
    depositAmount,
  }
}

export function ContractPreviewPage({ lead, clientRecord = null, t, appLanguage = 'en', companySettings, onBack, backLabel, onSaveContract, onMarkSigned, onMarkUnsigned, onArchiveContract }) {
  const { showToast } = useToast()
  const pdfTemplateRef = useRef(null)
  const { contractor, company, session } = useAuth()
  const contractorId = getProjectsContractorId({ contractor, company, session })
  const portal = getPortalData(lead)
  const savedContract = lead.portal?.contract || readLinkedContractDraft(lead, [lead.id, lead.projectId, lead.estimateId]) || portal.contract || {}
  const estimate = lead.portal?.estimate || portal.estimate || {}
  const [showSendModal, setShowSendModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSavingContract, setIsSavingContract] = useState(false)
  const contractSaveGuardRef = useRef(false)
  const [contractLanguage, setContractLanguage] = useState(
    normalizeDocumentLanguageOverride(savedContract.contractLanguage || estimate?.estimateLanguage)
  )
  const contractOutputLanguage = resolveClientFacingLanguage({
    documentLanguage: contractLanguage,
    client: clientRecord,
    lead,
    appLanguage,
  })
  const contractT = useMemo(() => createTranslator(contractOutputLanguage), [contractOutputLanguage])
  const contractTotal = Number(savedContract.total || lead.portal?.contractAmount || lead.portal?.estimate?.total || lead.value || 0)
  const editorState = buildContractEditorState({ lead, portal, savedContract, estimate, contractTotal, t: contractT })
  const [scope, setScope] = useState(editorState.scope)
  const [workBreakdown, setWorkBreakdown] = useState(editorState.workBreakdown)
  const [paymentTerms, setPaymentTerms] = useState(editorState.paymentTerms)
  const [acceptanceLegalText, setAcceptanceLegalText] = useState(editorState.acceptanceLegalText)
  const [materials, setMaterials] = useState(editorState.materials)
  const [timeline, setTimeline] = useState(editorState.timeline)
  const [changeOrders, setChangeOrders] = useState(editorState.changeOrders)
  const [clientResponsibilities, setClientResponsibilities] = useState(editorState.clientResponsibilities)
  const [warrantyDisclaimer, setWarrantyDisclaimer] = useState(editorState.warrantyDisclaimer)
  const [depositAmount, setDepositAmount] = useState(editorState.depositAmount)
  const previewContractDate = useMemo(
    () => formatContractDate(savedContract.signedDate || savedContract.updatedAt || lead.portal?.contract?.updatedAt || new Date(), contractOutputLanguage),
    [contractOutputLanguage, lead.portal?.contract?.updatedAt, savedContract.signedDate, savedContract.updatedAt]
  )
  const notesAndTermsItems = useMemo(
    () => buildContractNotesAndTermsItems({
      paymentTerms,
      total: contractTotal,
      depositAmount,
      acceptanceLegalText,
      legacyAcceptanceText: warrantyDisclaimer,
      t: contractT,
    }),
    [acceptanceLegalText, contractT, contractTotal, depositAmount, paymentTerms, warrantyDisclaimer]
  )
  const previewContractNumber = useMemo(
    () => formatContractDisplayNumber(savedContract.number || generateContractNumber(lead), { ...lead, ...savedContract }),
    [lead, savedContract]
  )
  const contractPreviewProps = useMemo(() => ({
    company: companySettings?.company,
    lead,
    contractNumber: previewContractNumber,
    contractDate: previewContractDate,
    notesAndTermsItems,
    scope,
    workBreakdown,
    total: contractTotal,
    t: contractT,
  }), [companySettings?.company, contractT, contractTotal, lead, notesAndTermsItems, previewContractDate, previewContractNumber, scope, workBreakdown])
  const isSigned = Boolean(
    savedContract?.status === 'Signed'
      || savedContract?.signed
      || savedContract?.signedDate
      || savedContract?.signedAt
      || savedContract?.signed_at
  )

  function resetEditorState() {
    const nextState = buildContractEditorState({
      lead,
      portal: getPortalData(lead),
      savedContract: lead.portal?.contract || {},
      estimate: lead.portal?.estimate || {},
      contractTotal,
      t: contractT,
    })

    setScope(nextState.scope)
    setWorkBreakdown(nextState.workBreakdown)
    setPaymentTerms(nextState.paymentTerms)
    setAcceptanceLegalText(nextState.acceptanceLegalText)
    setMaterials(nextState.materials)
    setTimeline(nextState.timeline)
    setChangeOrders(nextState.changeOrders)
    setClientResponsibilities(nextState.clientResponsibilities)
    setWarrantyDisclaimer(nextState.warrantyDisclaimer)
    setDepositAmount(nextState.depositAmount)
  }

  useEffect(() => {
    setContractLanguage(normalizeDocumentLanguageOverride(savedContract.contractLanguage || estimate?.estimateLanguage))
  }, [estimate?.estimateLanguage, savedContract.contractLanguage, lead.id, lead.portal?.contract?.updatedAt, lead.portal?.contract?.signedDate])

  useEffect(() => {
    if (!isEditing) {
      resetEditorState()
    }
  }, [contractLanguage, contractT, contractTotal, isEditing, lead.id, lead.portal?.contract?.updatedAt, lead.portal?.contract?.signedDate, lead.portal?.estimate?.updatedAt, portal.estimatedCompletion, portal.startDate])

  function getContractPayload(extra = {}) {
    return {
      id: savedContract.id || undefined,
      number: savedContract.number || generateContractNumber(lead),
      contractorId: savedContract.contractorId || contractorId || undefined,
      leadId: savedContract.leadId || lead.id,
      clientId: savedContract.clientId || lead.clientId || lead.client_id || null,
      projectId: savedContract.projectId || lead.projectId || lead.project_id || lead.id,
      estimateId: savedContract.estimateId || lead.estimateId || lead.portal?.estimate?.id || null,
      projectTitle: savedContract.projectTitle || lead.projectTitle || lead.projectType || 'Contract',
      title: savedContract.title || lead.projectTitle || lead.projectType || 'Contract',
      status: savedContract.status || 'Draft',
      signedDate: savedContract.signedDate || '',
      contractLanguage: contractLanguage || '',
      scope,
      workBreakdown,
      paymentTerms,
      acceptanceLegalText,
      depositAmount,
      materials,
      timeline,
      changeOrders,
      clientResponsibilities,
      warrantyDisclaimer,
      total: contractTotal,
      updatedAt: new Date().toISOString(),
      ...extra,
    }
  }

  async function openContractPrintDialog() {
    try {
      await printDocumentElement(pdfTemplateRef.current, {
        documentTitle: `${previewContractNumber} ${lead?.client || ''}`.trim(),
        pageMarginInches: ESTIMATE_PAPER_MARGIN / 72,
        safeInsetInches: 0,
      })
    } catch (error) {
      showToast(error?.message || t('contractPdfGenerateFailed'), 'error')
    }
  }

  async function persistContract(payload, { errorKey = 'contractSaveFailed', stopEditing = false, resetEditingState = false, onPersist = null } = {}) {
    if (contractSaveGuardRef.current) {
      return null
    }

    contractSaveGuardRef.current = true
    setIsSavingContract(true)

    try {
      const existing = savedContract || {}

      const response = existing && existing.id
        ? await dataProvider.contracts.update(existing.id, payload, { contractorId })
        : await dataProvider.contracts.create(payload, { contractorId })

      if (response?.error) {
        showToast(response.error.message || t(errorKey), 'error')
        return null
      }

      const persistedContract = {
        ...payload,
        ...(response?.data || {}),
      }

      await onPersist?.(persistedContract)

      if (stopEditing) {
        setIsEditing(false)
      }

      if (resetEditingState && isEditing) {
        resetEditorState()
      }

      return persistedContract
    } catch (err) {
      console.warn('Contract persistence via dataProvider failed', err)
      showToast(err?.message || t(errorKey), 'error')
      return null
    } finally {
      contractSaveGuardRef.current = false
      setIsSavingContract(false)
    }
  }

  async function saveContract() {
    const payload = getContractPayload()
    return persistContract(payload, {
      errorKey: 'contractSaveFailed',
      stopEditing: true,
      onPersist: async (persistedContract) => {
        await onSaveContract?.(persistedContract)
      },
    })
  }

  async function markSent() {
    const payload = getContractPayload({ status: 'Sent' })
    return persistContract(payload, {
      errorKey: 'contractSaveFailed',
      onPersist: async (persistedContract) => {
        await onSaveContract?.(persistedContract)
      },
    })
  }

  async function markSigned() {
    const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    const payload = getContractPayload({ status: 'Signed', signedDate: savedContract.signedDate || today })
    return persistContract(payload, {
      errorKey: 'contractSignFailed',
      stopEditing: true,
      resetEditingState: true,
      onPersist: async (persistedContract) => {
        await onMarkSigned?.(persistedContract)
      },
    })
  }

  async function markUnsigned() {
    const payload = getContractPayload({
      status: 'Draft',
      signed: false,
      signedDate: '',
      signedAt: null,
      signed_at: null,
      signedBy: '',
      signed_by: '',
    })
    return persistContract(payload, {
      errorKey: 'contractUpdateFailed',
      stopEditing: true,
      resetEditingState: true,
      onPersist: async (persistedContract) => {
        await onMarkUnsigned?.({
          ...persistedContract,
          status: 'Draft',
          signed: false,
          signedDate: '',
          signedAt: null,
          signedBy: '',
        })
      },
    })
  }

  function cancelEditing() {
    resetEditorState()
    setIsEditing(false)
  }

  async function handleArchiveContract() {
    const archivedContract = await onArchiveContract?.(savedContract)

    if (archivedContract) {
      setConfirmAction(null)
      onBack?.()
    }
  }

  const moreMenuItems = [
    {
      id: 'download-contract-pdf',
      label: t('saveAsPdf'),
      onClick: openContractPrintDialog,
    },
    {
      id: 'archive-contract',
      label: t('archiveContract'),
      onClick: () => setConfirmAction({ mode: 'archive' }),
      disabled: isSavingContract || !savedContract?.id,
      className: 'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50',
      icon: <Archive className="h-4 w-4" />,
    },
    isSigned
      ? {
          id: 'mark-contract-unsigned',
          label: t('markAsUnsigned'),
          onClick: markUnsigned,
          disabled: isSavingContract,
          className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
        }
      : null,
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> {backLabel || t('backToProjectWorkspace')}</button>
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-xl sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('contractPreview')}</p>
        <h1 className="mt-2 text-3xl font-bold">{lead.projectTitle || lead.projectType}</h1>
        <p className="mt-2 break-words text-slate-300">{lead.client} · {lead.address || lead.location}</p>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-5 rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
          <p className="text-base font-bold text-slate-950">{t('contractLanguage')}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t('contractLanguageHelp')}</p>
          <div className="mt-3 max-w-sm">
            <SelectField value={contractLanguage} onChange={(event) => setContractLanguage(event.target.value)} className="bg-white">
              <option value="">{t('matchAppLanguage')}</option>
              <option value="en">{t('english')}</option>
              <option value="es">{t('spanish')}</option>
            </SelectField>
          </div>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {isEditing ? (
            <button disabled={isSavingContract} onClick={saveContract} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-400">{isSavingContract ? t('saving') : t('saveContract')}</button>
          ) : (
            <button onClick={() => setIsEditing(true)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold">{t('editContract')}</button>
          )}
          <button onClick={() => setShowPreviewModal(true)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold">{t('previewPdf')}</button>
          <button onClick={openContractPrintDialog} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">{t('print')}</button>
          {!isSigned ? <button disabled={isSavingContract} onClick={markSigned} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{isSavingContract ? t('saving') : t('markAsSigned')}</button> : <div className="hidden xl:block" />}
          <button disabled={isSavingContract} onClick={() => setShowSendModal(true)} className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{t('sendToCustomer')}</button>
          <ActionMenu label={<MoreVertical className="h-4 w-4" />} ariaLabel={t('more')} showChevron={false} buttonClassName="inline-flex min-h-[50px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50" items={moreMenuItems} buttonDisabled={isSavingContract} />
        </div>
        <ContractDocument
          isEditing={isEditing}
          lead={lead}
          company={companySettings?.company}
          contractDate={previewContractDate}
          contractNumber={previewContractNumber}
          notesAndTermsItems={notesAndTermsItems}
          contractTotal={contractTotal}
          scope={scope}
          workBreakdown={workBreakdown}
          setScope={setScope}
          paymentTerms={paymentTerms}
          setPaymentTerms={setPaymentTerms}
          acceptanceLegalText={acceptanceLegalText}
          setAcceptanceLegalText={setAcceptanceLegalText}
          contractT={contractT}
          t={t}
        />
        {isEditing ? (
          <button disabled={isSavingContract} onClick={cancelEditing} className="mt-4 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">{t('cancelEditing')}</button>
        ) : null}
      </section>
      <SendToCustomerModal isOpen={showSendModal} documentType="contract" customer={{ name: lead.client, phone: lead.phone, email: lead.email }} projectTitle={lead.projectTitle || lead.projectType} amountLabel={t('projectTotal')} amountValue={currency.format(contractTotal)} onClose={() => setShowSendModal(false)} onSent={async () => {
        const result = await markSent()
        return Boolean(result)
      }} t={t} contentT={contractT} />
      <ModalShell isOpen={showPreviewModal} onBackdropClick={() => setShowPreviewModal(false)} panelClassName="p-2 sm:max-w-[64rem] sm:p-3 lg:max-w-[68rem]">
        <div className="rounded-3xl bg-white text-slate-950">
          <div className="p-1">
            <PaginatedContractPreview t={contractT}>
              <ContractPdfTemplate {...contractPreviewProps} />
            </PaginatedContractPreview>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={openContractPrintDialog} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">{t('print')}</button>
            <button onClick={() => setShowPreviewModal(false)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">{t('close')}</button>
          </div>
        </div>
      </ModalShell>
      <ConfirmRecordModal
        isOpen={Boolean(confirmAction)}
        mode="archive"
        title={t('confirmArchiveContract')}
        message={t('archiveContractHelp')}
        confirmLabel={t('archiveContract')}
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleArchiveContract}
        t={t}
      />
      <div style={{ pointerEvents: 'none', position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
        <div
          ref={pdfTemplateRef}
          data-contract-pdf-root="true"
          style={{ width: `${contractPreviewPageWidth}px`, backgroundColor: '#ffffff', color: '#0f172a', padding: 0, boxSizing: 'border-box' }}
        >
          <ContractPdfTemplate {...contractPreviewProps} />
        </div>
      </div>
    </div>
  )
}

function ContractDocument({ isEditing, lead, company, contractDate, contractNumber, notesAndTermsItems, contractTotal, scope, workBreakdown, setScope, paymentTerms, setPaymentTerms, acceptanceLegalText, setAcceptanceLegalText, contractT, t }) {
  return (
    <div className="space-y-5 text-sm leading-6 text-slate-700">
      {!isEditing ? (
        <div className="overflow-hidden rounded-[28px] bg-slate-50 p-2 sm:p-3">
          <PaginatedContractPreview t={contractT}>
            <ContractPdfTemplate
              company={company}
              lead={lead}
              contractNumber={contractNumber}
              contractDate={contractDate}
              notesAndTermsItems={notesAndTermsItems}
              scope={scope}
              workBreakdown={workBreakdown}
              total={contractTotal}
              t={contractT}
            />
          </PaginatedContractPreview>
        </div>
      ) : null}
      {isEditing ? (
        <>
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <DocumentCompanyHeader company={company} t={t} />
            <div className="min-w-0 sm:text-right">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-500">{t('contract')}</p>
              <p className="mt-1 break-words text-sm font-bold text-slate-900">{contractNumber}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{t('date')}</p>
              <p className="mt-1 break-words text-sm text-slate-600">{contractDate}</p>
            </div>
          </div>
          {hasContractWorkBreakdown(workBreakdown) ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-base font-bold text-slate-950">{t('workBreakdown')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{t('contractWorkBreakdownHelp')}</p>
              <ContractWorkBreakdownList workBreakdown={workBreakdown} t={contractT} />
            </div>
          ) : null}
          <ContractSection title={t('projectScope')} value={scope} onChange={setScope} isEditing={isEditing} highlighted />
          <ContractSection title={t('paymentTerms')} value={paymentTerms} onChange={setPaymentTerms} isEditing={isEditing} />
          <ContractSection title={t('acceptanceLegalConfirmation')} value={acceptanceLegalText} onChange={setAcceptanceLegalText} isEditing={isEditing} />
        </>
      ) : null}
    </div>
  )
}

function DocumentCompanyHeader({ company, t }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {company?.logo ? (
        <img src={company.logo} alt="" className="h-14 w-14 rounded-2xl object-cover ring-1 ring-slate-200" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">{t('brandInitials')}</div>
      )}
      <div className="min-w-0">
        <p className="break-words font-bold text-slate-950">{company?.name || t('brandName')}</p>
        <p className="break-words text-sm text-slate-600">{company?.phone || ''}</p>
        <p className="break-words text-sm text-slate-600">{company?.email || ''}</p>
        <p className="break-words text-sm text-slate-600">{company?.address || ''}</p>
      </div>
    </div>
  )
}

function ContractWorkBreakdownList({ workBreakdown = [], t }) {
  const normalizedWorkBreakdown = normalizeContractWorkBreakdown(workBreakdown)

  if (normalizedWorkBreakdown.length === 0) {
    return null
  }

  return (
    <div className="mt-4 space-y-3">
      {normalizedWorkBreakdown.map((item, index) => (
        <div key={item.id || `${item.title}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-950">{item.title || t('item')}</p>
              {typeof item.materialsIncluded === 'boolean' ? (
                <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {item.materialsIncluded ? t('includesMaterials') : t('materialsNotIncluded')}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-sm font-bold text-slate-950">{currency.format(item.amount)}</p>
          </div>
          {item.details.length > 0 ? (
            <div className="mt-3 space-y-2">
              {item.details.map((detail, detailIndex) => (
                <div key={`${item.id}-${detailIndex}`} className="grid grid-cols-[10px_minmax(0,1fr)] gap-2 text-sm leading-6 text-slate-700">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-500" />
                  <span className="whitespace-pre-wrap break-words">{stripLeadingBulletMarker(detail)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ContractSection({ title, value, onChange, isEditing, highlighted = false }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-bold text-slate-950">{title}</h2>
      {isEditing ? (
        <textarea value={value} onChange={(event) => onChange?.(event.target.value)} rows={3} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
      ) : (
        <div className={`${highlighted ? 'rounded-2xl bg-slate-50 p-4' : ''} whitespace-pre-line break-words text-sm leading-6 text-slate-700`}>{value}</div>
      )}
    </section>
  )
}


function ScaledContractPreview({ children }) {
  const containerRef = useRef(null)
  const contentRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const containerNode = containerRef.current
    const contentNode = contentRef.current
    if (!containerNode || !contentNode) return undefined

    const updateLayout = () => {
      const nextWidth = containerNode.clientWidth || contractPreviewPageWidth
      const nextScale = Math.min(1, nextWidth / contractPreviewPageWidth)
      setScale(nextScale)
      setContentHeight(contentNode.offsetHeight || 0)
    }

    updateLayout()

    const resizeObserver = new ResizeObserver(() => {
      updateLayout()
    })

    resizeObserver.observe(containerNode)
    resizeObserver.observe(contentNode)
    window.addEventListener('resize', updateLayout)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateLayout)
    }
  }, [children])

  return (
    <div ref={containerRef} className="w-full max-w-full overflow-hidden">
      <div style={{ height: contentHeight ? `${contentHeight * scale}px` : 'auto' }}>
        <div className="flex w-full justify-center overflow-hidden">
          <div
            ref={contentRef}
            style={{
              width: `${contractPreviewPageWidth}px`,
              maxWidth: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
            }}
          >
            <div
              style={{
                width: `${contractPreviewPageWidth}px`,
                backgroundColor: '#ffffff',
                color: '#0f172a',
                padding: '18px',
                boxSizing: 'border-box',
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ContractRoute({ companySettings, leads, clients = [], onSaveContract, onMarkContractSigned, onMarkContractUnsigned, onArchiveContract, t, appLanguage = 'en' }) {
  const { id, leadId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { contractor, company, session } = useAuth()
  const contractorId = getProjectsContractorId({ contractor, company, session })
  const projectId = location.state?.projectId || id || leadId
  const contractSource = location.state?.source || 'project'
  const sourceLeadId = location.state?.leadId || null
  const lead = findLeadByProjectLookup(leads, projectId)
  const [loadedContract, setLoadedContract] = useState(null)
  const backLabel = contractSource === 'estimate' ? t('backToEstimateBuilder') : t('backToProjectWorkspace')

  function handleBack() {
    if (contractSource === 'estimate' && projectId) {
      navigate(`/projects/${projectId}/estimate`, {
        state: {
          source: 'project',
          projectId,
          leadId: sourceLeadId || lead?.id || null,
        },
      })
      return
    }

    if (projectId) {
      navigate(`/projects/${projectId}`)
      return
    }

    navigate('/dashboard')
  }

  useEffect(() => {
    let isCancelled = false

    async function loadContract() {
      if (!lead?.id || (!USE_SUPABASE && !USE_SUPABASE_CONTRACTS)) {
        setLoadedContract(null)
        return
      }

      const cachedContract = readLinkedContractDraft(lead, [lead.id, lead.projectId, lead.estimateId])
      const knownContractId = lead.contractId || lead.portal?.contract?.id || cachedContract?.id || null
      const relatedProjectId = lead.projectId || lead.project_id || projectId || null

      try {
        if (knownContractId) {
          const response = await dataProvider.contracts.getById(knownContractId, { contractorId })

          if (!isCancelled && !response?.error && response?.data) {
            setLoadedContract({ ...(cachedContract || {}), ...response.data })
            return
          }
        }

        const response = await dataProvider.contracts.list({
          contractorId,
          includeArchived: true,
          ...(lead.estimateId ? { estimateId: lead.estimateId } : relatedProjectId ? { projectId: relatedProjectId } : {}),
        })

        if (isCancelled || response?.error) {
          if (!isCancelled) {
            setLoadedContract(cachedContract)
          }
          return
        }

        const persistedContract = selectPreferredContractRecord(response?.data)
        setLoadedContract(persistedContract ? { ...(cachedContract || {}), ...persistedContract } : cachedContract)
      } catch (error) {
        if (!isCancelled) {
          setLoadedContract(readLinkedContractDraft(lead, [lead.id, lead.projectId, lead.estimateId]))
        }
      }
    }

    loadContract()

    return () => {
      isCancelled = true
    }
  }, [contractorId, lead?.estimateId, lead?.id, lead?.projectId, lead?.project_id, projectId])

  if (!lead) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">{t('projectNotFound')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{t('projectNotFoundHelp')}</p>
        <button onClick={() => navigate('/dashboard')} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
          {t('backToDashboardAction')}
        </button>
      </section>
    )
  }

  const clientRecord = findRelatedClient(clients, lead || {})

  const mergedLead = loadedContract
    ? {
        ...lead,
        portal: {
          ...(lead.portal || {}),
          contract: loadedContract,
        },
      }
    : lead

  return (
    <ContractPreviewPage
      lead={mergedLead}
      clientRecord={clientRecord}
      t={t}
      appLanguage={appLanguage}
      companySettings={companySettings}
      onBack={handleBack}
      backLabel={backLabel}
      onSaveContract={(contract) => onSaveContract?.(lead.id, contract)}
      onMarkSigned={(contract) => onMarkContractSigned?.(lead.id, contract)}
      onMarkUnsigned={(contract) => onMarkContractUnsigned?.(lead.id, contract)}
      onArchiveContract={(contract) => onArchiveContract?.(lead.id, contract)}
    />
  )
}

export function ContractsPage({ leads, contracts = [], onViewContract, t }) {
  const usesSupabaseContracts = USE_SUPABASE || USE_SUPABASE_CONTRACTS
  const contractRows = usesSupabaseContracts && contracts.length > 0
    ? dedupeById(
      contracts.filter((contract) => !isArchivedContractRecord(contract)),
      ['projectId', 'project_id', 'estimateId', 'estimate_id', 'number', 'contractNumber']
    ).map((contract) => {
      const linkedLead = findLeadByProjectLookup(leads, contract?.projectId, contract?.project_id, contract?.leadId, contract?.lead_id)
        || leads.find((lead) => contract?.estimateId && contract.estimateId === lead.estimateId)
        || null

      return {
        id: contract.id,
        routeId: resolveLinkedProjectId(linkedLead, contract.projectId || contract.project_id || contract.leadId || contract.lead_id || contract.id),
        client: linkedLead?.client || contract.client || t('customer'),
        projectTitle: linkedLead?.projectTitle || linkedLead?.projectType || contract.projectTitle || contract.title || t('contract'),
        status: contract.status || t('draft'),
      }
    })
    : leads
        .filter((lead) => !isArchivedContractRecord(lead.portal?.contract) && (lead.portal?.contract?.id || lead.portal?.contract?.number || lead.portal?.contract?.contractNumber))
        .map((lead) => ({
        id: lead.id,
        routeId: lead.projectId || lead.project_id || lead.id,
        client: lead.client,
        projectTitle: lead.projectTitle || lead.projectType,
        status: lead.portal?.contract?.status || t('draft'),
      }))

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-slate-800 p-6 text-white shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('contracts')}</p>
        <h1 className="mt-2 text-3xl font-bold">{t('contracts')}</h1>
        <p className="mt-2 text-sm text-slate-300">{t('contractsComingDescription')}</p>
      </section>
      <section className="grid gap-4">
        {contractRows.map((contract) => (
          <article key={contract.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-bold text-slate-950">{contract.client}</p>
                <p className="text-sm text-slate-500">{contract.projectTitle}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{contract.status}</p>
              </div>
              <button onClick={() => onViewContract(contract.routeId)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">
                {t('openContract')}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

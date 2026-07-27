import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, BriefcaseBusiness, CheckCircle2, ChevronRight, ClipboardList, Copy, Edit3, Trash2, Undo2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionMenu } from '../components/common/ActionMenu'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { useToast } from '../components/common/ToastProvider'
import { LeadFormModal } from '../components/leads/LeadFormModal'
import { getLeadProgressStageLabelKey, LeadProgress } from '../components/leads/LeadProgress'
import { DetailRow } from '../components/ui/DetailRow'
import { InfoCard } from '../components/ui/InfoCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { USE_SUPABASE_LEADS } from '../config/backendConfig'
import { useAuth } from '../contexts/AuthContext'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import dataProvider from '../services/dataProvider'
import { getLeadsContractorId } from '../services/system/leadsRuntimeService'
import { getEstimateForLead, getEstimatedValueForLead, readLinkedEstimateDraft, writeLinkedEstimateDrafts } from '../utils/estimateLinks'
import { currency } from '../utils/formatters'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { getLeadNextStepKey, getLeadPipelineStage, getLeadPipelineStageLabelKey, getLeadPrimaryAction, leadPipelineStages } from '../utils/leadPipeline'
import { getRecordDetailsTitleKey } from '../utils/recordDetailsTitle'

function logLeadDetailDevError(message, error, meta) {
  if (!import.meta.env.DEV) return

  // eslint-disable-next-line no-console
  console.error(message, {
    error,
    ...meta,
  })
}

function hasSavedEstimate(estimate) {
  if (!estimate || typeof estimate !== 'object') return false

  if (estimate.id || estimate.updatedAt || estimate.updated_at) return true
  if (Array.isArray(estimate.lineItems) && estimate.lineItems.length > 0) return true
  if (estimate.total !== undefined || estimate.totalAmount !== undefined) return true
  return Boolean(estimate.number)
}

function createSafeLead(lead, fallbackId = '') {
  if (!lead) return null

  const clientName = lead.client || lead.clientName || lead.customerName || lead.name || ''
  const projectTitle = lead.projectTitle || lead.title || lead.projectType || ''
  const projectType = lead.projectType || projectTitle
  const linkedEstimate = getEstimateForLead(lead, [lead?.portal?.estimate, readLinkedEstimateDraft(lead, fallbackId)])
  const estimateDrivenValue = getEstimatedValueForLead(lead, [linkedEstimate])

  return {
    ...lead,
    id: lead.id || fallbackId,
    client: clientName,
    clientName,
    customerName: clientName,
    phone: lead.phone || '',
    email: lead.email || '',
    address: lead.address || lead.location || '',
    location: lead.location || lead.address || '',
    clientLanguage: lead.clientLanguage || lead.preferredLanguage || lead.preferred_language || lead.language || '',
    title: lead.title || projectTitle,
    projectTitle,
    projectType,
    value: estimateDrivenValue,
    estimatedValue: estimateDrivenValue,
    source: lead.source || '',
    priority: lead.priority || 'Medium',
    notes: lead.notes || '',
    nextStep: '',
    status: lead.status || 'New Lead',
    archivedAt: lead.archivedAt || lead.archived_at || null,
    isArchived: Boolean(lead.isArchived || lead.archivedAt || lead.archived_at),
    createdAt: lead.createdAt || lead.created_at || null,
    updatedAt: lead.updatedAt || lead.updated_at || null,
    projectId: lead.projectId || lead.project_id || null,
    leadPipelineStage: lead.leadPipelineStage || lead.lead_pipeline_stage || getLeadPipelineStage(lead),
  }
}

function LeadNotFound({ onBack, t }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-slate-950">{t('leadNotFound')}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{t('leadNotFoundHelp')}</p>
      <button onClick={onBack} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
        {t('backToLeads')}
      </button>
    </section>
  )
}

export function LeadDetailPage({
  lead,
  clients = [],
  archivedIds = [],
  onBack,
  onOpenProject,
  onDuplicateLead,
  onConvertLeadToJob,
  onTransitionLeadStage,
  onUpdateLead,
  onArchiveLead,
  onRestoreLead,
  onDeleteLead,
  language = 'en',
  t,
}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { contractor, company, session } = useAuth()
  const { isAnalyticsMode } = useAnalyticsMode()
  const contractorId = getLeadsContractorId({ contractor, company, session })
  const leadId = id || lead?.id || ''
  const [record, setRecord] = useState(USE_SUPABASE_LEADS ? null : lead)
  const [isLoading, setIsLoading] = useState(Boolean(USE_SUPABASE_LEADS))
  const [hasLoaded, setHasLoaded] = useState(!USE_SUPABASE_LEADS)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [isLeadActionSubmitting, setIsLeadActionSubmitting] = useState(false)
  const [estimateRecord, setEstimateRecord] = useState(() => readLinkedEstimateDraft(lead || leadId, leadId || lead?.id || ''))
  const leadActionGuardRef = useRef(false)
  const mergedLead = useMemo(() => {
    const baseLead = USE_SUPABASE_LEADS ? record : (record || lead)

    if (!baseLead) return null
    if (!hasSavedEstimate(estimateRecord)) return baseLead

    const nextEstimate = {
      ...(baseLead.portal?.estimate || {}),
      ...estimateRecord,
    }
    const estimateValue = getEstimatedValueForLead({
      ...baseLead,
      portal: {
        ...(baseLead.portal || {}),
        estimate: nextEstimate,
      },
    }, [nextEstimate])

    return {
      ...baseLead,
      value: estimateValue,
      estimatedValue: estimateValue,
      portal: {
        ...(baseLead.portal || {}),
        estimate: nextEstimate,
      },
    }
  }, [estimateRecord, lead, record])
  const currentLead = useMemo(() => createSafeLead(mergedLead, leadId), [leadId, mergedLead])
  const isArchived = Boolean(currentLead?.isArchived || archivedIds.includes(currentLead?.id))
  const currentEstimate = currentLead?.portal?.estimate || null
  const leadHasEstimate = hasSavedEstimate(currentEstimate)
  const currentStage = getLeadPipelineStage({
    ...currentLead,
    isArchived,
    archivedAt: isArchived ? currentLead?.archivedAt || true : currentLead?.archivedAt,
  })
  const primaryAction = getLeadPrimaryAction(currentStage)
  const isConvertedToJob = currentStage === leadPipelineStages.CONVERTED_TO_JOB
  const nextStepDisplay = t(isConvertedToJob ? 'leadCompletedStatus' : getLeadNextStepKey(currentStage))
  const primaryActionLabel = t(isConvertedToJob ? 'openProject' : primaryAction.labelKey)
  const progressStageLabelKey = getLeadProgressStageLabelKey(currentStage)
  const currentStageDisplay = t(progressStageLabelKey || getLeadPipelineStageLabelKey(currentStage))
  const estimatedValueDisplay = leadHasEstimate ? currency.format(currentLead?.value || 0) : t('notEstimated')
  const leadDisplayName = currentLead?.client || currentLead?.name || t('lead')
  const projectDisplayTitle = currentLead?.projectTitle || currentLead?.projectType || t('unknownProject')
  const recordDetailsTitle = t(getRecordDetailsTitleKey({
    ...currentLead,
    isArchived,
    archivedAt: isArchived ? currentLead?.archivedAt || true : currentLead?.archivedAt,
  }))

  useEffect(() => {
    if (!USE_SUPABASE_LEADS) {
      setRecord(lead || null)
      setIsLoading(false)
      setHasLoaded(true)
      return undefined
    }

    if (!leadId) {
      setRecord(null)
      setIsLoading(false)
      setHasLoaded(true)
      return undefined
    }

    let isCancelled = false

    async function loadLead() {
      setIsLoading(true)

      try {
        const response = await dataProvider.leads.getById(leadId, { contractorId })

        if (isCancelled) return

        if (response?.error) {
          logLeadDetailDevError('[dev] LeadDetailPage failed to load lead.', response.error, { leadId })
          setRecord(null)
          return
        }

        setRecord(response?.data || null)
      } catch (error) {
        if (isCancelled) return
        logLeadDetailDevError('[dev] LeadDetailPage threw while loading lead.', error, { leadId })
        setRecord(null)
      } finally {
        if (!isCancelled) {
          setHasLoaded(true)
          setIsLoading(false)
        }
      }
    }

    loadLead()

    return () => {
      isCancelled = true
    }
  }, [contractorId, lead, leadId])

  useEffect(() => {
    let isCancelled = false

    async function loadEstimate() {
      const activeLead = USE_SUPABASE_LEADS ? record : lead
      const relatedProjectId = activeLead?.projectId || activeLead?.project_id || null
      const relatedLeadId = activeLead?.id || leadId
      const knownEstimateId = activeLead?.estimateId || activeLead?.portal?.estimate?.id || null
      const draftEstimate = readLinkedEstimateDraft(activeLead || leadId, [leadId, relatedProjectId || ''])

      try {
        if (knownEstimateId) {
          const estimateResponse = await dataProvider.estimates.getById?.(knownEstimateId, {
            contractorId,
          })

          if (!isCancelled && !estimateResponse?.error && estimateResponse?.data) {
            const nextEstimate = { ...(draftEstimate || {}), ...estimateResponse.data }
            setEstimateRecord(nextEstimate)
            writeLinkedEstimateDrafts([leadId, relatedProjectId || '', relatedLeadId || '', nextEstimate.id], nextEstimate)
            return
          }
        }

        if (!relatedProjectId && !relatedLeadId) {
          if (!isCancelled) {
            setEstimateRecord(draftEstimate)
          }
          return
        }

        const response = await dataProvider.estimates.list({
          contractorId,
          ...(relatedProjectId ? { projectId: relatedProjectId } : {}),
          ...(relatedLeadId ? { leadId: relatedLeadId } : {}),
          includeArchived: true,
        })

        if (isCancelled || response?.error) {
          if (!isCancelled) {
            setEstimateRecord(draftEstimate)
          }
          return
        }

        if (!isCancelled) {
          const nextEstimate = response?.data?.[0]
            ? { ...(draftEstimate || {}), ...response.data[0] }
            : draftEstimate

          setEstimateRecord(nextEstimate)
          if (nextEstimate) {
            writeLinkedEstimateDrafts([leadId, relatedProjectId || '', relatedLeadId || '', nextEstimate.id], nextEstimate)
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setEstimateRecord(draftEstimate)
        }
      }
    }

    loadEstimate()

    return () => {
      isCancelled = true
    }
  }, [contractorId, lead, leadId, record])

  if (USE_SUPABASE_LEADS && isLoading) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">{t('loadingLead')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{t('loadingLeadHelp')}</p>
      </section>
    )
  }

  if (!currentLead && hasLoaded) {
    return <LeadNotFound onBack={onBack} t={t} />
  }

  async function handleSaveLead(updatedLead) {
    try {
      const response = await dataProvider.leads.update(currentLead.id, updatedLead, { contractorId })

      if (response?.error) {
        showToast(response.error.message || t('leadSaveFailed'), 'error')
        logLeadDetailDevError('[dev] LeadDetailPage failed to update lead.', response.error, { leadId: currentLead.id })
        return
      }

      const nextLead = createSafeLead({
        ...currentLead,
        ...updatedLead,
        ...(response?.data || {}),
        id: currentLead.id,
      }, currentLead.id)
      setRecord(nextLead)
      onUpdateLead?.(currentLead.id, nextLead)
      setIsEditOpen(false)
    } catch (error) {
      showToast(error?.message || t('leadSaveFailed'), 'error')
      logLeadDetailDevError('[dev] LeadDetailPage threw while updating lead.', error, { leadId: currentLead.id })
    }
  }

  async function handleWorkflowTransition(targetStage) {
    if (leadActionGuardRef.current) {
      return null
    }

    leadActionGuardRef.current = true
    setIsLeadActionSubmitting(true)

    try {
      const nextLead = await onTransitionLeadStage?.(currentLead.id, targetStage)

      if (!nextLead) {
        return null
      }

      const safeLead = createSafeLead(nextLead, currentLead.id)
      setRecord(safeLead)
      return safeLead
    } finally {
      leadActionGuardRef.current = false
      setIsLeadActionSubmitting(false)
    }
  }

  async function handleRestoreArchivedLead() {
    if (leadActionGuardRef.current) {
      return
    }

    leadActionGuardRef.current = true
    setIsLeadActionSubmitting(true)

    try {
      const response = await dataProvider.leads.restore(currentLead.id, { contractorId })
      if (response?.error) {
        showToast(response.error.message || t('restoreFailed'), 'error')
        return
      }

      const nextLead = createSafeLead({
        ...(record || currentLead),
        archivedAt: null,
        archived_at: null,
        isArchived: false,
      }, currentLead.id)
      setRecord(nextLead)
      onRestoreLead?.(currentLead.id)
    } catch (error) {
      showToast(error?.message || t('restoreFailed'), 'error')
      logLeadDetailDevError('[dev] LeadDetailPage failed to restore lead.', error, { leadId: currentLead.id })
    } finally {
      leadActionGuardRef.current = false
      setIsLeadActionSubmitting(false)
    }
  }

  function openEstimateBuilder() {
    navigate(`/projects/${currentLead.id}/estimate`, { state: { source: 'lead', leadId: currentLead.id } })
  }

  function openJobWorkspace() {
    onOpenProject?.(currentLead.projectId || currentLead.id)
  }

  async function handleConvertLeadToJob() {
    if (leadActionGuardRef.current) {
      return null
    }

    leadActionGuardRef.current = true
    setIsLeadActionSubmitting(true)

    try {
      const nextLead = await onConvertLeadToJob?.(currentLead.id)

      if (!nextLead) {
        return null
      }

      const safeLead = createSafeLead(nextLead, currentLead.id)
      setRecord(safeLead)
      return safeLead
    } finally {
      leadActionGuardRef.current = false
      setIsLeadActionSubmitting(false)
    }
  }

  async function handlePrimaryAction() {
    switch (primaryAction.actionType) {
      case 'createEstimate':
        openEstimateBuilder()
        return
      case 'markEstimateSent':
        await handleWorkflowTransition(leadPipelineStages.ESTIMATE_SENT)
        return
      case 'markFollowUpComplete':
        await handleWorkflowTransition(leadPipelineStages.FOLLOW_UP)
        return
      case 'markEstimateApproved':
        await handleWorkflowTransition(leadPipelineStages.ESTIMATE_APPROVED)
        return
      case 'convertToJob': {
        const nextLead = await handleConvertLeadToJob()
        if (nextLead) {
          openJobWorkspace()
        }
        return
      }
      case 'scheduleJob': {
        const nextLead = await handleConvertLeadToJob()
        if (nextLead) {
          openJobWorkspace()
        }
        return
      }
      case 'viewJob':
        openJobWorkspace()
        return
      case 'restoreLead':
        if (isArchived) {
          await handleRestoreArchivedLead()
        } else {
          await handleWorkflowTransition(leadPipelineStages.NEW_LEAD)
        }
        return
      default:
        return
    }
  }

  async function runConfirmAction() {
    if (!confirmAction) return

    try {
      if (confirmAction.mode === 'archive') {
        const response = await dataProvider.leads.archive(currentLead.id, { contractorId })
        if (response?.error) {
          showToast(response.error.message || t('archiveFailed'), 'error')
          setConfirmAction(null)
          return
        }
        setRecord((current) => (current ? { ...current, archivedAt: new Date().toISOString(), archived_at: new Date().toISOString(), isArchived: true } : current))
        onArchiveLead?.(currentLead.id)
      }

      if (confirmAction.mode === 'delete') {
        const response = await dataProvider.leads.deletePermanently(currentLead.id, { contractorId })
        if (response?.error) {
          showToast(response.error.message || t('deleteFailed'), 'error')
          setConfirmAction(null)
          return
        }
        onDeleteLead?.(currentLead.id)
        onBack?.()
      }
    } catch (error) {
      showToast(error?.message || (confirmAction.mode === 'delete' ? t('deleteFailed') : t('archiveFailed')), 'error')
      logLeadDetailDevError('[dev] LeadDetailPage action failed.', error, {
        leadId: currentLead.id,
        mode: confirmAction.mode,
      })
    }

    setConfirmAction(null)
  }

  const moreMenuItems = [
    leadHasEstimate
      ? {
          id: 'edit-estimate',
          label: t('editEstimate'),
          icon: <ClipboardList className="mr-2 h-4 w-4" />,
          onClick: openEstimateBuilder,
        }
      : null,
    !isArchived && currentStage !== leadPipelineStages.LOST && currentStage !== leadPipelineStages.CONVERTED_TO_JOB
      ? {
          id: 'mark-lost',
          label: t('markLost'),
          icon: <Undo2 className="mr-2 h-4 w-4" />,
          onClick: () => handleWorkflowTransition(leadPipelineStages.LOST),
        }
      : null,
    {
      id: 'duplicate-lead',
      label: t('duplicateLead'),
      icon: <Copy className="mr-2 h-4 w-4" />,
      onClick: () => onDuplicateLead?.(currentLead.id),
    },
    !isArchived
      ? {
          id: 'archive-lead',
          label: t('archiveLead'),
          icon: <Archive className="mr-2 h-4 w-4" />,
          onClick: () => setConfirmAction({ mode: 'archive' }),
          className: archiveMenuItemClasses,
        }
      : null,
  ].filter(Boolean)

  const primaryActionIcon = primaryAction.actionType === 'restoreLead'
    ? <Undo2 className="h-4 w-4" />
    : primaryAction.actionType === 'convertToJob'
      || primaryAction.actionType === 'scheduleJob'
      || primaryAction.actionType === 'viewJob'
      ? <BriefcaseBusiness className="h-4 w-4" />
      : <ClipboardList className="h-4 w-4" />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <nav aria-label={t('leads')} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('leads')}
          </button>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate text-slate-950" aria-current="page">{leadDisplayName}</span>
        </nav>
        <ActionMenu
          label={t('more')}
          ariaLabel={t('more')}
          items={moreMenuItems}
          buttonDisabled={isLeadActionSubmitting}
          containerClassName="shrink-0"
          buttonClassName="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          menuClassName="max-w-[calc(100vw-2rem)]"
        />
      </div>

      <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#020617_0%,#0f172a_58%,#172554_100%)] p-5 text-white shadow-xl shadow-slate-950/15 sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-400/5 blur-3xl" aria-hidden="true" />
        <div className="relative grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:items-end lg:gap-10">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">{t('lead')}</p>
            <h1 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{leadDisplayName}</h1>
            <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-slate-300 sm:text-base">{projectDisplayTitle}</p>
            {isArchived && <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{t('archived')}</span>}
          </div>
          <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm sm:p-5">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{t('currentStage')}</p>
                <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1.5 text-sm font-bold text-blue-100">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-blue-300" aria-hidden="true" />
                  <span className="break-words">{currentStageDisplay}</span>
                </div>
              </div>
              <div className="min-w-0 border-t border-white/10 pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{t('estimatedValue')}</p>
                <p className={`mt-2 break-words font-bold text-white ${leadHasEstimate ? 'text-2xl' : 'text-base leading-7'}`}>{estimatedValueDisplay}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LeadProgress currentStage={currentStage} t={t} />

      <section className={`rounded-3xl border p-5 shadow-sm ${isConvertedToJob ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/60' : 'border-slate-200 bg-white'}`}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-950">{t('nextRecommendedAction')}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className={`rounded-2xl px-4 py-3 ${isConvertedToJob ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'bg-slate-50'}`}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('currentStage')}</p>
                <p className="mt-1.5 flex items-center gap-2 text-base font-bold text-slate-950">
                  {isConvertedToJob && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />}
                  {currentStageDisplay}
                </p>
              </div>
              <div className={`rounded-2xl px-4 py-3 ${isConvertedToJob ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'bg-blue-50'}`}>
                <p className={`text-xs font-bold uppercase tracking-[0.16em] ${isConvertedToJob ? 'text-emerald-700' : 'text-blue-600'}`}>{t(isConvertedToJob ? 'status' : 'nextStep')}</p>
                <p className="mt-1.5 text-sm leading-6 text-slate-700">{nextStepDisplay}</p>
              </div>
            </div>
          </div>
          <button disabled={isLeadActionSubmitting} onClick={handlePrimaryAction} className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 lg:w-auto lg:min-w-52 lg:translate-y-[22px]">
            {primaryActionIcon}
            {isLeadActionSubmitting ? t('saving') : primaryActionLabel}
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
          <button disabled={isLeadActionSubmitting} onClick={() => setIsEditOpen(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60">
            <Edit3 className="h-4 w-4" /> {t('editLead')}
          </button>
        </div>
        {isArchived && (
          <button disabled={isLeadActionSubmitting} onClick={() => setConfirmAction({ mode: 'delete' })} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
            <Trash2 className="h-4 w-4" /> {t('deletePermanently')}
          </button>
        )}
      </section>

      <section className={`grid gap-4 ${isAnalyticsMode ? 'lg:grid-cols-2' : ''}`.trim()}>
        <InfoCard title={t('clientInformation')}>
          <DetailRow label={t('name')} value={currentLead.client} />
          <DetailRow label={t('phone')} value={currentLead.phone || t('notAdded')} />
          <DetailRow label={t('email')} value={currentLead.email || t('notAdded')} />
          <DetailRow label={t('address')} value={currentLead.address || currentLead.location || t('unknownAddress')} />
        </InfoCard>
        {isAnalyticsMode && (
          <InfoCard title={recordDetailsTitle}>
            <DetailRow label={t('status')} value={<StatusBadge status={isArchived ? 'Archived' : currentLead.status} t={t} />} />
            <DetailRow label={t('priority')} value={currentLead.priority} />
            <DetailRow label={t('source')} value={currentLead.source || t('notAdded')} />
            <DetailRow label={t('projectType')} value={currentLead.projectType || t('unknownProject')} />
          </InfoCard>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">{t('notes')}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{currentLead.notes || t('followUpWithClient')}</p>
      </section>

      <LeadFormModal
        isOpen={isEditOpen}
        mode="edit"
        lead={currentLead}
        clients={clients}
        defaultClientLanguage={language}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveLead}
        t={t}
      />
      <ConfirmRecordModal
        isOpen={Boolean(confirmAction)}
        mode={confirmAction?.mode}
        title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : t('confirmArchive')}
        message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveHelp')}
        confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
        t={t}
      />
    </div>
  )
}

export default LeadDetailPage

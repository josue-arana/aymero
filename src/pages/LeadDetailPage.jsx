import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, BriefcaseBusiness, CheckCircle2, ChevronRight, ClipboardList, Copy, Edit3, FileText, Send, Trash2, Undo2, UserRoundPlus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionMenu } from '../components/common/ActionMenu'
import { AymeroLoader } from '../components/common/AymeroLoader'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { useToast } from '../components/common/ToastProvider'
import { LeadFormModal } from '../components/leads/LeadFormModal'
import { LeadProgress } from '../components/leads/LeadProgress'
import { USE_SUPABASE_LEADS } from '../config/backendConfig'
import { appRoutes } from '../config/appRoutes'
import { useAuth } from '../contexts/AuthContext'
import dataProvider from '../services/dataProvider'
import { getLeadsContractorId } from '../services/system/leadsRuntimeService'
import { getEstimateForLead, getEstimatedValueForLead, readLinkedEstimateDraft, writeLinkedEstimateDrafts } from '../utils/estimateLinks'
import { currency, formatDisplayDate } from '../utils/formatters'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { getLeadPipelineStage, leadPipelineStages } from '../utils/leadPipeline'
import { resolveLeadLifecycle, selectPrimaryLeadEstimate } from '../utils/leadLifecycle'
import { getLanguageLocale } from '../utils/language'
import { tStatus } from '../translations'

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

function getActivityTimestamp(value) {
  if (!value) return null

  const normalizedValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value
  const timestamp = new Date(normalizedValue).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function formatLeadActivityDate(value, language = 'en') {
  const timestamp = getActivityTimestamp(value)
  if (timestamp === null) return ''

  return new Date(timestamp).toLocaleDateString(getLanguageLocale(language), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Lead activity is intentionally derived only from fields with authoritative dates.
 * Stage position and generic updated_at values are never treated as historical events.
 */
function buildLeadActivityEvents({ lead, estimate, project, language, t }) {
  const candidates = [
    {
      id: 'lead-created',
      type: 'lead',
      label: t('leadActivityLeadCreated'),
      dateValue: lead?.createdAt || lead?.created_at,
      detail: '',
      rank: 1,
    },
    hasSavedEstimate(estimate)
      ? {
          id: `estimate-created-${estimate?.id || 'linked'}`,
          type: 'estimate',
          label: t('leadActivityEstimateCreated'),
          dateValue: estimate?.createdAt || estimate?.created_at || estimate?.dateCreated,
          detail: estimate?.number || estimate?.estimateNumber || '',
          rank: 2,
        }
      : null,
    hasSavedEstimate(estimate)
      ? {
          id: `estimate-sent-${estimate?.id || 'linked'}`,
          type: 'sent',
          label: t('leadActivityEstimateSent'),
          dateValue: estimate?.sentAt || estimate?.sent_at,
          detail: estimate?.number || estimate?.estimateNumber || '',
          rank: 3,
        }
      : null,
    hasSavedEstimate(estimate)
      ? {
          id: `lead-approved-${estimate?.id || 'linked'}`,
          type: 'approved',
          label: t('leadActivityEstimateApproved'),
          dateValue: estimate?.approvedAt || estimate?.approved_at,
          detail: estimate?.number || estimate?.estimateNumber || '',
          rank: 4,
        }
      : null,
    project?.id
      ? {
          id: `converted-to-job-${project.id}`,
          type: 'converted',
          label: t('leadActivityProjectCreated'),
          dateValue: project?.createdAt || project?.created_at,
          detail: project?.projectTitle || project?.title || '',
          rank: 5,
        }
      : null,
  ].filter(Boolean)

  return candidates
    .map((event) => {
      const timestamp = getActivityTimestamp(event.dateValue)
      if (timestamp === null) return null

      return {
        ...event,
        timestamp,
        date: formatLeadActivityDate(event.dateValue, language),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp || left.rank - right.rank)
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
  const contractorId = getLeadsContractorId({ contractor, company, session })
  const leadId = id || lead?.id || ''
  const [record, setRecord] = useState(USE_SUPABASE_LEADS ? null : lead)
  const [isLoading, setIsLoading] = useState(Boolean(USE_SUPABASE_LEADS))
  const [hasLoaded, setHasLoaded] = useState(!USE_SUPABASE_LEADS)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [isLeadActionSubmitting, setIsLeadActionSubmitting] = useState(false)
  const [estimateRecord, setEstimateRecord] = useState(() => readLinkedEstimateDraft(lead || leadId, leadId || lead?.id || ''))
  const [relatedProjectRecord, setRelatedProjectRecord] = useState(null)
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
  const relatedProjectId = currentLead?.projectId || currentLead?.project_id || ''
  const relatedProject = relatedProjectRecord || (relatedProjectId
    ? {
        id: relatedProjectId,
        projectTitle: currentLead?.projectTitle || currentLead?.title || '',
        title: currentLead?.projectTitle || currentLead?.title || '',
      }
    : null)
  const lifecycle = resolveLeadLifecycle({
    lead: currentLead || {},
    estimates: [currentLead?.portal?.estimate].filter(Boolean),
    contract: currentLead?.portal?.contract || null,
    project: relatedProject,
    archivedLeadIds: archivedIds,
  })
  const isArchived = lifecycle.isArchived
  const currentEstimate = lifecycle.relatedEstimate
  const leadHasEstimate = Boolean(currentEstimate)
  const currentStage = lifecycle.stage
  const isConvertedToJob = lifecycle.hasActiveProject
  const nextStepDisplay = t(lifecycle.nextStepKey)
  const currentStageDisplay = t(lifecycle.stageLabelKey)
  const estimatedValueDisplay = leadHasEstimate ? currency.format(currentLead?.value || 0) : t('notEstimated')
  const leadDisplayName = currentLead?.client || currentLead?.name || t('lead')
  const projectDisplayTitle = currentLead?.projectTitle || currentLead?.projectType || t('unknownProject')
  const createdDateDisplay = formatDisplayDate(currentLead?.createdAt || currentLead?.created_at)
  const jobLocationDisplay = String(currentLead?.address || currentLead?.location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n')
  const leadInformation = [
    currentLead?.source ? { id: 'source', label: t('leadSource'), value: currentLead.source } : null,
    createdDateDisplay ? { id: 'created', label: t('dateCreated'), value: createdDateDisplay } : null,
  ].filter(Boolean)
  const leadActivityEvents = buildLeadActivityEvents({
    lead: currentLead,
    estimate: lifecycle.relatedEstimate,
    project: lifecycle.relatedProject,
    language,
    t,
  })

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
          const primaryEstimate = selectPrimaryLeadEstimate({
            lead: activeLead || {},
            estimates: [...(response?.data || []), draftEstimate].filter(Boolean),
            contract: activeLead?.portal?.contract || null,
            archivedLeadIds: archivedIds,
          })
          const nextEstimate = primaryEstimate
            ? { ...(draftEstimate || {}), ...primaryEstimate }
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
  }, [archivedIds, contractorId, lead, leadId, record])

  useEffect(() => {
    let isCancelled = false

    setRelatedProjectRecord(null)
    if (!relatedProjectId) return undefined

    async function loadRelatedProject() {
      try {
        const response = await dataProvider.projects.getById(relatedProjectId, { contractorId })

        if (isCancelled) return
        if (response?.error) {
          logLeadDetailDevError('[dev] LeadDetailPage could not load the linked project summary.', response.error, {
            leadId,
            projectId: relatedProjectId,
          })
          return
        }

        if (response?.data?.id) {
          setRelatedProjectRecord(response.data)
        }
      } catch (error) {
        if (!isCancelled) {
          logLeadDetailDevError('[dev] LeadDetailPage threw while loading the linked project summary.', error, {
            leadId,
            projectId: relatedProjectId,
          })
        }
      }
    }

    loadRelatedProject()

    return () => {
      isCancelled = true
    }
  }, [contractorId, leadId, relatedProjectId])

  if (USE_SUPABASE_LEADS && isLoading) {
    return (
      <AymeroLoader
        variant="section"
        title={t('loadingLead')}
        message={t('loadingLeadHelp')}
        accessibleLabel={t('loadingLead')}
        className="rounded-3xl border border-slate-200 bg-white shadow-sm"
      />
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

  function openEstimateBuilder({ openSend = false } = {}) {
    navigate(`/projects/${currentLead.id}/estimate`, {
      state: {
        source: 'lead',
        leadId: currentLead.id,
        ...(openSend ? { openSendEstimate: true } : {}),
      },
    })
  }

  function openRelatedEstimate() {
    const estimateId = currentEstimate?.id

    if (!estimateId) {
      openEstimateBuilder()
      return
    }

    navigate(appRoutes.estimateDetail.replace(':estimateId', estimateId), {
      state: {
        source: 'lead',
        leadId: currentLead.id,
        projectId: relatedProjectId || undefined,
      },
    })
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

  async function handleLifecycleAction(actionType) {
    switch (actionType) {
      case 'createEstimate':
        openEstimateBuilder()
        return
      case 'editEstimate':
        openEstimateBuilder()
        return
      case 'sendEstimate':
        openEstimateBuilder({ openSend: true })
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
    leadHasEstimate && !lifecycle.isDraftEstimate
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

  function getLifecycleActionIcon(actionType) {
    if (actionType === 'restoreLead') return <Undo2 className="h-4 w-4" />
    if (['convertToJob', 'scheduleJob', 'viewJob'].includes(actionType)) return <BriefcaseBusiness className="h-4 w-4" />
    if (actionType === 'sendEstimate') return <Send className="h-4 w-4" />
    if (actionType === 'editEstimate') return <Edit3 className="h-4 w-4" />
    return <ClipboardList className="h-4 w-4" />
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex min-w-0 items-center gap-4">
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

      <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start lg:gap-6">
        <section className={`min-w-0 rounded-3xl border p-4 shadow-md shadow-slate-200/50 sm:p-5 lg:col-start-1 lg:row-start-1 ${isConvertedToJob ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/60' : 'border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/60'}`}>
          <h2 className="text-lg font-bold text-slate-950 sm:text-xl">{t('nextRecommendedAction')}</h2>
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,0.65fr)_minmax(220px,1.2fr)_minmax(180px,auto)] xl:items-center">
            <div className={`min-w-0 rounded-2xl px-3.5 py-3 ${isConvertedToJob ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'bg-slate-50'}`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{t('currentStage')}</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-950">
                {isConvertedToJob && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
                <span className="break-words">{currentStageDisplay}</span>
              </p>
            </div>
            <div className={`min-w-0 rounded-2xl px-3.5 py-3 ${isConvertedToJob ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'bg-blue-50'}`}>
              <p className={`text-[11px] font-bold uppercase tracking-[0.16em] ${isConvertedToJob ? 'text-emerald-700' : 'text-blue-600'}`}>{t('nextStep')}</p>
              <p className="mt-1 text-sm leading-5 text-slate-700">{nextStepDisplay}</p>
            </div>
            <div className={`grid min-w-0 gap-2 sm:col-span-2 xl:col-span-1 ${lifecycle.actions.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {lifecycle.actions.map((action) => (
                <button
                  key={action.actionType}
                  type="button"
                  disabled={isLeadActionSubmitting}
                  onClick={() => handleLifecycleAction(action.actionType)}
                  className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${action.variant === 'secondary' ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50' : 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700'}`}
                >
                  {getLifecycleActionIcon(action.actionType)}
                  <span className="break-words">{isLeadActionSubmitting ? t('saving') : t(action.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
            <button disabled={isLeadActionSubmitting} onClick={() => setIsEditOpen(true)} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-800 transition hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
              <Edit3 className="h-4 w-4" /> {t('editLead')}
            </button>
            <ActionMenu
              label={t('more')}
              ariaLabel={t('more')}
              items={moreMenuItems}
              buttonDisabled={isLeadActionSubmitting}
              containerClassName="w-full sm:w-auto"
              buttonClassName="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
              menuClassName="max-w-[calc(100vw-2rem)]"
            />
          </div>
          {isArchived && (
            <button disabled={isLeadActionSubmitting} onClick={() => setConfirmAction({ mode: 'delete' })} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
              <Trash2 className="h-4 w-4" /> {t('deletePermanently')}
            </button>
          )}
        </section>

        {(leadHasEstimate || relatedProject) ? (
          <div className="min-w-0 lg:col-start-2 lg:row-start-1">
            <RelatedLeadRecordsCard
              estimate={leadHasEstimate ? lifecycle.relatedEstimate : null}
              estimateTotal={leadHasEstimate ? Number(currentLead?.value || 0) : null}
              project={lifecycle.relatedProject}
              estimateIsArchived={lifecycle.estimateArchiveState.isArchived}
              projectIsArchived={lifecycle.projectArchived}
              onOpenEstimate={leadHasEstimate ? openRelatedEstimate : null}
              onOpenProject={relatedProjectId ? openJobWorkspace : null}
              t={t}
            />
          </div>
        ) : null}

      <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:col-start-1 lg:row-start-2">
        <h2 className="text-lg font-bold text-slate-950 sm:text-xl">{t('leadDetails')}</h2>

        <div className={`mt-5 grid gap-6 ${jobLocationDisplay ? 'md:grid-cols-2' : ''}`}>
          <section aria-labelledby="lead-contact-title">
            <h3 id="lead-contact-title" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('contact')}</h3>
            <dl className="mt-3 space-y-2.5">
              <div className="grid min-w-0 gap-0.5 sm:grid-cols-[80px_minmax(0,1fr)] sm:gap-3">
                <dt className="text-xs font-semibold text-slate-500">{t('name')}</dt>
                <dd className="break-words text-sm font-semibold text-slate-900">{leadDisplayName}</dd>
              </div>
              {currentLead.phone && (
                <div className="grid min-w-0 gap-0.5 sm:grid-cols-[80px_minmax(0,1fr)] sm:gap-3">
                  <dt className="text-xs font-semibold text-slate-500">{t('phone')}</dt>
                  <dd className="min-w-0 text-sm font-semibold">
                    <a href={`tel:${String(currentLead.phone).replace(/[^\d+]/g, '')}`} className="break-words text-blue-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{currentLead.phone}</a>
                  </dd>
                </div>
              )}
              {currentLead.email && (
                <div className="grid min-w-0 gap-0.5 sm:grid-cols-[80px_minmax(0,1fr)] sm:gap-3">
                  <dt className="text-xs font-semibold text-slate-500">{t('email')}</dt>
                  <dd className="min-w-0 text-sm font-semibold">
                    <a href={`mailto:${currentLead.email}`} className="break-all text-blue-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{currentLead.email}</a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {jobLocationDisplay && (
            <section aria-labelledby="lead-location-title">
              <h3 id="lead-location-title" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('jobLocation')}</h3>
              <address className="mt-3 whitespace-pre-line break-words text-sm font-semibold not-italic leading-6 text-slate-900">{jobLocationDisplay}</address>
            </section>
          )}

          {leadInformation.length ? (
            <section className={`border-t border-slate-100 pt-5 ${jobLocationDisplay ? 'md:col-span-2' : ''}`} aria-labelledby="lead-information-title">
              <h3 id="lead-information-title" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('leadInformation')}</h3>
              <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                {leadInformation.map((item) => (
                  <div key={item.id} className="min-w-0 rounded-2xl bg-slate-50 px-4 py-3">
                    <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</dt>
                    <dd className="mt-1 break-words text-sm font-bold leading-5 text-slate-900">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <section className="mt-5 border-t border-slate-100 pt-4" aria-labelledby="lead-notes-title">
          <h3 id="lead-notes-title" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('notes')}</h3>
          <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${currentLead.notes ? 'text-slate-700' : 'text-slate-500'}`}>
            {currentLead.notes || t('noNotesAdded')}
          </p>
        </section>
      </section>

        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          <LeadActivityCard events={leadActivityEvents} t={t} />
        </div>
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
        message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveLeadHelp')}
        confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
        t={t}
      />
    </div>
  )
}

function LeadActivityEvent({ event, isLast }) {
  const presentationByType = {
    lead: {
      icon: UserRoundPlus,
      classes: 'bg-slate-100 text-slate-600 ring-slate-200',
    },
    estimate: {
      icon: FileText,
      classes: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    },
    sent: {
      icon: Send,
      classes: 'bg-blue-50 text-blue-700 ring-blue-100',
    },
    approved: {
      icon: CheckCircle2,
      classes: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    },
    converted: {
      icon: BriefcaseBusiness,
      classes: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    },
  }
  const presentation = presentationByType[event.type] || presentationByType.lead
  const EventIcon = presentation.icon

  return (
    <li className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
      {!isLast ? <span className="absolute bottom-0 left-[17px] top-9 w-px bg-slate-200" aria-hidden="true" /> : null}
      <span className={`relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${presentation.classes}`}>
        <EventIcon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="break-words text-sm font-bold text-slate-900">{event.label}</p>
        <time dateTime={new Date(event.timestamp).toISOString()} className="mt-0.5 block text-xs font-semibold text-slate-500">{event.date}</time>
        {event.detail ? <p className="mt-1 break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">{event.detail}</p> : null}
      </div>
    </li>
  )
}

function LeadActivityCard({ events, t }) {
  return (
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="lead-activity-title">
      <h2 id="lead-activity-title" className="text-lg font-bold text-slate-950 sm:text-xl">{t('leadActivity')}</h2>
      {events.length ? (
        <ol className="mt-5">
          {events.map((event, index) => (
            <LeadActivityEvent
              key={event.id}
              event={event}
              isLast={index === events.length - 1}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm leading-6 text-slate-500">
          {t('noLeadActivityRecorded')}
        </p>
      )}
    </section>
  )
}

function RelatedRecordSection({ eyebrow, title, amount = '', status = '', isArchived = false, actionLabel, onAction, t }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
        <h3 className="mt-1 break-words text-sm font-bold text-slate-950 [overflow-wrap:anywhere]">{title}</h3>
      </div>
      {amount ? <p className="mt-3 break-words text-xl font-bold text-slate-950">{amount}</p> : null}
      {(status || isArchived) ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {status ? <span className="inline-flex max-w-full break-words rounded-full bg-white px-2.5 py-1 text-left text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">{status}</span> : null}
          {isArchived ? <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">{t('archived')}</span> : null}
        </div>
      ) : null}
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  )
}

function RelatedLeadRecordsCard({ estimate, estimateTotal, project, estimateIsArchived = false, projectIsArchived = false, onOpenEstimate, onOpenProject, t }) {
  if (!estimate && !project) return null

  const estimateTitle = estimate?.number || estimate?.estimateNumber || estimate?.title || t('relatedEstimate')
  const estimateStatus = estimate?.status ? tStatus(t, estimate.status) : ''
  const projectTitle = project?.projectTitle || project?.title || t('relatedProject')
  const projectStatus = project?.projectStatus || project?.status

  return (
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="related-lead-records-title">
      <h2 id="related-lead-records-title" className="text-lg font-bold text-slate-950">{t('relatedRecords')}</h2>
      <div className="mt-4 space-y-4">
        {estimate ? (
          <RelatedRecordSection
            eyebrow={t('estimate')}
            title={estimateTitle}
            amount={estimateTotal !== null ? currency.format(estimateTotal) : ''}
            status={estimateStatus}
            isArchived={estimateIsArchived}
            actionLabel={t('openEstimate')}
            onAction={onOpenEstimate}
            t={t}
          />
        ) : null}
        {project ? (
          <div>
            <RelatedRecordSection
              eyebrow={t('project')}
              title={projectTitle}
              status={projectStatus ? tStatus(t, projectStatus) : ''}
              isArchived={projectIsArchived}
              actionLabel={t('openProject')}
              onAction={onOpenProject}
              t={t}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default LeadDetailPage

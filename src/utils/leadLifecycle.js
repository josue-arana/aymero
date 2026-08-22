import { isRecordArchived, resolveEstimateArchiveState } from './archiveLifecycle.js'
import { leadPipelineStages, normalizeLeadPipelineStage } from './leadPipeline.js'

function normalizeId(value) {
  return String(value || '').trim()
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replaceAll(/[_-]+/g, ' ')
}

function hasEstimateData(estimate) {
  if (!estimate || typeof estimate !== 'object') return false
  if (estimate.id || estimate.number || estimate.estimateNumber) return true
  if (Array.isArray(estimate.lineItems) && estimate.lineItems.length > 0) return true
  if (estimate.total !== undefined || estimate.totalAmount !== undefined || estimate.amount !== undefined) return true
  return Boolean(estimate.summary || estimate.scopeOfWork || estimate.updatedAt || estimate.updated_at)
}

function readRecordTimestamp(record = {}) {
  const value = record?.updatedAt
    || record?.updated_at
    || record?.createdAt
    || record?.created_at
    || record?.dateCreated
    || ''
  const timestamp = new Date(value).getTime()

  return Number.isFinite(timestamp) ? timestamp : 0
}

function estimateMatchesLead(estimate, lead, portalEstimate) {
  if (estimate === portalEstimate) return true

  const estimateId = normalizeId(estimate?.id)
  const estimateLeadId = normalizeId(estimate?.leadId || estimate?.lead_id)
  const estimateProjectId = normalizeId(estimate?.projectId || estimate?.project_id)
  const leadId = normalizeId(lead?.id || lead?.leadId || lead?.lead_id)
  const leadEstimateId = normalizeId(lead?.estimateId || lead?.estimate_id)
  const leadProjectId = normalizeId(lead?.projectId || lead?.project_id)

  if (leadEstimateId && estimateId === leadEstimateId) return true
  if (estimateLeadId) return Boolean(leadId && estimateLeadId === leadId)
  if (estimateProjectId) return Boolean(leadProjectId && estimateProjectId === leadProjectId)

  return false
}

function dedupeEstimateCandidates(estimates = []) {
  const seenIds = new Set()

  return estimates.filter((estimate) => {
    if (!hasEstimateData(estimate)) return false

    const id = normalizeId(estimate?.id)
    if (!id) return true
    if (seenIds.has(id)) return false

    seenIds.add(id)
    return true
  })
}

/**
 * Selects the Lead's current Estimate deterministically.
 * A persisted lead.estimateId wins; otherwise the newest active related
 * Estimate wins, followed by the newest archived related Estimate.
 */
export function selectPrimaryLeadEstimate({
  lead = {},
  estimates = [],
  contract = null,
  archivedLeadIds = [],
} = {}) {
  const portalEstimate = lead?.portal?.estimate || null
  const candidates = dedupeEstimateCandidates([
    ...(Array.isArray(estimates) ? estimates : [estimates]),
    portalEstimate,
  ])
  const relatedCandidates = candidates.filter((estimate) => (
    estimateMatchesLead(estimate, lead, portalEstimate)
  ))
  const usableCandidates = relatedCandidates.length > 0
    ? relatedCandidates
    : candidates.length === 1
      ? candidates
      : []
  const leadEstimateId = normalizeId(lead?.estimateId || lead?.estimate_id)
  const explicitEstimate = leadEstimateId
    ? usableCandidates.find((estimate) => normalizeId(estimate?.id) === leadEstimateId)
    : null

  if (explicitEstimate) return explicitEstimate

  const sortedCandidates = [...usableCandidates].sort((left, right) => (
    readRecordTimestamp(right) - readRecordTimestamp(left)
      || normalizeId(right?.id).localeCompare(normalizeId(left?.id))
  ))
  const activeEstimate = sortedCandidates.find((estimate) => !resolveEstimateArchiveState({
    estimate,
    lead,
    contract,
    archivedLeadIds,
  }).isArchived)

  return activeEstimate || sortedCandidates[0] || null
}

function buildLifecycleResult({
  stage,
  stageLabelKey,
  progressStep,
  nextStepKey,
  actions,
  relatedEstimate,
  relatedProject,
  estimateArchiveState,
  projectArchived,
  leadArchived,
  lost,
  estimateStatusKind,
}) {
  return {
    stage,
    stageLabelKey,
    progressStep,
    nextStepKey,
    nextAction: actions[0] || null,
    actions,
    relatedEstimate,
    relatedProject,
    estimateArchiveState,
    projectArchived,
    isArchived: leadArchived,
    isLost: lost,
    hasActiveEstimate: Boolean(relatedEstimate && !estimateArchiveState.isArchived),
    hasActiveProject: Boolean(relatedProject?.id && !projectArchived),
    isDraftEstimate: estimateStatusKind === 'draft',
    estimateStatusKind,
  }
}

export function resolveLeadLifecycle({
  lead = {},
  estimates = [],
  contract = null,
  project = null,
  archivedLeadIds = [],
  archivedProjectIds = [],
} = {}) {
  const leadArchived = isRecordArchived(lead, archivedLeadIds)
  const explicitStage = normalizeLeadPipelineStage(lead?.leadPipelineStage || lead?.lead_pipeline_stage)
  const lost = explicitStage === leadPipelineStages.LOST || normalizeStatus(lead?.status) === 'lost'
  const activeContract = contract && !isRecordArchived(contract) ? contract : null
  const relatedEstimate = selectPrimaryLeadEstimate({
    lead,
    estimates,
    contract: activeContract,
    archivedLeadIds,
  })
  const estimateArchiveState = resolveEstimateArchiveState({
    estimate: relatedEstimate || {},
    lead,
    contract: activeContract,
    archivedLeadIds,
  })
  const relatedProject = project?.id ? project : null
  const projectArchived = Boolean(relatedProject && isRecordArchived(relatedProject, archivedProjectIds))
  const normalizedEstimateStatus = normalizeStatus(relatedEstimate?.status)
  const estimateStatusKind = !relatedEstimate
    ? 'none'
    : ['approved', 'accepted', 'converted', 'converted to contract'].includes(normalizedEstimateStatus)
      ? 'approved'
      : normalizedEstimateStatus === 'sent'
        ? explicitStage === leadPipelineStages.FOLLOW_UP ? 'follow-up' : 'sent'
        : normalizedEstimateStatus === 'rejected'
          ? 'rejected'
          : 'draft'
  const baseResult = {
    relatedEstimate,
    relatedProject,
    estimateArchiveState,
    projectArchived,
    leadArchived,
    lost,
    estimateStatusKind,
  }

  if (leadArchived) {
    return buildLifecycleResult({
      ...baseResult,
      stage: leadPipelineStages.ARCHIVED,
      stageLabelKey: 'leadPipelineStageArchived',
      progressStep: null,
      nextStepKey: 'leadNextStepArchived',
      actions: [{ actionType: 'restoreLead', labelKey: 'restoreLead', variant: 'primary' }],
    })
  }

  if (lost) {
    return buildLifecycleResult({
      ...baseResult,
      stage: leadPipelineStages.LOST,
      stageLabelKey: 'leadPipelineStageLost',
      progressStep: null,
      nextStepKey: 'leadNextStepLost',
      actions: [{ actionType: 'restoreLead', labelKey: 'restoreLead', variant: 'primary' }],
    })
  }

  if (relatedProject?.id && !projectArchived) {
    return buildLifecycleResult({
      ...baseResult,
      stage: leadPipelineStages.CONVERTED_TO_JOB,
      stageLabelKey: 'leadProgressJobCreated',
      progressStep: 'job-created',
      nextStepKey: 'leadNextStepContinueProject',
      actions: [{ actionType: 'viewJob', labelKey: 'openProject', variant: 'primary' }],
    })
  }

  if (relatedEstimate && !estimateArchiveState.isArchived) {
    if (estimateStatusKind === 'approved' || activeContract) {
      return buildLifecycleResult({
        ...baseResult,
        stage: leadPipelineStages.ESTIMATE_APPROVED,
        stageLabelKey: 'leadProgressApproved',
        progressStep: 'approved',
        nextStepKey: activeContract ? 'leadNextStepReviewContract' : 'leadNextStepCreateContract',
        actions: [{ actionType: 'createContract', labelKey: activeContract ? 'viewContract' : 'createContract', variant: 'primary' }],
      })
    }

    if (estimateStatusKind === 'sent') {
      return buildLifecycleResult({
        ...baseResult,
        stage: leadPipelineStages.ESTIMATE_SENT,
        stageLabelKey: 'leadProgressEstimateSent',
        progressStep: 'estimate-sent',
        nextStepKey: 'leadNextStepFollowUpEstimate',
        actions: [{ actionType: 'markFollowUpComplete', labelKey: 'markFollowUpComplete', variant: 'primary' }],
      })
    }

    if (estimateStatusKind === 'follow-up') {
      return buildLifecycleResult({
        ...baseResult,
        stage: leadPipelineStages.FOLLOW_UP,
        stageLabelKey: 'leadPipelineStageFollowUp',
        progressStep: 'estimate-sent',
        nextStepKey: 'leadNextStepAwaitDecision',
        actions: [{ actionType: 'markEstimateApproved', labelKey: 'markEstimateApproved', variant: 'primary' }],
      })
    }

    return buildLifecycleResult({
      ...baseResult,
      stage: leadPipelineStages.ESTIMATE_CREATED,
      stageLabelKey: estimateStatusKind === 'rejected' ? 'rejected' : 'leadLifecycleStageEstimateDraft',
      progressStep: 'estimate',
      nextStepKey: estimateStatusKind === 'rejected' ? 'leadNextStepUpdateEstimate' : 'leadNextStepFinishOrSendEstimate',
      actions: estimateStatusKind === 'rejected'
        ? [
            { actionType: 'editEstimate', labelKey: 'editEstimate', variant: 'secondary' },
            { actionType: 'resendEstimate', labelKey: 'resendEstimate', variant: 'primary' },
          ]
        : [
            { actionType: 'editEstimate', labelKey: 'editEstimate', variant: 'secondary' },
            { actionType: 'sendEstimate', labelKey: 'sendEstimate', variant: 'primary' },
          ],
    })
  }

  if (activeContract) {
    return buildLifecycleResult({
      ...baseResult,
      stage: leadPipelineStages.ESTIMATE_APPROVED,
      stageLabelKey: 'leadProgressApproved',
      progressStep: 'approved',
      nextStepKey: 'leadNextStepConvertToJob',
      actions: [{ actionType: 'convertToJob', labelKey: 'convertToJob', variant: 'primary' }],
    })
  }

  return buildLifecycleResult({
    ...baseResult,
    stage: leadPipelineStages.NEW_LEAD,
    stageLabelKey: 'leadProgressInquiry',
    progressStep: 'inquiry',
    nextStepKey: 'leadNextStepCreateEstimate',
    actions: [{ actionType: 'createEstimate', labelKey: 'createEstimate', variant: 'primary' }],
  })
}

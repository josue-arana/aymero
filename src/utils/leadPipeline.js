export const leadPipelineStages = {
  NEW_LEAD: 'NEW_LEAD',
  ESTIMATE_CREATED: 'ESTIMATE_CREATED',
  ESTIMATE_SENT: 'ESTIMATE_SENT',
  FOLLOW_UP: 'FOLLOW_UP',
  ESTIMATE_APPROVED: 'ESTIMATE_APPROVED',
  READY_FOR_JOB: 'READY_FOR_JOB',
  CONVERTED_TO_JOB: 'CONVERTED_TO_JOB',
  LOST: 'LOST',
  ARCHIVED: 'ARCHIVED',
}

export const leadPipelineStageOrder = [
  leadPipelineStages.NEW_LEAD,
  leadPipelineStages.ESTIMATE_CREATED,
  leadPipelineStages.ESTIMATE_SENT,
  leadPipelineStages.FOLLOW_UP,
  leadPipelineStages.ESTIMATE_APPROVED,
  leadPipelineStages.READY_FOR_JOB,
  leadPipelineStages.CONVERTED_TO_JOB,
  leadPipelineStages.LOST,
  leadPipelineStages.ARCHIVED,
]

const stageLabelKeys = {
  [leadPipelineStages.NEW_LEAD]: 'leadPipelineStageNewLead',
  [leadPipelineStages.ESTIMATE_CREATED]: 'leadPipelineStageEstimateCreated',
  [leadPipelineStages.ESTIMATE_SENT]: 'leadPipelineStageEstimateSent',
  [leadPipelineStages.FOLLOW_UP]: 'leadPipelineStageFollowUp',
  [leadPipelineStages.ESTIMATE_APPROVED]: 'leadPipelineStageEstimateApproved',
  [leadPipelineStages.READY_FOR_JOB]: 'leadPipelineStageReadyForJob',
  [leadPipelineStages.CONVERTED_TO_JOB]: 'leadPipelineStageConvertedToJob',
  [leadPipelineStages.LOST]: 'leadPipelineStageLost',
  [leadPipelineStages.ARCHIVED]: 'leadPipelineStageArchived',
}

const nextStepKeys = {
  [leadPipelineStages.NEW_LEAD]: 'leadNextStepCreateEstimate',
  [leadPipelineStages.ESTIMATE_CREATED]: 'leadNextStepSendEstimate',
  [leadPipelineStages.ESTIMATE_SENT]: 'leadNextStepFollowUpEstimate',
  [leadPipelineStages.FOLLOW_UP]: 'leadNextStepAwaitDecision',
  [leadPipelineStages.ESTIMATE_APPROVED]: 'leadNextStepCreateContract',
  [leadPipelineStages.READY_FOR_JOB]: 'leadNextStepScheduleProject',
  [leadPipelineStages.CONVERTED_TO_JOB]: 'leadNextStepNoRemainingActions',
  [leadPipelineStages.LOST]: 'leadNextStepLost',
  [leadPipelineStages.ARCHIVED]: 'leadNextStepArchived',
}

const primaryActionConfig = {
  [leadPipelineStages.NEW_LEAD]: { actionType: 'createEstimate', labelKey: 'createEstimate' },
  [leadPipelineStages.ESTIMATE_CREATED]: { actionType: 'markEstimateSent', labelKey: 'markEstimateSent' },
  [leadPipelineStages.ESTIMATE_SENT]: { actionType: 'markFollowUpComplete', labelKey: 'markFollowUpComplete' },
  [leadPipelineStages.FOLLOW_UP]: { actionType: 'markEstimateApproved', labelKey: 'markEstimateApproved' },
  [leadPipelineStages.ESTIMATE_APPROVED]: { actionType: 'createContract', labelKey: 'createContract' },
  [leadPipelineStages.READY_FOR_JOB]: { actionType: 'scheduleJob', labelKey: 'scheduleJob' },
  [leadPipelineStages.CONVERTED_TO_JOB]: { actionType: 'viewJob', labelKey: 'viewJob' },
  [leadPipelineStages.LOST]: { actionType: 'restoreLead', labelKey: 'restoreLead' },
  [leadPipelineStages.ARCHIVED]: { actionType: 'restoreLead', labelKey: 'restoreLead' },
}

const validStageSet = new Set(leadPipelineStageOrder)

const priorityLabelKeys = {
  high: 'priorityHigh',
  medium: 'priorityMedium',
  low: 'priorityLow',
}

function humanizeValue(value) {
  if (!value) return ''

  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function resolveTranslatedValue(value, t) {
  if (!value) return ''

  const translated = t(value)
  return translated && translated !== value ? translated : ''
}

function normalizeStatusValue(value) {
  if (!value) return ''

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function hasSavedEstimate(lead = {}) {
  const estimate = lead?.portal?.estimate

  if (!estimate || typeof estimate !== 'object') return false
  if (estimate.id || estimate.updatedAt || estimate.updated_at) return true
  if (Array.isArray(estimate.lineItems) && estimate.lineItems.length > 0) return true
  if (estimate.total !== undefined || estimate.totalAmount !== undefined) return true
  return Boolean(estimate.number)
}

function hasSavedContract(lead = {}) {
  const contract = lead?.portal?.contract

  if (!contract || typeof contract !== 'object') return false
  if (contract.id || contract.updatedAt || contract.updated_at) return true
  if (contract.total !== undefined || contract.totalAmount !== undefined || contract.contractAmount !== undefined) return true
  return Boolean(contract.number || contract.contractNumber)
}

export function normalizeLeadPipelineStage(value) {
  if (!value) return ''

  const normalizedValue = String(value).trim().toUpperCase()
  return validStageSet.has(normalizedValue) ? normalizedValue : ''
}

export function getLeadPipelineStageLabelKey(stage) {
  return stageLabelKeys[stage] || stageLabelKeys[leadPipelineStages.NEW_LEAD]
}

export function getLeadNextStepKey(stage) {
  return nextStepKeys[stage] || 'leadNextStepReview'
}

export function getPriorityLabel(priority, t = (key) => key) {
  if (!priority) return ''

  const normalizedPriority = String(priority).trim()
  const lowerPriority = normalizedPriority.toLowerCase()
  const lookupKey = priorityLabelKeys[lowerPriority]

  if (lookupKey) {
    return t(lookupKey)
  }

  return resolveTranslatedValue(normalizedPriority, t) || humanizeValue(normalizedPriority)
}

export function getLeadStageLabel(stage, t = (key) => key) {
  if (!stage) return ''

  const normalizedStage = normalizeLeadPipelineStage(stage)
  if (normalizedStage) {
    return t(getLeadPipelineStageLabelKey(normalizedStage))
  }

  return resolveTranslatedValue(stage, t) || humanizeValue(stage)
}

export function getLeadNextStepLabel(nextStep, t = (key) => key, lead = null) {
  if (nextStep) {
    return resolveTranslatedValue(nextStep, t) || humanizeValue(nextStep)
  }

  if (lead) {
    return t(getLeadNextStepKey(getLeadPipelineStage(lead)))
  }

  return ''
}

export function getLeadDisplayValue(value, t = (key) => key) {
  if (!value) return ''

  return resolveTranslatedValue(value, t) || humanizeValue(value)
}

export function getLeadPrimaryAction(stage) {
  return primaryActionConfig[stage] || { actionType: 'reviewLead', labelKey: 'reviewLead' }
}

export function getLegacyLeadStatusForPipelineStage(stage, currentStatus = '') {
  switch (stage) {
    case leadPipelineStages.NEW_LEAD:
      return 'New Lead'
    case leadPipelineStages.ESTIMATE_CREATED:
      return 'Contacted'
    case leadPipelineStages.ESTIMATE_SENT:
    case leadPipelineStages.FOLLOW_UP:
      return 'Estimate Sent'
    case leadPipelineStages.ESTIMATE_APPROVED:
    case leadPipelineStages.READY_FOR_JOB:
    case leadPipelineStages.CONVERTED_TO_JOB:
      return 'Won'
    case leadPipelineStages.LOST:
      return 'Lost'
    case leadPipelineStages.ARCHIVED:
      return currentStatus || 'New Lead'
    default:
      return currentStatus || 'New Lead'
  }
}

export function inferLeadPipelineStage(lead = {}) {
  if (lead?.isArchived || lead?.archivedAt || lead?.archived_at) {
    return leadPipelineStages.ARCHIVED
  }

  const explicitStage = normalizeLeadPipelineStage(lead?.leadPipelineStage || lead?.lead_pipeline_stage)
  if (explicitStage) {
    return explicitStage
  }

  const leadStatus = normalizeStatusValue(lead?.status)
  const projectStatus = normalizeStatusValue(lead?.projectStatus)
  const estimateStatus = normalizeStatusValue(lead?.portal?.estimate?.status)
  const contractStatus = normalizeStatusValue(lead?.portal?.contract?.status)
  const hasEstimate = hasSavedEstimate(lead)
  const hasContract = hasSavedContract(lead)
  const hasProjectLink = Boolean(lead?.projectId || lead?.project_id)
  const hasScheduledProject = Boolean(
    lead?.portal?.startDate
      || lead?.startDate
      || ['scheduled', 'in_progress', 'waiting_on_client', 'waiting_on_materials', 'ready_for_final_walkthrough', 'completed', 'paid'].includes(projectStatus)
  )

  if (leadStatus === 'lost') {
    return leadPipelineStages.LOST
  }

  if (hasProjectLink) {
    return leadPipelineStages.CONVERTED_TO_JOB
  }

  if (hasScheduledProject) {
    return leadPipelineStages.CONVERTED_TO_JOB
  }

  if (contractStatus === 'signed') {
    return hasScheduledProject ? leadPipelineStages.CONVERTED_TO_JOB : leadPipelineStages.READY_FOR_JOB
  }

  if (hasContract && (contractStatus === 'draft' || contractStatus === 'sent')) {
    return contractStatus === 'sent' ? leadPipelineStages.READY_FOR_JOB : leadPipelineStages.ESTIMATE_APPROVED
  }

  if (estimateStatus === 'approved' || estimateStatus === 'accepted' || estimateStatus === 'converted' || estimateStatus === 'converted_to_contract') {
    return leadPipelineStages.ESTIMATE_APPROVED
  }

  if (estimateStatus === 'sent') {
    return leadPipelineStages.ESTIMATE_SENT
  }

  if (leadStatus === 'won') {
    return leadPipelineStages.READY_FOR_JOB
  }

  if (leadStatus === 'estimate_sent') {
    return leadPipelineStages.ESTIMATE_SENT
  }

  if (hasEstimate) {
    return leadPipelineStages.ESTIMATE_CREATED
  }

  return leadPipelineStages.NEW_LEAD
}

export function getLeadPipelineStage(lead = {}) {
  return inferLeadPipelineStage(lead)
}

export function buildLeadPipelineTransition(lead = {}, targetStage) {
  const normalizedStage = normalizeLeadPipelineStage(targetStage) || getLeadPipelineStage(lead)
  const nextLead = {
    ...lead,
    leadPipelineStage: normalizedStage,
  }

  switch (normalizedStage) {
    case leadPipelineStages.NEW_LEAD:
      nextLead.status = 'New Lead'
      break
    case leadPipelineStages.ESTIMATE_CREATED:
      nextLead.status = 'Contacted'
      break
    case leadPipelineStages.ESTIMATE_SENT:
    case leadPipelineStages.FOLLOW_UP:
      nextLead.status = 'Estimate Sent'
      break
    case leadPipelineStages.ESTIMATE_APPROVED:
    case leadPipelineStages.READY_FOR_JOB:
      nextLead.status = 'Won'
      break
    case leadPipelineStages.CONVERTED_TO_JOB:
      nextLead.status = 'Won'
      nextLead.projectStatus = nextLead.projectStatus || 'Scheduled'
      break
    case leadPipelineStages.LOST:
      nextLead.status = 'Lost'
      break
    case leadPipelineStages.ARCHIVED:
      nextLead.status = nextLead.status || 'New Lead'
      break
    default:
      break
  }

  return nextLead
}

export function getLeadPipelineStageCounts(leads = [], archivedIds = []) {
  const initialCounts = leadPipelineStageOrder.reduce((counts, stage) => ({
    ...counts,
    [stage]: 0,
  }), {})

  const countsByStage = leads.reduce((counts, lead) => {
    const nextLead = archivedIds.includes(lead?.id)
      ? { ...lead, isArchived: true, archivedAt: lead?.archivedAt || true }
      : lead
    const stage = getLeadPipelineStage(nextLead)

    return {
      ...counts,
      [stage]: (counts[stage] || 0) + 1,
    }
  }, initialCounts)

  return {
    byStage: countsByStage,
    newLeads: countsByStage[leadPipelineStages.NEW_LEAD],
    estimatesToSend: countsByStage[leadPipelineStages.ESTIMATE_CREATED],
    followUpsDue: countsByStage[leadPipelineStages.ESTIMATE_SENT],
    approvedEstimates: countsByStage[leadPipelineStages.ESTIMATE_APPROVED],
    readyForJob: countsByStage[leadPipelineStages.READY_FOR_JOB],
    lostLeads: countsByStage[leadPipelineStages.LOST],
  }
}

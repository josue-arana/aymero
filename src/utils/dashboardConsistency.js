import { isRecordArchived, resolveEstimateArchiveState } from './archiveLifecycle.js'
import { deriveProjectStatus, PROJECT_LIFECYCLE_STATUS } from './projectLifecycle.js'
import { getLeadPipelineStage, leadPipelineStages } from './leadPipeline.js'
import { dedupePayments } from './projectPayments.js'
import { selectActionableScheduleEventsToday } from './scheduleEvents.js'

export const DASHBOARD_PENDING_ESTIMATE_STATUSES = Object.freeze(['draft', 'saved', 'sent'])

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function normalizeId(value) {
  return String(value || '').trim()
}

function recordIds(record = {}) {
  return new Set([
    record?.id,
    record?.projectId,
    record?.project_id,
    record?.leadId,
    record?.lead_id,
  ].map(normalizeId).filter(Boolean))
}

function recordsOverlap(left = {}, right = {}) {
  const leftIds = recordIds(left)
  return [...recordIds(right)].some((id) => leftIds.has(id))
}

export function findDashboardLinkedLead(leads = [], record = {}) {
  return leads.find((lead) => recordsOverlap(lead, record)) || null
}

function findDashboardLinkedContract(contracts = [], estimate = {}, lead = null) {
  const estimateId = normalizeId(estimate?.id)

  return contracts.find((contract) => (
    (estimateId && normalizeId(contract?.estimateId || contract?.estimate_id) === estimateId)
    || recordsOverlap(contract, estimate)
    || (lead && recordsOverlap(contract, lead))
  )) || lead?.portal?.contract || null
}

export function isDashboardPendingEstimate({
  estimate = {},
  lead = null,
  contract = null,
  archivedLeadIds = [],
} = {}) {
  if (!estimate || typeof estimate !== 'object') return false

  const archiveState = resolveEstimateArchiveState({
    estimate,
    lead,
    contract,
    archivedLeadIds,
  })
  if (archiveState.isArchived || archiveState.converted) return false

  const explicitStatus = normalizeStatus(estimate?.status)
  if (explicitStatus) {
    return DASHBOARD_PENDING_ESTIMATE_STATUSES.includes(explicitStatus)
  }

  const stage = getLeadPipelineStage(lead || {})
  return [
    leadPipelineStages.ESTIMATE_CREATED,
    leadPipelineStages.ESTIMATE_SENT,
    leadPipelineStages.FOLLOW_UP,
  ].includes(stage)
}

export function selectDashboardPendingEstimates({
  estimates = [],
  leads = [],
  contracts = [],
  archivedLeadIds = [],
} = {}) {
  const persistedCandidates = estimates.filter(Boolean)
  const candidates = persistedCandidates.length
    ? persistedCandidates
    : leads.map((lead) => lead?.portal?.estimate).filter(Boolean)
  const seen = new Set()

  return candidates.filter((estimate, index) => {
    const lead = findDashboardLinkedLead(leads, estimate)
    const contract = findDashboardLinkedContract(contracts, estimate, lead)
    const key = normalizeId(estimate?.id)
      || normalizeId(estimate?.number || estimate?.estimateNumber)
      || `${normalizeId(estimate?.projectId || estimate?.project_id)}:${normalizeId(estimate?.leadId || estimate?.lead_id)}:${index}`
    if (seen.has(key)) return false
    seen.add(key)

    return isDashboardPendingEstimate({ estimate, lead, contract, archivedLeadIds })
  })
}

export function selectDashboardProjectRecords({
  projects = [],
  leads = [],
  archivedProjectIds = [],
} = {}) {
  const projectCandidates = projects.length
    ? projects
    : leads.filter((lead) => Boolean(lead?.projectId || lead?.project_id))
  const seen = new Set()

  return projectCandidates.reduce((records, project) => {
    const linkedLead = findDashboardLinkedLead(leads, project)
    const mergedProject = linkedLead
      ? {
          ...linkedLead,
          ...project,
          portal: {
            ...(linkedLead?.portal || {}),
            ...(project?.portal || {}),
          },
        }
      : project
    const projectId = normalizeId(project?.id || project?.projectId || project?.project_id)
    if (!projectId || seen.has(projectId) || isRecordArchived(project, archivedProjectIds)) return records

    seen.add(projectId)
    records.push({ ...mergedProject, dashboardProjectId: projectId, dashboardLinkedLead: linkedLead })
    return records
  }, [])
}

export function getDashboardLinkedRecords(records = [], project = {}) {
  return records.filter((record) => recordsOverlap(record, project))
}

export function getDashboardProjectPayments(payments = [], project = {}) {
  const embeddedPayments = [
    ...(Array.isArray(project?.payments) ? project.payments : []),
    ...(Array.isArray(project?.portal?.payments) ? project.portal.payments : []),
    ...(Array.isArray(project?.portal?.paymentHistory) ? project.portal.paymentHistory : []),
  ]

  return dedupePayments([
    ...getDashboardLinkedRecords(payments, project),
    ...embeddedPayments,
  ])
}

export function deriveDashboardProjectStatus(project = {}, {
  contracts = [],
  payments = [],
  events = [],
  now = new Date(),
} = {}) {
  return deriveProjectStatus({
    project,
    contracts: [
      ...getDashboardLinkedRecords(contracts, project),
      ...(project?.portal?.contract ? [project.portal.contract] : []),
    ],
    payments: getDashboardProjectPayments(payments, project),
    events: getDashboardLinkedRecords(events, project),
    now,
  })
}

export function selectDashboardActiveProjects(options = {}) {
  const projects = selectDashboardProjectRecords(options)

  return projects.filter((project) => {
    const status = deriveDashboardProjectStatus(project, options)
    return ![PROJECT_LIFECYCLE_STATUS.COMPLETED, PROJECT_LIFECYCLE_STATUS.ARCHIVED].includes(status)
  })
}

export function selectDashboardTodayEvents(events = [], now = new Date()) {
  return selectActionableScheduleEventsToday(events, now)
}

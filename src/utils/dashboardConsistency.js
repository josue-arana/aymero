import { isRecordArchived, resolveEstimateArchiveState } from './archiveLifecycle.js'
import { deriveProjectStatus, PROJECT_LIFECYCLE_STATUS } from './projectLifecycle.js'
import { getLeadPipelineStage, leadPipelineStages } from './leadPipeline.js'
import { dedupePayments } from './projectPayments.js'
import { calculateProjectFinancialSummary } from './projectFinancials.js'
import { getLeadEstimateRecords, getLeadEstimateValue } from './leadLifecycle.js'
import { getInvoiceRemainingBalance, isCollectibleInvoice } from './invoiceRecords.js'
import { getScheduleEventDate, isClientVisibleScheduleEvent, selectActionableScheduleEventsToday, sortScheduleEvents, toLocalScheduleDateKey } from './scheduleEvents.js'

export const DASHBOARD_PENDING_ESTIMATE_STATUSES = Object.freeze(['draft', 'saved', 'sent'])

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function normalizeId(value) {
  return String(value || '').trim()
}

function dedupeRecords(records = []) {
  const seen = new Set()

  return records.filter((record, index) => {
    if (!record) return false

    const key = normalizeId(record?.id)
      || normalizeId(record?.number || record?.estimateNumber || record?.invoiceNumber)
      || `record:${index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

export function getDashboardLeadValue({ lead = {}, estimates = [], archivedLeadIds = [] } = {}) {
  const relatedEstimates = getLeadEstimateRecords({
    lead,
    estimates,
    archivedLeadIds,
  })
  const estimateValue = getLeadEstimateValue({
    lead,
    estimates,
    archivedLeadIds,
  })

  if (estimateValue !== null) return estimateValue
  if (relatedEstimates.length > 0) return null

  const fallback = Number(lead?.value)
  return Number.isFinite(fallback) ? fallback : 0
}

export function calculateDashboardPipelineValue({ leads = [], estimates = [], archivedLeadIds = [] } = {}) {
  return leads.reduce((total, lead) => {
    const value = getDashboardLeadValue({ lead, estimates, archivedLeadIds })
    return total + (value === null ? 0 : value)
  }, 0)
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

export function getDashboardProjectFinancialSummary(project = {}, {
  estimates = [],
  contracts = [],
  invoices = [],
  payments = [],
} = {}) {
  const projectId = normalizeId(project?.id || project?.projectId || project?.project_id)
  const leadId = normalizeId(project?.leadId || project?.lead_id)
  const projectEstimates = dedupeRecords([
    ...(Array.isArray(project?.estimates) ? project.estimates : []),
    ...(project?.portal?.estimate ? [project.portal.estimate] : []),
    ...estimates.filter((estimate) => {
      const estimateProjectId = normalizeId(estimate?.projectId || estimate?.project_id)
      const estimateLeadId = normalizeId(estimate?.leadId || estimate?.lead_id)
      return (projectId && estimateProjectId === projectId)
        || (!estimateProjectId && leadId && estimateLeadId === leadId)
    }),
  ])
  const projectContracts = dedupeRecords([
    ...(Array.isArray(project?.contracts) ? project.contracts : []),
    ...(project?.portal?.contract ? [project.portal.contract] : []),
    ...contracts.filter((contract) => {
      const contractProjectId = normalizeId(contract?.projectId || contract?.project_id)
      const contractLeadId = normalizeId(contract?.leadId || contract?.lead_id)
      return (projectId && contractProjectId === projectId)
        || (!contractProjectId && leadId && contractLeadId === leadId)
    }),
  ])
  const projectInvoices = dedupeRecords([
    ...(Array.isArray(project?.invoices) ? project.invoices : []),
    ...(Array.isArray(project?.portal?.invoices) ? project.portal.invoices : []),
    ...invoices.filter((invoice) => normalizeId(invoice?.projectId || invoice?.project_id) === projectId),
  ])
  const projectPayments = dedupePayments([
    ...(Array.isArray(project?.payments) ? project.payments : []),
    ...(Array.isArray(project?.portal?.payments) ? project.portal.payments : []),
    ...(Array.isArray(project?.portal?.paymentHistory) ? project.portal.paymentHistory : []),
    ...payments,
  ])

  return calculateProjectFinancialSummary({
    project,
    estimates: projectEstimates,
    contracts: projectContracts,
    invoices: projectInvoices,
    payments: projectPayments,
  })
}

export function selectDashboardOverdueInvoices(invoices = [], now = new Date()) {
  const today = new Date(now)
  const todayKey = Number.isNaN(today.getTime()) ? '' : today.toISOString().slice(0, 10)

  return invoices
    .filter((invoice) => isCollectibleInvoice(invoice))
    .filter((invoice) => {
      const status = normalizeStatus(invoice?.status)
      const dueDate = new Date(invoice?.dueDate || invoice?.due_date || '')
      const dueDateKey = Number.isNaN(dueDate.getTime()) ? '' : dueDate.toISOString().slice(0, 10)
      return status === 'overdue'
        || (['sent', 'partially_paid', 'partial'].includes(status) && Boolean(todayKey && dueDateKey && dueDateKey < todayKey))
    })
    .map((invoice) => ({
      ...invoice,
      remainingBalance: getInvoiceRemainingBalance(invoice),
    }))
}

export function selectDashboardPaymentActivityRecords({ payments = [], invoices = [] } = {}) {
  const legacyHistory = invoices.flatMap((invoice) => (
    (Array.isArray(invoice?.paymentHistory) ? invoice.paymentHistory : []).map((payment, index) => ({
      ...payment,
      id: payment?.id || `invoice-history-${invoice.id}-${index}`,
      invoiceId: invoice.id,
      projectId: payment?.projectId || payment?.project_id || invoice.projectId || invoice.project_id || null,
      clientId: payment?.clientId || payment?.client_id || invoice.clientId || invoice.client_id || null,
      paymentDate: payment?.paymentDate || payment?.payment_date || payment?.date || null,
    }))
  ))

  return dedupePayments([...legacyHistory, ...payments])
    .filter((payment) => !payment?.archivedAt)
    .filter((payment) => !['failed', 'refunded', 'cancelled', 'canceled'].includes(normalizeStatus(payment?.status)))
}

export function selectDashboardContractAttentionRecords({
  contracts = [],
  projects = [],
  leads = [],
  archivedProjectIds = [],
} = {}) {
  return dedupeRecords(contracts).flatMap((contract) => {
    if (isRecordArchived(contract)) return []

    const status = normalizeStatus(contract?.status || 'draft')
    if (!['draft', 'sent', 'pending', 'pending_signature', 'viewed'].includes(status)) return []

    const projectId = normalizeId(contract?.projectId || contract?.project_id)
    const linkedProject = projects.find((project) => normalizeId(project?.id || project?.projectId || project?.project_id) === projectId) || null
    if (projectId && archivedProjectIds.some((id) => normalizeId(id) === projectId)) return []

    const linkedLead = findDashboardLinkedLead(leads, contract)
    return [{
      contract,
      linkedProject,
      linkedLead,
      projectId,
    }]
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

export function selectDashboardUpcomingEvents(events = [], now = new Date(), days = 3) {
  const today = toLocalScheduleDateKey(now)
  if (!today) return []
  const end = new Date(now)
  end.setDate(end.getDate() + days)
  const endKey = toLocalScheduleDateKey(end)

  return sortScheduleEvents(events.filter((event) => {
    if (!isClientVisibleScheduleEvent(event)) return false
    const date = getScheduleEventDate(event)
    return date > today && date <= endKey
  }))
}

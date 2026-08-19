import { calculateOutstandingInvoiceBalance, dedupeInvoiceRecords, isCollectibleInvoice } from './invoiceRecords.js'
import { deriveProjectStatus } from './projectLifecycle.js'
import { isUpcomingClientScheduleEvent, sortScheduleEvents } from './scheduleEvents.js'

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function selectProjectWorkspaceInvoices(invoices = [], {
  projectIds = [],
  leadIds = [],
  invoiceIds = [],
} = {}) {
  const projectIdSet = new Set(projectIds.filter(Boolean).map(String))
  const leadIdSet = new Set(leadIds.filter(Boolean).map(String))
  const invoiceIdSet = new Set(invoiceIds.filter(Boolean).map(String))

  return dedupeInvoiceRecords(invoices.filter((invoice) => {
    const invoiceId = String(invoice?.id || invoice?.invoiceId || invoice?.invoice_id || '')
    const invoiceProjectId = String(invoice?.projectId || invoice?.project_id || '')
    const invoiceLeadId = String(invoice?.leadId || invoice?.lead_id || '')

    return Boolean(
      (invoiceId && invoiceIdSet.has(invoiceId))
      || (invoiceProjectId && projectIdSet.has(invoiceProjectId))
      || (invoiceLeadId && leadIdSet.has(invoiceLeadId))
    )
  }))
}

export function groupProjectWorkspaceEvents(events = [], now = new Date()) {
  const orderedEvents = sortScheduleEvents(events)
  const upcomingEvents = orderedEvents.filter((event) => isUpcomingClientScheduleEvent(event, now))
  const upcomingKeys = new Set(upcomingEvents.map((event, index) => (
    event?.id || `${event?.date || ''}:${event?.startTime || event?.start_time || ''}:${index}`
  )))
  const historyEvents = orderedEvents
    .filter((event, index) => !upcomingKeys.has(
      event?.id || `${event?.date || ''}:${event?.startTime || event?.start_time || ''}:${index}`
    ))
    .reverse()

  return {
    upcomingEvents,
    historyEvents,
    nextEvent: upcomingEvents[0] || null,
  }
}

function resolveNextAction({
  projectStatus,
  contract,
  collectibleInvoices,
  nextEvent,
  photoCount,
  isArchived,
}) {
  const normalizedProjectStatus = normalizeStatus(projectStatus)
  const normalizedContractStatus = normalizeStatus(contract?.status || (contract?.signed ? 'signed' : ''))

  if (isArchived || ['complete', 'completed', 'canceled', 'cancelled'].includes(normalizedProjectStatus)) {
    return null
  }

  if (contract && (
    ['draft', 'contract_draft'].includes(normalizedContractStatus)
    || normalizedProjectStatus === 'contract_draft'
  )) {
    return { id: 'review-contract', messageKey: 'projectNextReviewContract', actionLabelKey: 'openContract' }
  }

  if (collectibleInvoices.length > 0) {
    return {
      id: 'view-invoice',
      messageKey: 'projectNextOutstandingInvoice',
      actionLabelKey: 'viewInvoice',
      invoiceId: collectibleInvoices[0].id,
    }
  }

  if (nextEvent) {
    return {
      id: 'view-schedule',
      messageKey: 'projectNextUpcomingSchedule',
      actionLabelKey: 'viewSchedule',
      event: nextEvent,
    }
  }

  if (contract?.signed || normalizedContractStatus === 'signed') {
    return { id: 'schedule-job', messageKey: 'projectNextScheduleJob', actionLabelKey: 'scheduleJob' }
  }

  if (photoCount === 0) {
    return { id: 'upload-photos', messageKey: 'projectNextUploadPhotos', actionLabelKey: 'uploadPhotos' }
  }

  return null
}

export function buildProjectWorkspaceViewModel({
  project = {},
  contract = null,
  paymentSummary = {},
  events = [],
  invoices = [],
  photoCount = 0,
  isArchived = false,
  now = new Date(),
} = {}) {
  const eventGroups = groupProjectWorkspaceEvents(events, now)
  const collectibleInvoices = invoices.filter(isCollectibleInvoice)
  const workflowProject = isArchived
    ? { ...project, isArchived: false, archivedAt: null, archived_at: null }
    : project
  const projectStatus = deriveProjectStatus({
    project: workflowProject,
    contract,
    payments: paymentSummary.payments || [],
    events,
    isArchived: false,
  })

  return {
    projectStatus,
    ...eventGroups,
    collectibleInvoices,
    outstandingInvoiceBalance: calculateOutstandingInvoiceBalance(invoices),
    nextAction: resolveNextAction({
      projectStatus,
      contract,
      collectibleInvoices,
      nextEvent: eventGroups.nextEvent,
      photoCount,
      isArchived,
    }),
  }
}

export const PROJECT_LIFECYCLE_STATUS = Object.freeze({
  CONTRACT_DRAFT: 'Contract Draft',
  SIGNED: 'Signed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
})

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function toList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []
}

function isArchivedRecord(record = {}) {
  return Boolean(record?.isArchived || record?.archivedAt || record?.archived_at)
}

export function isProjectContractSigned(contract = {}) {
  if (!contract || isArchivedRecord(contract)) return false

  return Boolean(
    contract.signedAt
      || contract.signed_at
      || contract.signedDate
      || contract.signed_date
      || contract.signed === true
      || normalizeValue(contract.status) === 'signed'
  )
}

export function hasProjectWorkPayment(payments = []) {
  return toList(payments).some((payment) => {
    if (!payment || isArchivedRecord(payment)) return false

    const status = normalizeValue(payment.status)
    const amount = Number(payment.amount)

    return !['failed', 'refunded', 'cancelled', 'canceled'].includes(status)
      && Number.isFinite(amount)
      && amount > 0
  })
}

function isProjectVisit(event = {}) {
  const values = [event.eventType, event.event_type, event.type, event.title]
    .map(normalizeValue)
    .filter(Boolean)
  const visitTypes = new Set([
    'site_visit',
    'appointment',
    'project_start',
    'job',
    'inspection',
    'final_walkthrough',
    'follow_up',
  ])

  return values.some((value) => visitTypes.has(value))
}

function getEventOccurrenceTime(event = {}) {
  const timestamp = event.endsAt || event.ends_at || event.startsAt || event.starts_at
  if (timestamp) {
    const parsedTimestamp = new Date(timestamp)
    if (!Number.isNaN(parsedTimestamp.getTime())) return parsedTimestamp.getTime()
  }

  const date = event.date || event.eventDate || event.event_date
  if (!date) return null

  const time = event.endTime || event.end_time || event.startTime || event.start_time || '23:59:59'
  const parsedDate = new Date(`${date}T${time}`)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime()
}

export function hasOccurredProjectVisit(events = [], now = new Date()) {
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(nowTime)) return false

  return toList(events).some((event) => {
    if (!event || isArchivedRecord(event) || !isProjectVisit(event)) return false

    const status = normalizeValue(event.status)
    if (['cancelled', 'canceled', 'no_show'].includes(status)) return false
    if (['complete', 'completed'].includes(status)) return true

    const occurrenceTime = getEventOccurrenceTime(event)
    return occurrenceTime !== null && occurrenceTime <= nowTime
  })
}

export function deriveProjectStatus({
  project = {},
  contract = null,
  contracts = [],
  payments = [],
  events = [],
  isArchived = false,
  now = new Date(),
} = {}) {
  if (isArchived || isArchivedRecord(project)) {
    return PROJECT_LIFECYCLE_STATUS.ARCHIVED
  }

  const storedStatus = normalizeValue(project?.projectStatus || project?.status)
  if (project?.completedAt || project?.completed_at || storedStatus === 'completed') {
    return PROJECT_LIFECYCLE_STATUS.COMPLETED
  }

  const contractCandidates = [
    ...toList(contract),
    ...toList(contracts),
    ...toList(project?.contracts),
    ...toList(project?.portal?.contract),
  ]
  const hasSignedContract = contractCandidates.some(isProjectContractSigned)

  if (!hasSignedContract) {
    return PROJECT_LIFECYCLE_STATUS.CONTRACT_DRAFT
  }

  const providedPayments = toList(payments)
  const paymentCandidates = providedPayments.length ? providedPayments : [
    ...toList(project?.payments),
    ...toList(project?.portal?.payments),
    ...toList(project?.portal?.paymentHistory),
  ]
  const providedEvents = toList(events)
  const eventCandidates = providedEvents.length ? providedEvents : [
    ...toList(project?.events),
    ...toList(project?.schedule),
    ...toList(project?.scheduleEvents),
  ]

  if (hasProjectWorkPayment(paymentCandidates) || hasOccurredProjectVisit(eventCandidates, now)) {
    return PROJECT_LIFECYCLE_STATUS.IN_PROGRESS
  }

  return PROJECT_LIFECYCLE_STATUS.SIGNED
}

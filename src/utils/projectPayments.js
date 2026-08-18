import { currency } from './formatters.js'

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampAtZero(value) {
  return Math.max(toNumber(value), 0)
}

function readField(source = {}, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key]
    }
  }

  return undefined
}

function normalizeDate(value) {
  if (!value) return ''

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  return parsedDate.toISOString().slice(0, 10)
}

function formatDisplayDate(value, fallback = '') {
  if (!value) return fallback

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return fallback || String(value)
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function normalizePaymentTypeKey(value) {
  const normalized = String(value || '').trim().toLowerCase()

  if (normalized.includes('deposit')) return 'deposit'
  if (normalized.includes('progress')) return 'progress'
  if (normalized.includes('final')) return 'final'
  return 'other'
}

export function getDisplayPaymentType(value) {
  const paymentTypeKey = normalizePaymentTypeKey(value)

  if (paymentTypeKey === 'deposit') return 'Deposit'
  if (paymentTypeKey === 'progress') return 'Progress Payment'
  if (paymentTypeKey === 'final') return 'Final Payment'
  return 'Other'
}

export function normalizePaymentRecord(payment = {}, fallbackValues = {}) {
  const amount = toNumber(readField(payment, ['amount']) ?? fallbackValues.amount)
  const paymentDateSource = readField(payment, ['paymentDate', 'payment_date', 'date']) ?? fallbackValues.paymentDate ?? fallbackValues.date
  const paymentDate = normalizeDate(paymentDateSource)
  const paymentMethod = readField(payment, ['paymentMethod', 'payment_method', 'method']) ?? fallbackValues.paymentMethod ?? fallbackValues.method ?? ''
  const paymentType = readField(payment, ['paymentType', 'payment_type', 'type']) ?? fallbackValues.paymentType ?? fallbackValues.type ?? ''
  const createdAt = readField(payment, ['createdAt', 'created_at']) ?? fallbackValues.createdAt ?? fallbackValues.created_at ?? new Date().toISOString()
  const archivedAt = readField(payment, ['archivedAt', 'archived_at']) ?? fallbackValues.archivedAt ?? fallbackValues.archived_at ?? null
  const displayType = paymentType || getDisplayPaymentType(paymentType)

  return {
    ...payment,
    id: payment.id || fallbackValues.id || '',
    contractorId: readField(payment, ['contractorId', 'contractor_id']) ?? fallbackValues.contractorId ?? fallbackValues.contractor_id ?? undefined,
    clientId: readField(payment, ['clientId', 'client_id']) ?? fallbackValues.clientId ?? fallbackValues.client_id ?? null,
    projectId: readField(payment, ['projectId', 'project_id']) ?? fallbackValues.projectId ?? fallbackValues.project_id ?? null,
    contractId: readField(payment, ['contractId', 'contract_id']) ?? fallbackValues.contractId ?? fallbackValues.contract_id ?? null,
    estimateId: readField(payment, ['estimateId', 'estimate_id']) ?? fallbackValues.estimateId ?? fallbackValues.estimate_id ?? null,
    invoiceId: readField(payment, ['invoiceId', 'invoice_id']) ?? fallbackValues.invoiceId ?? fallbackValues.invoice_id ?? null,
    leadId: readField(payment, ['leadId', 'lead_id']) ?? fallbackValues.leadId ?? fallbackValues.lead_id ?? null,
    amount,
    paymentDate,
    date: readField(payment, ['date', 'displayPaymentDate', 'display_payment_date']) ?? fallbackValues.date ?? formatDisplayDate(paymentDate),
    paymentMethod,
    method: paymentMethod,
    paymentType: displayType,
    type: displayType,
    paymentTypeKey: normalizePaymentTypeKey(displayType),
    status: readField(payment, ['status']) ?? fallbackValues.status ?? 'Recorded',
    referenceNumber: readField(payment, ['referenceNumber', 'reference_number']) ?? fallbackValues.referenceNumber ?? fallbackValues.reference_number ?? '',
    notes: readField(payment, ['notes']) ?? fallbackValues.notes ?? '',
    createdAt,
    archivedAt,
    updatedAt: readField(payment, ['updatedAt', 'updated_at']) ?? fallbackValues.updatedAt ?? fallbackValues.updated_at ?? createdAt,
  }
}

export function dedupePayments(payments = []) {
  const paymentMap = new Map()

  payments
    .filter(Boolean)
    .map((payment) => normalizePaymentRecord(payment))
    .forEach((payment, index) => {
      const fallbackKey = [
        payment.projectId || 'no-project',
        payment.invoiceId || 'no-invoice',
        payment.clientId || 'no-client',
        payment.paymentDate || payment.createdAt || `payment-${index}`,
        payment.amount,
        payment.paymentTypeKey,
      ].join(':')
      const key = payment.id || fallbackKey

      paymentMap.set(key, payment)
    })

  return Array.from(paymentMap.values())
}

export function collectProjectInvoiceIds(project = {}) {
  return Array.from(new Set(
    [
      ...(Array.isArray(project?.invoices) ? project.invoices : []),
      ...(Array.isArray(project?.portal?.invoices) ? project.portal.invoices : []),
    ]
      .map((invoice) => invoice?.id || invoice?.invoiceId || invoice?.invoice_id || '')
      .filter(Boolean)
  ))
}

export function getProjectPaymentRecords(project = {}, payments = [], { relatedInvoiceIds = [] } = {}) {
  const projectId = project?.id || project?.projectId || project?.project_id || ''
  const clientId = project?.clientId || project?.client_id || ''
  const leadIds = new Set(
    [
      project?.leadId,
      project?.lead_id,
      project?.id,
      project?.projectId,
      project?.project_id,
    ].filter(Boolean)
  )
  const invoiceIds = new Set(relatedInvoiceIds.filter(Boolean))

  return dedupePayments(payments)
    .filter((payment) => !payment.archivedAt)
    .filter((payment) => {
      const matchesProjectId = Boolean(projectId && payment.projectId === projectId)
      const matchesInvoiceId = Boolean(payment.invoiceId && invoiceIds.has(payment.invoiceId))
      const matchesLeadId = Boolean(payment.leadId && leadIds.has(payment.leadId))
      const matchesClientFallback = Boolean(
        !payment.projectId
          && clientId
          && payment.clientId === clientId
          && (matchesLeadId || matchesInvoiceId)
      )

      return matchesProjectId || matchesInvoiceId || matchesClientFallback
    })
    .sort((left, right) => {
      const leftTimestamp = new Date(left.paymentDate || left.createdAt || 0).getTime()
      const rightTimestamp = new Date(right.paymentDate || right.createdAt || 0).getTime()
      return rightTimestamp - leftTimestamp
    })
}

export function calculateProjectPaymentSummary(project = {}, payments = [], { relatedInvoiceIds = [] } = {}) {
  const projectPayments = getProjectPaymentRecords(project, payments, { relatedInvoiceIds })
  const projectValue = clampAtZero(
    project?.value
      ?? project?.estimatedValue
      ?? project?.contractValue
      ?? project?.portal?.contractAmount
  )
  const depositRequired = clampAtZero(
    project?.portal?.depositRequired
      ?? Math.round(projectValue * 0.5)
  )
  const depositPaid = projectPayments
    .filter((payment) => payment.paymentTypeKey === 'deposit')
    .reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const otherPaymentsTotal = projectPayments
    .filter((payment) => payment.paymentTypeKey !== 'deposit')
    .reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const totalPaid = projectPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const outstandingBalance = Math.max(projectValue - totalPaid, 0)

  let paymentStatus = 'Not Paid'

  if (projectValue > 0 && totalPaid >= projectValue) {
    paymentStatus = 'Paid'
  } else if (depositPaid > 0 && outstandingBalance > 0) {
    paymentStatus = 'Deposit Paid'
  } else if (totalPaid > 0 && outstandingBalance > 0) {
    paymentStatus = 'Partially Paid'
  }

  return {
    payments: projectPayments,
    projectValue,
    depositRequired,
    depositPaidTotal: depositPaid,
    depositPaid,
    otherPaymentsTotal,
    totalPaid,
    outstandingBalance,
    paymentStatus,
  }
}

export function buildPaymentTimelineEntries(payments = []) {
  return dedupePayments(payments)
    .filter((payment) => !payment.archivedAt)
    .sort((left, right) => {
      const leftTimestamp = new Date(left.paymentDate || left.createdAt || 0).getTime()
      const rightTimestamp = new Date(right.paymentDate || right.createdAt || 0).getTime()
      return rightTimestamp - leftTimestamp
    })
    .map((payment) => {
      const noteKeyMap = {
        deposit: 'depositPaymentRecordedTimelineNote',
        progress: 'progressPaymentRecordedTimelineNote',
        final: 'finalPaymentRecordedTimelineNote',
        other: 'otherPaymentRecordedTimelineNote',
      }

      return {
        id: `payment-timeline-${payment.id || `${payment.paymentDate}-${payment.amount}`}`,
        sourceType: 'payment',
        paymentId: payment.id || '',
        titleKey: 'paymentRecordedTimelineTitle',
        date: formatDisplayDate(payment.paymentDate, payment.date || payment.createdAt || ''),
        status: 'Complete',
        noteKey: noteKeyMap[payment.paymentTypeKey] || noteKeyMap.other,
        noteParams: {
          amount: currency.format(payment.amount),
        },
      }
    })
}

export function mergeProjectTimeline(existingTimeline = [], payments = []) {
  const paymentTimeline = buildPaymentTimelineEntries(payments)
  const baseTimeline = Array.isArray(existingTimeline) ? existingTimeline : []
  const seenKeys = new Set()

  return [...paymentTimeline, ...baseTimeline].filter((item, index) => {
    const key = item?.id || `${item?.titleKey || item?.title || 'timeline'}:${item?.date || index}:${item?.noteKey || item?.note || ''}`

    if (seenKeys.has(key)) {
      return false
    }

    seenKeys.add(key)
    return true
  })
}

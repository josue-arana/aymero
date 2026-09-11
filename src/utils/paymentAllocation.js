import { getInvoiceRemainingBalance, roundMoney, sumMoney } from './invoiceRecords.js'

const ELIGIBLE_STATUSES = new Set(['sent', 'partial', 'partially_paid', 'overdue'])
const EXCLUDED_PAYMENT_STATUSES = new Set(['failed', 'refunded', 'cancelled', 'canceled'])

function readField(source = {}, keys = []) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) return source[key]
  }
  return undefined
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function isArchived(record = {}) {
  return Boolean(record.archivedAt || record.archived_at || record.isArchived)
}

function getInvoiceId(invoice = {}) {
  return readField(invoice, ['id', 'invoiceId', 'invoice_id']) || ''
}

function getProjectId(record = {}) {
  return readField(record, ['projectId', 'project_id']) || ''
}

export function getInvoicePaymentRemaining(invoice = {}, payments = []) {
  const invoiceId = String(getInvoiceId(invoice))
  const linkedPayments = (Array.isArray(payments) ? payments : []).filter((payment) => (
    String(readField(payment, ['invoiceId', 'invoice_id']) || '') === invoiceId
      && !isArchived(payment)
      && !EXCLUDED_PAYMENT_STATUSES.has(normalizeStatus(payment.status))
  ))
  const storedAmountPaid = readField(invoice, ['amountPaid', 'amount_paid'])
  const amountPaid = linkedPayments.length > 0
    ? sumMoney(linkedPayments.map((payment) => payment.amount))
    : storedAmountPaid

  return getInvoiceRemainingBalance({
    ...invoice,
    amountPaid,
  })
}

export function isEligiblePaymentInvoice(invoice = {}, { payments = [] } = {}) {
  if (!invoice || isArchived(invoice)) return false
  if (!ELIGIBLE_STATUSES.has(normalizeStatus(invoice.status))) return false
  return getInvoicePaymentRemaining(invoice, payments) > 0
}

export function getEligiblePaymentInvoices(invoices = [], { projectId = '', payments = [] } = {}) {
  const normalizedProjectId = String(projectId || '')
  if (!normalizedProjectId || !Array.isArray(invoices)) return []

  return invoices
    .filter((invoice) => String(getProjectId(invoice)) === normalizedProjectId)
    .filter((invoice) => isEligiblePaymentInvoice(invoice, { payments }))
    .sort((left, right) => String(getInvoiceId(left)).localeCompare(String(getInvoiceId(right))))
}

export function validateInvoicePayment({ invoice, amount, projectId = '', payments = [] } = {}) {
  if (!invoice) return { code: 'invoiceRequired' }
  const invoiceId = String(getInvoiceId(invoice))
  if (!invoiceId) return { code: 'invoiceRequired' }
  if (projectId && String(getProjectId(invoice)) !== String(projectId)) return { code: 'invoiceProjectMismatch' }
  if (!isEligiblePaymentInvoice(invoice, { payments })) return { code: 'invoiceNotEligible' }

  const rawAmount = String(amount ?? '').trim()
  const parsedAmount = Number(amount)
  if (!rawAmount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return { code: 'amountPositive' }
  if (Math.round(parsedAmount * 100) !== parsedAmount * 100) return { code: 'amountPrecision' }

  const remaining = getInvoicePaymentRemaining(invoice, payments)
  const normalizedAmount = roundMoney(parsedAmount)
  if (normalizedAmount > remaining) {
    return {
      code: 'amountExceedsRemaining',
      overage: roundMoney(normalizedAmount - remaining),
      remaining,
    }
  }

  return null
}

export function validateProjectPaymentAmount({ projectValue, projectBalance, amount, payments = [], projectId = '', invoiceIds = [], currentPaymentId = '' } = {}) {
  const agreedValue = roundMoney(projectValue)
  if (agreedValue <= 0) return null

  const normalizedProjectId = String(projectId || '')
  const relatedInvoiceIds = new Set((Array.isArray(invoiceIds) ? invoiceIds : []).filter(Boolean).map(String))
  const existingPayments = (Array.isArray(payments) ? payments : [])
    .filter((payment) => !isArchived(payment) && !EXCLUDED_PAYMENT_STATUSES.has(normalizeStatus(payment.status)))
    .filter((payment) => {
      const paymentProjectId = String(getProjectId(payment))
      const paymentInvoiceId = String(readField(payment, ['invoiceId', 'invoice_id']) || '')
      return paymentProjectId === normalizedProjectId || relatedInvoiceIds.has(paymentInvoiceId)
    })
  const currentPaymentAmount = existingPayments.find((payment) => (
    String(readField(payment, ['id']) || '') === String(currentPaymentId || '')
  ))?.amount || 0
  const totalProjectPaid = sumMoney(existingPayments
    .filter((payment) => String(readField(payment, ['id']) || '') !== String(currentPaymentId || ''))
    .map((payment) => payment.amount))
  const normalizedAmount = roundMoney(amount)
  const remaining = projectBalance !== undefined && projectBalance !== null && Number.isFinite(Number(projectBalance))
    ? roundMoney(Math.max(Number(projectBalance) + Number(currentPaymentAmount), 0))
    : roundMoney(Math.max(agreedValue - totalProjectPaid, 0))

  if (normalizedAmount <= remaining) return null

  return {
    code: 'amountExceedsProjectBalance',
    overage: roundMoney(normalizedAmount - remaining),
    remaining,
  }
}

export function buildInvoicePaymentContext({ invoice = {}, project = {}, lead = {} } = {}) {
  return {
    invoiceId: getInvoiceId(invoice) || null,
    projectId: getProjectId(invoice) || getProjectId(project) || readField(project, ['id']) || null,
    clientId: readField(invoice, ['clientId', 'client_id']) || readField(project, ['clientId', 'client_id']) || readField(lead, ['clientId', 'client_id']) || null,
    contractId: readField(invoice, ['contractId', 'contract_id']) || readField(project, ['contractId', 'contract_id']) || readField(lead, ['contractId', 'contract_id']) || null,
    estimateId: readField(invoice, ['estimateId', 'estimate_id']) || readField(project, ['estimateId', 'estimate_id']) || readField(lead, ['estimateId', 'estimate_id']) || null,
    leadId: readField(invoice, ['leadId', 'lead_id']) || readField(project, ['leadId', 'lead_id']) || readField(lead, ['id']) || null,
  }
}

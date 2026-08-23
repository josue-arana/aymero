import { getClientSlug } from './clients.js'
import { getInvoiceDisplayNumber } from './invoiceNumber.js'
import { findLeadByProjectLookup, dedupeById } from './projectIdentity.js'
import { dedupePayments, normalizePaymentRecord } from './projectPayments.js'

function readField(source = {}, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key]
    }
  }

  return undefined
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeInvoiceLineItems(lineItems = []) {
  if (!Array.isArray(lineItems)) return []

  return lineItems.map((item) => ({
    ...(item && typeof item === 'object' ? item : {}),
    description: typeof item?.description === 'string'
      ? item.description
      : typeof item?.name === 'string'
        ? item.name
        : '',
    amount: toNumber(item?.amount),
  }))
}

export function calculateInvoiceTotal(lineItems = [], fallbackAmount = 0) {
  const normalizedLineItems = normalizeInvoiceLineItems(lineItems)

  if (normalizedLineItems.length === 0) {
    return toNumber(fallbackAmount)
  }

  return normalizedLineItems.reduce((sum, item) => sum + toNumber(item.amount), 0)
}

export function getInvoiceRemainingBalance(invoice = {}) {
  return Math.max(toNumber(invoice.amount) - toNumber(invoice.amountPaid), 0)
}

export function isCollectibleInvoice(invoice = {}) {
  const normalizedStatus = normalizeInvoiceStatus(invoice?.status, {
    amount: toNumber(invoice?.amount),
    amountPaid: toNumber(invoice?.amountPaid),
    hasLinkedPayments: Array.isArray(invoice?.paymentHistory) && invoice.paymentHistory.length > 0,
  })
  const isArchived = normalizedStatus === 'Archived'
    || Boolean(invoice?.archivedAt || invoice?.archived_at || invoice?.isArchived)

  if (isArchived || ['Draft', 'Paid', 'Canceled'].includes(normalizedStatus)) {
    return false
  }

  return getInvoiceRemainingBalance(invoice) > 0
}

export function calculateOutstandingInvoiceBalance(invoices = []) {
  if (!Array.isArray(invoices)) return 0

  return invoices.reduce((total, invoice) => (
    isCollectibleInvoice(invoice)
      ? total + getInvoiceRemainingBalance(invoice)
      : total
  ), 0)
}

function normalizeInvoicePaymentHistory(paymentHistory = []) {
  if (!Array.isArray(paymentHistory)) return []

  return paymentHistory.map((entry, index) => ({
    ...(entry && typeof entry === 'object' ? entry : {}),
    id: entry?.id || `payment-history-${index}`,
    amount: toNumber(entry?.amount),
    date: entry?.date || '',
    method: entry?.method || '',
    type: entry?.type || '',
    notes: entry?.notes || '',
  }))
}

function buildLinkedPaymentHistory(payments = []) {
  return dedupePayments(payments).map((payment) => {
    const normalizedPayment = normalizePaymentRecord(payment)

    return {
      id: normalizedPayment.id || `payment-${normalizedPayment.paymentDate || normalizedPayment.createdAt || Date.now()}`,
      amount: toNumber(normalizedPayment.amount),
      date: normalizedPayment.date || normalizedPayment.paymentDate || '',
      method: normalizedPayment.method || normalizedPayment.paymentMethod || '',
      type: normalizedPayment.type || normalizedPayment.paymentType || '',
      notes: normalizedPayment.notes || '',
    }
  })
}

export function normalizeInvoiceStatus(status, { amount = 0, amountPaid = 0, hasLinkedPayments = false } = {}) {
  if (status === 'Archived') return status
  if (status === 'Canceled' || status === 'Cancelled') return 'Canceled'
  if (status === 'Overdue') return status

  if (hasLinkedPayments || amountPaid > 0 || status === 'Paid' || status === 'Partially Paid') {
    if (amount > 0 && amountPaid >= amount) return 'Paid'
    if (amountPaid > 0) return 'Partially Paid'
  }

  return status || 'Draft'
}

export function findRelatedLeadForInvoice(leads = [], invoice = {}) {
  const linkedLead = findLeadByProjectLookup(
    leads,
    invoice?.projectId,
    invoice?.project_id,
    invoice?.leadId,
    invoice?.lead_id
  )

  if (linkedLead) {
    return linkedLead
  }

  // A Project is the authoritative relationship when projectId is present.
  // Falling back by Client here can attach a direct Client -> Project invoice
  // to an unrelated historical Lead owned by the same Client.
  if (invoice?.projectId || invoice?.project_id) {
    return null
  }

  const invoiceClientId = String(invoice?.clientId || invoice?.client_id || '').trim()
  const invoiceClientSlug = getClientSlug(invoice?.client || invoice?.clientName || invoice?.customerName || '')

  if (!invoiceClientId && !invoiceClientSlug) {
    return null
  }

  return leads.find((lead) => {
    const leadClientId = String(lead?.clientId || lead?.client_id || '').trim()
    const leadClientSlug = getClientSlug(lead?.client || lead?.clientName || lead?.customerName || '')

    return Boolean(
      (invoiceClientId && leadClientId && leadClientId === invoiceClientId)
      || (invoiceClientSlug && leadClientSlug === invoiceClientSlug)
    )
  }) || null
}

export function hydrateInvoiceRecord(invoice = {}, { leads = [], payments = [], defaultContractorId = '' } = {}) {
  const relatedLead = findRelatedLeadForInvoice(leads, invoice)
  const lineItems = normalizeInvoiceLineItems(readField(invoice, ['lineItems', 'line_items']) || [])
  const rawAmount = readField(invoice, ['amount', 'total', 'totalAmount', 'total_amount'])
  const amount = calculateInvoiceTotal(lineItems, rawAmount)
  const linkedPayments = dedupePayments(payments).filter((payment) => payment.invoiceId === invoice?.id)
  const hasLinkedPayments = linkedPayments.length > 0
  const amountPaid = hasLinkedPayments
    ? linkedPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
    : toNumber(readField(invoice, ['amountPaid', 'amount_paid']))
  const paymentHistory = hasLinkedPayments
    ? buildLinkedPaymentHistory(linkedPayments)
    : normalizeInvoicePaymentHistory(readField(invoice, ['paymentHistory', 'payment_history']) || [])
  const clientName = invoice?.client
    || invoice?.clientName
    || invoice?.customerName
    || relatedLead?.client
    || relatedLead?.clientName
    || relatedLead?.customerName
    || ''
  const clientId = invoice?.clientId
    || invoice?.client_id
    || relatedLead?.clientId
    || relatedLead?.client_id
    || getClientSlug(clientName)
    || null
  const projectId = invoice?.projectId
    || invoice?.project_id
    || relatedLead?.projectId
    || relatedLead?.project_id
    || relatedLead?.id
    || null
  const leadId = invoice?.leadId
    || invoice?.lead_id
    || relatedLead?.id
    || null
  const estimateId = invoice?.estimateId
    || invoice?.estimate_id
    || relatedLead?.estimateId
    || relatedLead?.estimate_id
    || relatedLead?.portal?.estimate?.id
    || relatedLead?.portal?.estimate?.number
    || null
  const contractId = invoice?.contractId
    || invoice?.contract_id
    || relatedLead?.contractId
    || relatedLead?.contract_id
    || relatedLead?.portal?.contract?.id
    || relatedLead?.portal?.contract?.number
    || null
  const title = invoice?.title || invoice?.projectTitle || relatedLead?.projectTitle || relatedLead?.projectType || 'Invoice'
  const number = getInvoiceDisplayNumber(invoice, {
    ...invoice,
    clientId,
    projectId,
    leadId,
    estimateId,
    contractId,
  }, readField(invoice, ['createdAt', 'created_at', 'issueDate', 'issue_date']) || new Date())
  const normalizedInvoice = {
    ...invoice,
    id: invoice?.id || '',
    contractorId: invoice?.contractorId || invoice?.contractor_id || relatedLead?.contractorId || defaultContractorId || undefined,
    clientId,
    projectId,
    leadId,
    estimateId,
    contractId,
    client: clientName,
    clientName,
    customerName: clientName,
    title,
    projectTitle: invoice?.projectTitle || title,
    number,
    invoiceNumber: number,
    invoiceLanguage: invoice?.invoiceLanguage || '',
    lineItems,
    amount,
    total: amount,
    totalAmount: amount,
    amountPaid,
    paymentHistory,
    status: normalizeInvoiceStatus(invoice?.status, { amount, amountPaid, hasLinkedPayments }),
  }

  return {
    ...normalizedInvoice,
    remainingBalance: getInvoiceRemainingBalance(normalizedInvoice),
    amountDue: getInvoiceRemainingBalance(normalizedInvoice),
  }
}

export function dedupeInvoiceRecords(records = []) {
  return dedupeById(records, ['number', 'invoiceNumber', 'invoice_number'])
}

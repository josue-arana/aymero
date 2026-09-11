import { calculateInvoiceTotal, normalizeInvoiceLineItems, roundMoney } from './invoiceRecords.js'
import { calculateProjectFinancialSummary } from './projectFinancials.js'

const DRAFT_STATUS = 'draft'

function readField(source = {}, keys = []) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) return source[key]
  }
  return undefined
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function isArchived(record = {}) {
  return Boolean(record.archivedAt || record.archived_at || record.isArchived)
}

export function getInvoiceAmount(invoice = {}) {
  const lineItems = normalizeInvoiceLineItems(readField(invoice, ['lineItems', 'line_items']) || [])
  return roundMoney(calculateInvoiceTotal(lineItems, readField(invoice, ['amount', 'total', 'totalAmount', 'total_amount'])))
}

export function isActiveDraftInvoice(invoice = {}) {
  if (!invoice || isArchived(invoice)) return false
  const status = normalizeStatus(invoice.status)
  return status === DRAFT_STATUS
}

export function calculateInvoiceBillingCapacity({
  project = {},
  estimates = [],
  contracts = [],
  invoices = [],
  payments = [],
  currentInvoiceId = '',
  currentInvoiceAmount = undefined,
} = {}) {
  const financialSummary = calculateProjectFinancialSummary({
    project,
    estimates,
    contracts,
    invoices,
    payments,
  })
  const normalizedCurrentId = String(currentInvoiceId || '')
  const projectInvoices = Array.isArray(invoices) ? invoices : []
  const activeDraftInvoices = projectInvoices.filter((invoice) => (
    isActiveDraftInvoice(invoice)
      && String(readField(invoice, ['projectId', 'project_id']) || '') === String(financialSummary.projectId || '')
  ))
  const otherDraftReserved = activeDraftInvoices
    .filter((invoice) => String(readField(invoice, ['id', 'invoiceId', 'invoice_id']) || '') !== normalizedCurrentId)
    .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0)
  const finalizedInvoicedExcludingCurrent = financialSummary.invoices
    .filter((invoice) => String(readField(invoice, ['id', 'invoiceId', 'invoice_id']) || '') !== normalizedCurrentId)
    .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0)
  const committedBillingExcludingCurrent = roundMoney(finalizedInvoicedExcludingCurrent + otherDraftReserved)
  const hasAgreedValue = financialSummary.agreedValueSource !== 'none'
  const availableToBill = hasAgreedValue
    ? roundMoney(Math.max(financialSummary.agreedValue - committedBillingExcludingCurrent, 0))
    : null
  const currentInvoice = projectInvoices.find((invoice) => String(readField(invoice, ['id', 'invoiceId', 'invoice_id']) || '') === normalizedCurrentId) || null
  const resolvedCurrentAmount = currentInvoiceAmount === undefined
    ? currentInvoice ? getInvoiceAmount(currentInvoice) : 0
    : roundMoney(currentInvoiceAmount)
  const projectedBillingAfterSave = hasAgreedValue
    ? roundMoney(committedBillingExcludingCurrent + resolvedCurrentAmount)
    : null
  const projectedOverbillingAmount = hasAgreedValue
    ? roundMoney(Math.max(projectedBillingAfterSave - financialSummary.agreedValue, 0))
    : 0

  return {
    ...financialSummary,
    finalizedInvoiced: finalizedInvoicedExcludingCurrent,
    draftReservedAmount: roundMoney(otherDraftReserved),
    committedBillingExcludingCurrent,
    availableToBill,
    currentInvoiceAmount: resolvedCurrentAmount,
    projectedBillingAfterSave,
    projectedOverbillingAmount,
    isOverbilling: projectedOverbillingAmount > 0,
    hasAgreedValue,
  }
}

export function validateInvoiceAgainstBillingCapacity({ capacity, invoiceAmount = 0 } = {}) {
  if (!capacity || !capacity.hasAgreedValue) return null

  const normalizedAmount = roundMoney(invoiceAmount)
  const availableToBill = roundMoney(capacity.availableToBill)
  if (normalizedAmount <= availableToBill) return null

  return {
    code: 'exceedsAvailableToBill',
    overage: roundMoney(normalizedAmount - availableToBill),
    availableToBill,
    invoiceAmount: normalizedAmount,
  }
}


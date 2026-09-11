import { dedupePayments } from './projectPayments.js'

const INVOICE_STATUSES = new Set(['sent', 'partial', 'partially_paid', 'paid', 'overdue'])
const EXCLUDED_PAYMENT_STATUSES = new Set(['failed', 'refunded', 'cancelled', 'canceled'])
const EXCLUDED_ESTIMATE_STATUSES = new Set(['rejected', 'cancelled', 'canceled', 'archived'])
const EXCLUDED_CONTRACT_STATUSES = new Set(['cancelled', 'canceled', 'archived'])

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

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100
}

function sumMoney(values = []) {
  return roundMoney((Array.isArray(values) ? values : []).reduce((sum, value) => sum + Math.round(toNumber(value) * 100), 0) / 100)
}

function getInvoiceRemainingBalance(invoice = {}) {
  return roundMoney(Math.max(
    toNumber(readField(invoice, ['amount', 'total', 'totalAmount', 'total_amount']))
      - toNumber(readField(invoice, ['amountPaid', 'amount_paid'])),
    0,
  ))
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function isArchived(record = {}) {
  return Boolean(record.archivedAt || record.archived_at || record.isArchived)
}

function hasMeaningfulAmount(record = {}) {
  return toNumber(readField(record, ['total', 'totalAmount', 'total_amount', 'amount', 'contractAmount', 'contract_amount'])) > 0
}

function getRecordId(record = {}) {
  return readField(record, ['id', 'projectId', 'project_id']) || ''
}

function getProjectId(project = {}) {
  return readField(project, ['id', 'projectId', 'project_id']) || ''
}

function getEstimateProjectId(estimate = {}) {
  return readField(estimate, ['projectId', 'project_id']) || ''
}

function getContractProjectId(contract = {}) {
  return readField(contract, ['projectId', 'project_id']) || ''
}

function getEstimateTotal(estimate = {}) {
  return roundMoney(readField(estimate, ['total', 'totalAmount', 'total_amount', 'amount']))
}

function getContractTotal(contract = {}) {
  return roundMoney(readField(contract, ['total', 'totalAmount', 'total_amount', 'contractAmount', 'contract_amount', 'amount']))
}

function activeEstimates(project = {}, estimates = []) {
  const projectId = String(getProjectId(project))
  return (Array.isArray(estimates) ? estimates : [])
    .filter((estimate) => estimate && !isArchived(estimate))
    .filter((estimate) => !EXCLUDED_ESTIMATE_STATUSES.has(normalizeStatus(estimate.status)))
    .filter((estimate) => {
      const estimateProjectId = String(getEstimateProjectId(estimate))
      return !projectId || !estimateProjectId || estimateProjectId === projectId
    })
    .filter(hasMeaningfulAmount)
}

function activeContracts(project = {}, contracts = []) {
  const projectId = String(getProjectId(project))
  return (Array.isArray(contracts) ? contracts : [])
    .filter((contract) => contract && !isArchived(contract))
    .filter((contract) => !EXCLUDED_CONTRACT_STATUSES.has(normalizeStatus(contract.status)))
    .filter((contract) => {
      const contractProjectId = String(getContractProjectId(contract))
      return !projectId || !contractProjectId || contractProjectId === projectId
    })
    .filter(hasMeaningfulAmount)
}

function selectContract(project, contracts) {
  const candidates = activeContracts(project, contracts)
  if (candidates.length === 0) return null

  const explicitContractId = readField(project, ['contractId', 'contract_id'])
    || project?.portal?.contract?.id
    || project?.portal?.contract?.contractId
  if (explicitContractId) {
    const explicit = candidates.find((contract) => String(getRecordId(contract)) === String(explicitContractId))
    if (explicit) return explicit
  }

  const signed = candidates.filter((contract) => ['signed', 'active'].includes(normalizeStatus(contract.status)) || contract.signed === true)
  if (signed.length === 1) return signed[0]
  if (candidates.length === 1) return candidates[0]
  return null
}

export function resolveProjectAgreedValue({ project = {}, estimates = [], contracts = [] } = {}) {
  const contract = selectContract(project, contracts)
  if (contract) {
    return {
      agreedValue: getContractTotal(contract),
      agreedValueSource: 'contract',
      agreedValueSourceId: getRecordId(contract) || null,
    }
  }

  const active = activeEstimates(project, estimates)
  const selectedEstimateId = readField(project, ['selectedEstimateId', 'selected_estimate_id'])
  if (selectedEstimateId) {
    const selected = active.find((estimate) => String(getRecordId(estimate)) === String(selectedEstimateId))
    if (selected) {
      return {
        agreedValue: getEstimateTotal(selected),
        agreedValueSource: 'selected_estimate',
        agreedValueSourceId: getRecordId(selected) || null,
      }
    }
  }

  if (active.length === 1) {
    return {
      agreedValue: getEstimateTotal(active[0]),
      agreedValueSource: 'single_estimate',
      agreedValueSourceId: getRecordId(active[0]) || null,
    }
  }

  const projectValue = [
    readField(project, ['projectValue']),
    readField(project, ['contractValue', 'contract_value']),
    readField(project, ['value']),
    readField(project, ['estimatedValue', 'estimated_value']),
    readField(project?.portal, ['contractAmount', 'contract_amount']),
  ].find((value) => value !== undefined && value !== null && value !== '' && toNumber(value) > 0)
  if (projectValue !== undefined) {
    return {
      agreedValue: roundMoney(projectValue),
      agreedValueSource: 'project',
      agreedValueSourceId: getProjectId(project) || null,
    }
  }

  return { agreedValue: 0, agreedValueSource: 'none', agreedValueSourceId: null }
}

export function getProjectInvoices(projectId, invoices = []) {
  const id = String(projectId || '')
  if (!id || !Array.isArray(invoices)) return []

  return invoices.filter((invoice) => {
    if (!invoice || isArchived(invoice)) return false
    const invoiceProjectId = readField(invoice, ['projectId', 'project_id'])
    if (!invoiceProjectId || String(invoiceProjectId) !== id) return false
    return INVOICE_STATUSES.has(normalizeStatus(invoice.status))
  })
}

export function getProjectPayments(projectId, payments = [], { invoiceIds = [] } = {}) {
  const id = String(projectId || '')
  const linkedInvoiceIds = new Set((Array.isArray(invoiceIds) ? invoiceIds : []).filter(Boolean).map(String))
  if ((!id && linkedInvoiceIds.size === 0) || !Array.isArray(payments)) return []

  return payments.filter((payment) => {
    if (!payment || isArchived(payment)) return false
    const paymentProjectId = String(readField(payment, ['projectId', 'project_id']) || '')
    const paymentInvoiceId = String(readField(payment, ['invoiceId', 'invoice_id']) || '')
    if (paymentProjectId !== id && !linkedInvoiceIds.has(paymentInvoiceId)) return false
    return !EXCLUDED_PAYMENT_STATUSES.has(normalizeStatus(payment.status))
  })
}

export function calculateProjectFinancialSummary({
  project = {},
  estimates = [],
  contracts = [],
  invoices = [],
  payments = [],
} = {}) {
  const projectId = getProjectId(project)
  const agreed = resolveProjectAgreedValue({ project, estimates, contracts })
  const projectInvoices = getProjectInvoices(projectId, invoices)
  const projectInvoiceIdSet = new Set(projectInvoices.map((invoice) => String(readField(invoice, ['id', 'invoiceId', 'invoice_id']) || '')))
  const projectPayments = getProjectPayments(projectId, dedupePayments(payments), {
    invoiceIds: projectInvoices.map((invoice) => readField(invoice, ['id', 'invoiceId', 'invoice_id'])),
  }).filter((payment) => {
    const invoiceId = String(readField(payment, ['invoiceId', 'invoice_id']) || '')
    return !invoiceId || projectInvoiceIdSet.has(invoiceId)
  })
  const totalInvoiced = sumMoney(projectInvoices.map((invoice) => readField(invoice, ['amount', 'total', 'totalAmount', 'total_amount'])))
  const invoiceLinkedPayments = projectPayments.filter((payment) => Boolean(readField(payment, ['invoiceId', 'invoice_id'])))
  const unappliedPayments = projectPayments.filter((payment) => !readField(payment, ['invoiceId', 'invoice_id']))
  const totalInvoicePaid = sumMoney(invoiceLinkedPayments.map((payment) => payment.amount))
  const unappliedProjectPayments = sumMoney(unappliedPayments.map((payment) => payment.amount))
  const totalProjectPaid = sumMoney(projectPayments.map((payment) => payment.amount))
  const projectBalance = agreed.agreedValue > 0
    ? roundMoney(Math.max(agreed.agreedValue - totalProjectPaid, 0))
    : null
  const outstandingInvoiced = sumMoney(projectInvoices.map((invoice) => {
    const invoiceId = readField(invoice, ['id', 'invoiceId', 'invoice_id'])
    const linkedPayments = invoiceLinkedPayments.filter((payment) => (
      String(readField(payment, ['invoiceId', 'invoice_id']) || '') === String(invoiceId || '')
    ))
    const storedPaid = readField(invoice, ['amountPaid', 'amount_paid'])
    const amountPaid = linkedPayments.length > 0
      ? sumMoney(linkedPayments.map((payment) => payment.amount))
      : storedPaid

    return getInvoiceRemainingBalance({
      ...invoice,
      amount: readField(invoice, ['amount', 'total', 'totalAmount', 'total_amount']),
      amountPaid,
    })
  }))
  const remainingToBill = roundMoney(Math.max(agreed.agreedValue - totalInvoiced, 0))
  const overbilledAmount = roundMoney(Math.max(totalInvoiced - agreed.agreedValue, 0))

  return {
    projectId,
    agreedValue: agreed.agreedValue,
    agreedValueSource: agreed.agreedValueSource,
    agreedValueSourceId: agreed.agreedValueSourceId,
    invoices: projectInvoices,
    payments: projectPayments,
    totalInvoiced,
    totalInvoicePaid,
    totalProjectPaid,
    projectBalance,
    invoiceAssociatedPayments: invoiceLinkedPayments,
    unassociatedProjectPayments: unappliedPayments,
    unappliedProjectPayments,
    outstandingInvoiced,
    remainingToBill,
    overbilledAmount,
    isOverbilled: overbilledAmount > 0,
  }
}

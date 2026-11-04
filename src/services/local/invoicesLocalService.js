import { mockInvoices } from '../../data/mockInvoices'
import { dedupeInvoiceRecords, hydrateInvoiceRecord, sanitizeInvoiceLineItemsForStorage } from '../../utils/invoiceRecords'
import { generateInvoiceNumber } from '../../utils/invoiceNumber'
import { createLocalRecordId } from '../../utils/projectIdentity'

const STORAGE_KEY = 'contractorflow.invoices'

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function getStorageKey(contractorId = '') {
  return contractorId ? `${STORAGE_KEY}:${contractorId}` : STORAGE_KEY
}

function sortInvoices(invoices = []) {
  return [...invoices].sort((left, right) => {
    const leftTimestamp = new Date(left.createdAt || left.updatedAt || 0).getTime()
    const rightTimestamp = new Date(right.createdAt || right.updatedAt || 0).getTime()
    return rightTimestamp - leftTimestamp
  })
}

function normalizeStoredInvoices(invoices = [], contractorId = '') {
  return sortInvoices(dedupeInvoiceRecords(
    invoices.map((invoice) => hydrateInvoiceRecord(invoice, { defaultContractorId: contractorId }))
  ))
}

function readStoredInvoices(contractorId = '') {
  if (!canUseStorage()) {
    return normalizeStoredInvoices(mockInvoices, contractorId)
  }

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(contractorId))

    if (!rawValue) {
      const seededInvoices = normalizeStoredInvoices(mockInvoices, contractorId)
      writeStoredInvoices(seededInvoices, contractorId)
      return seededInvoices
    }

    const parsedValue = JSON.parse(rawValue)
    const storedInvoices = Array.isArray(parsedValue) ? parsedValue : []

    if (storedInvoices.length === 0) {
      const seededInvoices = normalizeStoredInvoices(mockInvoices, contractorId)
      writeStoredInvoices(seededInvoices, contractorId)
      return seededInvoices
    }

    return normalizeStoredInvoices(storedInvoices, contractorId)
  } catch {
    window.localStorage.removeItem(getStorageKey(contractorId))
    const seededInvoices = normalizeStoredInvoices(mockInvoices, contractorId)
    writeStoredInvoices(seededInvoices, contractorId)
    return seededInvoices
  }
}

function writeStoredInvoices(invoices = [], contractorId = '') {
  if (!canUseStorage()) return

  window.localStorage.setItem(
    getStorageKey(contractorId),
    JSON.stringify(normalizeStoredInvoices(invoices, contractorId))
  )
}

function matchesFilter(invoice, filters = {}) {
  if (!filters.includeArchived && invoice.archivedAt) return false
  if (filters.clientId && invoice.clientId !== filters.clientId) return false
  if (filters.projectId && invoice.projectId !== filters.projectId) return false
  if (filters.contractId && invoice.contractId !== filters.contractId) return false
  if (filters.estimateId && invoice.estimateId !== filters.estimateId) return false
  if (filters.leadId && invoice.leadId !== filters.leadId) return false
  if (filters.status && invoice.status !== filters.status) return false
  if (filters.contractorId && invoice.contractorId && invoice.contractorId !== filters.contractorId) return false
  return true
}

function generateUniqueInvoiceNumber(invoiceData = {}, existingInvoices = []) {
  const existingNumbers = new Set(
    existingInvoices
      .map((invoice) => String(invoice.number || invoice.invoiceNumber || '').trim().toUpperCase())
      .filter(Boolean)
  )

  let attempt = 0
  let nextNumber = ''

  do {
    const record = {
      ...invoiceData,
      id: invoiceData?.id || createLocalRecordId('invoice'),
      number: '',
      invoiceNumber: '',
      attempt,
    }

    nextNumber = generateInvoiceNumber({
      ...record,
      id: `${record.id}-${attempt}`,
    }, new Date())

    attempt += 1
  } while (existingNumbers.has(nextNumber) && attempt < 10)

  return nextNumber
}

export async function list({ includeArchived = false, status, clientId, projectId, contractId, estimateId, leadId, contractorId } = {}) {
  const invoices = readStoredInvoices(contractorId).filter((invoice) => matchesFilter(invoice, {
    includeArchived,
    status,
    clientId,
    projectId,
    contractId,
    estimateId,
    leadId,
    contractorId,
  }))

  return {
    data: invoices,
    error: null,
    skipped: false,
  }
}

export async function getById(id, { contractorId } = {}) {
  const invoice = readStoredInvoices(contractorId).find((entry) => entry.id === id) || null

  return {
    data: invoice,
    error: null,
    skipped: false,
  }
}

export async function create(invoiceData, opts = {}) {
  const contractorId = opts.contractorId || invoiceData?.contractorId || invoiceData?.contractor_id || ''
  const invoices = readStoredInvoices(contractorId)
  const now = new Date().toISOString()
  const id = invoiceData?.id || createLocalRecordId('invoice')
  const number = invoiceData?.number
    || invoiceData?.invoiceNumber
    || generateUniqueInvoiceNumber({ ...invoiceData, id }, invoices)
  const invoice = hydrateInvoiceRecord({
    ...invoiceData,
    ...(Array.isArray(invoiceData?.lineItems) ? { lineItems: sanitizeInvoiceLineItemsForStorage(invoiceData.lineItems) } : {}),
    id,
    number,
    invoiceNumber: number,
    contractorId: contractorId || invoiceData?.contractorId || invoiceData?.contractor_id || undefined,
    createdAt: invoiceData?.createdAt || now,
    updatedAt: now,
    archivedAt: null,
  }, { defaultContractorId: contractorId })

  writeStoredInvoices([invoice, ...invoices], contractorId)

  return {
    data: invoice,
    error: null,
    skipped: false,
  }
}

export async function update(id, updates, opts = {}) {
  const contractorId = opts.contractorId || updates?.contractorId || updates?.contractor_id || ''
  const invoices = readStoredInvoices(contractorId)
  let updatedInvoice = null

  const nextInvoices = invoices.map((invoice) => {
    if (invoice.id !== id) return invoice

    const number = updates?.number || updates?.invoiceNumber || invoice.number || invoice.invoiceNumber || generateUniqueInvoiceNumber({ ...invoice, ...updates, id }, invoices)

    updatedInvoice = hydrateInvoiceRecord({
      ...invoice,
      ...(updates || {}),
      ...(Array.isArray(updates?.lineItems) ? { lineItems: sanitizeInvoiceLineItemsForStorage(updates.lineItems) } : {}),
      id,
      number,
      invoiceNumber: number,
      updatedAt: new Date().toISOString(),
    }, { defaultContractorId: contractorId || invoice.contractorId })

    return updatedInvoice
  })

  writeStoredInvoices(nextInvoices, contractorId)

  return {
    data: updatedInvoice,
    error: null,
    skipped: false,
  }
}

export async function archive(id, opts = {}) {
  return update(id, { archivedAt: new Date().toISOString() }, opts)
}

export async function restore(id, opts = {}) {
  return update(id, { archivedAt: null }, opts)
}

export async function deletePermanently(id, { contractorId } = {}) {
  const invoices = readStoredInvoices(contractorId)
  const deletedInvoice = invoices.find((invoice) => invoice.id === id) || null
  const nextInvoices = invoices.filter((invoice) => invoice.id !== id)

  writeStoredInvoices(nextInvoices, contractorId)

  return {
    data: deletedInvoice || { id, deleted: true },
    error: null,
    skipped: false,
  }
}

export default { list, getById, create, update, archive, restore, deletePermanently }

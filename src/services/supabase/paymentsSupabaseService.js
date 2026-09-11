import { USE_SUPABASE, USE_SUPABASE_PAYMENTS } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'

const TABLE_NAME = 'payments'

const uiToDbStatusMap = {
  Pending: 'pending',
  Recorded: 'recorded',
  Failed: 'failed',
  Refunded: 'refunded',
}

const dbToUiStatusMap = {
  pending: 'Pending',
  recorded: 'Recorded',
  failed: 'Failed',
  refunded: 'Refunded',
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isDev() {
  return Boolean(import.meta.env.DEV)
}

function warnDev(message, meta) {
  if (!isDev()) return

  if (meta === undefined) {
    // eslint-disable-next-line no-console
    console.warn(message)
    return
  }

  // eslint-disable-next-line no-console
  console.warn(message, meta)
}

function createSkippedResponse(message, data = null) {
  return {
    data,
    error: null,
    skipped: true,
    message,
  }
}

function createErrorResult(message, details = null) {
  return {
    data: null,
    error: {
      message,
      details,
    },
    skipped: false,
  }
}

function normalizeError(error, fallbackMessage) {
  const raw = error?.raw || {}
  return {
    message: error?.message || fallbackMessage,
    details: error?.details || raw.details || null,
    hint: error?.hint || raw.hint || null,
    constraint: error?.constraint || raw.constraint || null,
    code: error?.code || raw.code || null,
    status: error?.status || null,
  }
}

function readSingleRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key)
}

function readField(source = {}, keys = []) {
  for (const key of keys) {
    if (hasOwn(source, key)) {
      return source[key]
    }
  }

  return undefined
}

function sanitizeUuid(value) {
  if (typeof value !== 'string') return null

  const trimmedValue = value.trim()

  if (!trimmedValue) return null
  if (!uuidPattern.test(trimmedValue)) return null

  return trimmedValue
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mapStatusToDb(status) {
  if (!status) return 'recorded'
  return uiToDbStatusMap[status] || String(status).toLowerCase().replace(/\s+/g, '_')
}

function mapStatusToUi(status) {
  if (!status) return 'Recorded'
  return dbToUiStatusMap[status] || status
}

function parseDateToIso(value) {
  if (!value) return null

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return parsedDate.toISOString().slice(0, 10)
}

function formatDisplayDate(value) {
  if (!value) return ''

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function parseLegacyNotes(notes) {
  const fallback = {
    notesText: notes || '',
    paymentType: '',
    leadId: null,
    displayPaymentDate: '',
  }

  if (!notes) return fallback

  try {
    const parsed = JSON.parse(notes)

    if (!parsed || typeof parsed !== 'object') {
      return fallback
    }

    return {
      notesText: parsed.notes || '',
      paymentType: parsed.paymentType || '',
      leadId: parsed.leadId || null,
      displayPaymentDate: parsed.displayPaymentDate || '',
    }
  } catch {
    return fallback
  }
}

function sortPayments(payments = []) {
  return [...payments].sort((left, right) => {
    const leftTimestamp = new Date(left.paymentDate || left.createdAt || 0).getTime()
    const rightTimestamp = new Date(right.paymentDate || right.createdAt || 0).getTime()
    return rightTimestamp - leftTimestamp
  })
}

function toAppPayment(row) {
  const parsedNotes = parseLegacyNotes(row?.notes)
  const paymentDate = row?.payment_date || null
  const paymentMethod = row?.payment_method || row?.method || ''
  const paymentType = row?.payment_type || parsedNotes.paymentType || ''

  return {
    id: row?.id || undefined,
    contractorId: row?.contractor_id || undefined,
    projectId: row?.project_id || null,
    clientId: row?.client_id || null,
    contractId: row?.contract_id || null,
    estimateId: row?.estimate_id || null,
    leadId: row?.lead_id || parsedNotes.leadId || null,
    invoiceId: row?.invoice_id || null,
    amount: toNumber(row?.amount),
    paymentType,
    paymentMethod,
    paymentDate,
    notes: parsedNotes.notesText,
    status: mapStatusToUi(row?.status),
    type: paymentType,
    method: paymentMethod,
    date: parsedNotes.displayPaymentDate || (paymentDate ? formatDisplayDate(paymentDate) : ''),
    referenceNumber: row?.reference_number || '',
    sampleDataKey: row?.sample_data_key || '',
    archivedAt: row?.archived_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export function toSupabasePayload(contractorId, payment = {}, { isCreate = false } = {}) {
  const payload = {}
  const amountInput = readField(payment, ['amount'])
  const paymentDateInput = readField(payment, ['paymentDate', 'payment_date', 'date'])
  const paymentTypeInput = readField(payment, ['type', 'paymentType', 'payment_type'])
  const paymentMethodInput = readField(payment, ['method', 'paymentMethod', 'payment_method'])
  const statusInput = readField(payment, ['status'])
  const notesInput = readField(payment, ['notes'])
  const referenceInput = readField(payment, ['referenceNumber', 'reference_number'])

  if (contractorId) {
    payload.contractor_id = contractorId
  }

  if (isCreate || readField(payment, ['projectId', 'project_id']) !== undefined) {
    payload.project_id = sanitizeUuid(readField(payment, ['projectId', 'project_id']))
  }

  if (isCreate || readField(payment, ['clientId', 'client_id']) !== undefined) {
    payload.client_id = sanitizeUuid(readField(payment, ['clientId', 'client_id']))
  }

  if (isCreate || readField(payment, ['contractId', 'contract_id']) !== undefined) {
    payload.contract_id = sanitizeUuid(readField(payment, ['contractId', 'contract_id']))
  }

  if (isCreate || readField(payment, ['estimateId', 'estimate_id']) !== undefined) {
    payload.estimate_id = sanitizeUuid(readField(payment, ['estimateId', 'estimate_id']))
  }

  if (isCreate || readField(payment, ['leadId', 'lead_id']) !== undefined) {
    payload.lead_id = sanitizeUuid(readField(payment, ['leadId', 'lead_id']))
  }

  if (isCreate || readField(payment, ['invoiceId', 'invoice_id']) !== undefined) {
    payload.invoice_id = sanitizeUuid(readField(payment, ['invoiceId', 'invoice_id']))
  }

  if (amountInput !== undefined) {
    payload.amount = toNumber(amountInput)
  } else if (isCreate) {
    payload.amount = 0
  }

  if (isCreate || paymentDateInput !== undefined) {
    payload.payment_date = parseDateToIso(paymentDateInput)
  }

  if (isCreate || paymentTypeInput !== undefined) {
    payload.payment_type = paymentTypeInput || null
  }

  if (isCreate || paymentMethodInput !== undefined) {
    payload.payment_method = paymentMethodInput || null
    payload.method = paymentMethodInput || null
  }

  if (statusInput !== undefined) {
    payload.status = mapStatusToDb(statusInput)
  } else if (isCreate) {
    payload.status = 'recorded'
  }

  if (isCreate || referenceInput !== undefined) {
    payload.reference_number = referenceInput || null
  }

  if (notesInput !== undefined) {
    payload.notes = notesInput || null
  } else if (isCreate) {
    payload.notes = null
  }

  if (isCreate || readField(payment, ['sampleDataKey', 'sample_data_key']) !== undefined) {
    payload.sample_data_key = readField(payment, ['sampleDataKey', 'sample_data_key']) || null
  }

  return payload
}

function buildContractorQuery(contractorId, extraQuery = {}) {
  return {
    ...extraQuery,
    contractor_id: `eq.${contractorId}`,
  }
}

function handleMissingContractorId(methodName) {
  warnDev(`[dev] paymentsSupabaseService.${methodName} called without contractorId`)

  return createErrorResult('contractorId is required for payment operations.')
}

export async function list({ contractorId, includeArchived = false, status, clientId, projectId, contractId, estimateId, invoiceId, leadId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PAYMENTS) {
    return createSkippedResponse('Supabase payments service skipped because USE_SUPABASE=false and USE_SUPABASE_PAYMENTS=false', [])
  }

  if (!contractorId) {
    return handleMissingContractorId('list')
  }

  try {
    const query = buildContractorQuery(contractorId, {
      select: '*',
      order: 'payment_date.desc,created_at.desc',
    })

    if (!includeArchived) {
      query.archived_at = 'is.null'
    }

    if (status) {
      query.status = `eq.${mapStatusToDb(status)}`
    }

    if (clientId) {
      query.client_id = `eq.${clientId}`
    }

    if (projectId) {
      query.project_id = `eq.${projectId}`
    }

    if (contractId) {
      query.contract_id = `eq.${contractId}`
    }

    if (estimateId) {
      query.estimate_id = `eq.${estimateId}`
    }

    if (invoiceId) {
      query.invoice_id = `eq.${invoiceId}`
    }

    if (leadId) {
      query.lead_id = `eq.${leadId}`
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query,
    })

    return {
      data: sortPayments(Array.isArray(data) ? data.map(toAppPayment) : []),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: [],
      error: normalizeError(error, 'Unable to load payments from Supabase.'),
      skipped: false,
    }
  }
}

export async function getById(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PAYMENTS) {
    return createSkippedResponse('Supabase payments service skipped because USE_SUPABASE=false and USE_SUPABASE_PAYMENTS=false')
  }

  if (!contractorId) {
    return handleMissingContractorId('getById')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query: buildContractorQuery(contractorId, {
        select: '*',
        id: `eq.${id}`,
        limit: '1',
      }),
    })

    const row = readSingleRow(data)

    return {
      data: row ? toAppPayment(row) : null,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to load the payment from Supabase.'),
      skipped: false,
    }
  }
}

export async function create(paymentData, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PAYMENTS) {
    return createSkippedResponse('Supabase payments service skipped because USE_SUPABASE=false and USE_SUPABASE_PAYMENTS=false', paymentData ?? null)
  }

  if (!contractorId) {
    return handleMissingContractorId('create')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'POST',
      body: toSupabasePayload(contractorId, paymentData, { isCreate: true }),
    })

    return {
      data: toAppPayment(readSingleRow(data)),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to create the payment in Supabase.'),
      skipped: false,
    }
  }
}

export async function update(id, updates, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PAYMENTS) {
    return createSkippedResponse('Supabase payments service skipped because USE_SUPABASE=false and USE_SUPABASE_PAYMENTS=false', { id, ...(updates || {}) })
  }

  if (!contractorId) {
    return handleMissingContractorId('update')
  }

  try {
    const payload = {
      ...toSupabasePayload(contractorId, updates),
      updated_at: new Date().toISOString(),
    }

    delete payload.contractor_id

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: payload,
    })

    return {
      data: toAppPayment(readSingleRow(data) || { id, contractor_id: contractorId, ...payload }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to update the payment in Supabase.'),
      skipped: false,
    }
  }
}

export async function archive(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PAYMENTS) {
    return createSkippedResponse('Supabase payments service skipped because USE_SUPABASE=false and USE_SUPABASE_PAYMENTS=false', { id, archived: true })
  }

  if (!contractorId) {
    return handleMissingContractorId('archive')
  }

  try {
    const archivedAt = new Date().toISOString()
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: {
        archived_at: archivedAt,
        updated_at: archivedAt,
      },
    })

    return {
      data: toAppPayment(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: archivedAt, updated_at: archivedAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to archive the payment in Supabase.'),
      skipped: false,
    }
  }
}

export async function restore(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PAYMENTS) {
    return createSkippedResponse('Supabase payments service skipped because USE_SUPABASE=false and USE_SUPABASE_PAYMENTS=false', { id, archived: false })
  }

  if (!contractorId) {
    return handleMissingContractorId('restore')
  }

  try {
    const restoredAt = new Date().toISOString()
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: {
        archived_at: null,
        updated_at: restoredAt,
      },
    })

    return {
      data: toAppPayment(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: null, updated_at: restoredAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to restore the payment in Supabase.'),
      skipped: false,
    }
  }
}

export async function deletePermanently(id, { contractorId, authenticatedUserId = '' } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PAYMENTS) {
    return createSkippedResponse('Supabase payments service skipped because USE_SUPABASE=false and USE_SUPABASE_PAYMENTS=false', { id, deleted: true })
  }

  if (!contractorId) {
    return handleMissingContractorId('deletePermanently')
  }

  const query = buildContractorQuery(contractorId, {
    id: `eq.${id}`,
  })

  try {
    const response = await supabaseClient.request(TABLE_NAME, {
      method: 'DELETE',
      query,
      prefer: 'return=representation,count=exact',
      includeResponseMetadata: true,
    })
    const rows = Array.isArray(response?.data)
      ? response.data
      : response?.data
        ? [response.data]
        : []
    const row = rows[0] || null
    const affectedRowCount = response?.count ?? rows.length

    warnDev('[dev] Supabase permanent payment deletion returned.', {
      paymentId: id,
      contractorId,
      authenticatedUserId: authenticatedUserId || null,
      query,
      status: response?.status ?? null,
      contentRange: response?.contentRange ?? null,
      returnedDeletedRows: rows,
      affectedRowCount,
    })

    if (!row?.id || affectedRowCount < 1) {
      return {
        data: null,
        error: {
          code: 'PAYMENT_DELETE_NO_ROWS',
          message: 'The payment could not be permanently deleted.',
          details: {
            paymentId: id,
            contractorId,
            query,
            status: response?.status ?? null,
            contentRange: response?.contentRange ?? null,
            returnedDeletedRows: rows,
            affectedRowCount,
          },
        },
        skipped: false,
      }
    }

    return {
      data: toAppPayment(row),
      error: null,
      skipped: false,
      affectedRowCount,
    }
  } catch (error) {
    const normalizedError = normalizeError(error, 'Unable to permanently delete the payment in Supabase.')
    warnDev('[dev] Supabase permanent payment deletion failed.', {
      paymentId: id,
      contractorId,
      authenticatedUserId: authenticatedUserId || null,
      query,
      errorCode: normalizedError.code,
      errorMessage: normalizedError.message,
      errorDetails: normalizedError.details,
      status: error?.status || null,
    })
    return {
      data: null,
      error: normalizedError,
      skipped: false,
    }
  }
}

export default {
  list,
  getById,
  create,
  update,
  archive,
  restore,
  deletePermanently,
}

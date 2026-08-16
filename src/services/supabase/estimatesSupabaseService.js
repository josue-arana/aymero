import { USE_SUPABASE, USE_SUPABASE_ESTIMATES } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'
import { normalizeSupportedLanguageOrEmpty } from '../../utils/language'
import {
  normalizeEstimateLineItemsForStorage,
  normalizeEstimateFormattedTextForStorage,
  resolveEstimatePricingMode,
} from '../../utils/estimateDocument'

const TABLE_NAME = 'estimates'

const uiToDbStatusMap = {
  Draft: 'draft',
  Saved: 'saved',
  Sent: 'sent',
  Approved: 'approved',
  Rejected: 'rejected',
  'Converted to Contract': 'converted',
}

const dbToUiStatusMap = {
  draft: 'Draft',
  saved: 'Saved',
  sent: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted to Contract',
}

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
  if (extractMissingColumnName(error) === 'estimate_language') {
    return createEstimateLanguageSetupError(error)
  }

  return {
    message: error?.message || fallbackMessage,
    details: error?.details || null,
    code: error?.code || null,
  }
}

function extractMissingColumnName(error) {
  const message = [
    error?.message,
    error?.details,
    error?.raw?.message,
    error?.raw?.details,
    error?.raw?.hint,
  ]
    .filter(Boolean)
    .join(' ')

  const quotedColumnMatch = message.match(/'([^']+)' column/)
  if (quotedColumnMatch?.[1]) {
    return quotedColumnMatch[1]
  }

  const alternateColumnMatch = message.match(/column ['"]?([^'" ]+)['"]?/)
  if (alternateColumnMatch?.[1]) {
    return alternateColumnMatch[1]
  }

  return null
}

function createEstimateLanguageSetupError(error) {
  return {
    message: 'Estimate language is not set up in Supabase. Run the estimates estimate_language migration before saving or loading estimate language preferences.',
    details: error?.details || error?.raw?.details || error?.raw || null,
    code: 'ESTIMATES_LANGUAGE_COLUMN_MISSING',
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

function assignIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeLineItems(lineItems) {
  return normalizeEstimateLineItemsForStorage(lineItems)
}

function sumLineItems(lineItems) {
  return normalizeLineItems(lineItems).reduce((sum, item) => sum + toNumber(item.amount), 0)
}

function mapStatusToDb(status) {
  if (!status) return 'draft'
  return uiToDbStatusMap[status] || String(status).toLowerCase().replace(/\s+/g, '_')
}

function mapStatusToUi(status) {
  if (!status) return 'Draft'
  return dbToUiStatusMap[status] || status
}

function applyStatusTimestamps(payload, estimate = {}) {
  const explicitSentAt = readField(estimate, ['sentAt', 'sent_at'])
  const explicitApprovedAt = readField(estimate, ['approvedAt', 'approved_at'])
  const explicitRejectedAt = readField(estimate, ['rejectedAt', 'rejected_at'])
  const explicitConvertedAt = readField(estimate, ['convertedAt', 'converted_at'])
  const now = new Date().toISOString()

  assignIfDefined(payload, 'sent_at', explicitSentAt)
  assignIfDefined(payload, 'approved_at', explicitApprovedAt)
  assignIfDefined(payload, 'rejected_at', explicitRejectedAt)
  assignIfDefined(payload, 'converted_at', explicitConvertedAt)

  if (payload.status === 'sent' && payload.sent_at === undefined) payload.sent_at = now
  if (payload.status === 'approved' && payload.approved_at === undefined) payload.approved_at = now
  if (payload.status === 'rejected' && payload.rejected_at === undefined) payload.rejected_at = now
  if (payload.status === 'converted' && payload.converted_at === undefined) payload.converted_at = now

  return payload
}

function toAppEstimate(row) {
  const lineItems = normalizeLineItems(row?.line_items)

  return {
    id: row?.id || undefined,
    contractorId: row?.contractor_id || undefined,
    clientId: row?.client_id || null,
    client_id: row?.client_id || null,
    leadId: row?.lead_id || null,
    lead_id: row?.lead_id || null,
    projectId: row?.project_id || null,
    project_id: row?.project_id || null,
    number: row?.estimate_number || '',
    estimateNumber: row?.estimate_number || '',
    title: row?.title || 'Estimate',
    projectTitle: row?.title || 'Estimate',
    summary: row?.scope_of_work || '',
    scopeOfWork: row?.scope_of_work || '',
    lineItems,
    pricingMode: resolveEstimatePricingMode(row?.pricing_mode, lineItems),
    subtotal: toNumber(row?.subtotal),
    discountAmount: toNumber(row?.discount_amount),
    taxAmount: toNumber(row?.tax_amount),
    total: toNumber(row?.total_amount),
    totalAmount: toNumber(row?.total_amount),
    amount: toNumber(row?.total_amount),
    depositPercentage: row?.deposit_percentage === null || row?.deposit_percentage === undefined ? null : toNumber(row?.deposit_percentage),
    materialsIncluded: Boolean(row?.materials_included),
    paymentTerms: row?.payment_terms || '',
    sampleDataKey: row?.sample_data_key || '',
    publicShareToken: row?.public_share_token || '',
    public_share_token: row?.public_share_token || '',
    estimateLanguage: normalizeSupportedLanguageOrEmpty(row?.estimate_language),
    status: mapStatusToUi(row?.status),
    sentAt: row?.sent_at || null,
    approvedAt: row?.approved_at || null,
    rejectedAt: row?.rejected_at || null,
    convertedAt: row?.converted_at || null,
    dateCreated: row?.created_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    archivedAt: row?.archived_at || null,
    client: '',
    nextAction: '',
  }
}

function toSupabasePayload(contractorId, estimate = {}, { isCreate = false } = {}) {
  const payload = {}
  const lineItemsInput = readField(estimate, ['lineItems', 'line_items'])
  const lineItems = lineItemsInput !== undefined ? normalizeLineItems(lineItemsInput) : undefined
  const subtotalInput = readField(estimate, ['subtotal'])
  const discountAmountInput = readField(estimate, ['discountAmount', 'discount_amount'])
  const taxAmountInput = readField(estimate, ['taxAmount', 'tax_amount'])
  const totalInput = readField(estimate, ['total', 'totalAmount', 'total_amount', 'amount'])
  const titleInput = readField(estimate, ['title', 'projectTitle', 'estimateTitle'])
  const statusInput = readField(estimate, ['status'])
  const materialsIncludedInput = readField(estimate, ['materialsIncluded', 'materials_included'])
  const estimateLanguageInput = readField(estimate, ['estimateLanguage'])

  if (contractorId) {
    payload.contractor_id = contractorId
  }

  if (isCreate || readField(estimate, ['clientId', 'client_id']) !== undefined) {
    payload.client_id = readField(estimate, ['clientId', 'client_id']) || null
  }

  if (readField(estimate, ['leadId', 'lead_id']) !== undefined) {
    payload.lead_id = readField(estimate, ['leadId', 'lead_id']) || null
  }

  if (isCreate || readField(estimate, ['projectId', 'project_id']) !== undefined) {
    payload.project_id = readField(estimate, ['projectId', 'project_id']) || null
  }

  if (titleInput !== undefined) {
    payload.title = titleInput || 'Estimate'
  } else if (isCreate) {
    payload.title = 'Estimate'
  }

  if (isCreate || readField(estimate, ['number', 'estimateNumber', 'estimate_number']) !== undefined) {
    payload.estimate_number = readField(estimate, ['number', 'estimateNumber', 'estimate_number']) || null
  }

  if (isCreate || readField(estimate, ['summary', 'scopeOfWork', 'scope_of_work']) !== undefined) {
    const scopeInput = readField(estimate, ['summary', 'scopeOfWork', 'scope_of_work'])
    payload.scope_of_work = normalizeEstimateFormattedTextForStorage(scopeInput) || null
  }

  if (lineItems !== undefined || isCreate) {
    payload.line_items = lineItems || []
  }

  if (subtotalInput !== undefined) {
    payload.subtotal = toNumber(subtotalInput)
  } else if (lineItems !== undefined) {
    payload.subtotal = sumLineItems(lineItems)
  } else if (isCreate) {
    payload.subtotal = 0
  }

  if (discountAmountInput !== undefined) {
    payload.discount_amount = toNumber(discountAmountInput)
  } else if (isCreate) {
    payload.discount_amount = 0
  }

  if (taxAmountInput !== undefined) {
    payload.tax_amount = toNumber(taxAmountInput)
  } else if (isCreate) {
    payload.tax_amount = 0
  }

  if (totalInput !== undefined) {
    payload.total_amount = toNumber(totalInput)
  } else if (lineItems !== undefined || subtotalInput !== undefined || discountAmountInput !== undefined || taxAmountInput !== undefined || isCreate) {
    const subtotal = payload.subtotal ?? 0
    const discountAmount = payload.discount_amount ?? 0
    const taxAmount = payload.tax_amount ?? 0
    payload.total_amount = subtotal - discountAmount + taxAmount
  }

  if (isCreate || readField(estimate, ['depositPercentage', 'deposit_percentage']) !== undefined) {
    const depositPercentage = readField(estimate, ['depositPercentage', 'deposit_percentage'])
    payload.deposit_percentage = depositPercentage === '' || depositPercentage === null || depositPercentage === undefined
      ? null
      : toNumber(depositPercentage)
  }

  if (materialsIncludedInput !== undefined) {
    payload.materials_included = Boolean(materialsIncludedInput)
  } else if (isCreate) {
    payload.materials_included = true
  }

  if (isCreate || readField(estimate, ['paymentTerms', 'payment_terms']) !== undefined) {
    payload.payment_terms = readField(estimate, ['paymentTerms', 'payment_terms']) || null
  }

  if (isCreate || readField(estimate, ['sampleDataKey', 'sample_data_key']) !== undefined) {
    payload.sample_data_key = readField(estimate, ['sampleDataKey', 'sample_data_key']) || null
  }

  if (isCreate || estimateLanguageInput !== undefined) {
    payload.estimate_language = normalizeSupportedLanguageOrEmpty(estimateLanguageInput) || null
  }

  if (statusInput !== undefined) {
    payload.status = mapStatusToDb(statusInput)
  } else if (isCreate) {
    payload.status = 'draft'
  }

  return applyStatusTimestamps(payload, estimate)
}

function buildContractorQuery(contractorId, extraQuery = {}) {
  return {
    ...extraQuery,
    contractor_id: `eq.${contractorId}`,
  }
}

function handleMissingContractorId(methodName) {
  warnDev(`[dev] estimatesSupabaseService.${methodName} called without contractorId`)

  return createErrorResult('contractorId is required for estimate operations.')
}

export async function list({ contractorId, includeArchived = false, status, clientId, leadId, projectId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
    return createSkippedResponse('Supabase estimates service skipped because USE_SUPABASE=false and USE_SUPABASE_ESTIMATES=false', [])
  }

  if (!contractorId) {
    return handleMissingContractorId('list')
  }

  try {
    const query = buildContractorQuery(contractorId, {
      select: '*',
      order: 'created_at.desc',
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

    if (leadId) {
      query.lead_id = `eq.${leadId}`
    }

    if (projectId) {
      query.project_id = `eq.${projectId}`
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query,
    })

    return {
      data: Array.isArray(data) ? data.map(toAppEstimate) : [],
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: [],
      error: normalizeError(error, 'Unable to load estimates from Supabase.'),
      skipped: false,
    }
  }
}

export async function getById(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
    return createSkippedResponse('Supabase estimates service skipped because USE_SUPABASE=false and USE_SUPABASE_ESTIMATES=false')
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
      data: row ? toAppEstimate(row) : null,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to load the estimate from Supabase.'),
      skipped: false,
    }
  }
}

export async function create(estimateData, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
    return createSkippedResponse('Supabase estimates service skipped because USE_SUPABASE=false and USE_SUPABASE_ESTIMATES=false', estimateData ?? null)
  }

  if (!contractorId) {
    return handleMissingContractorId('create')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'POST',
      body: toSupabasePayload(contractorId, estimateData, { isCreate: true }),
    })

    return {
      data: toAppEstimate(readSingleRow(data)),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to create the estimate in Supabase.'),
      skipped: false,
    }
  }
}

export async function update(id, updates, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
    return createSkippedResponse('Supabase estimates service skipped because USE_SUPABASE=false and USE_SUPABASE_ESTIMATES=false', { id, ...(updates || {}) })
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
      data: toAppEstimate(readSingleRow(data) || { id, contractor_id: contractorId, ...payload }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to update the estimate in Supabase.'),
      skipped: false,
    }
  }
}

export async function archive(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
    return createSkippedResponse('Supabase estimates service skipped because USE_SUPABASE=false and USE_SUPABASE_ESTIMATES=false', { id, archived: true })
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
      data: toAppEstimate(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: archivedAt, updated_at: archivedAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to archive the estimate in Supabase.'),
      skipped: false,
    }
  }
}

export async function restore(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
    return createSkippedResponse('Supabase estimates service skipped because USE_SUPABASE=false and USE_SUPABASE_ESTIMATES=false', { id, archived: false })
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
      data: toAppEstimate(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: null, updated_at: restoredAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to restore the estimate in Supabase.'),
      skipped: false,
    }
  }
}

export async function deletePermanently(id, { contractorId, authenticatedUserId = '' } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
    return createSkippedResponse('Supabase estimates service skipped because USE_SUPABASE=false and USE_SUPABASE_ESTIMATES=false', { id, deleted: true })
  }

  if (!contractorId) {
    return handleMissingContractorId('deletePermanently')
  }

  const query = buildContractorQuery(contractorId, {
    id: `eq.${id}`,
  })

  warnDev('[dev] Submitting contractor-scoped permanent estimate deletion.', {
    estimateId: id,
    contractorId,
    authenticatedUserId: authenticatedUserId || null,
    query,
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

    warnDev('[dev] Supabase permanent estimate deletion returned.', {
      estimateId: id,
      contractorId,
      authenticatedUserId: authenticatedUserId || null,
      query,
      status: response?.status ?? null,
      contentRange: response?.contentRange ?? null,
      returnedDeletedRows: rows,
      affectedRowCount,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
    })

    if (!row?.id || affectedRowCount < 1) {
      const error = {
        code: 'ESTIMATE_DELETE_NO_ROWS',
        message: 'The estimate could not be deleted. Your access may have changed, or the estimate may no longer be available.',
        details: {
          estimateId: id,
          contractorId,
          query,
          status: response?.status ?? null,
          contentRange: response?.contentRange ?? null,
          returnedDeletedRows: rows,
          affectedRowCount,
        },
      }

      warnDev('[dev] Supabase permanent estimate deletion affected no rows.', {
        estimateId: id,
        contractorId,
        authenticatedUserId: authenticatedUserId || null,
        query,
        status: response?.status ?? null,
        contentRange: response?.contentRange ?? null,
        returnedDeletedRows: rows,
        affectedRowCount,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
      })

      return { data: null, error, skipped: false }
    }

    return {
      data: toAppEstimate(row),
      error: null,
      skipped: false,
      affectedRowCount,
    }
  } catch (error) {
    const normalizedError = normalizeError(error, 'Unable to permanently delete the estimate in Supabase.')

    warnDev('[dev] Supabase permanent estimate deletion failed.', {
      estimateId: id,
      contractorId,
      authenticatedUserId: authenticatedUserId || null,
      query,
      errorCode: normalizedError.code,
      errorMessage: normalizedError.message,
      errorDetails: normalizedError.details,
      status: error?.status || null,
      returnedDeletedRows: [],
      affectedRowCount: 0,
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

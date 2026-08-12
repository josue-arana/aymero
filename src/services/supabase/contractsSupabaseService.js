import { USE_SUPABASE, USE_SUPABASE_CONTRACTS } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'
import { normalizeContractWorkBreakdown } from '../../utils/contractDocument'

const TABLE_NAME = 'contracts'

const uiToDbStatusMap = {
  Draft: 'draft',
  Sent: 'sent',
  Signed: 'signed',
  Cancelled: 'cancelled',
  Canceled: 'cancelled',
  'Not generated': 'draft',
}

const dbToUiStatusMap = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  cancelled: 'Cancelled',
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
  return {
    message: error?.message || fallbackMessage,
    details: error?.details || null,
    code: error?.code || null,
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

function mapStatusToDb(status) {
  if (!status) return 'draft'
  return uiToDbStatusMap[status] || String(status).toLowerCase().replace(/\s+/g, '_')
}

function mapStatusToUi(status) {
  if (!status) return 'Draft'
  return dbToUiStatusMap[status] || status
}

function formatSignedDate(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function parseSignedAt(value) {
  if (!value) return null

  const parsedDate = new Date(value)
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString()
  }

  return null
}

function buildLegacyTermsText(sections = {}) {
  return [
    sections.materials ? `Materials:\n${sections.materials}` : null,
    sections.timeline ? `Timeline:\n${sections.timeline}` : null,
    sections.changeOrders ? `Change Orders:\n${sections.changeOrders}` : null,
    sections.clientResponsibilities ? `Client Responsibilities:\n${sections.clientResponsibilities}` : null,
    sections.warrantyDisclaimer ? `Warranty Disclaimer:\n${sections.warrantyDisclaimer}` : null,
  ].filter(Boolean).join('\n\n')
}

function serializeTerms(contract = {}) {
  const termsText = readField(contract, ['terms'])
  const contractLanguage = readField(contract, ['contractLanguage'])
  const acceptanceLegalText = readField(contract, ['acceptanceLegalText'])
  const workBreakdown = normalizeContractWorkBreakdown(readField(contract, ['workBreakdown']) || [])
  const sections = {
    materials: readField(contract, ['materials']),
    timeline: readField(contract, ['timeline']),
    changeOrders: readField(contract, ['changeOrders']),
    clientResponsibilities: readField(contract, ['clientResponsibilities']),
    warrantyDisclaimer: readField(contract, ['warrantyDisclaimer']),
  }

  const hasStructuredSections = Object.values(sections).some((value) => value !== undefined)
    || contractLanguage !== undefined
    || acceptanceLegalText !== undefined
    || workBreakdown.length > 0

  if (!hasStructuredSections) {
    return termsText === undefined ? undefined : termsText || null
  }

  return JSON.stringify({
    version: 1,
    summary: termsText || buildLegacyTermsText(sections),
    contractLanguage: contractLanguage || '',
    acceptanceLegalText: acceptanceLegalText || '',
    workBreakdown,
    sections: {
      materials: sections.materials || '',
      timeline: sections.timeline || '',
      changeOrders: sections.changeOrders || '',
      clientResponsibilities: sections.clientResponsibilities || '',
      warrantyDisclaimer: sections.warrantyDisclaimer || '',
    },
  })
}

function parseTerms(terms) {
  const fallback = {
    termsText: terms || '',
    materials: '',
    timeline: '',
    changeOrders: '',
    clientResponsibilities: '',
    warrantyDisclaimer: '',
    contractLanguage: '',
    acceptanceLegalText: '',
    workBreakdown: [],
  }

  if (!terms) return fallback

  try {
    const parsed = JSON.parse(terms)

    if (!parsed || typeof parsed !== 'object') {
      return fallback
    }

    return {
      termsText: parsed.summary || terms || '',
      materials: parsed.sections?.materials || '',
      timeline: parsed.sections?.timeline || '',
      changeOrders: parsed.sections?.changeOrders || '',
      clientResponsibilities: parsed.sections?.clientResponsibilities || '',
      warrantyDisclaimer: parsed.sections?.warrantyDisclaimer || '',
      contractLanguage: parsed.contractLanguage || '',
      acceptanceLegalText: parsed.acceptanceLegalText || '',
      workBreakdown: normalizeContractWorkBreakdown(parsed.workBreakdown || []),
    }
  } catch {
    return fallback
  }
}

function applyStatusFields(payload, contract = {}) {
  const explicitSentAt = readField(contract, ['sentAt', 'sent_at'])
  const explicitSignedAt = readField(contract, ['signedAt', 'signed_at'])
  const explicitSignedDate = readField(contract, ['signedDate'])
  const explicitSignedBy = readField(contract, ['signedBy', 'signed_by'])
  const now = new Date().toISOString()

  assignIfDefined(payload, 'sent_at', explicitSentAt)
  assignIfDefined(payload, 'signed_at', explicitSignedAt)
  assignIfDefined(payload, 'signed_by', explicitSignedBy)

  if (payload.status === 'sent' && payload.sent_at === undefined) {
    payload.sent_at = now
  }

  if (payload.status === 'signed') {
    if (payload.signed_at === undefined) {
      payload.signed_at = parseSignedAt(explicitSignedDate) || now
    }
  }

  return payload
}

function toAppContract(row) {
  const parsedTerms = parseTerms(row?.terms)
  const signedDate = row?.signed_at ? formatSignedDate(row.signed_at) : ''
  const status = mapStatusToUi(row?.status)
  const hasStoredContractAmount = row?.total_amount !== null
    && row?.total_amount !== undefined
    && row?.total_amount !== ''
    && Number.isFinite(Number(row.total_amount))

  return {
    id: row?.id || undefined,
    contractorId: row?.contractor_id || undefined,
    clientId: row?.client_id || null,
    projectId: row?.project_id || null,
    estimateId: row?.estimate_id || null,
    number: row?.contract_number || '',
    contractNumber: row?.contract_number || '',
    title: row?.title || 'Contract',
    projectTitle: row?.title || 'Contract',
    scope: row?.scope_of_work || '',
    scopeOfWork: row?.scope_of_work || '',
    terms: parsedTerms.termsText,
    paymentTerms: row?.payment_terms || '',
    sampleDataKey: row?.sample_data_key || '',
    contractLanguage: parsedTerms.contractLanguage || '',
    acceptanceLegalText: parsedTerms.acceptanceLegalText || '',
    workBreakdown: normalizeContractWorkBreakdown(parsedTerms.workBreakdown || []),
    materials: parsedTerms.materials,
    timeline: parsedTerms.timeline,
    changeOrders: parsedTerms.changeOrders,
    clientResponsibilities: parsedTerms.clientResponsibilities,
    warrantyDisclaimer: parsedTerms.warrantyDisclaimer,
    total: toNumber(row?.total_amount),
    totalAmount: toNumber(row?.total_amount),
    contractTotal: toNumber(row?.total_amount),
    contractAmount: toNumber(row?.total_amount),
    hasStoredContractAmount,
    depositAmount: row?.deposit_amount === null || row?.deposit_amount === undefined ? null : toNumber(row?.deposit_amount),
    status,
    signed: status === 'Signed' || Boolean(row?.signed_at),
    signedStatus: status === 'Signed' ? 'Signed' : status,
    signedDate,
    signedAt: row?.signed_at || null,
    signedBy: row?.signed_by || '',
    sentAt: row?.sent_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    archivedAt: row?.archived_at || null,
    client: '',
  }
}

function toSupabasePayload(contractorId, contract = {}, { isCreate = false } = {}) {
  const payload = {}
  const titleInput = readField(contract, ['title', 'projectTitle', 'contractTitle'])
  const numberInput = readField(contract, ['number', 'contractNumber', 'contract_number'])
  const scopeInput = readField(contract, ['scope', 'scopeOfWork', 'scope_of_work'])
  const paymentTermsInput = readField(contract, ['paymentTerms', 'payment_terms'])
  const statusInput = readField(contract, ['status'])
  const totalInput = readField(contract, ['total', 'totalAmount', 'total_amount', 'contractTotal', 'contractAmount', 'amount'])
  const depositInput = readField(contract, ['depositAmount', 'deposit_amount', 'depositRequired'])
  const termsInput = serializeTerms(contract)

  if (contractorId) {
    payload.contractor_id = contractorId
  }

  if (isCreate || readField(contract, ['clientId', 'client_id']) !== undefined) {
    payload.client_id = readField(contract, ['clientId', 'client_id']) || null
  }

  if (isCreate || readField(contract, ['projectId', 'project_id']) !== undefined) {
    payload.project_id = readField(contract, ['projectId', 'project_id']) || null
  }

  if (isCreate || readField(contract, ['estimateId', 'estimate_id']) !== undefined) {
    payload.estimate_id = readField(contract, ['estimateId', 'estimate_id']) || null
  }

  if (titleInput !== undefined) {
    payload.title = titleInput || 'Contract'
  } else if (isCreate) {
    payload.title = 'Contract'
  }

  if (isCreate || numberInput !== undefined) {
    payload.contract_number = numberInput || null
  }

  if (isCreate || scopeInput !== undefined) {
    payload.scope_of_work = scopeInput || null
  }

  if (paymentTermsInput !== undefined || isCreate) {
    payload.payment_terms = paymentTermsInput || null
  }

  if (isCreate || readField(contract, ['sampleDataKey', 'sample_data_key']) !== undefined) {
    payload.sample_data_key = readField(contract, ['sampleDataKey', 'sample_data_key']) || null
  }

  if (termsInput !== undefined) {
    payload.terms = termsInput
  } else if (isCreate) {
    payload.terms = null
  }

  if (totalInput !== undefined) {
    payload.total_amount = toNumber(totalInput)
  } else if (isCreate) {
    payload.total_amount = 0
  }

  if (isCreate || depositInput !== undefined) {
    payload.deposit_amount = depositInput === '' || depositInput === null || depositInput === undefined
      ? null
      : toNumber(depositInput)
  }

  if (statusInput !== undefined) {
    payload.status = mapStatusToDb(statusInput)
  } else if (isCreate) {
    payload.status = 'draft'
  }

  return applyStatusFields(payload, contract)
}

function buildContractorQuery(contractorId, extraQuery = {}) {
  return {
    ...extraQuery,
    contractor_id: `eq.${contractorId}`,
  }
}

function handleMissingContractorId(methodName) {
  warnDev(`[dev] contractsSupabaseService.${methodName} called without contractorId`)

  return createErrorResult('contractorId is required for contract operations.')
}

export async function list({ contractorId, includeArchived = false, status, clientId, projectId, estimateId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CONTRACTS) {
    return createSkippedResponse('Supabase contracts service skipped because USE_SUPABASE=false and USE_SUPABASE_CONTRACTS=false', [])
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

    if (projectId) {
      query.project_id = `eq.${projectId}`
    }

    if (estimateId) {
      query.estimate_id = `eq.${estimateId}`
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query,
    })

    return {
      data: Array.isArray(data) ? data.map(toAppContract) : [],
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: [],
      error: normalizeError(error, 'Unable to load contracts from Supabase.'),
      skipped: false,
    }
  }
}

export async function getById(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CONTRACTS) {
    return createSkippedResponse('Supabase contracts service skipped because USE_SUPABASE=false and USE_SUPABASE_CONTRACTS=false')
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
      data: row ? toAppContract(row) : null,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to load the contract from Supabase.'),
      skipped: false,
    }
  }
}

export async function create(contractData, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CONTRACTS) {
    return createSkippedResponse('Supabase contracts service skipped because USE_SUPABASE=false and USE_SUPABASE_CONTRACTS=false', contractData ?? null)
  }

  if (!contractorId) {
    return handleMissingContractorId('create')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'POST',
      body: toSupabasePayload(contractorId, contractData, { isCreate: true }),
    })

    return {
      data: toAppContract(readSingleRow(data)),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to create the contract in Supabase.'),
      skipped: false,
    }
  }
}

export async function update(id, updates, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CONTRACTS) {
    return createSkippedResponse('Supabase contracts service skipped because USE_SUPABASE=false and USE_SUPABASE_CONTRACTS=false', { id, ...(updates || {}) })
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
      data: toAppContract(readSingleRow(data) || { id, contractor_id: contractorId, ...payload }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to update the contract in Supabase.'),
      skipped: false,
    }
  }
}

export async function archive(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CONTRACTS) {
    return createSkippedResponse('Supabase contracts service skipped because USE_SUPABASE=false and USE_SUPABASE_CONTRACTS=false', { id, archived: true })
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
      data: toAppContract(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: archivedAt, updated_at: archivedAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to archive the contract in Supabase.'),
      skipped: false,
    }
  }
}

export async function restore(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CONTRACTS) {
    return createSkippedResponse('Supabase contracts service skipped because USE_SUPABASE=false and USE_SUPABASE_CONTRACTS=false', { id, archived: false })
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
      data: toAppContract(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: null, updated_at: restoredAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to restore the contract in Supabase.'),
      skipped: false,
    }
  }
}

export async function deletePermanently(id, { contractorId, authenticatedUserId = '' } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CONTRACTS) {
    return createSkippedResponse('Supabase contracts service skipped because USE_SUPABASE=false and USE_SUPABASE_CONTRACTS=false', { id, deleted: true })
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

    warnDev('[dev] Supabase permanent contract deletion returned.', {
      contractId: id,
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
          code: 'CONTRACT_DELETE_NO_ROWS',
          message: 'The contract could not be permanently deleted.',
          details: {
            contractId: id,
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
      data: toAppContract(row),
      error: null,
      skipped: false,
      affectedRowCount,
    }
  } catch (error) {
    const normalizedError = normalizeError(error, 'Unable to permanently delete the contract in Supabase.')
    warnDev('[dev] Supabase permanent contract deletion failed.', {
      contractId: id,
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

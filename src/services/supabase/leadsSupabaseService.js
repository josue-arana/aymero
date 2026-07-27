import { USE_SUPABASE, USE_SUPABASE_LEADS } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'
import { readLeadPipelineStage } from '../local/leadPipelineStorage'
import { getLeadPipelineStage } from '../../utils/leadPipeline'
import { normalizeSupportedLanguage, normalizeSupportedLanguageOrEmpty } from '../../utils/language'

const TABLE_NAME = 'leads'

const uiToDbStatusMap = {
  'New Lead': 'new',
  Contacted: 'contacted',
  Qualified: 'qualified',
  'Estimate Sent': 'estimate_sent',
  Won: 'won',
  Lost: 'lost',
}

const dbToUiStatusMap = {
  new: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  estimate_sent: 'Estimate Sent',
  won: 'Won',
  lost: 'Lost',
}

const uiToDbPriorityMap = {
  High: 'high',
  Medium: 'normal',
  Low: 'low',
  Urgent: 'urgent',
}

const dbToUiPriorityMap = {
  high: 'High',
  normal: 'Medium',
  low: 'Low',
  urgent: 'Urgent',
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

function createErrorResult(message, details = null, code = null) {
  return {
    data: null,
    error: {
      message,
      details,
      code,
    },
    skipped: false,
  }
}

function normalizeError(error, fallbackMessage) {
  if (extractMissingColumnName(error) === 'client_language') {
    return createClientLanguageSetupError(error)
  }

  return {
    message: error?.message || fallbackMessage,
    details: error?.details || null,
    code: error?.code || null,
    status: error?.status || null,
  }
}

function readSingleRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

function mapStatusToDb(status) {
  if (!status) return 'new'
  return uiToDbStatusMap[status] || status
}

function mapStatusToUi(status) {
  if (!status) return 'New Lead'
  return dbToUiStatusMap[status] || status
}

function mapPriorityToDb(priority) {
  if (!priority) return 'normal'
  return uiToDbPriorityMap[priority] || String(priority).toLowerCase()
}

function mapPriorityToUi(priority) {
  if (!priority) return 'Medium'
  return dbToUiPriorityMap[priority] || priority
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeOptionalText(value) {
  if (typeof value !== 'string') return value || null
  return value.trim() || null
}

function normalizeOptionalUuid(value, fieldName) {
  if (!value) return null

  if (typeof value === 'string' && uuidPattern.test(value.trim())) {
    return value.trim()
  }

  warnDev(`[dev] leadsSupabaseService received a non-UUID ${fieldName}; sending null instead.`, {
    fieldName,
    value,
  })

  return null
}

function hasOwnField(object, fieldName) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, fieldName)
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

function createClientLanguageSetupError(error) {
  return {
    message: 'Lead client language is not set up in Supabase. Run the leads client_language migration before saving or loading lead language preferences.',
    details: error?.details || error?.raw?.details || error?.raw || null,
    code: 'LEADS_CLIENT_LANGUAGE_COLUMN_MISSING',
    status: error?.status || null,
  }
}

export function mapLeadRowToUiLead(row) {
  const archivedAt = row?.archived_at || null
  const clientName = row?.name || 'Unknown Client'
  const projectTitle = row?.title || row?.project_title || row?.service_type || ''
  const projectType = row?.project_type || row?.job_type || row?.service_type || projectTitle
  const estimatedValue = toNumber(row?.estimated_value)
  const storedPipelineStage = row?.lead_pipeline_stage || readLeadPipelineStage(row?.id)
  const nextLead = {
    id: row?.id || undefined,
    contractorId: row?.contractor_id || undefined,
    clientId: row?.client_id || null,
    projectId: row?.project_id || null,
    name: clientName,
    client: clientName,
    clientName,
    customerName: clientName,
    phone: row?.phone || '',
    email: row?.email || '',
    address: row?.address || '',
    location: row?.address || '',
    title: projectTitle,
    projectTitle,
    projectType,
    jobType: projectType,
    value: estimatedValue,
    estimatedValue,
    source: row?.source || '',
    clientLanguage: normalizeSupportedLanguageOrEmpty(row?.client_language),
    priority: mapPriorityToUi(row?.priority),
    notes: row?.notes || '',
    sampleDataKey: row?.sample_data_key || '',
    nextStep: '',
    status: mapStatusToUi(row?.status),
    projectStatus: row?.status === 'won' ? 'Signed' : 'Lead',
    archivedAt,
    archived_at: archivedAt,
    isArchived: Boolean(archivedAt),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    leadPipelineStage: storedPipelineStage || undefined,
  }

  return {
    ...nextLead,
    leadPipelineStage: nextLead.leadPipelineStage || getLeadPipelineStage(nextLead),
  }
}

export function mapUiLeadToLeadRow(contractorId, lead = {}) {
  const projectTitle = lead.projectTitle || lead.title || lead.projectType || null

  return {
    contractor_id: contractorId,
    client_id: normalizeOptionalUuid(lead.clientId || lead.client_id, 'client_id'),
    project_id: normalizeOptionalUuid(lead.projectId || lead.project_id, 'project_id'),
    name: lead.client || lead.name || 'Unknown Client',
    phone: lead.phone || null,
    email: lead.email || null,
    address: lead.address || lead.location || null,
    service_type: projectTitle,
    source: lead.source || null,
    client_language: normalizeSupportedLanguage(
      lead.clientLanguage || lead.preferredLanguage || lead.preferred_language || lead.language,
      'en'
    ),
    estimated_value: toNumber(lead.value ?? lead.estimated_value),
    status: mapStatusToDb(lead.status),
    priority: mapPriorityToDb(lead.priority),
    notes: normalizeOptionalText(lead.notes),
    sample_data_key: lead.sampleDataKey || lead.sample_data_key || null,
  }
}

function mapUiLeadUpdatesToLeadRow(updates = {}) {
  const payload = {}

  if (hasOwnField(updates, 'clientId') || hasOwnField(updates, 'client_id')) {
    payload.client_id = normalizeOptionalUuid(updates.clientId || updates.client_id, 'client_id')
  }

  if (hasOwnField(updates, 'projectId') || hasOwnField(updates, 'project_id')) {
    payload.project_id = normalizeOptionalUuid(updates.projectId || updates.project_id, 'project_id')
  }

  if (
    hasOwnField(updates, 'client')
    || hasOwnField(updates, 'clientName')
    || hasOwnField(updates, 'customerName')
    || hasOwnField(updates, 'name')
  ) {
    payload.name = updates.client || updates.clientName || updates.customerName || updates.name || 'Unknown Client'
  }

  if (hasOwnField(updates, 'phone')) {
    payload.phone = updates.phone || null
  }

  if (hasOwnField(updates, 'email')) {
    payload.email = updates.email || null
  }

  if (hasOwnField(updates, 'address') || hasOwnField(updates, 'location')) {
    payload.address = updates.address || updates.location || null
  }

  if (
    hasOwnField(updates, 'projectType')
    || hasOwnField(updates, 'projectTitle')
    || hasOwnField(updates, 'title')
    || hasOwnField(updates, 'project_title')
    || hasOwnField(updates, 'service_type')
  ) {
    payload.service_type = updates.projectTitle
      || updates.title
      || updates.project_title
      || updates.projectType
      || updates.service_type
      || null
  }

  if (hasOwnField(updates, 'source')) {
    payload.source = updates.source || null
  }

  if (
    hasOwnField(updates, 'clientLanguage')
    || hasOwnField(updates, 'preferredLanguage')
    || hasOwnField(updates, 'preferred_language')
    || hasOwnField(updates, 'language')
  ) {
    payload.client_language = normalizeSupportedLanguage(
      updates.clientLanguage || updates.preferredLanguage || updates.preferred_language || updates.language,
      'en'
    )
  }

  if (hasOwnField(updates, 'value') || hasOwnField(updates, 'estimatedValue') || hasOwnField(updates, 'estimated_value')) {
    payload.estimated_value = toNumber(updates.value ?? updates.estimatedValue ?? updates.estimated_value)
  }

  if (hasOwnField(updates, 'status')) {
    payload.status = mapStatusToDb(updates.status)
  }

  if (hasOwnField(updates, 'priority')) {
    payload.priority = mapPriorityToDb(updates.priority)
  }

  if (hasOwnField(updates, 'notes')) {
    payload.notes = normalizeOptionalText(updates.notes)
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
  warnDev(`[dev] leadsSupabaseService.${methodName} called without contractorId`)

  return createErrorResult(
    'Your account is not connected to a contractor profile yet.',
    {
      methodName,
      reason: 'No contractorId was provided to the Leads Supabase service.',
    },
    'MISSING_CONTRACTOR_ID'
  )
}

export async function list({ contractorId, includeArchived = false, status, clientId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_LEADS) {
    return createSkippedResponse('Supabase leads service skipped because USE_SUPABASE=false and USE_SUPABASE_LEADS=false', [])
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

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query,
    })

    return {
      data: Array.isArray(data) ? data.map(mapLeadRowToUiLead) : [],
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: [],
      error: normalizeError(error, 'Unable to load leads from Supabase.'),
      skipped: false,
    }
  }
}

export async function getById(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_LEADS) {
    return createSkippedResponse('Supabase leads service skipped because USE_SUPABASE=false and USE_SUPABASE_LEADS=false')
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
      data: row ? mapLeadRowToUiLead(row) : null,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to load the lead from Supabase.'),
      skipped: false,
    }
  }
}

export async function create(leadData, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_LEADS) {
    return createSkippedResponse('Supabase leads service skipped because USE_SUPABASE=false and USE_SUPABASE_LEADS=false', leadData ?? null)
  }

  if (!contractorId) {
    return handleMissingContractorId('create')
  }

  try {
    const payload = mapUiLeadToLeadRow(contractorId, leadData)

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'POST',
      body: payload,
    })

    return {
      data: mapLeadRowToUiLead(readSingleRow(data)),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to create the lead in Supabase.'),
      skipped: false,
    }
  }
}

export async function update(id, updates, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_LEADS) {
    return createSkippedResponse('Supabase leads service skipped because USE_SUPABASE=false and USE_SUPABASE_LEADS=false', { id, ...(updates || {}) })
  }

  if (!contractorId) {
    return handleMissingContractorId('update')
  }

  try {
    const payload = {
      ...mapUiLeadUpdatesToLeadRow(updates),
      updated_at: new Date().toISOString(),
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: payload,
    })

    return {
      data: mapLeadRowToUiLead(readSingleRow(data) || { id, contractor_id: contractorId, ...(updates || {}), ...payload }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to update the lead in Supabase.'),
      skipped: false,
    }
  }
}

export async function archive(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_LEADS) {
    return createSkippedResponse('Supabase leads service skipped because USE_SUPABASE=false and USE_SUPABASE_LEADS=false', { id, archived: true })
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
      data: mapLeadRowToUiLead(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: archivedAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to archive the lead in Supabase.'),
      skipped: false,
    }
  }
}

export async function restore(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_LEADS) {
    return createSkippedResponse('Supabase leads service skipped because USE_SUPABASE=false and USE_SUPABASE_LEADS=false', { id, archived: false })
  }

  if (!contractorId) {
    return handleMissingContractorId('restore')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: {
        archived_at: null,
        updated_at: new Date().toISOString(),
      },
    })

    return {
      data: mapLeadRowToUiLead(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: null }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to restore the lead in Supabase.'),
      skipped: false,
    }
  }
}

export async function deletePermanently(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_LEADS) {
    return createSkippedResponse('Supabase leads service skipped because USE_SUPABASE=false and USE_SUPABASE_LEADS=false', { id, deleted: true })
  }

  if (!contractorId) {
    return handleMissingContractorId('deletePermanently')
  }

  try {
    await supabaseClient.request(TABLE_NAME, {
      method: 'DELETE',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
    })

    return {
      data: { id, deleted: true },
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to delete the lead from Supabase.'),
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

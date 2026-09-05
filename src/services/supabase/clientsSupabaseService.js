import { USE_SUPABASE, USE_SUPABASE_CLIENTS } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'
import { normalizeSupportedLanguage, normalizeSupportedLanguageOrEmpty } from '../../utils/language'
import { mapOptionalClientUpdatesToPersistence } from '../../utils/clients'
import { normalizeOptionalEmail, normalizeOptionalEmailForPersistence } from '../../utils/email'

const TABLE_NAME = 'clients'

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
  if (extractMissingColumnName(error) === 'preferred_language') {
    return createPreferredLanguageSetupError(error)
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

function readClientName(client = {}) {
  return String(
    client.name
      || client.displayName
      || client.display_name
      || [client.firstName || client.first_name, client.lastName || client.last_name].filter(Boolean).join(' ')
      || ''
  ).trim()
}

function splitClientName(client = {}) {
  const fullName = readClientName(client)

  if (!fullName) {
    return { firstName: null, lastName: null, displayName: 'Unknown Client' }
  }

  const parts = fullName.split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    displayName: fullName,
  }
}

function buildDisplayName(row = {}) {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
  return row.display_name || fullName || 'Unknown Client'
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

function createPreferredLanguageSetupError(error) {
  return {
    message: 'Client preferred language is not set up in Supabase. Run the clients preferred_language migration before saving or loading client language preferences.',
    details: error?.details || error?.raw?.details || error?.raw || null,
    code: 'CLIENTS_PREFERRED_LANGUAGE_COLUMN_MISSING',
    status: error?.status || null,
  }
}

export function mapClientRowToUiClient(row) {
  const displayName = row?.display_name || buildDisplayName(row)
  const archivedAt = row?.archived_at || null
  const preferredLanguage = normalizeSupportedLanguageOrEmpty(row?.preferred_language)

  return {
    id: row?.id || undefined,
    contractorId: row?.contractor_id || undefined,
    name: displayName,
    displayName,
    firstName: row?.first_name || '',
    lastName: row?.last_name || '',
    phone: row?.phone || '',
    email: normalizeOptionalEmail(row?.email),
    address: row?.address || '',
    preferredLanguage,
    preferred_language: preferredLanguage,
    language: preferredLanguage,
    notes: row?.notes || '',
    sampleDataKey: row?.sample_data_key || '',
    status: row?.status || 'active',
    archivedAt,
    archived_at: archivedAt,
    isArchived: Boolean(archivedAt),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export function mapUiClientToClientRow(contractorId, client = {}) {
  const { firstName, lastName, displayName } = splitClientName(client)

  return {
    contractor_id: contractorId,
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    phone: client.phone || null,
    email: normalizeOptionalEmailForPersistence(client.email) || null,
    address: client.address || null,
    preferred_language: normalizeSupportedLanguage(
      client.preferredLanguage || client.preferred_language || client.language,
      'en'
    ),
    notes: client.notes || null,
    sample_data_key: client.sampleDataKey || client.sample_data_key || null,
    status: client.status || 'active',
  }
}

function mapUiClientUpdatesToClientRow(updates = {}) {
  const payload = {}
  const nextName = readClientName(updates)

  if (
    hasOwnField(updates, 'name')
    || hasOwnField(updates, 'displayName')
    || hasOwnField(updates, 'display_name')
    || hasOwnField(updates, 'firstName')
    || hasOwnField(updates, 'first_name')
    || hasOwnField(updates, 'lastName')
    || hasOwnField(updates, 'last_name')
  ) {
    const { firstName, lastName, displayName } = splitClientName({
      ...updates,
      ...(nextName ? { name: nextName } : {}),
    })

    payload.first_name = firstName
    payload.last_name = lastName
    payload.display_name = displayName
  }

  Object.assign(payload, mapOptionalClientUpdatesToPersistence(updates))

  if (
    hasOwnField(updates, 'preferredLanguage')
    || hasOwnField(updates, 'preferred_language')
    || hasOwnField(updates, 'language')
    || hasOwnField(updates, 'clientLanguage')
  ) {
    payload.preferred_language = normalizeSupportedLanguage(
      updates.preferredLanguage || updates.preferred_language || updates.language || updates.clientLanguage,
      'en'
    )
  }

  if (hasOwnField(updates, 'status')) {
    payload.status = updates.status || 'active'
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
  warnDev(`[dev] clientsSupabaseService.${methodName} called without contractorId`)

  return createErrorResult(
    'Your account is not connected to a contractor profile yet.',
    {
      methodName,
      reason: 'No contractorId was provided to the Clients Supabase service.',
    },
    'MISSING_CONTRACTOR_ID'
  )
}

export async function list({ contractorId, includeArchived = false } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CLIENTS) {
    return createSkippedResponse('Supabase clients service skipped because USE_SUPABASE=false and USE_SUPABASE_CLIENTS=false', [])
  }

  if (!contractorId) {
    return handleMissingContractorId('list')
  }

  try {
    const query = buildContractorQuery(contractorId, {
      select: '*',
      order: 'display_name.asc',
    })

    if (!includeArchived) {
      query.archived_at = 'is.null'
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query,
    })

    return {
      data: Array.isArray(data) ? data.map(mapClientRowToUiClient) : [],
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: [],
      error: normalizeError(error, 'Unable to load clients from Supabase.'),
      skipped: false,
    }
  }
}

export async function getById(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CLIENTS) {
    return createSkippedResponse('Supabase clients service skipped because USE_SUPABASE=false and USE_SUPABASE_CLIENTS=false')
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
      data: row ? mapClientRowToUiClient(row) : null,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to load the client from Supabase.'),
      skipped: false,
    }
  }
}

export async function create(clientData, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CLIENTS) {
    return createSkippedResponse('Supabase clients service skipped because USE_SUPABASE=false and USE_SUPABASE_CLIENTS=false', clientData ?? null)
  }

  if (!contractorId) {
    return handleMissingContractorId('create')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'POST',
      body: mapUiClientToClientRow(contractorId, clientData),
    })

    return {
      data: mapClientRowToUiClient(readSingleRow(data)),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to create the client in Supabase.'),
      skipped: false,
    }
  }
}

export async function update(id, updates, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CLIENTS) {
    return createSkippedResponse('Supabase clients service skipped because USE_SUPABASE=false and USE_SUPABASE_CLIENTS=false', { id, ...(updates || {}) })
  }

  if (!contractorId) {
    return handleMissingContractorId('update')
  }

  try {
    const payload = {
      ...mapUiClientUpdatesToClientRow(updates),
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
      data: mapClientRowToUiClient(readSingleRow(data) || { id, contractor_id: contractorId, ...(updates || {}), ...payload }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to update the client in Supabase.'),
      skipped: false,
    }
  }
}

export async function archive(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CLIENTS) {
    return createSkippedResponse('Supabase clients service skipped because USE_SUPABASE=false and USE_SUPABASE_CLIENTS=false', { id, archived: true })
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
      data: mapClientRowToUiClient(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: archivedAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to archive the client in Supabase.'),
      skipped: false,
    }
  }
}

export async function restore(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CLIENTS) {
    return createSkippedResponse('Supabase clients service skipped because USE_SUPABASE=false and USE_SUPABASE_CLIENTS=false', { id, archived: false })
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
      data: mapClientRowToUiClient(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: null }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to restore the client in Supabase.'),
      skipped: false,
    }
  }
}

export async function deletePermanently(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_CLIENTS) {
    return createSkippedResponse('Supabase clients service skipped because USE_SUPABASE=false and USE_SUPABASE_CLIENTS=false', { id, deleted: true })
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
      error: normalizeError(error, 'Unable to delete the client from Supabase.'),
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

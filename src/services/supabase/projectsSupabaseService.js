import { USE_SUPABASE, USE_SUPABASE_PROJECTS } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'
import { buildPortalShareUrl } from '../../utils/portal'

const TABLE_NAME = 'projects'

const uiToDbStatusMap = {
  Lead: 'lead',
  Estimate: 'estimate',
  Signed: 'contract',
  Contract: 'contract',
  Scheduled: 'scheduled',
  'In Progress': 'in_progress',
  'Waiting on Client': 'waiting_on_client',
  'Waiting on Materials': 'waiting_on_materials',
  'Ready for Final Walkthrough': 'ready_for_final_walkthrough',
  Completed: 'completed',
  Paid: 'paid',
  Cancelled: 'cancelled',
}

const dbToUiStatusMap = {
  lead: 'Lead',
  estimate: 'Estimate',
  contract: 'Signed',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  waiting_on_client: 'Waiting on Client',
  waiting_on_materials: 'Waiting on Materials',
  ready_for_final_walkthrough: 'Ready for Final Walkthrough',
  completed: 'Completed',
  paid: 'Paid',
  cancelled: 'Cancelled',
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
  return {
    message: error?.message || fallbackMessage,
    details: error?.details || null,
    code: error?.code || null,
  }
}

function readSingleRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

function hasOwnField(record, fieldName) {
  return Boolean(record) && Object.prototype.hasOwnProperty.call(record, fieldName)
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapStatusToDb(status) {
  if (!status) return 'lead'
  return uiToDbStatusMap[status] || String(status).toLowerCase().replace(/\s+/g, '_')
}

function mapStatusToUi(status) {
  if (!status) return 'Lead'
  return dbToUiStatusMap[status] || status
}

function normalizeOptionalUuid(value, fieldName) {
  if (!value) return null

  if (typeof value === 'string' && uuidPattern.test(value.trim())) {
    return value.trim()
  }

  warnDev(`[dev] projectsSupabaseService received a non-UUID ${fieldName}; sending null instead.`, {
    fieldName,
    value,
  })

  return null
}

export function mapProjectRowToUiProject(row) {
  const archivedAt = row?.archived_at || null
  const estimatedValue = toNumber(row?.estimated_value || 0)
  const contractValue = toNumber(row?.contract_value)
  const value = toNumber(row?.estimated_value || row?.contract_value || 0)
  const paid = toNumber(row?.paid || 0)
  const remaining = toNumber(row?.remaining ?? Math.max(value - paid, 0))
  const projectType = row?.project_type || ''
  const notes = row?.notes || ''
  const description = row?.description || ''
  const address = row?.address || ''
  const status = row?.status || 'scheduled'
  const portalId = row?.public_portal_token || ''

  return {
    id: row?.id || undefined,
    projectId: row?.id || undefined,
    project_id: row?.id || undefined,
    portalId,
    clientPortalId: portalId,
    contractorId: row?.contractor_id || undefined,
    clientId: row?.client_id || null,
    leadId: row?.lead_id || null,
    title: row?.title || '',
    name: row?.title || '',
    projectTitle: row?.title || '',
    projectType,
    jobType: projectType,
    client: '',
    clientName: '',
    customerName: '',
    phone: '',
    email: '',
    status,
    projectStatus: mapStatusToUi(status),
    startDate: row?.start_date || '',
    estimatedValue,
    value,
    contractValue,
    paid,
    amountPaid: paid,
    remaining,
    remainingBalance: remaining,
    nextStep: notes || description || '',
    location: address,
    address,
    notes,
    sampleDataKey: row?.sample_data_key || '',
    description,
    events: [],
    schedule: [],
    scheduleEvents: [],
    photos: [],
    estimates: [],
    contracts: [],
    invoices: [],
    payments: [],
    portal: {
      portalId,
      clientPortalId: portalId,
      shareUrl: portalId ? buildPortalShareUrl(portalId) : '',
      contractAmount: contractValue || value,
      depositRequired: 0,
      amountPaid: paid,
      outstandingBalance: remaining,
      paymentStatus: '',
      startDate: row?.start_date || '',
      estimatedCompletion: row?.target_end_date || '',
      timeline: [],
      photos: [],
      documents: [],
      estimate: {},
      contract: {},
      invoices: [],
      payments: [],
    },
    targetCompletion: row?.target_end_date || '',
    completedAt: row?.completed_at || null,
    completed_at: row?.completed_at || null,
    archivedAt,
    archived_at: archivedAt,
    isArchived: Boolean(archivedAt),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export function mapUiProjectToProjectRow(contractorId, project = {}) {
  const normalizedNotes = typeof project.notes === 'string' ? project.notes.trim() : project.notes

  return {
    contractor_id: contractorId,
    client_id: normalizeOptionalUuid(project.clientId || project.client_id, 'client_id'),
    lead_id: normalizeOptionalUuid(project.leadId || project.lead_id, 'lead_id'),
    title: project.projectTitle || project.title || project.projectType || 'Untitled Project',
    description: project.description || null,
    project_type: project.projectType || project.projectTitle || null,
    address: project.address || project.location || null,
    status: mapStatusToDb(project.projectStatus || project.status),
    estimated_value: toNumber(project.estimatedValue ?? project.value),
    contract_value: toNumber(project.contractValue ?? project.value),
    start_date: project.startDate || project.start_date || null,
    target_end_date: project.targetCompletion || project.target_end_date || null,
    completed_at: project.completedAt || project.completed_at || null,
    notes: normalizedNotes || null,
    sample_data_key: project.sampleDataKey || project.sample_data_key || null,
  }
}

function buildContractorQuery(contractorId, extraQuery = {}) {
  return {
    ...extraQuery,
    contractor_id: `eq.${contractorId}`,
  }
}

function handleMissingContractorId(methodName) {
  warnDev(`[dev] projectsSupabaseService.${methodName} called without contractorId`)

  return createErrorResult(
    'Your account is not connected to a contractor profile yet.',
    {
      methodName,
      reason: 'No contractorId was provided to the Projects Supabase service.',
    },
    'MISSING_CONTRACTOR_ID'
  )
}

export async function list({ contractorId, includeArchived = false, status, clientId, leadId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PROJECTS) {
    return createSkippedResponse('Supabase projects service skipped because USE_SUPABASE=false and USE_SUPABASE_PROJECTS=false', [])
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

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query,
    })

    const rows = Array.isArray(data) ? data : []
    const mappedRows = rows.map(mapProjectRowToUiProject)

    return {
      data: mappedRows,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: [],
      error: normalizeError(error, 'Unable to load projects from Supabase.'),
      skipped: false,
    }
  }
}

export async function getById(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PROJECTS) {
    return createSkippedResponse('Supabase projects service skipped because USE_SUPABASE=false and USE_SUPABASE_PROJECTS=false')
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
      data: row ? mapProjectRowToUiProject(row) : null,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to load the project from Supabase.'),
      skipped: false,
    }
  }
}

export async function create(projectData, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PROJECTS) {
    return createSkippedResponse('Supabase projects service skipped because USE_SUPABASE=false and USE_SUPABASE_PROJECTS=false', projectData ?? null)
  }

  if (!contractorId) {
    return handleMissingContractorId('create')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'POST',
      body: mapUiProjectToProjectRow(contractorId, projectData),
    })

    return {
      data: mapProjectRowToUiProject(readSingleRow(data)),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to create the project in Supabase.'),
      skipped: false,
    }
  }
}

export async function update(id, updates, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PROJECTS) {
    return createSkippedResponse('Supabase projects service skipped because USE_SUPABASE=false and USE_SUPABASE_PROJECTS=false', { id, ...(updates || {}) })
  }

  if (!contractorId) {
    return handleMissingContractorId('update')
  }

  try {
    const payload = {
      ...mapUiProjectToProjectRow(contractorId, updates),
      updated_at: new Date().toISOString(),
    }

    if (!hasOwnField(updates, 'notes')) delete payload.notes

    delete payload.contractor_id

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: payload,
    })

    return {
      data: mapProjectRowToUiProject(readSingleRow(data) || { id, contractor_id: contractorId, ...payload }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to update the project in Supabase.'),
      skipped: false,
    }
  }
}

export async function archive(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PROJECTS) {
    return createSkippedResponse('Supabase projects service skipped because USE_SUPABASE=false and USE_SUPABASE_PROJECTS=false', { id, archived: true })
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
      data: mapProjectRowToUiProject(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: archivedAt }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to archive the project in Supabase.'),
      skipped: false,
    }
  }
}

export async function restore(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PROJECTS) {
    return createSkippedResponse('Supabase projects service skipped because USE_SUPABASE=false and USE_SUPABASE_PROJECTS=false', { id, archived: false })
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
      data: mapProjectRowToUiProject(readSingleRow(data) || { id, contractor_id: contractorId, archived_at: null }),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to restore the project in Supabase.'),
      skipped: false,
    }
  }
}

export async function deletePermanently(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_PROJECTS) {
    return createSkippedResponse('Supabase projects service skipped because USE_SUPABASE=false and USE_SUPABASE_PROJECTS=false', { id, deleted: true })
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
      error: normalizeError(error, 'Unable to delete the project from Supabase.'),
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

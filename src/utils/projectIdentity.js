function normalizeLookupId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveLinkedProjectId(record = {}, fallback = '') {
  return (
    normalizeLookupId(record?.projectId)
    || normalizeLookupId(record?.project_id)
    || normalizeLookupId(record?.id)
    || normalizeLookupId(fallback)
    || ''
  )
}

export function resolveLinkedLeadId(record = {}, fallback = '') {
  return (
    normalizeLookupId(record?.leadId)
    || normalizeLookupId(record?.lead_id)
    || normalizeLookupId(fallback)
    || ''
  )
}

export function findProjectByLookup(projects = [], ...ids) {
  const normalizedIds = new Set(
    ids
      .flat()
      .map(normalizeLookupId)
      .filter(Boolean)
  )

  if (normalizedIds.size === 0) return null

  return projects.find((project) => [
    project?.id,
    project?.projectId,
    project?.project_id,
  ].map(normalizeLookupId).some((id) => normalizedIds.has(id))) || null
}

export function findLeadByProjectLookup(leads = [], ...ids) {
  const normalizedIds = Array.from(new Set(
    ids
      .flat()
      .map(normalizeLookupId)
      .filter(Boolean)
  ))

  if (normalizedIds.length === 0) {
    return null
  }

  return leads.find((lead) => {
    const leadIds = [
      normalizeLookupId(lead?.id),
      normalizeLookupId(lead?.projectId),
      normalizeLookupId(lead?.project_id),
    ].filter(Boolean)

    return leadIds.some((leadId) => normalizedIds.includes(leadId))
  }) || null
}

export function createLocalRecordId(prefix = 'record') {
  const normalizedPrefix = normalizeLookupId(prefix) || 'record'

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${normalizedPrefix}-${crypto.randomUUID()}`
  }

  return `${normalizedPrefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function dedupeById(records = [], fallbackFields = []) {
  const recordMap = new Map()

  records
    .filter(Boolean)
    .forEach((record, index) => {
      const id = normalizeLookupId(record?.id)
      const fallbackKey = fallbackFields
        .map((field) => normalizeLookupId(record?.[field]))
        .filter(Boolean)
        .join(':')
      const key = id || fallbackKey || `index:${index}`

      if (!recordMap.has(key)) {
        recordMap.set(key, record)
      }
    })

  return Array.from(recordMap.values())
}

export function getProjectsForClient(client = {}, projects = []) {
  const clientId = normalizeLookupId(client?.id || client?.clientId || client?.client_id)

  return dedupeById(projects, ['projectId', 'project_id', 'leadId', 'lead_id'])
    .filter((project) => {
      if (!clientId) return true

      return normalizeLookupId(project?.clientId || project?.client_id) === clientId
    })
}

function readEstimateProjectId(estimate = {}) {
  return normalizeLookupId(estimate?.projectId || estimate?.project_id)
}

function isArchivedEstimate(estimate = {}) {
  return Boolean(estimate?.isArchived || estimate?.archivedAt || estimate?.archived_at)
}

function estimateCreatedAt(estimate = {}) {
  const value = estimate?.createdAt || estimate?.created_at || estimate?.dateCreated
  const timestamp = value ? new Date(value).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

/**
 * Returns active estimates explicitly linked to this project. The project id
 * is required so an estimate from another project can never be selected by a
 * loose lead/title/position match.
 */
export function getEstimatesForProject(project = {}, estimates = [], { includeArchived = false } = {}) {
  const projectId = normalizeLookupId(project?.id || project?.projectId || project?.project_id)
  if (!projectId) return []

  return dedupeById(estimates, ['projectId', 'project_id', 'leadId', 'lead_id', 'number', 'estimateNumber'])
    .filter((estimate) => readEstimateProjectId(estimate) === projectId)
    .filter((estimate) => includeArchived || !isArchivedEstimate(estimate))
    .sort((left, right) => (
      estimateCreatedAt(right) - estimateCreatedAt(left)
      || normalizeLookupId(right?.id).localeCompare(normalizeLookupId(left?.id))
    ))
}

/**
 * Resolves the explicit project selection, with a safe legacy fallback only
 * when exactly one active estimate exists. A stale or cross-project selection
 * returns null rather than silently choosing another estimate.
 */
export function getSelectedEstimateForProject(project = {}, estimates = [], { includeArchived = false } = {}) {
  const projectEstimates = getEstimatesForProject(project, estimates, { includeArchived })
  const selectedEstimateId = normalizeLookupId(project?.selectedEstimateId || project?.selected_estimate_id)

  if (selectedEstimateId) {
    return projectEstimates.find((estimate) => normalizeLookupId(estimate?.id) === selectedEstimateId) || null
  }

  const activeEstimates = includeArchived
    ? projectEstimates.filter((estimate) => !isArchivedEstimate(estimate))
    : projectEstimates

  return activeEstimates.length === 1 ? activeEstimates[0] : null
}

export function hasAmbiguousProjectEstimateSelection(project = {}, estimates = []) {
  return getEstimatesForProject(project, estimates).length > 1
    && !normalizeLookupId(project?.selectedEstimateId || project?.selected_estimate_id)
}

export function getEstimateForProject(project = {}, estimates = []) {
  const selectedEstimate = getSelectedEstimateForProject(project, estimates)
  if (selectedEstimate) return selectedEstimate

  const projectId = resolveLinkedProjectId(project)
  const leadId = resolveLinkedLeadId(project, project?.isProjectRecord === false ? project?.id : '')
  const estimateId = normalizeLookupId(project?.estimateId || project?.estimate_id)

  if (estimateId) {
    const explicitEstimate = dedupeById(estimates, ['projectId', 'project_id', 'leadId', 'lead_id', 'number', 'estimateNumber'])
      .find((estimate) => normalizeLookupId(estimate?.id) === estimateId && !isArchivedEstimate(estimate))
    if (explicitEstimate) return explicitEstimate
  }

  if (projectId && getEstimatesForProject(project, estimates).length > 1) {
    return null
  }

  return dedupeById(estimates, ['projectId', 'project_id', 'leadId', 'lead_id', 'number', 'estimateNumber'])
    .filter((estimate) => !isArchivedEstimate(estimate))
    .find((estimate) => {
      const estimateProjectId = readEstimateProjectId(estimate)
      const estimateLeadId = resolveLinkedLeadId(estimate)
      const currentEstimateId = normalizeLookupId(estimate?.id)

      if (projectId && estimateProjectId === projectId) return true
      if (!estimateProjectId && projectId && estimateLeadId === projectId) return true
      if (leadId && !estimateProjectId && estimateLeadId === leadId) return true
      return Boolean(estimateId && currentEstimateId === estimateId)
    }) || null
}

export function getContractForProject(project = {}, contracts = [], estimate = null) {
  const projectId = resolveLinkedProjectId(project)
  const leadId = resolveLinkedLeadId(project, project?.isProjectRecord === false ? project?.id : '')
  const contractId = normalizeLookupId(project?.contractId || project?.contract_id)
  const estimateId = normalizeLookupId(estimate?.id || project?.estimateId || project?.estimate_id)

  return dedupeById(contracts, ['projectId', 'project_id', 'estimateId', 'estimate_id', 'number', 'contractNumber'])
    .find((contract) => {
      const contractProjectId = normalizeLookupId(contract?.projectId || contract?.project_id)
      const contractLeadId = resolveLinkedLeadId(contract)
      const currentContractId = normalizeLookupId(contract?.id)
      const contractEstimateId = normalizeLookupId(contract?.estimateId || contract?.estimate_id)

      if (projectId && contractProjectId === projectId) return true
      if (!contractProjectId && projectId && contractLeadId === projectId) return true
      if (estimateId && contractEstimateId === estimateId) return true
      if (leadId && !contractProjectId && contractLeadId === leadId) return true
      return Boolean(contractId && currentContractId === contractId)
    }) || null
}

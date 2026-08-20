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

export function getEstimateForProject(project = {}, estimates = []) {
  const projectId = resolveLinkedProjectId(project)
  const leadId = resolveLinkedLeadId(project, project?.isProjectRecord === false ? project?.id : '')
  const estimateId = normalizeLookupId(project?.estimateId || project?.estimate_id)

  return dedupeById(estimates, ['projectId', 'project_id', 'leadId', 'lead_id', 'number', 'estimateNumber'])
    .find((estimate) => {
      const estimateProjectId = normalizeLookupId(estimate?.projectId || estimate?.project_id)
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

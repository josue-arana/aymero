function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readEstimateProjectId(estimate = {}) {
  return normalizeId(estimate?.projectId || estimate?.project_id)
}

function readEstimateLeadId(estimate = {}) {
  return normalizeId(estimate?.leadId || estimate?.lead_id)
}

function readAmount(estimate = {}) {
  const amount = Number(estimate?.total ?? estimate?.totalAmount ?? estimate?.amount ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

export function sumUnambiguousEstimateValues(estimates = [], projects = []) {
  const activeEstimates = estimates.filter((estimate) => !estimate?.isArchived && !estimate?.archivedAt && !estimate?.archived_at)
  const projectMap = new Map(projects.map((project) => [normalizeId(project?.id || project?.projectId || project?.project_id), project]))
  const grouped = new Map()
  activeEstimates.forEach((estimate) => {
    const projectId = readEstimateProjectId(estimate)
    const leadId = readEstimateLeadId(estimate)
    const key = projectId ? `project:${projectId}` : leadId ? `lead:${leadId}` : `estimate:${normalizeId(estimate?.id)}`
    grouped.set(key, [...(grouped.get(key) || []), estimate])
  })
  return Array.from(grouped.entries()).reduce((sum, [key, rows]) => {
    if (rows.length === 1) return sum + readAmount(rows[0])
    const project = key.startsWith('project:') ? projectMap.get(key.slice('project:'.length)) : null
    const selectedId = normalizeId(project?.selectedEstimateId || project?.selected_estimate_id)
    const selected = selectedId ? rows.find((estimate) => normalizeId(estimate?.id) === selectedId) : null
    return selected ? sum + readAmount(selected) : sum
  }, 0)
}

const IDENTITY_FIELDS = new Set([
  'id', 'number', 'estimateNumber', 'estimate_number',
  'publicShareToken', 'public_share_token', 'shareToken', 'share_token',
  'createdAt', 'created_at', 'updatedAt', 'updated_at',
  'archivedAt', 'archived_at', 'isArchived', 'archived',
  'sentAt', 'sent_at', 'approvedAt', 'approved_at', 'rejectedAt', 'rejected_at',
  'finalizedAt', 'finalized_at', 'convertedAt', 'converted_at',
  'status', 'scopeAssistantState', 'scope_assistant_state',
])

function copyLineItems(value) {
  return Array.isArray(value) ? value.map((item) => ({ ...item })) : []
}

function readOptionProjectId(project = {}) {
  return project?.id || project?.projectId || project?.project_id || null
}

function readLeadId(project = {}, lead = {}) {
  return project?.leadId || project?.lead_id || lead?.id || lead?.leadId || lead?.lead_id || null
}

function readClientId(project = {}, lead = {}) {
  return project?.clientId || project?.client_id || lead?.clientId || lead?.client_id || null
}

export function createEstimateShareToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
}

export function buildNewEstimateOptionDraft({ project = {}, lead = {} } = {}) {
  const projectId = readOptionProjectId(project)
  const leadId = readLeadId(project, lead)
  const clientId = readClientId(project, lead)
  const projectTitle = project?.projectTitle || project?.title || lead?.projectTitle || lead?.projectType || 'Estimate'

  return {
    projectId,
    project_id: projectId,
    leadId,
    lead_id: leadId,
    clientId,
    client_id: clientId,
    projectTitle,
    title: projectTitle,
    summary: '',
    scopeOfWork: '',
    lineItems: [],
    total: 0,
    subtotal: 0,
    discountAmount: 0,
    taxAmount: 0,
    status: 'Draft',
    optionName: null,
    publicShareToken: createEstimateShareToken(),
    public_share_token: undefined,
    scopeAssistantState: {},
  }
}

export function buildDuplicatedEstimateDraft({ project = {}, lead = {}, estimate = {} } = {}) {
  const base = buildNewEstimateOptionDraft({ project, lead })
  const draft = Object.entries(estimate || {}).reduce((result, [key, value]) => {
    if (!IDENTITY_FIELDS.has(key)) {
      result[key] = key === 'lineItems' || key === 'line_items' ? copyLineItems(value) : value
    }
    return result
  }, {})

  return {
    ...base,
    ...draft,
    projectId: base.projectId,
    project_id: base.project_id,
    leadId: base.leadId,
    lead_id: base.lead_id,
    clientId: base.clientId,
    client_id: base.client_id,
    status: 'Draft',
    optionName: estimate?.optionName ?? estimate?.option_name ?? null,
    option_name: estimate?.optionName ?? estimate?.option_name ?? null,
    publicShareToken: createEstimateShareToken(),
    public_share_token: undefined,
    scopeAssistantState: {},
    lineItems: copyLineItems(estimate?.lineItems || estimate?.line_items),
  }
}

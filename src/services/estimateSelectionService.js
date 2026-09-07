import { getEstimatesForProject, getSelectedEstimateForProject } from '../utils/projectIdentity.js'

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isArchived(record = {}) {
  return Boolean(record?.isArchived || record?.archivedAt || record?.archived_at)
}

function readProjectId(project = {}) {
  return normalizeId(project?.id || project?.projectId || project?.project_id)
}

function readEstimateProjectId(estimate = {}) {
  return normalizeId(estimate?.projectId || estimate?.project_id)
}

function readContractorId(record = {}) {
  return normalizeId(record?.contractorId || record?.contractor_id)
}

export function validateEstimateSelection({ project = {}, estimate = null, contractorId = '' } = {}) {
  const projectId = readProjectId(project)
  const estimateId = normalizeId(estimate?.id)
  const projectContractorId = readContractorId(project)
  const estimateContractorId = readContractorId(estimate)
  const normalizedContractorId = normalizeId(contractorId)

  if (!projectId) return { valid: false, code: 'PROJECT_REQUIRED', message: 'A project is required.' }
  if (!estimateId) return { valid: false, code: 'ESTIMATE_REQUIRED', message: 'An estimate is required.' }
  if (readEstimateProjectId(estimate) !== projectId) {
    return { valid: false, code: 'ESTIMATE_PROJECT_MISMATCH', message: 'The estimate does not belong to this project.' }
  }
  if (isArchived(estimate)) {
    return { valid: false, code: 'ESTIMATE_ARCHIVED', message: 'Archived estimates cannot be selected.' }
  }

  const expectedContractorId = normalizedContractorId || projectContractorId
  if (normalizedContractorId && projectContractorId && normalizedContractorId !== projectContractorId) {
    return { valid: false, code: 'CONTRACTOR_MISMATCH', message: 'The project does not belong to this contractor.' }
  }
  if (expectedContractorId && (!estimateContractorId || expectedContractorId !== estimateContractorId)) {
    return { valid: false, code: 'CONTRACTOR_MISMATCH', message: 'The estimate does not belong to this contractor.' }
  }
  return { valid: true, code: null, message: '' }
}

export async function selectEstimateForProject(project, estimate, { contractorId = '', estimates = null, updateProject } = {}) {
  const canonicalEstimate = Array.isArray(estimates)
    ? getEstimatesForProject(project, estimates).find((candidate) => normalizeId(candidate?.id) === normalizeId(estimate?.id)) || null
    : estimate
  const validation = validateEstimateSelection({ project, estimate: canonicalEstimate, contractorId })
  if (!validation.valid) return { data: null, error: validation }
  if (typeof updateProject !== 'function') {
    return { data: null, error: { code: 'PERSISTENCE_REQUIRED', message: 'A project update function is required.' } }
  }

  const projectId = readProjectId(project)
  const response = await updateProject(projectId, { selectedEstimateId: canonicalEstimate.id })
  if (response?.error) return response

  return {
    data: response?.data || { ...project, selectedEstimateId: canonicalEstimate.id, selected_estimate_id: canonicalEstimate.id },
    error: null,
  }
}

export async function clearSelectedEstimate(project, { updateProject } = {}) {
  const projectId = readProjectId(project)
  if (!projectId) return { data: null, error: { code: 'PROJECT_REQUIRED', message: 'A project is required.' } }
  if (typeof updateProject !== 'function') {
    return { data: null, error: { code: 'PERSISTENCE_REQUIRED', message: 'A project update function is required.' } }
  }

  const response = await updateProject(projectId, { selectedEstimateId: null })
  if (response?.error) return response

  return {
    data: response?.data || { ...project, selectedEstimateId: null, selected_estimate_id: null },
    error: null,
  }
}

export function resolveProjectEstimateSelection(project = {}, estimates = []) {
  return getSelectedEstimateForProject(project, getEstimatesForProject(project, estimates))
}

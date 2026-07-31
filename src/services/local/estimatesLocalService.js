// Local estimates service used while app runs in local/mock mode.
// Methods mirror the Supabase-ready service shape but return skipped
// responses so the App's in-memory state remains the source-of-truth.

import { createLocalRecordId } from '../../utils/projectIdentity'
import {
  normalizeEstimateFormattedTextForStorage,
  normalizeEstimateLineItemsForStorage,
} from '../../utils/estimateDocument'

function normalizeEstimate(estimate = {}, opts = {}) {
  const now = new Date().toISOString()
  const clientId = estimate.clientId || estimate.client_id || null
  const leadId = estimate.leadId || estimate.lead_id || null
  const projectId = estimate.projectId || estimate.project_id || null
  const hasLineItemsInput = Array.isArray(estimate.lineItems) || Array.isArray(estimate.line_items)
  const lineItemsInput = Array.isArray(estimate.lineItems)
    ? estimate.lineItems
    : estimate.line_items
  const estimateWithoutLegacyLineItems = { ...estimate }
  delete estimateWithoutLegacyLineItems.line_items
  const scopeInput = estimate.summary ?? estimate.scopeOfWork ?? estimate.scope_of_work
  const normalizedScope = typeof scopeInput === 'string'
    ? normalizeEstimateFormattedTextForStorage(scopeInput)
    : undefined

  return {
    ...estimateWithoutLegacyLineItems,
    id: estimate.id || createLocalRecordId('estimate'),
    contractorId: estimate.contractorId || estimate.contractor_id || opts.contractorId || undefined,
    clientId,
    client_id: clientId,
    leadId,
    lead_id: leadId,
    projectId,
    project_id: projectId,
    ...(normalizedScope !== undefined
      ? {
          summary: normalizedScope,
          scopeOfWork: normalizedScope,
          scope_of_work: normalizedScope,
        }
      : {}),
    ...(hasLineItemsInput
      ? {
          lineItems: normalizeEstimateLineItemsForStorage(lineItemsInput, {
            fallbackMaterialsIncluded: Boolean(estimate.materialsIncluded ?? estimate.materials_included),
          }),
        }
      : {}),
    updatedAt: estimate.updatedAt || estimate.updated_at || now,
    createdAt: estimate.createdAt || estimate.created_at || now,
    archivedAt: estimate.archivedAt || estimate.archived_at || null,
  }
}

export async function list({ includeArchived = false, status, clientId, projectId, contractorId } = {}) {
  // contractorId is accepted for future contractor isolation (ignored locally)
  return { data: [], skipped: true, message: 'Local mode: estimates are sourced from App state' }
}

export async function getById(id) {
  return { data: null, skipped: true, message: 'Local mode: estimates are sourced from App state' }
}

export async function create(estimateData, opts = {}) {
  // opts.contractorId supported for future contractor isolation.
  return { data: normalizeEstimate(estimateData, opts), skipped: true, message: 'Local mode: estimate created in App state' }
}

export async function update(id, updates) {
  return { data: normalizeEstimate({ id, ...(updates || {}) }), skipped: true, message: 'Local mode: estimate updated in App state' }
}

export async function archive(id) {
  return { data: { id, archived: true }, skipped: true, message: 'Local mode: estimate archived in App state' }
}

export async function restore(id) {
  return { data: { id, archived: false }, skipped: true, message: 'Local mode: estimate restored in App state' }
}

export async function deletePermanently(id) {
  return { data: { id, deleted: true }, skipped: true, message: 'Local mode: estimate deleted in App state' }
}

export default { list, getById, create, update, archive, restore, deletePermanently }

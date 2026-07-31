import {
  normalizeEstimateFormattedTextForStorage,
  normalizeEstimateLineItemsForStorage,
} from '../../utils/estimateDocument'

const ESTIMATE_DRAFTS_STORAGE_KEY = 'contractorflow.estimateDrafts'

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readDraftMap() {
  if (!canUseStorage()) return {}

  try {
    const rawValue = window.localStorage.getItem(ESTIMATE_DRAFTS_STORAGE_KEY)
    if (!rawValue) return {}

    const parsedValue = JSON.parse(rawValue)
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : {}
  } catch {
    return {}
  }
}

function writeDraftMap(nextDraftMap) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(ESTIMATE_DRAFTS_STORAGE_KEY, JSON.stringify(nextDraftMap))
  } catch {
    // Ignore storage errors in preview/private browser modes.
  }
}

export function readEstimateDraft(recordId) {
  if (!recordId) return null

  const draftMap = readDraftMap()
  const draft = draftMap[recordId]

  return draft && typeof draft === 'object' ? draft : null
}

export function writeEstimateDraft(recordId, estimate) {
  if (!recordId || !estimate || typeof estimate !== 'object') return

  const draftMap = readDraftMap()
  const lineItemsInput = Array.isArray(estimate.lineItems)
    ? estimate.lineItems
    : Array.isArray(estimate.line_items)
      ? estimate.line_items
      : null
  const normalizedEstimate = { ...estimate }
  delete normalizedEstimate.line_items

  for (const field of ['summary', 'scopeOfWork', 'scope_of_work']) {
    if (typeof normalizedEstimate[field] === 'string') {
      normalizedEstimate[field] = normalizeEstimateFormattedTextForStorage(normalizedEstimate[field])
    }
  }

  if (lineItemsInput) {
    normalizedEstimate.lineItems = normalizeEstimateLineItemsForStorage(lineItemsInput, {
      fallbackMaterialsIncluded: Boolean(estimate.materialsIncluded ?? estimate.materials_included),
    })
  }

  writeDraftMap({
    ...draftMap,
    [recordId]: normalizedEstimate,
  })
}

export function clearEstimateDraft(recordId) {
  if (!recordId) return

  const draftMap = readDraftMap()
  if (!Object.prototype.hasOwnProperty.call(draftMap, recordId)) return

  const nextDraftMap = { ...draftMap }
  delete nextDraftMap[recordId]
  writeDraftMap(nextDraftMap)
}

export default {
  readEstimateDraft,
  writeEstimateDraft,
  clearEstimateDraft,
}

export const ESTIMATE_FINALIZATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  SAVED: 'saved',
  SENT: 'sent',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CONVERTED: 'converted',
})

export function normalizeEstimateFinalizationStatus(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (normalized === 'converted to contract') return ESTIMATE_FINALIZATION_STATUS.CONVERTED
  return Object.values(ESTIMATE_FINALIZATION_STATUS).includes(normalized)
    ? normalized
    : ESTIMATE_FINALIZATION_STATUS.DRAFT
}

export function shouldConfirmSentEstimateEdit(status) {
  return normalizeEstimateFinalizationStatus(status) === ESTIMATE_FINALIZATION_STATUS.SENT
}

export function canEditEstimate(status) {
  return ![
    ESTIMATE_FINALIZATION_STATUS.APPROVED,
    ESTIMATE_FINALIZATION_STATUS.CONVERTED,
  ].includes(normalizeEstimateFinalizationStatus(status))
}

export function canSendEstimate(status) {
  return [
    ESTIMATE_FINALIZATION_STATUS.DRAFT,
    ESTIMATE_FINALIZATION_STATUS.SAVED,
    ESTIMATE_FINALIZATION_STATUS.SENT,
    ESTIMATE_FINALIZATION_STATUS.REJECTED,
  ].includes(normalizeEstimateFinalizationStatus(status))
}

export function canCreateContractFromEstimate(status) {
  return normalizeEstimateFinalizationStatus(status) === ESTIMATE_FINALIZATION_STATUS.APPROVED
}

export function buildEstimateRevisionReset() {
  return {
    status: 'Saved',
    sentAt: null,
    approvedAt: null,
    rejectedAt: null,
  }
}

export function buildEstimateResendTransition(now = new Date().toISOString()) {
  return {
    status: 'Sent',
    sentAt: now,
    approvedAt: null,
    rejectedAt: null,
  }
}

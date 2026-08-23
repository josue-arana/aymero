const statusAliases = {
  sent: 'sent',
  approved: 'approved',
  rejected: 'rejected',
  converted: 'converted',
  'converted to contract': 'converted',
  draft: 'draft',
  saved: 'saved',
}

const publicTokenPattern = /^[a-zA-Z0-9_-]{20,200}$/
const internalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const allowedDecisions = new Set(['approve', 'decline'])

export function isValidEstimateResponseToken(token) {
  const normalizedToken = String(token || '').trim()
  return publicTokenPattern.test(normalizedToken) && !internalUuidPattern.test(normalizedToken)
}

export function resolveEstimateResponseTransition(status, decision) {
  const currentStatus = String(status || '').trim().toLowerCase()
  const normalizedDecision = String(decision || '').trim().toLowerCase()
  if (!allowedDecisions.has(normalizedDecision)) {
    return { kind: 'invalid', currentStatus, targetStatus: '' }
  }

  const targetStatus = normalizedDecision === 'approve' ? 'approved' : 'rejected'
  if (currentStatus === targetStatus) return { kind: 'idempotent', currentStatus, targetStatus }
  if (currentStatus === 'sent') return { kind: 'update', currentStatus, targetStatus }
  return { kind: 'blocked', currentStatus, targetStatus }
}

export function normalizeEstimateClientResponseStatus(status) {
  return statusAliases[String(status || '').trim().toLowerCase()] || 'unavailable'
}

export function getEstimateClientResponseView(status) {
  const normalizedStatus = normalizeEstimateClientResponseStatus(status)

  return {
    status: normalizedStatus,
    isActionable: normalizedStatus === 'sent',
    isApproved: normalizedStatus === 'approved',
    isRejected: normalizedStatus === 'rejected',
    isConverted: normalizedStatus === 'converted',
  }
}

export function getEstimatePortalStatusPresentation(status) {
  const normalizedStatus = normalizeEstimateClientResponseStatus(status)
  const presentations = {
    sent: {
      labelKey: 'portalEstimateAwaitingResponse',
      className: 'bg-blue-50 text-blue-700 ring-blue-100',
    },
    approved: {
      labelKey: 'portalEstimateApproved',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    },
    rejected: {
      labelKey: 'portalEstimateDeclined',
      className: 'bg-rose-50 text-rose-700 ring-rose-100',
    },
  }

  return presentations[normalizedStatus] || null
}

export default getEstimateClientResponseView

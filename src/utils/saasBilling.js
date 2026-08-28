const terminalSubscriptionStatuses = new Set(['canceled', 'incomplete_expired'])

const statusPresentations = {
  active: {
    labelKey: 'billingStatusActive',
    descriptionKey: 'billingStatusDescriptionActive',
    tone: 'success',
  },
  trialing: {
    labelKey: 'billingStatusTrialing',
    descriptionKey: 'billingStatusDescriptionTrialing',
    tone: 'info',
  },
  incomplete: {
    labelKey: 'billingStatusIncomplete',
    descriptionKey: 'billingStatusDescriptionIncomplete',
    tone: 'warning',
  },
  incomplete_expired: {
    labelKey: 'billingStatusIncompleteExpired',
    descriptionKey: 'billingStatusDescriptionIncompleteExpired',
    tone: 'neutral',
  },
  past_due: {
    labelKey: 'billingStatusPastDue',
    descriptionKey: 'billingStatusDescriptionPastDue',
    tone: 'warning',
    needsAttention: true,
  },
  unpaid: {
    labelKey: 'billingStatusUnpaid',
    descriptionKey: 'billingStatusDescriptionUnpaid',
    tone: 'warning',
    needsAttention: true,
  },
  paused: {
    labelKey: 'billingStatusPaused',
    descriptionKey: 'billingStatusDescriptionPaused',
    tone: 'neutral',
  },
  canceled: {
    labelKey: 'billingStatusCanceled',
    descriptionKey: 'billingStatusDescriptionCanceled',
    tone: 'neutral',
  },
}

export function normalizeSaasBillingStatus(status) {
  return String(status || '').trim().toLowerCase()
}

export function getSaasBillingStatusPresentation(status) {
  return statusPresentations[normalizeSaasBillingStatus(status)] || {
    labelKey: 'billingStatusUnknown',
    descriptionKey: 'billingStatusDescriptionUnknown',
    tone: 'neutral',
  }
}

export function getSaasBillingPaymentPresentation(lastPaymentStatus) {
  const status = String(lastPaymentStatus || '').trim().toLowerCase()
  if (status === 'paid') return { labelKey: 'billingPaymentPaid', tone: 'success', needsAttention: false }
  if (status === 'failed') return { labelKey: 'billingPaymentIssue', tone: 'warning', needsAttention: true }
  return null
}

function normalizeSaasBillingDate(value) {
  if (!value) return ''
  const timestamp = Date.parse(String(value))
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : ''
}

export function resolveSaasBillingCancellation(subscription, { now = Date.now() } = {}) {
  const status = normalizeSaasBillingStatus(subscription?.status)
  if (status === 'canceled') return { isScheduled: false, accessThrough: '' }

  const cancelAt = normalizeSaasBillingDate(subscription?.cancel_at)
  const cancelAtTimestamp = cancelAt ? Date.parse(cancelAt) : Number.NaN
  if (Number.isFinite(cancelAtTimestamp) && cancelAtTimestamp > now) {
    return { isScheduled: true, accessThrough: cancelAt }
  }

  if (subscription?.cancel_at_period_end === true) {
    return {
      isScheduled: true,
      accessThrough: normalizeSaasBillingDate(subscription?.current_period_end),
    }
  }

  return { isScheduled: false, accessThrough: '' }
}

export function isSaasBillingCancellationScheduled(subscription, options) {
  return resolveSaasBillingCancellation(subscription, options).isScheduled
}

export function canStartSaasBillingCheckout(subscription) {
  if (!subscription) return true
  return terminalSubscriptionStatuses.has(normalizeSaasBillingStatus(subscription.status))
}

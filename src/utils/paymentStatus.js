const FINANCIAL_PAYMENT_STATUSES = new Set(['recorded', 'complete', 'completed', 'paid', 'settled', 'success', 'succeeded'])
const KNOWN_PAYMENT_STATUSES = new Set([
  ...FINANCIAL_PAYMENT_STATUSES,
  'pending',
  'failed',
  'refunded',
  'cancelled',
  'canceled',
])

export function normalizePaymentStatus(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function classifyPaymentStatus(value) {
  const status = normalizePaymentStatus(value)
  if (!status || !KNOWN_PAYMENT_STATUSES.has(status)) return 'unknown'
  if (FINANCIAL_PAYMENT_STATUSES.has(status)) return 'effective'
  return status
}

export function isFinanciallyEffectivePayment(payment = {}) {
  const amount = Number(payment?.amount)
  return classifyPaymentStatus(payment?.status) === 'effective'
    && (!Number.isFinite(amount) || amount >= 0)
}

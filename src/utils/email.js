const KNOWN_EMAIL_SENTINELS = new Set(['no agregado', 'not added'])

function normalizeSentinel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isKnownEmailSentinel(value) {
  return KNOWN_EMAIL_SENTINELS.has(normalizeSentinel(value))
}

export function normalizeOptionalEmail(value) {
  const normalized = String(value || '').trim()
  if (!normalized || isKnownEmailSentinel(normalized)) return ''
  return normalized
}

export function isValidOptionalEmail(value) {
  const rawValue = String(value || '').trim()
  if (isKnownEmailSentinel(rawValue)) return false
  const normalized = normalizeOptionalEmail(rawValue)
  if (!normalized) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

export function normalizeOptionalEmailForPersistence(value) {
  const normalized = normalizeOptionalEmail(value)
  if (!isValidOptionalEmail(normalized)) {
    throw new Error('Invalid optional email address')
  }
  return normalized
}

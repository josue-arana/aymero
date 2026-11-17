const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{20,200}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeInvoicePublicShareToken(value = '') {
  const token = String(value || '').trim()
  return TOKEN_PATTERN.test(token) && !UUID_PATTERN.test(token) ? token : ''
}

export function createInvoicePublicShareToken(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('Secure invoice-link generation is unavailable in this browser.')
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

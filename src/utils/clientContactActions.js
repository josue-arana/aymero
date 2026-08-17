const unavailableClientContactValues = new Set([
  '(410) 555-0100',
  'address not added',
  'email not added',
  'phone not added',
])

function readAvailableValue(value) {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue) return ''
  return unavailableClientContactValues.has(normalizedValue.toLowerCase()) ? '' : normalizedValue
}

export function normalizeClientPhone(phone = '') {
  const value = readAvailableValue(phone)
  if (!value) return ''

  const linkValue = value.replace(/[^\d+]/g, '')
  const digits = linkValue.replace(/\D/g, '')
  return digits.length >= 7 ? linkValue : ''
}

export function normalizeClientEmail(email = '') {
  const value = readAvailableValue(email)
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return ''
  return value
}

export function normalizeClientAddress(address = '') {
  return readAvailableValue(address)
}

export function buildClientMapsHref(address = '') {
  const value = normalizeClientAddress(address)
  return value ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}` : ''
}

export function resolveClientContactActions(client = {}) {
  const phone = readAvailableValue(client?.phone)
  const phoneHref = normalizeClientPhone(phone)
  const email = normalizeClientEmail(client?.email)
  const address = normalizeClientAddress(client?.address)
  const actions = [
    address ? 'drive' : null,
    phoneHref ? 'call' : null,
    phoneHref ? 'text' : null,
    email ? 'email' : null,
  ].filter(Boolean)

  return {
    phone: phoneHref ? phone : '',
    phoneHref,
    smsHref: phoneHref ? `sms:${phoneHref}` : '',
    email,
    emailHref: email ? `mailto:${email}` : '',
    address,
    mapsHref: buildClientMapsHref(address),
    actions,
  }
}

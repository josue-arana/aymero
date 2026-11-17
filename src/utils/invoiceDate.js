const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const US_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

export function normalizeInvoiceDate(value) {
  if (!value) return ''
  const input = String(value).trim()
  const isoMatch = input.match(ISO_DATE_PATTERN)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    return date.getUTCFullYear() === Number(year)
      && date.getUTCMonth() === Number(month) - 1
      && date.getUTCDate() === Number(day) ? input : ''
  }
  const usMatch = input.match(US_DATE_PATTERN)
  if (usMatch) {
    const [, month, day, year] = usMatch
    return normalizeInvoiceDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }
  return ''
}

export function formatInvoiceDateInput(value) {
  const isoDate = normalizeInvoiceDate(value)
  if (!isoDate) return ''
  const [, year, month, day] = isoDate.match(ISO_DATE_PATTERN)
  return `${month}/${day}/${year}`
}

export function formatInvoiceCalendarDate(value, language = 'en', options = {}) {
  const isoDate = normalizeInvoiceDate(value)
  if (!isoDate) return ''
  const [, year, month, day] = isoDate.match(ISO_DATE_PATTERN)
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
  return date.toLocaleDateString(language === 'es' ? 'es-US' : 'en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  })
}

export function invoiceDateFromInput(value) {
  return normalizeInvoiceDate(value)
}

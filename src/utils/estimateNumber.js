function normalizeToken(value) {
  return String(value || '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
}

function toDateStamp(value = new Date()) {
  const parsedDate = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '')
  }

  const year = parsedDate.getFullYear()
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0')
  const day = String(parsedDate.getDate()).padStart(2, '0')

  return `${year}${month}${day}`
}

function extractDateStamp(value = '') {
  const match = String(value).match(/(20\d{6})/)
  return match?.[1] || ''
}

function extractEstimateSuffix(value = '', fallbackRecord = {}) {
  const candidate = normalizeToken(value)
  const fallback = [
    fallbackRecord?.id,
    fallbackRecord?.estimateId,
    fallbackRecord?.estimate_id,
    fallbackRecord?.projectId,
    fallbackRecord?.project_id,
    fallbackRecord?.leadId,
    fallbackRecord?.lead_id,
  ]
    .map(normalizeToken)
    .find(Boolean)

  const source = candidate || fallback || '0001'
  return source.slice(-6).padStart(6, '0')
}

export function generateEstimateNumber(record = {}, date = new Date()) {
  return `EST-${toDateStamp(date)}-${extractEstimateSuffix('', record)}`
}

export function formatEstimateDisplayNumber(value, record = {}) {
  const rawValue = String(value || '').trim()

  if (!rawValue) {
    return generateEstimateNumber(record)
  }

  if (/^EST-\d{8}-[A-Z0-9]{2,6}$/i.test(rawValue)) {
    return rawValue.toUpperCase()
  }

  if (rawValue.length <= 18) {
    return /^est-/i.test(rawValue) ? rawValue.toUpperCase() : rawValue
  }

  const dateStamp = extractDateStamp(rawValue)
  const suffix = extractEstimateSuffix(rawValue, record)

  return dateStamp
    ? `EST-${dateStamp}-${suffix}`
    : `EST-${suffix}`
}

export function getEstimateDisplayNumber(estimate = {}, record = {}) {
  return formatEstimateDisplayNumber(
    estimate?.number || estimate?.estimateNumber || '',
    record
  )
}

const currencyWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const currencyWithCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function hasNonZeroCents(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return false

  const cents = Math.round(Math.abs(numericValue) * 100) % 100
  return cents !== 0
}

export const currency = {
  format(value) {
    return (hasNonZeroCents(value) ? currencyWithCents : currencyWhole).format(Number(value) || 0)
  },
}

export function formatDisplayDate(value, fallback = '', locale) {
  if (!value) return fallback

  const parsedDate = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return typeof value === 'string' ? value : fallback
  }

  return parsedDate.toLocaleDateString(locale || undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

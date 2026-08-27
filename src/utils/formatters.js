export const currency = new Intl.NumberFormat('en-US', {
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

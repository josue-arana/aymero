export function normalizeCurrencyInput(value) {
  const rawValue = String(value ?? '')
  if (rawValue.includes('-')) return rawValue.trim()

  const cleaned = rawValue.replace(/[^\d.]/g, '')

  if (!cleaned) return ''

  const hasDecimal = cleaned.includes('.')
  const [rawWhole = '', ...rawDecimals] = cleaned.split('.')
  const whole = rawWhole.replace(/^0+(?=\d)/, '')
  const decimal = rawDecimals.join('').slice(0, 2)

  if (hasDecimal) {
    if (cleaned.endsWith('.') && decimal.length === 0) {
      return `${whole || '0'}.`
    }

    return `${whole || '0'}.${decimal}`
  }

  return whole
}

export function parsePaymentAmount(value) {
  const normalized = normalizeCurrencyInput(value)
  const parsed = Number(normalized)

  return {
    normalized,
    value: Number.isFinite(parsed) ? parsed : NaN,
  }
}

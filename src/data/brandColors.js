export const DEFAULT_BRAND_COLOR = '#2563EB'

// These names mirror the exact colors offered by the former Settings swatch
// control. They are read-only compatibility aliases; all new writes use HEX.
export const LEGACY_BRAND_COLOR_MAP = Object.freeze({
  blue: '#2563EB',
  teal: '#0F8B8D',
  green: '#059669',
  purple: '#7C3AED',
  rose: '#E11D48',
  orange: '#C2410C',
})

export function parseBrandColor(value) {
  const input = String(value || '').trim()
  const match = input.match(/^#?([0-9a-f]{6})$/i)
  return match ? `#${match[1].toUpperCase()}` : null
}

export function normalizeBrandColor(value, fallback = DEFAULT_BRAND_COLOR) {
  const input = String(value || '').trim()
  const parsedColor = parseBrandColor(input)

  if (parsedColor) return parsedColor

  const legacyColor = LEGACY_BRAND_COLOR_MAP[input.toLowerCase()]
  if (legacyColor) return legacyColor

  return parseBrandColor(fallback) || DEFAULT_BRAND_COLOR
}

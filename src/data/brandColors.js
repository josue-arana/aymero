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

function hexToRgb(value) {
  const color = normalizeBrandColor(value)
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  }
}

function toLinearChannel(channel) {
  const normalized = channel / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function getRelativeLuminance({ red, green, blue }) {
  return (0.2126 * toLinearChannel(red))
    + (0.7152 * toLinearChannel(green))
    + (0.0722 * toLinearChannel(blue))
}

function rgbToHex({ red, green, blue }) {
  const channel = (value) => Math.round(value).toString(16).padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase()
}

// Preserve the selected hue while making accent-colored text readable on white.
// Decorative borders and markers can continue using the exact company HEX.
export function getReadableBrandTextColor(value, minimumContrast = 4.5) {
  const color = hexToRgb(value)
  const whiteLuminance = 1
  const contrast = (whiteLuminance + 0.05) / (getRelativeLuminance(color) + 0.05)

  if (contrast >= minimumContrast) return normalizeBrandColor(value)

  for (let mix = 0.05; mix <= 1; mix += 0.05) {
    const darkened = {
      red: color.red * (1 - mix),
      green: color.green * (1 - mix),
      blue: color.blue * (1 - mix),
    }
    const darkenedContrast = (whiteLuminance + 0.05) / (getRelativeLuminance(darkened) + 0.05)
    if (darkenedContrast >= minimumContrast) return rgbToHex(darkened)
  }

  return '#000000'
}

// Document templates share one resolver so preview, print, and export paths
// receive identical, validated brand tokens from either persisted field shape.
export function resolveDocumentBrandTokens(company = {}) {
  const accentColor = normalizeBrandColor(company?.primaryColor || company?.primary_color)

  return {
    accentColor,
    accentTextColor: getReadableBrandTextColor(accentColor),
  }
}

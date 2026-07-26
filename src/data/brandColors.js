export const DEFAULT_BRAND_COLOR = '#2563eb'

// Canonical colors offered by Aymero's company branding controls.
// Previously saved custom colors remain valid, but new selections are limited
// to this intentionally small, document-safe palette.
export const SUPPORTED_BRAND_COLORS = [
  { value: '#2563eb', labelKey: 'brandColorBlue' },
  { value: '#0f8b8d', labelKey: 'brandColorTeal' },
  { value: '#059669', labelKey: 'brandColorGreen' },
  { value: '#7c3aed', labelKey: 'brandColorPurple' },
  { value: '#e11d48', labelKey: 'brandColorRose' },
  { value: '#c2410c', labelKey: 'brandColorOrange' },
]

export function normalizeBrandColor(value, fallback = DEFAULT_BRAND_COLOR) {
  const normalized = String(value || '').trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback
}

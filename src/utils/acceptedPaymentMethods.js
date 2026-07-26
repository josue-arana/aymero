export const OTHER_PAYMENT_METHOD = 'other'

export const ACCEPTED_PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', labelKey: 'Cash' },
  { value: 'check', labelKey: 'Check' },
  { value: 'credit_card', labelKey: 'Credit Card' },
  { value: 'zelle', labelKey: 'Zelle' },
  { value: 'ach_bank_transfer', labelKey: 'achBankTransfer' },
  { value: 'venmo', labelKey: 'Venmo' },
  { value: OTHER_PAYMENT_METHOD, labelKey: 'Other' },
]

const supportedMethodValues = new Set(ACCEPTED_PAYMENT_METHOD_OPTIONS.map(({ value }) => value))
const legacyMethodAliases = new Map([
  ['cash', 'cash'],
  ['check', 'check'],
  ['credit card', 'credit_card'],
  ['credit_card', 'credit_card'],
  ['zelle', 'zelle'],
  ['ach', 'ach_bank_transfer'],
  ['bank transfer', 'ach_bank_transfer'],
  ['bank_transfer', 'ach_bank_transfer'],
  ['ach / bank transfer', 'ach_bank_transfer'],
  ['ach_bank_transfer', 'ach_bank_transfer'],
  ['venmo', 'venmo'],
  ['other', OTHER_PAYMENT_METHOD],
])

export function createEmptyAcceptedPaymentMethods() {
  return {
    methods: [],
    otherLabel: '',
  }
}

function normalizeMethodValue(value) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return { value: '', customLabel: '' }

  const normalizedValue = legacyMethodAliases.get(rawValue.toLowerCase())
  if (normalizedValue) return { value: normalizedValue, customLabel: '' }
  if (supportedMethodValues.has(rawValue)) return { value: rawValue, customLabel: '' }

  return {
    value: OTHER_PAYMENT_METHOD,
    customLabel: rawValue,
  }
}

function readLegacyObjectMethods(value = {}) {
  return Object.entries(value)
    .filter(([key, enabled]) => (
      !['methods', 'otherLabel', 'other_label', 'customLabel', 'custom_label'].includes(key)
      && Boolean(enabled)
    ))
    .map(([method]) => method)
}

export function normalizeAcceptedPaymentMethods(value) {
  const source = value && typeof value === 'object' ? value : {}
  const rawMethods = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : Array.isArray(source.methods)
        ? source.methods
        : readLegacyObjectMethods(source)
  const normalizedMethods = []
  const seenMethods = new Set()
  let legacyCustomLabel = ''

  rawMethods.forEach((method) => {
    const rawMethod = method && typeof method === 'object'
      ? method.value || method.name || method.label
      : method
    const normalizedMethod = normalizeMethodValue(rawMethod)

    if (!normalizedMethod.value || seenMethods.has(normalizedMethod.value)) return

    seenMethods.add(normalizedMethod.value)
    normalizedMethods.push(normalizedMethod.value)
    if (normalizedMethod.customLabel && !legacyCustomLabel) {
      legacyCustomLabel = normalizedMethod.customLabel
    }
  })

  const otherLabel = String(
    source.otherLabel
      ?? source.other_label
      ?? source.customLabel
      ?? source.custom_label
      ?? legacyCustomLabel
      ?? ''
  )

  return {
    methods: normalizedMethods,
    otherLabel,
  }
}

export function serializeAcceptedPaymentMethods(value) {
  const normalized = normalizeAcceptedPaymentMethods(value)
  const hasOther = normalized.methods.includes(OTHER_PAYMENT_METHOD)

  // Canonical company_settings.accepted_payment_methods JSONB shape:
  // { methods: string[], otherLabel: string }
  return {
    methods: normalized.methods,
    otherLabel: hasOther ? normalized.otherLabel.trim() : '',
  }
}

export function getAcceptedPaymentMethodLabels(value, t = (key) => key) {
  const normalized = serializeAcceptedPaymentMethods(value)

  return normalized.methods
    .map((method) => {
      if (method === OTHER_PAYMENT_METHOD) {
        return normalized.otherLabel
      }

      const option = ACCEPTED_PAYMENT_METHOD_OPTIONS.find(({ value: optionValue }) => optionValue === method)
      return option ? t(option.labelKey) : ''
    })
    .filter(Boolean)
}

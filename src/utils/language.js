export const supportedLanguageCodes = ['en', 'es']

export function normalizeSupportedLanguage(value, fallback = 'en') {
  if (value === 'es') return 'es'
  if (value === 'en') return 'en'
  return fallback === 'es' ? 'es' : 'en'
}

export function normalizeSupportedLanguageOrEmpty(value) {
  if (value === 'es') return 'es'
  if (value === 'en') return 'en'
  return ''
}

function normalizeBrowserLanguage(value = '') {
  const normalizedValue = String(value || '').trim().toLowerCase()

  if (normalizedValue.startsWith('es')) return 'es'
  if (normalizedValue.startsWith('en')) return 'en'
  return ''
}

export function detectBrowserSupportedLanguage(fallback = 'en') {
  if (typeof navigator === 'undefined') {
    return normalizeSupportedLanguage(fallback, 'en')
  }

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
    navigator.userLanguage,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeBrowserLanguage(candidate)
    if (normalizedCandidate) {
      return normalizedCandidate
    }
  }

  return normalizeSupportedLanguage(fallback, 'en')
}

export function readStoredSupportedLanguage(key) {
  if (!key || typeof window === 'undefined') return ''

  try {
    return normalizeSupportedLanguageOrEmpty(window.localStorage.getItem(key) || '')
  } catch {
    return ''
  }
}

export function resolveInitialSupportedLanguage(key, fallback = 'en') {
  return readStoredSupportedLanguage(key) || detectBrowserSupportedLanguage(fallback)
}

export function getLanguageLocale(value = 'en') {
  return normalizeSupportedLanguage(value, 'en') === 'es' ? 'es-ES' : 'en-US'
}

export function normalizeDocumentLanguageOverride(value) {
  return normalizeSupportedLanguageOrEmpty(value)
}

export function readRecordLanguage(record = {}, fallback = 'en') {
  const explicitLanguage = normalizeSupportedLanguageOrEmpty(
    record?.clientLanguage
      || record?.preferredLanguage
      || record?.preferred_language
      || record?.language
      || ''
  )

  return explicitLanguage || normalizeSupportedLanguage(fallback, 'en')
}

export function resolvePreferredClientLanguage({
  client = null,
  lead = null,
  userLanguage = 'en',
  fallback = 'en',
} = {}) {
  if (client) {
    return readRecordLanguage(client, normalizeSupportedLanguage(userLanguage, fallback))
  }

  if (lead) {
    return readRecordLanguage(lead, normalizeSupportedLanguage(userLanguage, fallback))
  }

  return normalizeSupportedLanguage(userLanguage, fallback)
}

export function resolveClientFacingLanguage({
  documentLanguage = '',
  client = null,
  lead = null,
  appLanguage = 'en',
  fallback = 'en',
} = {}) {
  const explicitDocumentLanguage = normalizeDocumentLanguageOverride(documentLanguage)

  if (explicitDocumentLanguage) {
    return explicitDocumentLanguage
  }

  return resolvePreferredClientLanguage({
    client,
    lead,
    userLanguage: appLanguage,
    fallback,
  })
}

// Scope Assistant contractor review language belongs to the authenticated
// contractor application. It must not inherit a client, lead, or document
// language, which are all client-facing concerns.
export function resolveScopeAssistantContractorLanguage({ appLanguage = 'en' } = {}) {
  return normalizeSupportedLanguage(appLanguage, 'en')
}

export function normalizeLeadClientLanguageFields(lead = {}, fallback = 'en') {
  const explicitLanguage = normalizeSupportedLanguageOrEmpty(
    lead?.clientLanguage
      || lead?.preferredLanguage
      || lead?.preferred_language
      || lead?.language
      || ''
  )
  const clientLanguage = explicitLanguage || (fallback ? normalizeSupportedLanguage(fallback, 'en') : '')

  return {
    ...lead,
    ...(clientLanguage ? { clientLanguage } : {}),
  }
}

export function normalizeClientPreferredLanguageFields(client = {}, fallback = 'en') {
  const explicitLanguage = normalizeSupportedLanguageOrEmpty(
    client?.preferredLanguage
      || client?.preferred_language
      || client?.clientLanguage
      || client?.language
      || ''
  )
  const preferredLanguage = explicitLanguage || (fallback ? normalizeSupportedLanguage(fallback, 'en') : '')

  return {
    ...client,
    ...(preferredLanguage ? {
      preferredLanguage,
      preferred_language: client?.preferred_language ?? preferredLanguage,
      language: client?.language ?? preferredLanguage,
    } : {}),
  }
}

export function buildLanguageOptions(t) {
  return [
    { value: 'en', label: `🇺🇸 ${t('english')}` },
    { value: 'es', label: `🇪🇸 ${t('spanish')}` },
  ]
}

export default {
  buildLanguageOptions,
  detectBrowserSupportedLanguage,
  getLanguageLocale,
  normalizeClientPreferredLanguageFields,
  normalizeDocumentLanguageOverride,
  normalizeLeadClientLanguageFields,
  normalizeSupportedLanguage,
  normalizeSupportedLanguageOrEmpty,
  readStoredSupportedLanguage,
  readRecordLanguage,
  resolveInitialSupportedLanguage,
  resolveClientFacingLanguage,
  resolveScopeAssistantContractorLanguage,
  resolvePreferredClientLanguage,
  supportedLanguageCodes,
}

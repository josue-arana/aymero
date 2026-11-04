import { normalizeSupportedLanguageOrEmpty, normalizeSupportedLanguage } from './language'

export function getCustomerPortalLanguageStorageKey(portalId = '') {
  const normalizedPortalId = String(portalId || '').trim()
  return normalizedPortalId
    ? `aymero.customerPortal.language.${encodeURIComponent(normalizedPortalId)}`
    : ''
}

export function readCustomerPortalLanguageSelection(portalId = '') {
  const key = getCustomerPortalLanguageStorageKey(portalId)
  if (!key || typeof window === 'undefined') return ''

  try {
    return normalizeSupportedLanguageOrEmpty(window.localStorage.getItem(key) || '')
  } catch {
    return ''
  }
}

export function persistCustomerPortalLanguageSelection(portalId = '', language = '') {
  const key = getCustomerPortalLanguageStorageKey(portalId)
  const normalizedLanguage = normalizeSupportedLanguageOrEmpty(language)
  if (!key || !normalizedLanguage || typeof window === 'undefined') return false

  try {
    window.localStorage.setItem(key, normalizedLanguage)
    return true
  } catch {
    return false
  }
}

function readPreference(record = {}) {
  return normalizeSupportedLanguageOrEmpty(
    record?.preferredLanguage
      || record?.preferred_language
      || record?.clientLanguage
      || record?.client_language
      || record?.language
      || ''
  )
}

export function resolveCustomerPortalLanguage({
  explicitSelection = '',
  client = null,
  lead = null,
  project = null,
  fallback = 'en',
} = {}) {
  return normalizeSupportedLanguageOrEmpty(explicitSelection)
    || readPreference(client || {})
    || readPreference(lead || {})
    || readPreference(project || {})
    || normalizeSupportedLanguage(fallback, 'en')
}

export default {
  getCustomerPortalLanguageStorageKey,
  persistCustomerPortalLanguageSelection,
  readCustomerPortalLanguageSelection,
  resolveCustomerPortalLanguage,
}

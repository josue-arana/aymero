import { USE_SUPABASE, USE_SUPABASE_CLIENTS, USE_SUPABASE_CONTRACTS, USE_SUPABASE_ESTIMATES, USE_SUPABASE_EVENTS, USE_SUPABASE_INVOICES, USE_SUPABASE_LEADS, USE_SUPABASE_PAYMENTS, USE_SUPABASE_PROJECTS, USE_SUPABASE_SETTINGS } from '../../config/backendConfig'

const DEFAULT_DEV_ORIGIN = 'http://localhost:5174'

function readEnvValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOrigin(origin = '') {
  const value = readEnvValue(origin).replace(/\/$/, '')
  if (!value) return ''

  try {
    const parsedUrl = new URL(value)
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) return ''

    return parsedUrl.origin
  } catch {
    return ''
  }
}

function readWindowOrigin() {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return ''
  }

  return normalizeOrigin(window.location.origin)
}

function joinOriginWithPath(origin = '', pathname = '') {
  const normalizedOrigin = normalizeOrigin(origin)
  const normalizedPath = typeof pathname === 'string' ? pathname.trim() : ''

  if (!normalizedPath) {
    return normalizedOrigin
  }

  const relativePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`

  if (!normalizedOrigin) {
    return relativePath
  }

  try {
    return new URL(relativePath, normalizedOrigin).toString()
  } catch {
    return `${normalizedOrigin}${relativePath}`
  }
}

export function getSupabaseEnvironmentConfig() {
  return {
    supabaseUrl: readEnvValue(import.meta.env.VITE_SUPABASE_URL),
    supabaseAnonKey: readEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY),
  }
}

export function getPublicEnvironmentConfig() {
  const appUrl = normalizeOrigin(import.meta.env.VITE_APP_URL) || readWindowOrigin() || (import.meta.env.DEV ? DEFAULT_DEV_ORIGIN : '')
  const siteUrl = normalizeOrigin(import.meta.env.VITE_SITE_URL) || appUrl
  const explicitPortalUrl = normalizeOrigin(import.meta.env.VITE_PORTAL_URL)
  const portalUrl = explicitPortalUrl || appUrl
  const authUrl = normalizeOrigin(import.meta.env.VITE_AUTH_URL) || appUrl

  return {
    siteUrl,
    appUrl,
    portalUrl,
    hasExplicitPortalUrl: Boolean(explicitPortalUrl),
    authUrl,
  }
}

export function getHostnameEnvironmentConfig() {
  const configuredValues = {
    site: readEnvValue(import.meta.env.VITE_SITE_URL),
    app: readEnvValue(import.meta.env.VITE_APP_URL),
    portal: readEnvValue(import.meta.env.VITE_PORTAL_URL),
    auth: readEnvValue(import.meta.env.VITE_AUTH_URL),
  }
  const origins = Object.fromEntries(
    Object.entries(configuredValues).map(([surface, value]) => [surface, normalizeOrigin(value)])
  )
  const environmentKey = (surface) => `VITE_${surface.toUpperCase()}_URL`

  return {
    origins,
    missingKeys: Object.entries(configuredValues)
      .filter(([, value]) => !value)
      .map(([surface]) => environmentKey(surface)),
    invalidKeys: Object.entries(configuredValues)
      .filter(([surface, value]) => Boolean(value) && !origins[surface])
      .map(([surface]) => environmentKey(surface)),
  }
}

export function buildPublicUrl(pathname = '', originType = 'app') {
  const publicConfig = getPublicEnvironmentConfig()
  const origin = originType === 'site'
    ? publicConfig.siteUrl
    : originType === 'portal'
      ? publicConfig.portalUrl
      : originType === 'auth'
        ? publicConfig.authUrl
        : publicConfig.appUrl

  return joinOriginWithPath(origin, pathname)
}

export function getAuthRedirectUrl(pathname = '') {
  const explicitRedirectUrl = readEnvValue(import.meta.env.VITE_AUTH_REDIRECT_URL)
  const publicConfig = getPublicEnvironmentConfig()

  if (explicitRedirectUrl) {
    return joinOriginWithPath(explicitRedirectUrl, pathname)
  }

  if (publicConfig.authUrl) {
    return buildPublicUrl(pathname, 'auth')
  }

  return buildPublicUrl(pathname, 'app')
}

export function getEnvironmentStatus() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnvironmentConfig()
  const hasSupabaseUrl = Boolean(supabaseUrl)
  const hasAnonKey = Boolean(supabaseAnonKey)
  const supabaseConfigured = hasSupabaseUrl && hasAnonKey
  const enabledEntityFlags = [USE_SUPABASE_SETTINGS, USE_SUPABASE_CLIENTS, USE_SUPABASE_LEADS, USE_SUPABASE_PROJECTS, USE_SUPABASE_ESTIMATES, USE_SUPABASE_CONTRACTS, USE_SUPABASE_INVOICES, USE_SUPABASE_PAYMENTS, USE_SUPABASE_EVENTS].filter(Boolean).length
  const dataMode = USE_SUPABASE
    ? 'supabase'
    : enabledEntityFlags > 1
      ? 'entity-supabase-beta'
      : USE_SUPABASE_SETTINGS
        ? 'settings-supabase'
        : USE_SUPABASE_CLIENTS
          ? 'clients-supabase'
          : USE_SUPABASE_LEADS
            ? 'leads-supabase'
            : USE_SUPABASE_PROJECTS
              ? 'projects-supabase'
                : USE_SUPABASE_ESTIMATES
                  ? 'estimates-supabase'
                : USE_SUPABASE_CONTRACTS
                  ? 'contracts-supabase'
                  : USE_SUPABASE_INVOICES
                    ? 'invoices-supabase'
                  : USE_SUPABASE_PAYMENTS
                    ? 'payments-supabase'
                    : USE_SUPABASE_EVENTS
                      ? 'events-supabase'
                  : 'local'
  const settingsDataMode = USE_SUPABASE_SETTINGS ? 'supabase' : 'local'

  return {
    hasSupabaseUrl,
    hasAnonKey,
    supabaseConfigured,
    authConfigured: supabaseConfigured,
    dataMode,
    settingsDataMode,
    useSupabaseClients: USE_SUPABASE_CLIENTS,
    useSupabaseInvoices: USE_SUPABASE_INVOICES,
    useSupabaseLeads: USE_SUPABASE_LEADS,
    useSupabaseProjects: USE_SUPABASE_PROJECTS,
    useSupabaseEstimates: USE_SUPABASE_ESTIMATES,
    useSupabaseContracts: USE_SUPABASE_CONTRACTS,
    useSupabasePayments: USE_SUPABASE_PAYMENTS,
    useSupabaseEvents: USE_SUPABASE_EVENTS,
    useSupabaseSettings: USE_SUPABASE_SETTINGS,
  }
}

import { appRoutes } from '../config/appRoutes.js'

const HOST_SURFACES = ['site', 'app', 'portal', 'auth']
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])
const AUTH_PATHS = new Set([
  appRoutes.root,
  appRoutes.login,
  appRoutes.signup,
  appRoutes.forgotPassword,
])

function normalizeHostname(hostname = '') {
  return String(hostname).trim().toLowerCase().replace(/^\[|\]$/g, '')
}

function parseConfiguredOrigin(value = '') {
  if (!value) return null

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

function normalizePathname(pathname = '/') {
  const value = String(pathname || '/').trim()
  if (!value || value === '/') return '/'
  return `/${value.replace(/^\/+/, '').replace(/\/+$/, '')}`
}

function isLocalHostname(hostname = '') {
  const normalized = normalizeHostname(hostname)
  return LOCAL_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost')
}

function isNetlifyPreviewHostname(hostname = '') {
  return normalizeHostname(hostname).endsWith('.netlify.app')
}

export function isPublicPortalPath(pathname = '') {
  return /^\/portal\/[^/]+\/?$/.test(String(pathname || ''))
}

export function isAuthenticationPath(pathname = '') {
  return AUTH_PATHS.has(normalizePathname(pathname))
}

export function classifyHostname({ hostname = '', origins = {}, isDevelopment = false } = {}) {
  const normalizedHostname = normalizeHostname(hostname)

  if (isDevelopment || isLocalHostname(normalizedHostname)) {
    return { mode: 'unrestricted', surface: 'development', reason: 'local-development' }
  }

  const parsedOrigins = Object.fromEntries(
    HOST_SURFACES.map((surface) => [surface, parseConfiguredOrigin(origins[surface])])
  )
  const matchingSurfaces = HOST_SURFACES.filter(
    (surface) => normalizeHostname(parsedOrigins[surface]?.hostname) === normalizedHostname
  )

  if (matchingSurfaces.length === 1) {
    return { mode: 'scoped', surface: matchingSurfaces[0], reason: 'configured-host-match' }
  }

  if (matchingSurfaces.length > 1) {
    return { mode: 'blocked', surface: 'configuration', reason: 'ambiguous-host-configuration', matchingSurfaces }
  }

  if (isNetlifyPreviewHostname(normalizedHostname)) {
    return { mode: 'unrestricted', surface: 'preview', reason: 'netlify-preview' }
  }

  return { mode: 'blocked', surface: 'configuration', reason: 'unrecognized-production-host' }
}

function buildAbsoluteTarget(origin, { pathname = '/', search = '', hash = '' } = {}) {
  const parsedOrigin = parseConfiguredOrigin(origin)
  if (!parsedOrigin) return ''

  const target = new URL(normalizePathname(pathname), parsedOrigin.origin)
  target.search = search || ''
  target.hash = hash || ''
  return target.toString()
}

function redirectDecision(surface, origins, location, reason) {
  const target = buildAbsoluteTarget(origins[surface], location)

  if (!target) {
    return { action: 'configuration-error', surface: 'configuration', reason: `missing-${surface}-origin` }
  }

  return { action: 'redirect', surface, target, reason }
}

export function resolveHostnameRoute({
  hostname = '',
  pathname = '/',
  search = '',
  hash = '',
  origins = {},
  isDevelopment = false,
} = {}) {
  const host = classifyHostname({ hostname, origins, isDevelopment })
  const location = { pathname, search, hash }

  if (host.mode === 'unrestricted') {
    return { action: 'allow', surface: host.surface, reason: host.reason }
  }

  if (host.mode === 'blocked') {
    return { action: 'configuration-error', surface: host.surface, reason: host.reason }
  }

  if (host.surface === 'app') {
    return isPublicPortalPath(pathname)
      ? redirectDecision('portal', origins, location, 'portal-route-on-app-host')
      : { action: 'allow', surface: 'app', reason: 'app-route' }
  }

  if (host.surface === 'portal') {
    return isPublicPortalPath(pathname)
      ? { action: 'allow', surface: 'portal', reason: 'public-portal-route' }
      : { action: 'portal-not-found', surface: 'portal', reason: 'route-not-allowed-on-portal-host' }
  }

  if (host.surface === 'auth') {
    if (isAuthenticationPath(pathname)) {
      return {
        action: normalizePathname(pathname) === appRoutes.root ? 'auth-entry' : 'allow',
        surface: 'auth',
        reason: 'authentication-route',
      }
    }

    if (isPublicPortalPath(pathname)) {
      return redirectDecision('portal', origins, location, 'portal-route-on-auth-host')
    }

    return redirectDecision('app', origins, location, 'contractor-route-on-auth-host')
  }

  if (isPublicPortalPath(pathname)) {
    return redirectDecision('portal', origins, location, 'portal-route-on-site-host')
  }

  if (isAuthenticationPath(pathname) && normalizePathname(pathname) !== appRoutes.root) {
    return redirectDecision('auth', origins, location, 'authentication-route-on-site-host')
  }

  return redirectDecision('app', origins, location, 'application-route-on-site-host')
}

export function buildAppSessionTransferUrl(origins = {}, session = {}, location = {}) {
  const target = buildAbsoluteTarget(origins.app, {
    pathname: location.pathname || appRoutes.dashboard,
    search: location.search || '',
  })

  if (!target || !session?.access_token || !session?.refresh_token) return target

  const url = new URL(target)
  const sessionParams = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type || 'bearer',
    ...(session.expires_in ? { expires_in: String(session.expires_in) } : {}),
    ...(session.expires_at ? { expires_at: String(session.expires_at) } : {}),
  })
  url.hash = sessionParams.toString()
  return url.toString()
}

import assert from 'node:assert/strict'
import { buildAppSessionTransferUrl, resolveHostnameRoute } from '../src/utils/hostnameRouting.js'

const origins = {
  site: 'https://aymero.co',
  app: 'https://app.aymero.co',
  portal: 'https://portal.aymero.co',
  auth: 'https://auth.aymero.co',
}

function decision(hostname, pathname, options = {}) {
  return resolveHostnameRoute({ hostname, pathname, origins, ...options })
}

assert.equal(decision('app.aymero.co', '/dashboard').action, 'allow')
assert.equal(decision('portal.aymero.co', '/portal/test-token').action, 'allow')
assert.equal(decision('portal.aymero.co', '/dashboard').action, 'portal-not-found')
assert.equal(decision('portal.aymero.co', '/settings').action, 'portal-not-found')
assert.equal(decision('portal.aymero.co', '/').action, 'portal-not-found')
assert.equal(decision('auth.aymero.co', '/forgot-password').action, 'allow')
assert.equal(decision('auth.aymero.co', '/signup').action, 'allow')
assert.equal(decision('auth.aymero.co', '/').action, 'auth-entry')
assert.equal(decision('auth.aymero.co', '/dashboard').target, 'https://app.aymero.co/dashboard')
assert.equal(decision('aymero.co', '/dashboard').target, 'https://app.aymero.co/dashboard')
assert.equal(decision('aymero.co', '/').target, 'https://app.aymero.co/')
assert.equal(decision('aymero.co', '/login').target, 'https://auth.aymero.co/login')
assert.equal(decision('app.aymero.co', '/portal/test-token').target, 'https://portal.aymero.co/portal/test-token')
assert.equal(decision('localhost', '/dashboard').action, 'allow')
assert.equal(decision('127.0.0.1', '/portal/test-token').action, 'allow')
assert.equal(decision('deploy-preview-42--aymero.netlify.app', '/dashboard').action, 'allow')
assert.equal(resolveHostnameRoute({
  hostname: 'deploy-preview-42--aymero.netlify.app',
  pathname: '/dashboard',
  origins: { ...origins, app: 'https://deploy-preview-42--aymero.netlify.app' },
}).surface, 'app')
assert.equal(decision('unknown.example.com', '/dashboard').action, 'configuration-error')
assert.equal(resolveHostnameRoute({
  hostname: 'portal.aymero.co',
  pathname: '/dashboard',
  origins: { ...origins, app: origins.portal },
}).action, 'configuration-error')
assert.equal(resolveHostnameRoute({
  hostname: 'auth.aymero.co',
  pathname: '/projects/example',
  search: '?tab=documents',
  hash: '#contract',
  origins,
}).target, 'https://app.aymero.co/projects/example?tab=documents#contract')
const transferUrl = new URL(buildAppSessionTransferUrl(origins, {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1234567890,
}, { pathname: '/dashboard' }))
assert.equal(transferUrl.origin, origins.app)
assert.equal(transferUrl.pathname, '/dashboard')
assert.equal(new URLSearchParams(transferUrl.hash.slice(1)).get('refresh_token'), 'refresh-token')

console.log('Hostname routing validation passed.')

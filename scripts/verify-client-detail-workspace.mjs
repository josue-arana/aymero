import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveClientContactActions } from '../src/utils/clientContactActions.js'

function actionIds(client) {
  return resolveClientContactActions(client).actions
}

assert.deepEqual(actionIds({ phone: '(410) 555-0188' }), ['call', 'text'])
assert.deepEqual(actionIds({ email: 'client@example.com' }), ['email'])
assert.deepEqual(actionIds({ address: '123 Main Street, Baltimore, MD' }), ['drive'])
assert.deepEqual(actionIds({ phone: '410-555-0188', email: 'client@example.com', address: '123 Main Street' }), ['drive', 'call', 'text', 'email'])
assert.deepEqual(actionIds({}), [])
assert.deepEqual(actionIds({ phone: '555', email: 'not-an-email' }), [])
assert.deepEqual(actionIds({ phone: '(410) 555-0100', address: 'Address not added' }), [])
assert.equal(resolveClientContactActions({ email: 'client@example.com' }).emailHref, 'mailto:client@example.com')
assert.match(resolveClientContactActions({ address: '123 Main Street' }).mapsHref, /^https:\/\/www\.google\.com\/maps\/search/)

const appSource = readFileSync(
  fileURLToPath(new URL('../src/App.jsx', import.meta.url)),
  'utf8',
)
const clientSource = readFileSync(
  fileURLToPath(new URL('../src/pages/ClientProfilePage.jsx', import.meta.url)),
  'utf8',
)
const backButtonSource = readFileSync(
  fileURLToPath(new URL('../src/components/common/RecordBackButton.jsx', import.meta.url)),
  'utf8',
)

assert.doesNotMatch(appSource, /isMobileClientProfileRoute/)
assert.match(appSource, /<Topbar/)
assert.match(appSource, /const mainLayoutClassName = '[^']*safe-area-inset-left[^']*safe-area-inset-right[^']*'/)
assert.match(clientSource, /<RecordBackButton label=\{t\('backToClients'\)\}/)
assert.match(backButtonSource, /aria-label=\{ariaLabel\}/)
assert.match(clientSource, /heroContactActions\.map/)
assert.match(clientSource, /clientStatus = isArchived \? 'Archived' : 'Active'/)
assert.match(clientSource, /project\.isProjectRecord \? onOpenProject\(project\.id\)/)
assert.match(clientSource, /min-h-1[12]/)
assert.match(clientSource, /data-client-detail-hero="consolidated"/)
assert.match(clientSource, /onClick=\{\(\) => onCreateJob\?\.\(client\)\}/)
assert.match(clientSource, /data-client-detail-layout="independent-columns"/)
assert.match(clientSource, /max-w-6xl/)
assert.match(clientSource, /overflow-x-hidden/)
assert.equal(clientSource.match(/<RecordBackButton label=\{t\('backToClients'\)\}/g)?.length, 1)
assert.doesNotMatch(clientSource, /setLanguage/)
assert.doesNotMatch(clientSource, /cursor-not-allowed[^\n]*hero/i)

console.log('Client Detail workspace validation passed.')

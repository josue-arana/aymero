import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const clientSource = read('../src/pages/ClientProfilePage.jsx')

// One hero owns the client identity, contact details, relationship summary, and actions.
assert.match(clientSource, /data-client-detail-hero="consolidated"/)
assert.match(clientSource, /aria-labelledby="client-profile-title"/)
assert.match(clientSource, /<h1 id="client-profile-title"/)
assert.match(clientSource, /t\('phone'\)/)
assert.match(clientSource, /t\('email'\)/)
assert.match(clientSource, /t\('address'\)/)
assert.match(clientSource, /t\('preferredLanguage'\)/)
assert.match(clientSource, /href=\{`tel:\$\{phoneHref\}`\}/)
assert.match(clientSource, /href=\{emailHref\}/)
assert.doesNotMatch(clientSource, /t\('contactInformation'\)/)

// The existing create-project workflow is primary; edit/archive remain in More.
assert.match(clientSource, /onClick=\{\(\) => onCreateJob\?\.\(client\)\}/)
assert.match(clientSource, /t\('createNewProject'\)/)
assert.match(clientSource, /id: 'edit-client'/)
assert.match(clientSource, /id: 'archive-client'/)
assert.match(clientSource, /<ActionMenu/)
assert.match(clientSource, /min-h-12/)

// Related records are compact and optional sections do not reserve empty space.
assert.match(clientSource, /renderProjectCards\(projectCards\)/)
assert.match(clientSource, /showDocumentInsightSections && \(estimateCards\.length \|\| contractCards\.length\)/)
assert.match(clientSource, /showAnalyticsSections && recentActivities\.length/)
assert.match(clientSource, /clientNotes\.length \? \(/)
assert.match(clientSource, /estimateCards\.map\(\(item\) => renderDocumentCard\(item, 'estimate'\)\)/)
assert.match(clientSource, /contractCards\.map\(\(item\) => renderDocumentCard\(item, 'contract'\)\)/)

// Tablet stays stacked; wide desktop uses independent 2:1 stacks without synchronized rows.
assert.match(clientSource, /data-client-detail-breakpoint="xl"/)
assert.match(clientSource, /data-client-detail-layout="independent-columns"/)
assert.match(clientSource, /data-client-detail-ratio="2:1"/)
assert.match(clientSource, /xl:grid-cols-\[minmax\(0,2fr\)_minmax\(300px,1fr\)\]/)
assert.match(clientSource, /data-client-detail-column="primary"/)
assert.match(clientSource, /data-client-detail-column="secondary"/)
assert.doesNotMatch(clientSource, /lg:hidden/)
assert.doesNotMatch(clientSource, /hidden[^"\n]*lg:block/)
assert.doesNotMatch(clientSource, /xl:grid-cols-\[1fr_1fr\]/)

// Mobile uses one DOM order, safe wrapping, and full-size action targets.
assert.match(clientSource, /grid-cols-2 gap-2\.5/)
assert.match(clientSource, /break-all text-sm font-semibold/)
assert.match(clientSource, /overflow-hidden rounded-3xl/)
assert.equal(clientSource.match(/data-client-detail-hero="consolidated"/g)?.length, 1)

// All labels come from the bilingual translation catalog.
for (const key of [
  'client',
  'phone',
  'email',
  'address',
  'preferredLanguage',
  'english',
  'spanish',
  'createNewProject',
  'projects',
  'documents',
  'accountSummary',
  'recentActivity',
  'recentNotes',
]) {
  assert.equal(typeof en[key], 'string')
  assert.equal(typeof es[key], 'string')
  assert.ok(en[key].length > 0)
  assert.ok(es[key].length > 0)
}

console.log('Client Detail responsive layout validation passed.')

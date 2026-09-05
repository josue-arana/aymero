import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'
import {
  buildClientProfiles,
  mapOptionalClientUpdatesToPersistence,
  mergeClientUpdatesIntoRelatedRecord,
  readClientNotesForForm,
} from '../src/utils/clients.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const clientSource = read('../src/pages/ClientProfilePage.jsx')
const clientFormSource = read('../src/components/clients/ClientFormModal.jsx')
const appSource = read('../src/App.jsx')
const clientServiceSource = read('../src/services/supabase/clientsSupabaseService.js')
const heroStart = clientSource.indexOf('data-client-detail-hero="consolidated"')
const heroEnd = clientSource.indexOf('data-client-detail-breakpoint="xl"')
const heroSource = clientSource.slice(heroStart, heroEnd)

// One shorter hero owns client identity, actionable contact details, and actions.
assert.match(clientSource, /data-client-detail-hero="consolidated"/)
assert.match(clientSource, /aria-labelledby="client-profile-title"/)
assert.match(clientSource, /<h1 id="client-profile-title"/)
assert.match(heroSource, /t\('phone'\)/)
assert.match(heroSource, /t\('email'\)/)
assert.match(heroSource, /t\('address'\)/)
assert.match(heroSource, /href=\{`tel:\$\{phoneHref\}`\}/)
assert.match(heroSource, /href=\{emailHref\}/)
assert.doesNotMatch(heroSource, /<dd[^>]*>\{client\.projectCount\}<\/dd>/)
assert.doesNotMatch(heroSource, /t\('projects'\)/)
assert.doesNotMatch(heroSource, /t\('preferredLanguage'\)/)
assert.doesNotMatch(clientSource, /t\('contactInformation'\)/)

// The existing create-project workflow is primary; edit/archive remain in More.
assert.match(clientSource, /onClick=\{\(\) => onCreateJob\?\.\(client\)\}/)
assert.match(clientSource, /t\('createNewProject'\)/)
assert.match(clientSource, /id: 'edit-client'/)
assert.match(clientSource, /id: 'archive-client'/)
assert.match(clientSource, /<ActionMenu/)
assert.match(clientSource, /min-h-12/)

// The Jobs heading owns the count only when records exist; zero keeps the existing empty state.
assert.match(clientSource, /const projectsHeading = projectCards\.length/)
assert.match(clientSource, /`\$\{t\('jobs'\)\} \(\$\{projectCards\.length\}\)`/)
assert.match(clientSource, /: t\('jobs'\)/)
assert.match(clientSource, /\{projectsHeading\}/)
assert.match(clientSource, /t\('noJobs'\)/)

// Preferred language remains editable but is no longer read-only hero content.
assert.match(clientFormSource, /t\('clientLanguage'\)/)
assert.match(clientFormSource, /updateField\('preferredLanguage'/)
assert.match(clientFormSource, /<select/)

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
assert.match(clientSource, /lg:flex lg:flex-nowrap/)
assert.match(clientSource, /const moreActionSpansMobileRow = heroContactActions\.length % 2 === 0/)
assert.match(clientSource, /moreActionSpansMobileRow \? 'col-span-2' : ''/)
assert.match(clientSource, /col-span-2 inline-flex min-h-12 w-full[^\n]*lg:col-span-1 lg:w-auto/)
assert.match(clientSource, /sharedClassName = '[^']*w-full[^']*lg:w-auto'/)
assert.match(clientSource, /buttonClassName="[^"]*w-full[^"]*lg:w-auto"/)
assert.match(clientSource, /break-all text-sm font-semibold/)
assert.match(clientSource, /overflow-hidden rounded-3xl/)
assert.equal(clientSource.match(/data-client-detail-hero="consolidated"/g)?.length, 1)

// Explicit optional-field clears survive every client update boundary.
assert.deepEqual(
  mapOptionalClientUpdatesToPersistence({
    phone: '',
    email: '',
    address: '',
    notes: '',
  }),
  {
    phone: null,
    email: null,
    address: null,
    notes: null,
  },
)
assert.deepEqual(mapOptionalClientUpdatesToPersistence({ email: '' }), { email: null })
assert.match(clientServiceSource, /Object\.assign\(payload, mapOptionalClientUpdatesToPersistence\(updates\)\)/)
assert.match(appSource, /mergeClientUpdatesIntoRelatedRecord\(lead, updates\)/)
assert.doesNotMatch(appSource, /email: updates\.email \|\| lead\.email/)

const relatedRecord = mergeClientUpdatesIntoRelatedRecord(
  {
    id: 'lead-1',
    client: 'Existing Client',
    phone: '410-555-0100',
    email: 'client@example.com',
    address: '123 Main Street',
    location: '123 Main Street',
    status: 'Qualified',
  },
  { phone: '', email: '', address: '' },
)
assert.equal(relatedRecord.phone, '')
assert.equal(relatedRecord.email, '')
assert.equal(relatedRecord.address, '')
assert.equal(relatedRecord.location, '')
assert.equal(relatedRecord.client, 'Existing Client')
assert.equal(relatedRecord.status, 'Qualified')

const [clearedClient] = buildClientProfiles(
  [{
    id: 'lead-1',
    clientId: 'client-1',
    client: 'Existing Client',
    phone: '410-555-0100',
    email: 'client@example.com',
    address: '123 Main Street',
    nextStep: 'Old lead note',
  }],
  [{
    id: 'client-1',
    name: 'Existing Client',
    phone: '',
    email: '',
    address: '',
    notes: '',
    status: 'active',
  }],
)
assert.equal(clearedClient.phone, '')
assert.equal(clearedClient.email, '')
assert.equal(clearedClient.address, '')
assert.equal(clearedClient.notes, '')
assert.equal(clearedClient.projectCount, 1)
assert.equal(clearedClient.status, 'active')
assert.equal(readClientNotesForForm(['First note', '', 'Second note']), 'First note\nSecond note')
assert.equal(readClientNotesForForm(''), '')

// Name remains required; all other editable contact fields remain optional.
assert.match(clientFormSource, /updateField\('name', value\)\} required/)
assert.doesNotMatch(clientFormSource, /updateField\('(phone|email|address)', value\)\} required/)

// All labels come from the bilingual translation catalog.
for (const key of [
  'client',
  'phone',
  'email',
  'address',
  'clientLanguage',
  'createNewProject',
  'jobs',
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

assert.equal(en.jobs, 'Jobs')
assert.equal(es.jobs, 'Trabajos')
assert.equal(`${en.jobs} (1)`, 'Jobs (1)')
assert.equal(`${es.jobs} (1)`, 'Trabajos (1)')
assert.equal(en.createNewProject, 'Create New Job')
assert.equal(es.createNewProject, 'Crear nuevo trabajo')

console.log('Client Detail responsive layout validation passed.')

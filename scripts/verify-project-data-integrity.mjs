import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildClientProfiles } from '../src/utils/clients.js'
import { isKnownEmailSentinel, isValidOptionalEmail, normalizeOptionalEmail, normalizeOptionalEmailForPersistence } from '../src/utils/email.js'
import { deriveProjectStatus, PROJECT_LIFECYCLE_STATUS } from '../src/utils/projectLifecycle.js'
import { buildProjectWorkspaceViewModel } from '../src/utils/projectWorkspaceViewModel.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

assert.equal(normalizeOptionalEmail(''), '')
assert.equal(normalizeOptionalEmail('  '), '')
assert.equal(normalizeOptionalEmail(' No  Agregado '), '')
assert.equal(normalizeOptionalEmail('NOT ADDED'), '')
assert.equal(isKnownEmailSentinel('not   added'), true)
assert.equal(isValidOptionalEmail(''), true)
assert.equal(isValidOptionalEmail('client@example.com'), true)
assert.equal(isValidOptionalEmail('client+tag@example.co'), true)
assert.equal(isValidOptionalEmail('client@example'), false)
assert.equal(isValidOptionalEmail('client example.com'), false)
assert.equal(isValidOptionalEmail('No agregado'), false)
assert.equal(isValidOptionalEmail('Not added'), false)
assert.equal(normalizeOptionalEmailForPersistence('No agregado'), '')
assert.equal(normalizeOptionalEmailForPersistence('client@example.com'), 'client@example.com')
assert.throws(() => normalizeOptionalEmailForPersistence('not-an-email'), /Invalid optional email/)

const normalizedProfiles = buildClientProfiles(
  [{ id: 'lead-1', client: 'Sentinel Client', email: 'Not added', phone: '555-0100' }],
  [{ id: 'client-1', name: 'Manual Client', email: ' No agregado ' }],
)
assert.equal(normalizedProfiles.find((client) => client.id === 'client-1')?.email, '')
assert.equal(normalizedProfiles.find((client) => client.name === 'Sentinel Client')?.email, '')

const noContract = buildProjectWorkspaceViewModel({
  project: { status: 'Scheduled' },
  photoCount: 0,
})
assert.equal(noContract.projectStatus, PROJECT_LIFECYCLE_STATUS.SCHEDULED)
assert.equal(noContract.nextAction.id, 'upload-photos')

const draftContract = buildProjectWorkspaceViewModel({
  project: { status: 'Scheduled' },
  contract: { id: 'contract-1', status: 'Draft' },
  photoCount: 1,
})
assert.equal(draftContract.projectStatus, PROJECT_LIFECYCLE_STATUS.CONTRACT_DRAFT)
assert.equal(draftContract.nextAction.id, 'review-contract')

const signed = { id: 'contract-2', status: 'Signed', signed: true }
assert.equal(deriveProjectStatus({ project: { status: 'Scheduled' }, contract: signed }), PROJECT_LIFECYCLE_STATUS.SIGNED)
assert.equal(deriveProjectStatus({ project: { status: 'Scheduled' }, contract: signed, payments: [{ amount: 1 }] }), PROJECT_LIFECYCLE_STATUS.IN_PROGRESS)
assert.equal(deriveProjectStatus({ project: { status: 'Completed', completedAt: '2026-01-01T00:00:00Z' }, contract: signed }), PROJECT_LIFECYCLE_STATUS.COMPLETED)
assert.equal(deriveProjectStatus({ project: { status: 'Scheduled' }, contract: signed, isArchived: true }), PROJECT_LIFECYCLE_STATUS.ARCHIVED)

const projectServiceSource = read('../src/services/supabase/projectsSupabaseService.js')
const clientServiceSource = read('../src/services/supabase/clientsSupabaseService.js')
const leadServiceSource = read('../src/services/supabase/leadsSupabaseService.js')
const appSource = read('../src/App.jsx')
const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const jobModalSource = read('../src/components/jobs/JobFormModal.jsx')
const scheduleModalSource = read('../src/components/calendar/ScheduleEventModal.jsx')

assert.match(projectServiceSource, /const normalizedNotes = .*project\.notes\.trim\(\)/)
assert.match(projectServiceSource, /notes: normalizedNotes \|\| null/)
assert.match(projectServiceSource, /if \(!hasOwnField\(updates, 'notes'\)\) delete payload\.notes/)
assert.doesNotMatch(projectServiceSource, /notes: project\.notes \|\| project\.nextStep/)
assert.match(clientServiceSource, /normalizeOptionalEmail(?:ForPersistence)?\(client\.email\)/)
assert.match(clientServiceSource, /normalizeOptionalEmail\(row\?\.email\)/)
assert.match(leadServiceSource, /normalizeOptionalEmail(?:ForPersistence)?\(lead\.email\)/)
assert.match(leadServiceSource, /normalizeOptionalEmail\(row\?\.email\)/)
assert.match(appSource, /email: normalizeOptionalEmail\(leadRecord\?\.email\)/)
assert.match(jobModalSource, /notes: editingProject\.notes \|\| ''/)
assert.match(projectSource, /grid min-w-0 grid-cols-2/)
assert.match(projectSource, /index === 0 \? 'col-span-2 lg:col-span-1'/)
assert.match(projectSource, /moreActionSpansMobileRow/)
assert.match(scheduleModalSource, /flex flex-col-reverse gap-3 sm:flex-row sm:justify-end/)

console.log('Project data integrity validation passed.')

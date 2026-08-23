import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildProjectCompletionUpdate, isProjectCompleted } from '../src/utils/projectCompletion.js'
import { deriveProjectStatus, PROJECT_LIFECYCLE_STATUS } from '../src/utils/projectLifecycle.js'
import { buildProjectWorkspaceViewModel } from '../src/utils/projectWorkspaceViewModel.js'
import { selectDashboardActiveProjects, selectDashboardProjectRecords } from '../src/utils/dashboardConsistency.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const completedAt = '2026-08-23T15:00:00.000Z'
const completionUpdate = buildProjectCompletionUpdate(completedAt)
assert.deepEqual(completionUpdate, {
  status: 'Completed',
  projectStatus: 'Completed',
  completedAt,
  completed_at: completedAt,
})

for (const project of [
  { id: 'direct-project', clientId: 'client-direct', leadId: null, ...completionUpdate },
  { id: 'lead-project', clientId: 'client-lead', leadId: 'lead-one', ...completionUpdate },
]) {
  assert.equal(isProjectCompleted(project), true)
  assert.equal(deriveProjectStatus({ project }), PROJECT_LIFECYCLE_STATUS.COMPLETED)
  assert.equal(Boolean(project.archivedAt || project.archived_at), false)
}

const preservedProject = {
  id: 'direct-project',
  clientId: 'client-direct',
  leadId: null,
  invoices: [{ id: 'invoice-one' }],
  payments: [{ id: 'payment-one', amount: 100 }],
  photos: [{ id: 'photo-one' }],
  events: [{ id: 'event-one', date: '2026-08-30', status: 'Scheduled' }],
  ...completionUpdate,
}
assert.equal(preservedProject.invoices.length, 1)
assert.equal(preservedProject.payments.length, 1)
assert.equal(preservedProject.photos.length, 1)
assert.equal(preservedProject.events.length, 1)

const workspace = buildProjectWorkspaceViewModel({
  project: preservedProject,
  invoices: [{ id: 'invoice-one', amount: 1000, amountPaid: 0, status: 'Sent' }],
  events: preservedProject.events,
})
assert.equal(workspace.projectStatus, PROJECT_LIFECYCLE_STATUS.COMPLETED)
assert.equal(workspace.nextAction, null)
assert.equal(workspace.upcomingEvents.length, 1)

const dashboardOptions = { projects: [preservedProject], leads: [] }
assert.equal(selectDashboardProjectRecords(dashboardOptions).length, 1)
assert.equal(selectDashboardActiveProjects(dashboardOptions).length, 0)

const appSource = read('../src/App.jsx')
const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const jobsSource = read('../src/pages/JobsPage.jsx')
const clientSource = read('../src/pages/ClientProfilePage.jsx')
const schemaSource = read('../supabase/schema.sql')

assert.match(schemaSource, /'completed'/)
assert.match(schemaSource, /completed_at timestamptz/)
assert.match(appSource, /async function markProjectComplete\(projectRecord = \{\}\)/)
assert.match(appSource, /dataProvider\.projects\.update\(projectId/)
assert.match(appSource, /\.\.\.completionUpdate/)
assert.match(appSource, /setPersistedProjects/)
assert.match(appSource, /projectStatus: 'Completed'/)
assert.doesNotMatch(JSON.stringify(completionUpdate), /archiv/i)
assert.match(projectSource, /id: 'mark-project-complete'/)
assert.match(projectSource, /setConfirmAction\(\{ mode: 'complete' \}\)/)
assert.match(projectSource, /projectCompletionUpcomingEventsWarning/)
assert.match(projectSource, /projectCompletionOutstandingBalanceWarning/)
assert.match(projectSource, /!projectIsArchived \? \(/)
assert.match(jobsSource, /projectRecords\.length \? projectRecords : leads/)
assert.match(jobsSource, /activeJobsList\.filter\(\(job\) => job\.jobStatus !== 'Completed'\)/)
assert.match(clientSource, /getProjectsForClient/)

for (const key of [
  'markJobComplete',
  'markJobCompleteTitle',
  'markJobCompleteHelp',
  'projectCompletionUpcomingEventsWarning',
  'projectCompletionOutstandingBalanceWarning',
  'projectMarkedComplete',
  'projectCompletionFailed',
]) {
  assert.equal(typeof en[key], 'string', `Missing English translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish translation: ${key}`)
}

console.log('Project completion validation passed.')

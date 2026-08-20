import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildClientProfiles, findRelatedClient } from '../src/utils/clients.js'
import { findProjectByLookup, resolveLinkedLeadId } from '../src/utils/projectIdentity.js'
import { selectDashboardProjectRecords } from '../src/utils/dashboardConsistency.js'
import { sortScheduleEvents } from '../src/utils/scheduleEvents.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const client = { id: 'client-1', name: 'Maria Rivera', phone: '', address: '' }
const directProject = {
  id: 'project-direct',
  projectId: 'project-direct',
  clientId: client.id,
  leadId: null,
  projectTitle: 'Kitchen Renovation',
  estimatedValue: 47500,
  projectStatus: 'Scheduled',
}
const linkedLead = {
  id: 'lead-1',
  clientId: client.id,
  client: client.name,
  projectId: 'project-lead',
  projectTitle: 'Roof Replacement',
  value: 12000,
}
const linkedProject = {
  id: 'project-lead',
  projectId: 'project-lead',
  clientId: client.id,
  leadId: linkedLead.id,
  projectTitle: linkedLead.projectTitle,
  estimatedValue: 12000,
}

const hydratedClients = buildClientProfiles([linkedLead], [client], [directProject, linkedProject])
const hydratedClient = hydratedClients.find((record) => record.id === client.id)
assert.ok(hydratedClient)
assert.deepEqual(hydratedClient.projects.map((project) => project.id).sort(), ['project-direct', 'project-lead'])
assert.equal(hydratedClient.projects.filter((project) => project.id === 'project-lead').length, 1)
assert.equal(findRelatedClient(hydratedClients, directProject)?.name, client.name)

assert.equal(findProjectByLookup([directProject], 'project-direct')?.id, directProject.id)
assert.equal(resolveLinkedLeadId(directProject), '')
assert.equal(resolveLinkedLeadId(linkedProject), linkedLead.id)

const dashboardProjects = selectDashboardProjectRecords({
  projects: [directProject, linkedProject],
  leads: [linkedLead],
})
assert.deepEqual(dashboardProjects.map((project) => project.dashboardProjectId).sort(), ['project-direct', 'project-lead'])

const directEvent = {
  id: 'event-direct',
  projectId: directProject.id,
  leadId: null,
  date: '2026-08-20',
  startTime: '09:00',
  status: 'Scheduled',
}
assert.deepEqual(sortScheduleEvents([directEvent]).map((event) => event.id), ['event-direct'])

const appSource = read('../src/App.jsx')
const clientsSource = read('../src/utils/clients.js')
const paymentSource = read('../src/pages/ProjectDetailPage.jsx')
const scheduleModalSource = read('../src/components/calendar/ScheduleEventModal.jsx')
const jobModalSource = read('../src/components/jobs/JobFormModal.jsx')
const estimateRouteSource = read('../src/pages/EstimateBuilderPage.jsx')
const contractRouteSource = read('../src/pages/ContractsPage.jsx')
const projectServiceSource = read('../src/services/supabase/projectsSupabaseService.js')
const paymentServiceSource = read('../src/services/supabase/paymentsSupabaseService.js')
const eventServiceSource = read('../src/services/supabase/eventsSupabaseService.js')
const schemaSource = read('../supabase/schema.sql')
const englishSource = read('../src/translations/en.js')
const spanishSource = read('../src/translations/es.js')

assert.match(appSource, /setPersistedProjects\(\(current\) => dedupeById\(\[nextJob/)
assert.doesNotMatch(appSource.match(/function createJob\(job,[\s\S]*?function upsertClientSilently/)?.[0] || '', /return \[nextJob, \.\.\.current\]/)
assert.match(appSource, /findProjectByLookup\(persistedProjects, recordId\)/)
assert.match(appSource, /clients=\{clients\}/)
assert.match(clientsSource, /buildClientProfiles\(leads = \[\], customClients = \[\], projects = \[\]\)/)
assert.match(paymentSource, /leadId: linkedLeadId \|\| currentLead\.leadId \|\| currentLead\.lead_id \|\| null/)
assert.doesNotMatch(paymentSource, /leadId: linkedLeadId \|\| currentLead\.leadId \|\| currentLead\.id/)
assert.match(scheduleModalSource, /__relationshipType === 'project' \? lead\.id : null/)
assert.match(scheduleModalSource, /__relationshipType === 'lead' \? lead\.id : null/)
assert.match(appSource, /if \(response\?\.error\) \{\s*throw response\.error\s*\}/)
assert.match(estimateRouteSource, /findProjectByLookup\(projects, projectId\)/)
assert.match(contractRouteSource, /findProjectByLookup\(projects, projectId\)/)
assert.match(projectServiceSource, /contractor_id: `eq\.\$\{contractorId\}`/)
assert.match(paymentServiceSource, /payload\.lead_id = sanitizeUuid/)
assert.match(eventServiceSource, /payload\.project_id = sanitizeUuid/)
assert.match(schemaSource, /create table projects[\s\S]*?lead_id uuid references leads\(id\) on delete set null/)
assert.match(schemaSource, /create table payments[\s\S]*?lead_id uuid references leads\(id\) on delete set null/)
assert.match(schemaSource, /create table events[\s\S]*?lead_id uuid references leads\(id\) on delete set null/)
assert.match(jobModalSource, /grid min-w-0 gap-4 sm:grid-cols-2/)
assert.match(jobModalSource, /min-w-0 max-w-full appearance-none/)
assert.match(englishSource, /your contract for \{\{project\}\} is ready\. View contract:/)
assert.match(spanishSource, /tu contrato para \{\{project\}\} está listo\. Ver contrato:/)

console.log('Direct Project lifecycle validation passed.')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DASHBOARD_PENDING_ESTIMATE_STATUSES,
  selectDashboardActiveProjects,
  selectDashboardPendingEstimates,
  selectDashboardProjectRecords,
  selectDashboardTodayEvents,
} from '../src/utils/dashboardConsistency.js'
import { calculateOutstandingInvoiceBalance } from '../src/utils/invoiceRecords.js'

const now = new Date(2026, 7, 18, 10, 30)

const projects = [
  { id: 'project-active', leadId: 'lead-active', status: 'In Progress' },
  { id: 'project-signed', leadId: 'lead-signed', status: 'Signed' },
  { id: 'project-completed', leadId: 'lead-completed', status: 'Completed', completedAt: '2026-08-17T12:00:00.000Z' },
  { id: 'project-archived', leadId: 'lead-archived', status: 'In Progress', archivedAt: '2026-08-17T12:00:00.000Z' },
]
const leads = projects.map((project) => ({
  id: project.leadId,
  projectId: project.id,
  projectTitle: project.id,
}))
const contracts = [
  { id: 'contract-active', projectId: 'project-active', status: 'Signed', signedAt: '2026-08-01T12:00:00.000Z' },
  { id: 'contract-signed', projectId: 'project-signed', status: 'Signed', signedAt: '2026-08-01T12:00:00.000Z' },
]
const payments = [{ id: 'payment-active', projectId: 'project-active', amount: 100, status: 'Recorded' }]

const activeProjects = selectDashboardActiveProjects({ projects, leads, contracts, payments, now })
assert.deepEqual(activeProjects.map((project) => project.dashboardProjectId).sort(), ['project-active', 'project-signed'])
assert.equal(selectDashboardProjectRecords({ projects, leads }).some((project) => project.dashboardProjectId === 'project-archived'), false)
assert.equal(selectDashboardProjectRecords({ projects, leads, archivedProjectIds: ['project-active'] }).some((project) => project.dashboardProjectId === 'project-active'), false)

assert.deepEqual(DASHBOARD_PENDING_ESTIMATE_STATUSES, ['draft', 'saved', 'sent'])
const estimates = [
  { id: 'estimate-draft', leadId: 'lead-active', status: 'Draft' },
  { id: 'estimate-sent', leadId: 'lead-signed', status: 'Sent' },
  { id: 'estimate-approved', leadId: 'lead-completed', status: 'Approved' },
  { id: 'estimate-archived', leadId: 'lead-archived', status: 'Draft', archivedAt: '2026-08-17T12:00:00.000Z' },
]
assert.deepEqual(
  selectDashboardPendingEstimates({ estimates, leads, contracts: [] }).map((estimate) => estimate.id).sort(),
  ['estimate-draft', 'estimate-sent']
)

assert.equal(calculateOutstandingInvoiceBalance([]), 0)
assert.equal(calculateOutstandingInvoiceBalance([
  { id: 'invoice-unpaid', status: 'Sent', amount: 10000, amountPaid: 0 },
  { id: 'invoice-partial', status: 'Partially Paid', amount: 10000, amountPaid: 4000 },
  { id: 'invoice-paid', status: 'Paid', amount: 5000, amountPaid: 5000 },
  { id: 'invoice-draft', status: 'Draft', amount: 9000, amountPaid: 0 },
  { id: 'invoice-canceled', status: 'Canceled', amount: 8000, amountPaid: 0 },
  { id: 'invoice-archived', status: 'Sent', amount: 7000, amountPaid: 0, archivedAt: '2026-08-17T12:00:00.000Z' },
]), 16000)

const todayEvents = selectDashboardTodayEvents([
  { id: 'future-project', projectId: 'project-active', date: '2026-08-18', startTime: '12:00', status: 'Scheduled' },
  { id: 'future-lead', leadId: 'lead-signed', date: '2026-08-18', startTime: '11:00', status: 'Scheduled' },
  { id: 'past', date: '2026-08-18', startTime: '09:00', status: 'Scheduled' },
  { id: 'completed', date: '2026-08-18', startTime: '12:30', status: 'Completed' },
  { id: 'cancelled', date: '2026-08-18', startTime: '13:00', status: 'Cancelled' },
  { id: 'no-show', date: '2026-08-18', startTime: '14:00', status: 'No Show' },
  { id: 'archived', date: '2026-08-18', startTime: '15:00', status: 'Scheduled', archivedAt: '2026-08-17T12:00:00.000Z' },
  { id: 'tomorrow', date: '2026-08-19', startTime: '11:00', status: 'Scheduled' },
], now)
assert.deepEqual(todayEvents.map((event) => event.id), ['future-lead', 'future-project'])

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const dashboardSource = read('../src/pages/DashboardPage.jsx')
const appSource = read('../src/App.jsx')
const jobModalSource = read('../src/components/jobs/JobFormModal.jsx')
const healthRegistrySource = read('../src/config/developerHealthRegistry.js')
const pipelineSource = read('../src/components/pipeline/PipelineBoard.jsx')

assert.match(dashboardSource, /calculateOutstandingInvoiceBalance\(invoices\)/)
assert.match(dashboardSource, /selectDashboardActiveProjects/)
assert.match(dashboardSource, /selectDashboardPendingEstimates/)
assert.match(dashboardSource, /selectDashboardTodayEvents/)
assert.match(dashboardSource, /\{isAnalyticsMode \? <div[^>]*>.*?outstandingBalance/s)
assert.match(dashboardSource, /showFinancials=\{isAnalyticsMode\}/)
assert.match(dashboardSource, /col-span-2 sm:col-span-1/)
assert.match(dashboardSource, /onOpenInvoice\(invoice\.id\)/)
assert.match(dashboardSource, /onOpenProject\?\.\(eventProjectId\)/)
assert.match(dashboardSource, /onOpenEstimate\(lead\.id, estimate\)/)
assert.match(dashboardSource, /onOpenContract\(lead\.id\)/)
assert.match(appSource, /navigate\(appRoutes\.leadDetail\.replace\(':id', persistedLead\.id\)\)/)
assert.match(appSource, /shouldOpenCreatedProject = jobModalState\.origin === 'dashboard'/)
assert.match(appSource, /navigate\(appRoutes\.projects\.replace\(':id', persistedProjectId\)\)/)
assert.match(appSource, /navigate\(savedProjectId \? appRoutes\.projects\.replace\(':id', savedProjectId\) : appRoutes\.calendar\)/)
assert.match(jobModalSource, /'Other'/)
assert.match(jobModalSource, /customProjectType/)
assert.match(healthRegistrySource, /id: 'contractorConfigurableServices'/)
assert.match(healthRegistrySource, /classification: 'backlog'/)
assert.match(pipelineSource, /role="button"/)
assert.match(pipelineSource, /event\.key !== 'Enter' && event\.key !== ' '/)

console.log('Dashboard consistency validation passed.')

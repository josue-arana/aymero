import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DASHBOARD_PENDING_ESTIMATE_STATUSES,
  calculateDashboardPipelineValue,
  getDashboardLeadValue,
  getDashboardProjectFinancialSummary,
  selectDashboardContractAttentionRecords,
  selectDashboardOverdueInvoices,
  selectDashboardPaymentActivityRecords,
  selectDashboardActiveProjects,
  selectDashboardPendingEstimates,
  selectDashboardProjectRecords,
  selectDashboardTodayEvents,
  selectDashboardUpcomingEvents,
} from '../src/utils/dashboardConsistency.js'
import { calculateOutstandingInvoiceBalance } from '../src/utils/invoiceRecords.js'

const now = new Date(2026, 7, 18, 10, 30)

const projects = [
  { id: 'project-active', leadId: 'lead-active', status: 'In Progress' },
  { id: 'project-signed', leadId: 'lead-signed', status: 'Signed' },
  { id: 'project-draft', leadId: 'lead-draft-project', status: 'Contract Draft' },
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
assert.deepEqual(activeProjects.map((project) => project.dashboardProjectId).sort(), ['project-active', 'project-draft', 'project-signed'])
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

const alternativeLead = { id: 'lead-alternatives', projectTitle: 'Deck' }
const alternatives = [
  { id: 'estimate-a', leadId: alternativeLead.id, total: 5000, status: 'Draft' },
  { id: 'estimate-b', leadId: alternativeLead.id, total: 7000, status: 'Sent' },
  { id: 'estimate-c', leadId: alternativeLead.id, total: 9000, status: 'Saved' },
]
assert.equal(getDashboardLeadValue({ lead: alternativeLead, estimates: alternatives }), null)
assert.equal(calculateDashboardPipelineValue({ leads: [alternativeLead, { id: 'lead-single', value: 4000 }], estimates: alternatives }), 4000)
assert.equal(selectDashboardPendingEstimates({ estimates: alternatives, leads: [alternativeLead] }).length, 3)
assert.equal(getDashboardLeadValue({ lead: { id: 'lead-draft' }, estimates: [{ id: 'estimate-draft', leadId: 'lead-draft', total: 5000, status: 'Draft' }] }), 5000)
assert.equal(getDashboardLeadValue({ lead: { id: 'lead-approved' }, estimates: [{ id: 'estimate-approved', leadId: 'lead-approved', total: 12000, status: 'Approved' }] }), 12000)

const directProject = { id: 'project-direct', clientId: 'client-1', value: 10000 }
const directPayment = { id: 'payment-direct', projectId: directProject.id, amount: 4000, status: 'Recorded', paymentDate: '2026-08-18' }
const projectSummary = getDashboardProjectFinancialSummary(directProject, { payments: [directPayment] })
assert.equal(projectSummary.agreedValue, 10000)
assert.equal(projectSummary.totalProjectPaid, 4000)
assert.equal(projectSummary.projectBalance, 6000)
assert.equal(getDashboardProjectFinancialSummary({ ...directProject, selectedEstimateId: 'estimate-selected' }, {
  estimates: [{ id: 'estimate-selected', projectId: directProject.id, total: 15000, status: 'Sent' }],
}).agreedValue, 15000)
assert.equal(getDashboardProjectFinancialSummary(directProject, {
  estimates: [{ id: 'estimate-selected', projectId: directProject.id, total: 15000, status: 'Sent' }],
  contracts: [{ id: 'contract-direct', projectId: directProject.id, total: 11000, status: 'Draft' }],
}).agreedValue, 11000)

const draftInvoice = { id: 'invoice-draft', projectId: directProject.id, amount: 2000, status: 'Draft', dueDate: '2026-08-01' }
const sentInvoice = { id: 'invoice-sent', projectId: directProject.id, amount: 2000, status: 'Sent', dueDate: '2026-08-01' }
assert.equal(selectDashboardOverdueInvoices([draftInvoice], new Date('2026-08-18T12:00:00Z')).length, 0)
assert.equal(selectDashboardOverdueInvoices([{ ...draftInvoice, status: 'Canceled' }], new Date('2026-08-18T12:00:00Z')).length, 0)
assert.equal(selectDashboardOverdueInvoices([sentInvoice], new Date('2026-08-18T12:00:00Z')).length, 1)
assert.equal(selectDashboardPaymentActivityRecords({ payments: [directPayment], invoices: [draftInvoice] }).length, 1)
assert.equal(selectDashboardPaymentActivityRecords({
  payments: [{ ...directPayment, invoiceId: sentInvoice.id }],
  invoices: [{ ...sentInvoice, paymentHistory: [{ ...directPayment, invoiceId: sentInvoice.id }] }],
}).length, 1)
assert.equal(selectDashboardContractAttentionRecords({
  contracts: [{ id: 'contract-direct-draft', projectId: directProject.id, status: 'Draft' }],
  projects: [directProject],
  leads: [],
}).length, 1)
assert.equal(selectDashboardUpcomingEvents([
  { id: 'today', date: '2026-08-18', status: 'scheduled' },
  { id: 'future', date: '2026-08-19', status: 'scheduled' },
  { id: 'cancelled', date: '2026-08-19', status: 'cancelled' },
], now).map((event) => event.id).join(','), 'future')

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const dashboardSource = read('../src/pages/DashboardPage.jsx')
const appSource = read('../src/App.jsx')
const jobModalSource = read('../src/components/jobs/JobFormModal.jsx')
const healthRegistrySource = read('../src/config/developerHealthRegistry.js')
const pipelineSource = read('../src/components/pipeline/PipelineBoard.jsx')
const englishTranslations = read('../src/translations/en.js')
const spanishTranslations = read('../src/translations/es.js')

assert.match(dashboardSource, /calculateOutstandingInvoiceBalance\(invoices\)/)
assert.match(dashboardSource, /getDashboardProjectFinancialSummary/)
assert.match(dashboardSource, /selectDashboardPaymentActivityRecords/)
assert.match(dashboardSource, /selectDashboardContractAttentionRecords/)
assert.match(appSource, /calculateDashboardPipelineValue/)
assert.match(appSource, /selectDashboardOverdueInvoices/)
assert.doesNotMatch(appSource, /metricNewLeadsHelper/)
assert.match(dashboardSource, /selectDashboardActiveProjects/)
assert.match(dashboardSource, /selectDashboardPendingEstimates/)
assert.match(dashboardSource, /selectDashboardTodayEvents/)
assert.match(dashboardSource, /function FinancialSnapshotCard/)
assert.match(dashboardSource, /function DashboardHero/)
assert.match(dashboardSource, /gridItems \? 'grid gap-3 xl:grid-cols-2'/)
assert.match(dashboardSource, /sectionId="dashboard-needs-attention"[^>]*gridItems/)
assert.match(dashboardSource, /attentionCount={needsAttentionItems.length}/)
assert.match(dashboardSource, /todayCount={todaysScheduleItems.length}/)
assert.match(dashboardSource, /openProjectCount={activeProjectIds.size}/)
assert.match(dashboardSource, /scrollIntoView\(\{ behavior: 'smooth'/)
assert.match(dashboardSource, /function ActiveProjectsCard/)
assert.match(dashboardSource, /t\('openProjects'\)/)
assert.match(dashboardSource, /function ScheduleOverviewCard/)
assert.match(dashboardSource, /selectDashboardUpcomingEvents/)
assert.match(dashboardSource, /todayItems\.length === 0 && upcomingItems\.length === 0/)
assert.match(dashboardSource, /noTodayOrUpcomingEvents/)
assert.match(dashboardSource, /renderItems\(todayItems, t\('noEventsScheduledForToday'\)\)/)
assert.match(dashboardSource, /renderItems\(upcomingItems, t\('noUpcomingEvents'\)\)/)
assert.match(dashboardSource, /showAllAttention/)
assert.match(dashboardSource, /t\('paymentsReceived'\)/)
assert.match(dashboardSource, /t\('projectBalance'\)/)
assert.doesNotMatch(dashboardSource, /heroBackground/)
assert.match(spanishTranslations, /"metricRevenuePipeline": "Valor de oportunidades"/)
assert.doesNotMatch(spanishTranslations, /"metricRevenuePipeline": "Valor del pipeline"/)
assert.match(englishTranslations, /"metricRevenuePipeline": "Pipeline Value"/)
assert.match(dashboardSource, /showFinancials=\{isAnalyticsMode\}/)
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

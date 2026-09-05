import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildProjectWorkspaceViewModel,
  groupProjectWorkspaceEvents,
  selectProjectWorkspaceInvoices,
} from '../src/utils/projectWorkspaceViewModel.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const now = new Date('2026-08-18T12:00:00')
const schedule = groupProjectWorkspaceEvents([
  { id: 'past', date: '2026-08-17', startTime: '09:00', status: 'Scheduled' },
  { id: 'upcoming', date: '2026-08-19', startTime: '08:00', status: 'Scheduled' },
  { id: 'completed', date: '2026-08-20', startTime: '10:00', status: 'Completed' },
], now)
assert.deepEqual(schedule.upcomingEvents.map((event) => event.id), ['upcoming'])
assert.deepEqual(schedule.historyEvents.map((event) => event.id), ['completed', 'past'])
assert.equal(schedule.nextEvent.id, 'upcoming')

const relatedInvoices = selectProjectWorkspaceInvoices([
  { id: 'invoice-project', projectId: 'project-1', amount: 1000, amountPaid: 250, status: 'Sent' },
  { id: 'invoice-lead', leadId: 'lead-1', amount: 500, amountPaid: 0, status: 'Draft' },
  { id: 'invoice-explicit', projectId: 'other-project', amount: 300, amountPaid: 0, status: 'Sent' },
  { id: 'invoice-other', projectId: 'other-project', amount: 900, amountPaid: 0, status: 'Sent' },
], {
  projectIds: ['project-1'],
  leadIds: ['lead-1'],
  invoiceIds: ['invoice-explicit'],
})
assert.deepEqual(relatedInvoices.map((invoice) => invoice.id), ['invoice-project', 'invoice-lead', 'invoice-explicit'])

const baseInput = {
  project: { id: 'project-1', status: 'Scheduled', value: 1000 },
  paymentSummary: { payments: [], projectValue: 1000, totalPaid: 0, outstandingBalance: 1000 },
  photoCount: 1,
  now,
}
const draftContractView = buildProjectWorkspaceViewModel({
  ...baseInput,
  contract: { id: 'contract-1', status: 'Draft' },
})
assert.equal(draftContractView.projectStatus, 'Contract Draft')
assert.equal(draftContractView.nextAction.id, 'review-contract')

const invoiceView = buildProjectWorkspaceViewModel({
  ...baseInput,
  contract: { id: 'contract-1', status: 'Signed', signed: true },
  invoices: [{ id: 'invoice-1', amount: 1000, amountPaid: 250, status: 'Sent' }],
})
assert.equal(invoiceView.nextAction.id, 'view-invoice')
assert.equal(invoiceView.outstandingInvoiceBalance, 750)

const upcomingView = buildProjectWorkspaceViewModel({
  ...baseInput,
  contract: { id: 'contract-1', status: 'Signed', signed: true },
  events: [{ id: 'event-1', date: '2026-08-19', startTime: '08:00', status: 'Scheduled' }],
})
assert.equal(upcomingView.nextAction.id, 'view-schedule')

const scheduleView = buildProjectWorkspaceViewModel({
  ...baseInput,
  contract: { id: 'contract-1', status: 'Signed', signed: true },
})
assert.equal(scheduleView.nextAction.id, 'schedule-job')

const archivedView = buildProjectWorkspaceViewModel({
  ...baseInput,
  contract: { id: 'contract-1', status: 'Signed', signed: true },
  isArchived: true,
})
assert.equal(archivedView.projectStatus, 'Signed')
assert.equal(archivedView.nextAction, null)

const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const appSource = read('../src/App.jsx')
const scheduleCardSource = read('../src/components/projects/ProjectScheduleCard.jsx')
const viewModelSource = read('../src/utils/projectWorkspaceViewModel.js')

assert.match(projectSource, /calculateProjectPaymentSummary/)
assert.match(viewModelSource, /deriveProjectStatus/)
assert.match(viewModelSource, /calculateOutstandingInvoiceBalance/)
assert.doesNotMatch(viewModelSource, /dataProvider|supabase|fetch\(/i)
assert.match(projectSource, /isAnalyticsMode && hasProjectValue/)
assert.match(projectSource, /<StatusBadge status=\{projectStatus\}/)
assert.match(projectSource, /projectIsArchived \? <StatusBadge status="Archived"/)
assert.match(projectSource, /label: t\('recordPayment'\)/)
assert.match(projectSource, /label: t\('scheduleJob'\)/)
assert.match(projectSource, /label: t\('uploadPhotos'\)/)
assert.match(projectSource, /label: t\('edit'\)/)
assert.match(projectSource, /min-h-12 min-w-0 w-full/)
assert.match(projectSource, /navigate\(`\/invoices\/\$\{invoice\.id\}`\)/)
assert.match(appSource, /invoices=\{activeInvoices\}/)
assert.match(scheduleCardSource, /upcomingEvents/)
assert.match(scheduleCardSource, /historyEvents/)
assert.match(scheduleCardSource, /min-h-11/)

const scheduleIndex = projectSource.indexOf('<ProjectScheduleCard')
const documentsIndex = projectSource.indexOf("t('projectDocuments')", scheduleIndex)
const paymentsIndex = projectSource.indexOf("t('paymentHistory')", documentsIndex)
const photosIndex = projectSource.indexOf("t('projectPhotos')", paymentsIndex)
const clientIndex = projectSource.indexOf("t('clientInformation')", photosIndex)
assert.ok(scheduleIndex > -1 && scheduleIndex < documentsIndex)
assert.ok(documentsIndex < paymentsIndex)
assert.ok(paymentsIndex < photosIndex)
assert.ok(photosIndex < clientIndex)

console.log('Project Workspace validation passed.')

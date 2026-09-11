import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  calculateProjectFinancialSummary,
  getProjectInvoices,
  resolveProjectAgreedValue,
} from '../src/utils/projectFinancials.js'
import { buildClientProfiles } from '../src/utils/clients.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const project = { id: 'project-1', value: 7000 }
const estimates = [
  { id: 'estimate-1', projectId: 'project-1', total: 8000, status: 'Sent' },
  { id: 'estimate-2', projectId: 'project-1', total: 10000, status: 'Draft' },
]
const signedContract = { id: 'contract-signed', projectId: 'project-1', total: 12000, status: 'Signed' }
const draftContract = { id: 'contract-draft', projectId: 'project-1', total: 11000, status: 'Draft' }

assert.deepEqual(
  resolveProjectAgreedValue({ project, estimates, contracts: [signedContract] }),
  { agreedValue: 12000, agreedValueSource: 'contract', agreedValueSourceId: 'contract-signed' },
)
assert.deepEqual(
  resolveProjectAgreedValue({ project, estimates: [{ ...estimates[0] }], contracts: [] }),
  { agreedValue: 8000, agreedValueSource: 'single_estimate', agreedValueSourceId: 'estimate-1' },
)
assert.deepEqual(
  resolveProjectAgreedValue({ project: { ...project, selectedEstimateId: 'estimate-2' }, estimates, contracts: [] }),
  { agreedValue: 10000, agreedValueSource: 'selected_estimate', agreedValueSourceId: 'estimate-2' },
)
assert.deepEqual(
  resolveProjectAgreedValue({ project, estimates, contracts: [] }),
  { agreedValue: 7000, agreedValueSource: 'project', agreedValueSourceId: 'project-1' },
)
assert.deepEqual(
  resolveProjectAgreedValue({ project: { id: 'project-direct' }, estimates: [], contracts: [{ ...draftContract, projectId: 'project-direct' }] }),
  { agreedValue: 11000, agreedValueSource: 'contract', agreedValueSourceId: 'contract-draft' },
)
assert.equal(resolveProjectAgreedValue({ project, estimates, contracts: [draftContract] }).agreedValue, 11000)
assert.equal(resolveProjectAgreedValue({ project: { id: 'project-ambiguous', value: 6000 }, estimates: estimates.map((estimate) => ({ ...estimate, projectId: 'project-ambiguous' })), contracts: [] }).agreedValue, 6000)
assert.equal(resolveProjectAgreedValue({ project: { id: 'project-empty' }, estimates: [], contracts: [] }).agreedValueSource, 'none')

const invoices = [
  { id: 'invoice-sent', projectId: 'project-1', total: 3000, amountPaid: 500, status: 'Sent' },
  { id: 'invoice-paid', projectId: 'project-1', total: 2000, amountPaid: 2000, status: 'Paid' },
  { id: 'invoice-draft', projectId: 'project-1', total: 9000, status: 'Draft' },
  { id: 'invoice-cancelled', projectId: 'project-1', total: 4000, status: 'Cancelled' },
  { id: 'invoice-archived', projectId: 'project-1', total: 5000, status: 'Paid', archivedAt: '2026-01-01T00:00:00Z' },
  { id: 'invoice-other-project', projectId: 'project-2', total: 7000, status: 'Sent' },
]
assert.deepEqual(getProjectInvoices('project-1', invoices).map((invoice) => invoice.id), ['invoice-sent', 'invoice-paid'])

const payments = [
  { id: 'payment-invoice', projectId: 'project-1', invoiceId: 'invoice-sent', amount: 500, status: 'Recorded' },
  { id: 'payment-invoice-only', invoiceId: 'invoice-paid', amount: 2000, status: 'Recorded' },
  { id: 'payment-unapplied', projectId: 'project-1', amount: 2000, status: 'Recorded' },
  { id: 'payment-failed', projectId: 'project-1', amount: 9000, status: 'Failed' },
  { id: 'payment-archived', projectId: 'project-1', amount: 8000, status: 'Recorded', archivedAt: '2026-01-01T00:00:00Z' },
]
const summary = calculateProjectFinancialSummary({
  project: { ...project, selectedEstimateId: 'estimate-1' },
  estimates,
  contracts: [],
  invoices,
  payments,
})
assert.equal(summary.agreedValue, 8000)
assert.equal(summary.totalInvoiced, 5000)
assert.equal(summary.totalInvoicePaid, 2500)
assert.equal(summary.totalProjectPaid, 4500)
assert.equal(summary.projectBalance, 3500)
assert.equal(summary.invoiceAssociatedPayments.length, 2)
assert.equal(summary.unassociatedProjectPayments.length, 1)
assert.equal(summary.unappliedProjectPayments, 2000)
assert.equal(summary.outstandingInvoiced, 2500)
assert.equal(summary.remainingToBill, 3000)
assert.equal(summary.overbilledAmount, 0)

const dedupedSummary = calculateProjectFinancialSummary({
  project: { id: 'project-dedupe', value: 10000 },
  payments: [
    { id: 'same-payment', projectId: 'project-dedupe', amount: 2000, status: 'Recorded' },
    { id: 'same-payment', projectId: 'project-dedupe', amount: 2000, status: 'Recorded' },
  ],
})
assert.equal(dedupedSummary.totalProjectPaid, 2000)
assert.equal(dedupedSummary.projectBalance, 8000)

const projectFirstCases = [
  {
    invoices: [],
    payments: [{ id: 'p-a', projectId: 'project-matrix', amount: 2000, status: 'Recorded' }],
    expected: { totalProjectPaid: 2000, projectBalance: 8000, totalInvoiced: 0, remainingToBill: 10000, outstandingInvoiced: 0 },
  },
  {
    invoices: [{ id: 'i-b', projectId: 'project-matrix', total: 4000, status: 'Sent' }],
    payments: [{ id: 'p-b', projectId: 'project-matrix', amount: 2000, status: 'Recorded' }],
    expected: { totalProjectPaid: 2000, projectBalance: 8000, totalInvoiced: 4000, remainingToBill: 6000, outstandingInvoiced: 4000 },
  },
  {
    invoices: [{ id: 'i-c', projectId: 'project-matrix', total: 4000, status: 'Sent' }],
    payments: [{ id: 'p-c', projectId: 'project-matrix', invoiceId: 'i-c', amount: 2000, status: 'Recorded' }],
    expected: { totalProjectPaid: 2000, projectBalance: 8000, totalInvoiced: 4000, remainingToBill: 6000, outstandingInvoiced: 2000 },
  },
  {
    invoices: [{ id: 'i-d', projectId: 'project-matrix', total: 4000, status: 'Sent' }],
    payments: [
      { id: 'p-d1', projectId: 'project-matrix', invoiceId: 'i-d', amount: 1000, status: 'Recorded' },
      { id: 'p-d2', projectId: 'project-matrix', amount: 2000, status: 'Recorded' },
    ],
    expected: { totalProjectPaid: 3000, projectBalance: 7000, totalInvoiced: 4000, remainingToBill: 6000, outstandingInvoiced: 3000 },
  },
]

projectFirstCases.forEach(({ invoices: caseInvoices, payments: casePayments, expected }) => {
  const result = calculateProjectFinancialSummary({
    project: { id: 'project-matrix', value: 10000 },
    invoices: caseInvoices,
    payments: casePayments,
  })
  Object.entries(expected).forEach(([key, value]) => assert.equal(result[key], value, key))
})

const [clientWithProjectPayment] = buildClientProfiles([], [], [{
  id: 'client-project-1',
  clientId: 'client-financial-1',
  client: 'Financial Client',
  value: 10000,
  invoices: [{ id: 'client-invoice-1', projectId: 'client-project-1', total: 4000, status: 'Sent' }],
  payments: [{ id: 'client-payment-1', projectId: 'client-project-1', amount: 2000, status: 'Recorded' }],
}])
assert.equal(clientWithProjectPayment.outstandingBalance, 8000)

const overbilled = calculateProjectFinancialSummary({
  project: { id: 'project-overbilled', value: 10000 },
  invoices: [{ id: 'invoice-over', projectId: 'project-overbilled', total: 12000, status: 'Sent' }],
})
assert.equal(overbilled.remainingToBill, 0)
assert.equal(overbilled.overbilledAmount, 2000)
assert.equal(overbilled.isOverbilled, true)

const cents = calculateProjectFinancialSummary({
  project: { id: 'project-cents', value: 10000.99 },
  invoices: [{ id: 'invoice-cents', projectId: 'project-cents', total: 300.50, status: 'Sent', amountPaid: 0.50 }],
  payments: [{ id: 'payment-cents', projectId: 'project-cents', invoiceId: 'invoice-cents', amount: 0.50, status: 'Recorded' }],
})
assert.equal(cents.totalInvoiced, 300.50)
assert.equal(cents.totalInvoicePaid, 0.50)
assert.equal(cents.outstandingInvoiced, 300)
assert.equal(cents.remainingToBill, 9700.49)

const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const clientSource = read('../src/utils/clients.js')
assert.match(projectSource, /calculateProjectFinancialSummary/)
assert.match(clientSource, /calculateProjectFinancialSummary/)
assert.doesNotMatch(projectSource, /totalInvoiced\s*[-+]=/) // no ad-hoc invoice aggregation

console.log('Financial foundation validation passed.')

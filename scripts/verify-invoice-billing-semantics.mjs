import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildInvoiceCreationPayload, buildInvoiceProjectOptions, validateInvoiceCreationDraft } from '../src/utils/invoiceCreation.js'
import { calculateInvoiceBillingCapacity, validateInvoiceAgainstBillingCapacity } from '../src/utils/invoiceBilling.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const project = { id: 'project-1', clientId: 'client-1', value: 5000, selectedEstimateId: null }
const client = { id: 'client-1', name: 'Billing Client' }
const estimates = [
  { id: 'estimate-1', projectId: 'project-1', total: 8000, status: 'Sent' },
  { id: 'estimate-2', projectId: 'project-1', total: 10000, status: 'Draft' },
]
const contract = { id: 'contract-1', projectId: 'project-1', total: 10000, status: 'Signed' }

const contractCapacity = calculateInvoiceBillingCapacity({ project, estimates, contracts: [contract], invoices: [], payments: [] })
assert.equal(contractCapacity.agreedValue, 10000)
assert.equal(contractCapacity.agreedValueSource, 'contract')
assert.equal(contractCapacity.availableToBill, 10000)

const selectedEstimateCapacity = calculateInvoiceBillingCapacity({
  project: { ...project, selectedEstimateId: 'estimate-2' },
  estimates,
  invoices: [],
})
assert.equal(selectedEstimateCapacity.agreedValue, 10000)
assert.equal(selectedEstimateCapacity.agreedValueSource, 'selected_estimate')

const directContractCapacity = calculateInvoiceBillingCapacity({
  project: { id: 'project-direct', clientId: 'client-1' },
  contracts: [{ ...contract, projectId: 'project-direct', estimateId: null }],
})
assert.equal(directContractCapacity.agreedValue, 10000)

const ambiguousCapacity = calculateInvoiceBillingCapacity({ project: { id: 'project-ambiguous' }, estimates: estimates.map((estimate) => ({ ...estimate, projectId: 'project-ambiguous' })) })
assert.equal(ambiguousCapacity.agreedValueSource, 'none')
assert.equal(ambiguousCapacity.availableToBill, null)

const singleEstimateCapacity = calculateInvoiceBillingCapacity({ project: { id: 'project-single' }, estimates: [{ id: 'estimate-single', projectId: 'project-single', total: 8000, status: 'Saved' }] })
assert.equal(singleEstimateCapacity.agreedValue, 8000)
assert.equal(singleEstimateCapacity.agreedValueSource, 'single_estimate')

const manualCapacity = calculateInvoiceBillingCapacity({ project: { id: 'project-manual' } })
assert.equal(manualCapacity.hasAgreedValue, false)
assert.equal(validateInvoiceAgainstBillingCapacity({ capacity: manualCapacity, invoiceAmount: 100000 }), null)

const invoices = [
  { id: 'invoice-sent', projectId: 'project-1', total: 3000, status: 'Sent' },
  { id: 'invoice-draft', projectId: 'project-1', total: 4000, status: 'Draft' },
  { id: 'invoice-cancelled', projectId: 'project-1', total: 5000, status: 'Cancelled' },
  { id: 'invoice-archived', projectId: 'project-1', total: 6000, status: 'Paid', archivedAt: '2026-01-01T00:00:00Z' },
]
const capacity = calculateInvoiceBillingCapacity({ project, contracts: [contract], invoices })
assert.equal(capacity.finalizedInvoiced, 3000)
assert.equal(capacity.draftReservedAmount, 4000)
assert.equal(capacity.committedBillingExcludingCurrent, 7000)
assert.equal(capacity.availableToBill, 3000)

const editingDraft = calculateInvoiceBillingCapacity({ project, contracts: [contract], invoices, currentInvoiceId: 'invoice-draft' })
assert.equal(editingDraft.finalizedInvoiced, 3000)
assert.equal(editingDraft.draftReservedAmount, 0)
assert.equal(editingDraft.availableToBill, 7000)

const fullyBilled = calculateInvoiceBillingCapacity({ project, contracts: [contract], invoices: [{ id: 'full', projectId: 'project-1', total: 10000, status: 'Sent' }] })
assert.equal(fullyBilled.availableToBill, 0)
assert.equal(validateInvoiceAgainstBillingCapacity({ capacity: fullyBilled, invoiceAmount: 0.01 })?.overage, 0.01)

const alreadyOverbilled = calculateInvoiceBillingCapacity({ project, contracts: [contract], invoices: [{ id: 'over', projectId: 'project-1', total: 10000.01, status: 'Sent' }] })
assert.equal(alreadyOverbilled.projectFinancials, undefined)
assert.equal(alreadyOverbilled.overbilledAmount, 0.01)
assert.equal(alreadyOverbilled.availableToBill, 0)

const cents = calculateInvoiceBillingCapacity({
  project: { id: 'project-cents', value: 10000.99 },
  invoices: [{ id: 'cents-invoice', projectId: 'project-cents', total: 7500.49, status: 'Sent' }],
})
assert.equal(cents.availableToBill, 2500.50)
assert.equal(validateInvoiceAgainstBillingCapacity({ capacity: cents, invoiceAmount: 2500.50 }), null)
assert.equal(validateInvoiceAgainstBillingCapacity({ capacity: cents, invoiceAmount: 2500.51 })?.overage, 0.01)

const projectOptions = buildInvoiceProjectOptions({ projects: [project], clients: [client], contracts: [contract], estimates, invoices, payments: [] })
assert.equal(projectOptions[0].availableToBill, 3000)
const draft = validateInvoiceCreationDraft({
  selectedProject: projectOptions[0],
  selectedClient: client,
  title: 'Progress billing',
  issueDate: '2026-09-01',
  dueDate: '2026-09-08',
  lineItems: [{ description: 'Work', amount: '3000.00' }],
  billingCapacity: projectOptions[0].billingCapacity,
})
assert.deepEqual(draft, {})
const overDraft = validateInvoiceCreationDraft({
  selectedProject: projectOptions[0],
  selectedClient: client,
  title: 'Over billing',
  issueDate: '2026-09-01',
  dueDate: '2026-09-08',
  lineItems: [{ description: 'Work', amount: '3000.01' }],
  billingCapacity: projectOptions[0].billingCapacity,
})
assert.equal(overDraft.billingCapacity.code, 'exceedsAvailableToBill')
assert.equal(overDraft.billingCapacity.overage, 0.01)

const payload = buildInvoiceCreationPayload({ project: projectOptions[0], client, title: 'Progress billing', lineItems: [{ description: 'Work', amount: 1500 }] })
assert.equal(payload.projectId, 'project-1')
assert.equal(payload.contractId, 'contract-1')
assert.equal(payload.amount, 1500)

const modalSource = read('../src/components/invoices/InvoiceCreationModal.jsx')
const appSource = read('../src/App.jsx')
const detailSource = read('../src/pages/InvoiceDetailPage.jsx')
const projectSource = read('../src/pages/ProjectDetailPage.jsx')
assert.match(modalSource, /calculateInvoiceBillingCapacity|billingCapacity/)
assert.match(modalSource, /useRemainingToBill/)
assert.match(appSource, /validateInvoiceAgainstBillingCapacity/)
assert.match(detailSource, /validateInvoiceAgainstBillingCapacity/)
assert.match(projectSource, /onCreateInvoice/)
assert.doesNotMatch(read('../src/utils/invoiceBilling.js'), /invoiceId\s*=/)

console.log('Invoice billing semantics validation passed.')


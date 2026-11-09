import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { calculateInvoiceBillingCapacity } from '../src/utils/invoiceBilling.js'
import { getInvoiceAmount } from '../src/utils/invoiceBilling.js'
import { buildInvoiceProjectOptions, validateInvoiceCreationDraft } from '../src/utils/invoiceCreation.js'
import { hydrateInvoiceRecord, resolveInvoiceFinancials } from '../src/utils/invoiceRecords.js'
import { getInvoicePaymentRemaining } from '../src/utils/paymentAllocation.js'
import { calculateProjectPaymentSummary } from '../src/utils/projectPayments.js'
import { calculateProjectFinancialSummary } from '../src/utils/projectFinancials.js'
import { selectDashboardPaymentActivityRecords } from '../src/utils/dashboardConsistency.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const statusCases = [
  { id: 'recorded', amount: 100, status: 'Recorded' },
  { id: 'completed-legacy', amount: 50, status: 'Completed' },
  { id: 'pending', amount: 400, status: 'Pending' },
  { id: 'failed', amount: 500, status: 'Failed' },
  { id: 'refunded', amount: 600, status: 'Refunded' },
  { id: 'canceled', amount: 700, status: 'Canceled' },
  { id: 'unknown', amount: 800, status: 'awaiting_review' },
  { id: 'missing', amount: 900 },
  { id: 'negative-ambiguous', amount: -75, status: 'Recorded' },
].map((payment) => ({ ...payment, projectId: 'project-cash' }))
const cashSummary = calculateProjectPaymentSummary({ id: 'project-cash', value: 2000 }, statusCases)
assert.equal(cashSummary.totalPaid, 150, 'only explicit recorded or recognized settled statuses count as cash')
assert.deepEqual(cashSummary.payments.map((payment) => payment.id).sort(), ['completed-legacy', 'recorded'])
assert.equal(selectDashboardPaymentActivityRecords({ payments: statusCases }).length, 2)

const sameDayNoId = [
  { projectId: 'project-cash', amount: 125, status: 'Recorded', paymentDate: '2026-09-01', paymentType: 'Deposit' },
  { projectId: 'project-cash', amount: 125, status: 'Recorded', paymentDate: '2026-09-01', paymentType: 'Deposit' },
]
assert.equal(calculateProjectPaymentSummary({ id: 'project-cash' }, sameDayNoId).totalPaid, 250)

const archivedInvoiceSummary = calculateProjectFinancialSummary({
  project: { id: 'project-archived-invoice', value: 1000 },
  invoices: [{ id: 'invoice-archived', projectId: 'project-archived-invoice', total: 1000, status: 'Paid', archivedAt: '2026-11-01' }],
  payments: [{ id: 'payment-archived-invoice', invoiceId: 'invoice-archived', amount: 1000, status: 'Recorded' }],
})
assert.equal(archivedInvoiceSummary.totalProjectPaid, 1000, 'archiving an invoice does not erase a recorded project receipt')
assert.equal(archivedInvoiceSummary.totalInvoiced, 0, 'archived invoice value is not active billing')

const invoiceWithTax = {
  id: 'invoice-tax', status: 'Sent', subtotal: 500, taxAmount: 50, total: 550,
  lineItems: [{ description: 'Work', amount: 500 }],
}
assert.deepEqual(resolveInvoiceFinancials(invoiceWithTax), { subtotal: 500, taxAmount: 50, total: 550 })
assert.deepEqual(resolveInvoiceFinancials({ ...invoiceWithTax, status: 'Draft', total: 0 }), { subtotal: 500, taxAmount: 50, total: 550 })
assert.deepEqual(resolveInvoiceFinancials({ ...invoiceWithTax, status: 'Draft', lineItems: [], subtotal: 500, total: 550 }, { recalculateDraft: true }), { subtotal: 0, taxAmount: 50, total: 50 })
assert.deepEqual(resolveInvoiceFinancials({ ...invoiceWithTax, status: 'Paid', subtotal: 500, taxAmount: 0, total: 0 }), { subtotal: 500, taxAmount: 0, total: 0 })
assert.equal(getInvoiceAmount({ ...invoiceWithTax, status: 'Draft' }), 550, 'Draft billing capacity includes tax exactly once')

const invoiceBeforeHydration = {
  id: 'invoice-failed-payment', amount: 1000, amountPaid: 400, status: 'Sent',
  lineItems: [{ description: 'Work', amount: 1000 }],
}
const failedPaymentInvoice = hydrateInvoiceRecord(invoiceBeforeHydration, {
  payments: [{ id: 'failed-payment', invoiceId: invoiceBeforeHydration.id, amount: 400, status: 'Failed' }],
})
assert.equal(failedPaymentInvoice.amountPaid, 0)
assert.deepEqual(failedPaymentInvoice.paymentHistory, [], 'failed payment rows do not render as received cash')
assert.equal(invoiceBeforeHydration.amountPaid, 400, 'read-only normalization leaves the persisted source object unchanged')
assert.equal(getInvoicePaymentRemaining({ id: 'invoice-pending', amount: 1000, amountPaid: 600 }, [
  { id: 'pending-payment', invoiceId: 'invoice-pending', amount: 600, status: 'Pending' },
]), 1000)

const project = { id: 'project-capacity', clientId: 'client-capacity', value: 5000 }
const contracts = [
  { id: 'orphan-signed-contract', total: 3000, status: 'Signed' },
  { id: 'linked-signed-contract', projectId: project.id, total: 4000, status: 'Signed' },
]
const capacity = calculateInvoiceBillingCapacity({ project, contracts, invoices: [], payments: [] })
assert.equal(capacity.agreedValue, 4000, 'a project-less contract is not attributed to a project by proximity')
const ambiguousCapacity = calculateInvoiceBillingCapacity({
  project,
  contracts: [
    { id: 'signed-a', projectId: project.id, total: 4000, status: 'Signed' },
    { id: 'signed-b', projectId: project.id, total: 4500, status: 'Signed' },
  ],
  invoices: [],
})
assert.equal(ambiguousCapacity.agreedValueSource, 'ambiguous_contracts')
assert.equal(ambiguousCapacity.availableToBill, 0, 'ambiguous approved basis does not permit unbounded billing')

const projectOption = buildInvoiceProjectOptions({
  projects: [project],
  clients: [{ id: project.clientId, name: 'Client' }],
  contracts,
  invoices: [],
})[0]
const saveCapacity = calculateInvoiceBillingCapacity({
  project,
  contracts,
  invoices: [],
})
assert.equal(projectOption.availableToBill, saveCapacity.availableToBill)
assert.equal(saveCapacity.availableToBill, 4000, 'the invoice being edited is excluded from other draft reservations')
const editingCapacity = calculateInvoiceBillingCapacity({
  project,
  contracts,
  invoices: [{ id: 'current-draft', projectId: project.id, total: 1000, status: 'Draft' }],
  currentInvoiceId: 'current-draft',
  currentInvoiceAmount: 500,
})
assert.equal(editingCapacity.availableToBill, 4000, 'editing excludes the current invoice from capacity')
assert.deepEqual(validateInvoiceCreationDraft({
  selectedProject: projectOption,
  selectedClient: { id: project.clientId },
  title: 'Zero-value adjustment',
  issueDate: '2026-11-01',
  dueDate: '2026-11-08',
  lineItems: [{ description: 'No-charge work', amount: '0' }],
  billingCapacity: projectOption.billingCapacity,
}), {})
assert.equal(validateInvoiceCreationDraft({
  selectedProject: projectOption,
  selectedClient: { id: project.clientId },
  title: 'Unpriced placeholder',
  issueDate: '2026-11-01',
  dueDate: '2026-11-08',
  lineItems: [{ description: 'Work', amount: '' }],
})['lineItems.0.amount'], 'required')

for (const translations of [en, es]) assert.ok(translations.removeItem)
const invoiceDetail = read('../src/pages/InvoiceDetailPage.jsx')
const pdfTemplate = read('../src/components/invoices/InvoicePdfTemplate.jsx')
const portalHook = read('../src/hooks/usePortalProjectData.js')
const publicEndpoint = read('../supabase/functions/super-endpoint/index.ts')
const projectDetail = read('../src/pages/ProjectDetailPage.jsx')
assert.match(invoiceDetail, /function removeLineItem\(index\) \{\s*if \(!canEditDraftLineItems\) return/)
assert.match(invoiceDetail, /<InvoiceLineItemsEditor isEditing=\{isEditingInvoice\} canEditDraftLineItems=\{canEditDraftLineItems\}/)
assert.match(pdfTemplate, /resolveInvoiceFinancials\(invoice\)/)
assert.match(portalHook, /calculateProjectPaymentSummary/)
assert.match(projectDetail, /allInvoices = invoices/)
assert.match(projectDetail, /allPayments = \[\]/)
assert.match(projectDetail, /invoices: financialRelatedInvoices/)
assert.match(publicEndpoint, /\.eq\('status', 'recorded'\)/)

console.log('Financial calculation integrity verification passed.')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildInvoicePaymentContext,
  getEligiblePaymentInvoices,
  getInvoicePaymentRemaining,
  validateInvoicePayment,
  validateProjectPaymentAmount,
} from '../src/utils/paymentAllocation.js'
import { calculateProjectFinancialSummary } from '../src/utils/projectFinancials.js'
import { normalizeCurrencyInput, parsePaymentAmount } from '../src/utils/paymentAmount.js'
import { classifyPaymentPersistenceError, getPaymentPersistenceErrorMessage } from '../src/utils/paymentErrors.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const project = { id: 'project-1', clientId: 'client-1' }
const invoices = [
  { id: 'invoice-a', number: 'INV-001', projectId: 'project-1', amount: 3000, amountPaid: 0, status: 'Sent' },
  { id: 'invoice-b', number: 'INV-002', projectId: 'project-1', amount: 1000, amountPaid: 0, status: 'Overdue' },
  { id: 'invoice-paid', number: 'INV-003', projectId: 'project-1', amount: 500, amountPaid: 500, status: 'Paid' },
  { id: 'invoice-draft', number: 'INV-004', projectId: 'project-1', amount: 700, amountPaid: 0, status: 'Draft' },
  { id: 'invoice-cancelled', number: 'INV-005', projectId: 'project-1', amount: 800, amountPaid: 0, status: 'Cancelled' },
  { id: 'invoice-archived', number: 'INV-006', projectId: 'project-1', amount: 900, amountPaid: 0, status: 'Sent', archivedAt: '2026-01-01T00:00:00Z' },
  { id: 'invoice-other-project', number: 'INV-007', projectId: 'project-2', amount: 1000, amountPaid: 0, status: 'Sent' },
]

const eligible = getEligiblePaymentInvoices(invoices, { projectId: project.id })
assert.deepEqual(eligible.map((invoice) => invoice.id), ['invoice-a', 'invoice-b'])
assert.deepEqual(getEligiblePaymentInvoices([invoices[3]], { projectId: project.id }), [])
assert.equal(getInvoicePaymentRemaining(invoices[0]), 3000)

const partialPayments = [{ id: 'payment-1', invoiceId: 'invoice-a', projectId: 'project-1', amount: 1000, status: 'Recorded' }]
assert.equal(getInvoicePaymentRemaining(invoices[0], partialPayments), 2000)
assert.equal(validateInvoicePayment({ invoice: invoices[0], amount: 2000, projectId: project.id, payments: partialPayments }), null)
assert.equal(validateInvoicePayment({ invoice: invoices[0], amount: 2000.01, projectId: project.id, payments: partialPayments })?.overage, 0.01)
const exactInvoice = { id: 'invoice-exact', projectId: project.id, amount: 1000, amountPaid: 0, status: 'Sent' }
assert.equal(validateInvoicePayment({ invoice: exactInvoice, amount: 1000, projectId: project.id, payments: [] }), null)
const exactInvoicePayment = { id: 'invoice-exact-payment', invoiceId: exactInvoice.id, projectId: project.id, amount: 1000, status: 'Recorded' }
assert.equal(getInvoicePaymentRemaining(exactInvoice, [exactInvoicePayment]), 0)
assert.equal(validateInvoicePayment({ invoice: exactInvoice, amount: 1000, projectId: project.id, payments: [exactInvoicePayment] })?.code, 'invoiceNotEligible')
assert.equal(validateInvoicePayment({ invoice: invoices[0], amount: 0, projectId: project.id })?.code, 'amountPositive')
assert.equal(validateInvoicePayment({ invoice: invoices[0], amount: 1.001, projectId: project.id })?.code, 'amountPrecision')
assert.equal(validateInvoicePayment({ invoice: invoices[0], amount: 1, projectId: 'project-2' })?.code, 'invoiceProjectMismatch')
assert.equal(validateInvoicePayment({ invoice: invoices[3], amount: 1, projectId: project.id })?.code, 'invoiceNotEligible')
assert.equal(validateInvoicePayment({ invoice: invoices[2], amount: 1, projectId: project.id })?.code, 'invoiceNotEligible')
assert.equal(validateProjectPaymentAmount({ projectValue: 10000, amount: 2000, projectId: project.id, payments: [] }), null)
assert.equal(validateProjectPaymentAmount({ projectValue: 10000, amount: 1500, projectId: project.id, payments: [{ id: 'p', projectId: project.id, amount: 9000 }] })?.code, 'amountExceedsProjectBalance')
assert.equal(validateProjectPaymentAmount({
  projectValue: 10000,
  amount: 1000,
  projectId: project.id,
  invoiceIds: ['invoice-a'],
  payments: [{ id: 'invoice-only', invoiceId: 'invoice-a', amount: 9500, status: 'Recorded' }],
})?.code, 'amountExceedsProjectBalance')
assert.equal(validateProjectPaymentAmount({ projectValue: 0, amount: 100000, projectId: project.id, payments: [] }), null)
const observedProjectPayments = [
  { id: 'observed-1', projectId: project.id, amount: 3000, status: 'Recorded' },
  { id: 'observed-2', projectId: project.id, amount: 200, status: 'Recorded' },
  { id: 'observed-3', projectId: project.id, amount: 2000, status: 'Recorded' },
]
const observedSummary = calculateProjectFinancialSummary({
  project: { id: project.id, value: 23322 },
  invoices: [{ id: 'draft-300', projectId: project.id, amount: 300, status: 'Draft' }],
  payments: observedProjectPayments,
})
assert.equal(observedSummary.agreedValue, 23322)
assert.equal(observedSummary.totalProjectPaid, 5200)
assert.equal(observedSummary.projectBalance, 18122)
assert.equal(validateProjectPaymentAmount({ projectValue: 23322, projectBalance: 18122, amount: 200, projectId: project.id, payments: observedProjectPayments }), null)
assert.equal(validateProjectPaymentAmount({ projectValue: 23322, projectBalance: 18122, amount: 2000, projectId: project.id, payments: observedProjectPayments }), null)
assert.equal(validateProjectPaymentAmount({ projectValue: 23322, projectBalance: 18122, amount: 3000, projectId: project.id, payments: observedProjectPayments }), null)
assert.equal(validateProjectPaymentAmount({ projectValue: 23322, projectBalance: 18122, amount: 18122, projectId: project.id, payments: observedProjectPayments }), null)
assert.equal(validateProjectPaymentAmount({ projectValue: 23322, projectBalance: 18122, amount: 18122.01, projectId: project.id, payments: observedProjectPayments })?.overage, 0.01)

const exactBalanceBefore = calculateProjectFinancialSummary({
  project: { id: project.id, value: 2500 },
  payments: [],
})
assert.equal(exactBalanceBefore.projectBalance, 2500)
assert.equal(validateProjectPaymentAmount({
  projectValue: 2500,
  projectBalance: exactBalanceBefore.projectBalance,
  amount: 2500,
  projectId: project.id,
  payments: [],
}), null)
const exactBalancePayment = { id: 'exact-payment', projectId: project.id, amount: 2500, status: 'Recorded' }
const exactBalanceAfter = calculateProjectFinancialSummary({
  project: { id: project.id, value: 2500 },
  payments: [exactBalancePayment],
})
assert.equal(exactBalanceAfter.totalProjectPaid, 2500)
assert.equal(exactBalanceAfter.projectBalance, 0)
assert.equal(validateProjectPaymentAmount({
  projectValue: 2500,
  projectBalance: exactBalanceAfter.projectBalance,
  amount: 2500,
  projectId: project.id,
  payments: [exactBalancePayment],
})?.overage, 2500)

assert.equal(normalizeCurrencyInput('2000'), '2000')
assert.equal(parsePaymentAmount('2000').value, 2000)
assert.equal(parsePaymentAmount(2000).value, 2000)
assert.equal(parsePaymentAmount('2000.00').value, 2000)
assert.equal(parsePaymentAmount('2,000').value, 2000)
assert.equal(parsePaymentAmount('2,000.00').value, 2000)
assert.equal(parsePaymentAmount('2000,00').value, 200000)
assert.equal(parsePaymentAmount(' 2000 ').value, 2000)
assert.equal(parsePaymentAmount('$2,000').value, 2000)
assert.equal(parsePaymentAmount('2000.50').value, 2000.5)
assert.equal(parsePaymentAmount(0).value, 0)
assert.equal(normalizeCurrencyInput('-1'), '-1')
assert.equal(parsePaymentAmount('-1').value, -1)
assert.equal(validateInvoicePayment({ invoice: invoices[0], amount: '-1', projectId: project.id })?.code, 'amountPositive')
assert.equal(classifyPaymentPersistenceError({ code: '23505', status: 409 }), 'duplicate')
assert.equal(classifyPaymentPersistenceError({ code: '23503', details: 'payments_project_id_fkey' }), 'relationship')
assert.equal(classifyPaymentPersistenceError({ code: '23514' }), 'invalidValue')
assert.equal(classifyPaymentPersistenceError({ code: 'PGRST999', message: 'unexpected backend failure' }), 'unknown')
assert.equal(getPaymentPersistenceErrorMessage((key) => ({ paymentDuplicate: 'duplicate', paymentSaveFailed: 'generic' }[key]), { code: '23505' }), 'duplicate')
assert.equal(getPaymentPersistenceErrorMessage((key) => ({ paymentDuplicate: 'duplicate', paymentSaveFailed: 'generic' }[key]), { code: 'PGRST999' }), 'generic')


const context = buildInvoicePaymentContext({ invoice: invoices[0], project, lead: { id: 'lead-1', clientId: 'client-1' } })
assert.deepEqual(context, {
  invoiceId: 'invoice-a',
  projectId: 'project-1',
  clientId: 'client-1',
  contractId: null,
  estimateId: null,
  leadId: 'lead-1',
})

const summaryBefore = calculateProjectFinancialSummary({
  project: { id: 'project-1', value: 10000 },
  invoices: [{ ...invoices[0], amount: 3000, status: 'Sent' }],
  payments: [],
})
const summaryAfter = calculateProjectFinancialSummary({
  project: { id: 'project-1', value: 10000 },
  invoices: [{ ...invoices[0], amount: 3000, status: 'Sent' }],
  payments: [{ id: 'payment-a', projectId: 'project-1', invoiceId: 'invoice-a', amount: 1000, status: 'Recorded' }],
})
assert.equal(summaryBefore.remainingToBill, summaryAfter.remainingToBill)
assert.equal(summaryAfter.totalInvoicePaid, 1000)
assert.equal(summaryAfter.outstandingInvoiced, 2000)

const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const modalSource = read('../src/components/common/RecordPaymentModal.jsx')
const invoiceDetailSource = read('../src/pages/InvoiceDetailPage.jsx')
const appSource = read('../src/App.jsx')
const paymentServiceSource = read('../src/services/supabase/paymentsSupabaseService.js')
assert.match(projectSource, /getEligiblePaymentInvoices/)
assert.match(projectSource, /invoiceId: paymentContext\.invoiceId/)
assert.doesNotMatch(projectSource, /invoiceId:\s*currentLead\.invoiceId/)
assert.match(modalSource, /applyToInvoiceOptional/)
assert.doesNotMatch(modalSource, /noOutstandingInvoicesForPayment/)
assert.doesNotMatch(modalSource, /requiresInvoice/)
assert.doesNotMatch(modalSource, /eligibleInvoices\.length === 1 \? eligibleInvoices\[0\]\.id/)
assert.match(modalSource, /invoiceId \|\| initialPayment\?\.invoice_id \|\| ''/)
assert.match(modalSource, /invoiceId: selectedInvoiceId \|\| null/)
assert.match(projectSource, /validateProjectPaymentAmount/)
assert.match(projectSource, /projectBalance: editingPayment\?\.id \? undefined : projectFinancialSummary\.projectBalance/)
assert.match(projectSource, /logProjectPaymentDev\('before-persistence'/)
assert.match(projectSource, /logProjectPaymentDev\('after-persistence'/)
assert.match(projectSource, /logProjectPaymentDev\('over-balance-rejected'/)
const projectPaymentSaveSource = projectSource.slice(projectSource.indexOf('async function saveProjectPayment'))
assert.ok(projectPaymentSaveSource.indexOf('validateProjectPaymentAmount') < projectPaymentSaveSource.indexOf('dataProvider.payments.create'))
assert.equal((projectPaymentSaveSource.match(/dataProvider\.payments\.(?:create|update)/g) || []).length, 2)
assert.doesNotMatch(projectSource, /remainingBalance=\{portal\.outstandingBalance\}/)
assert.match(projectSource, /clientId: null,\n            contractId: null,\n            estimateId: null,\n            leadId: null/)
assert.doesNotMatch(projectSource, /isEditingLegacyUnappliedPayment/)
assert.match(modalSource, /value=\{payment\.amount\}/)
assert.match(modalSource, /setAmountError\(''\)/)
assert.match(modalSource, /setIsSubmitting\(false\)/)
assert.match(modalSource, /setPayment\(\(current\) => \(\{ \.\.\.current, date:/)
assert.match(modalSource, /setPayment\(\(current\) => \(\{ \.\.\.current, method:/)
assert.match(modalSource, /setPayment\(\(current\) => \(\{ \.\.\.current, type:/)
assert.match(modalSource, /setPayment\(\(current\) => \(\{ \.\.\.current, notes:/)
assert.doesNotMatch(modalSource, /setPayment\(\{ \.\.\.payment, (date|method|type|notes):/)
assert.match(invoiceDetailSource, /validateInvoicePayment/)
assert.match(invoiceDetailSource, /parsePaymentAmount/)
assert.match(invoiceDetailSource, /normalizeCurrencyInput/)
assert.match(projectSource, /getPaymentPersistenceErrorMessage/)
assert.match(invoiceDetailSource, /getPaymentPersistenceErrorMessage/)
assert.doesNotMatch(projectSource, /showToast\(errorMessage\)/)
assert.match(paymentServiceSource, /payload\.project_id = sanitizeUuid/)
assert.match(paymentServiceSource, /payload\.invoice_id = sanitizeUuid/)
assert.match(paymentServiceSource, /payload\.payment_type = paymentTypeInput \|\| null/)
assert.match(paymentServiceSource, /payload\.payment_method = paymentMethodInput \|\| null/)
assert.match(paymentServiceSource, /payload\.status = mapStatusToDb\(statusInput\)/)
assert.match(paymentServiceSource, /payload\.payment_date = parseDateToIso\(paymentDateInput\)/)
assert.match(paymentServiceSource, /constraint: error\?\.constraint \|\| raw\.constraint \|\| null/)
assert.doesNotMatch(appSource, /validateInvoicePayment/)
assert.doesNotMatch(appSource, /validateProjectPaymentAmount/)
assert.doesNotMatch(read('../src/utils/paymentAllocation.js'), /split|allocation table/i)

console.log('Payment allocation validation passed.')

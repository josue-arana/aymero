import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [endpoint, portalHook, portalPage, portalSummary, publicInvoice, sendDialog, delivery, schema] = await Promise.all([
  read('../supabase/functions/super-endpoint/index.ts'),
  read('../src/hooks/usePortalProjectData.js'),
  read('../src/pages/CustomerPortalPage.jsx'),
  read('../src/components/portal/PortalSummary.jsx'),
  read('../src/pages/PublicInvoicePage.jsx'),
  read('../src/components/common/SendToCustomerModal.jsx'),
  read('../src/utils/customerDelivery.js'),
  read('../supabase/schema.sql'),
])
const {
  buildPublicInvoice,
  isPublicPortalInvoiceEligible,
  PUBLIC_PORTAL_INVOICE_STATUSES,
  resolvePublicInvoiceFinancials,
} = await import('../supabase/functions/_shared/publicInvoiceFinancials.js')
const financialsSource = await read('../supabase/functions/_shared/publicInvoiceFinancials.js')

assert.match(endpoint, /\.select\('id, contractor_id, client_id, project_id, invoice_number/)
assert.match(endpoint, /\.eq\('public_share_token', token\)[\s\S]*?\.in\('status', \['sent', 'partial', 'paid', 'overdue'\]\)[\s\S]*?\.is\('archived_at', null\)/)
assert.match(endpoint, /\.eq\('contractor_id', contractorId\)\.eq\('invoice_id', invoiceRow\.id\)/)
assert.match(endpoint, /import\s*\{[\s\S]*?buildPublicInvoice[\s\S]*?\}\s*from '\.\.\/\_shared\/publicInvoiceFinancials\.js'/)
assert.match(endpoint, /invoiceRow\.project_id && !projectResult\.data/)
assert.match(endpoint, /new Set\(linkedClientIds\)\.size > 1/)
assert.match(endpoint, /\.eq\('contractor_id', contractorId\)\.eq\('project_id', projectId\)\.in\('status', PUBLIC_PORTAL_INVOICE_STATUSES\)/)
assert.match(endpoint, /invoiceResult\.data \|\| \[\]\)\.filter\(\(invoice\) => isPublicPortalInvoiceEligible/)
assert.match(endpoint, /\.eq\('contractor_id', contractorId\)\.in\('invoice_id', portalInvoiceIds\)/)
assert.match(endpoint, /invoices: publicInvoices/)
assert.match(endpoint, /clientId: canonicalPortalClientId/)
assert.match(endpoint, /const publicInvoice = buildPublicInvoice\(invoiceRow, paymentsResult\.data \|\| \[\]/)
assert.match(endpoint, /buildPublicInvoice\(invoice, invoicePayments/)
assert.match(financialsSource, /customerNotes: row\.customer_notes/)
assert.match(financialsSource, /paymentHistory: financials\.paymentHistory\.length[\s\S]*?financials\.hasLinkedPayments \? \[\] : legacyPaymentHistory/)
assert.match(financialsSource, /amountPaid: financials\.amountPaid/)
assert.doesNotMatch(endpoint, /function buildPublicInvoice/)
assert.match(financialsSource, /remainingBalance: financials\.remainingBalance/)
assert.match(financialsSource, /normalizedDueDate && normalizedDueDate < today/)
assert.match(financialsSource, /PUBLIC_PORTAL_INVOICE_STATUSES = \['sent', 'partial', 'paid', 'overdue'\]/)
assert.match(financialsSource, /invoice\.project_id \|\| ''\) === String\(projectId\)/)
assert.match(financialsSource, /status,\s*$/m)

const invoiceStatusEnum = schema.match(/create type invoice_status as enum\s*\(([\s\S]*?)\);/i)?.[1] || ''
const invoiceStatusValues = [...invoiceStatusEnum.matchAll(/'([^']+)'/g)].map((match) => match[1])
assert.ok(invoiceStatusValues.length, 'The schema must declare the invoice_status enum.')
assert.deepEqual(PUBLIC_PORTAL_INVOICE_STATUSES, ['sent', 'partial', 'paid', 'overdue'])
assert.ok(PUBLIC_PORTAL_INVOICE_STATUSES.every((status) => invoiceStatusValues.includes(status)))
assert.ok(!invoiceStatusValues.includes('partially_paid'))
assert.ok(!endpoint.includes(".in('status', ['sent', 'partial', 'partially_paid', 'paid', 'overdue'])"))

const scope = { contractorId: 'contractor-a', projectId: 'project-a', clientId: 'client-a' }
const eligibleInvoice = (overrides = {}) => ({
  contractor_id: 'contractor-a',
  project_id: 'project-a',
  client_id: 'client-a',
  status: 'sent',
  ...overrides,
})
assert.deepEqual([].filter((invoice) => isPublicPortalInvoiceEligible(invoice, scope)), [], 'A Project without Invoices should load with an empty Invoice collection.')
assert.deepEqual(
  [eligibleInvoice({ status: 'draft' })].filter((invoice) => isPublicPortalInvoiceEligible(invoice, scope)),
  [],
  'Draft-only Invoices must not be included.',
)
const validProjectInvoices = [
  eligibleInvoice({ status: 'sent' }),
  eligibleInvoice({ status: 'paid' }),
].filter((invoice) => isPublicPortalInvoiceEligible(invoice, scope))
assert.deepEqual(validProjectInvoices.map((invoice) => invoice.status), ['sent', 'paid'])
const isolatedInvoiceFixtures = [
  eligibleInvoice({ contractor_id: 'contractor-b' }),
  eligibleInvoice({ project_id: 'project-b' }),
  eligibleInvoice({ client_id: 'client-b' }),
  eligibleInvoice({ archived_at: '2026-11-01T00:00:00Z' }),
]
assert.deepEqual(isolatedInvoiceFixtures.filter((invoice) => isPublicPortalInvoiceEligible(invoice, scope)), [])

assert.match(portalHook, /Array\.isArray\(payload\.invoices\) \? payload\.invoices : \[\]/)
assert.match(portalHook, /setInvoices\(Array\.isArray\(payload\?\.invoices\)/)
assert.match(portalPage, /invoices,/)
assert.match(portalPage, /invoices=\{invoices\}/)
assert.match(portalSummary, /visibleInvoices\.map/)
assert.match(portalSummary, /<LazyInvoicePdfTemplate \{\.\.\.props\} \/>/)
assert.match(portalSummary, /<LazyInvoicePdfTemplate ref=\{invoicePreviewRef\} \{\.\.\.invoicePreviewProps\} \/>/)
assert.match(portalSummary, /downloadInvoicePdf\(/)
assert.match(portalSummary, /formatInvoiceCalendarDate\(/)
assert.match(portalSummary, /getDocumentStatusTone\(status\)/)
assert.match(portalSummary, /label: t\('invoiceTotal'\)/)
assert.match(portalSummary, /label: t\('remainingBalance'\)/)
assert.match(portalSummary, /hasEstimate \? \(/)
assert.match(portalSummary, /hasContract \? \(/)
assert.doesNotMatch(portalSummary, /noInvoiceAvailableYet/)

const paidInvoice = resolvePublicInvoiceFinancials({
  totalAmount: 1625,
  payments: [{ amount: 1625, status: 'recorded', payment_date: '2026-11-01' }],
  today: '2026-11-09',
})
assert.deepEqual([paidInvoice.amountPaid, paidInvoice.remainingBalance, paidInvoice.status], [1625, 0, 'Paid'])

const partiallyPaidInvoice = resolvePublicInvoiceFinancials({
  totalAmount: 500,
  payments: [
    { amount: 200, status: 'recorded', payment_date: '2026-11-02' },
    { amount: 100, status: 'pending', payment_date: '2026-11-03' },
    { amount: 40, status: 'refunded', payment_date: '2026-11-04' },
  ],
  today: '2026-11-09',
})
assert.deepEqual([partiallyPaidInvoice.amountPaid, partiallyPaidInvoice.remainingBalance, partiallyPaidInvoice.status], [200, 300, 'Partially Paid'])
assert.equal(partiallyPaidInvoice.paymentHistory.length, 1)

const overdueInvoice = resolvePublicInvoiceFinancials({ totalAmount: 200, storedAmountPaid: 0, dueDate: '2026-11-03', payments: [], today: '2026-11-09' })
assert.deepEqual([overdueInvoice.amountPaid, overdueInvoice.remainingBalance, overdueInvoice.status], [0, 200, 'Overdue'])

const failedLinkedPayment = resolvePublicInvoiceFinancials({
  totalAmount: 200,
  storedAmountPaid: 50,
  payments: [{ amount: 50, status: 'failed' }],
  today: '2026-11-02',
})
assert.deepEqual([failedLinkedPayment.amountPaid, failedLinkedPayment.remainingBalance], [0, 200])

const legacyPaidFallback = resolvePublicInvoiceFinancials({ totalAmount: 120, storedAmountPaid: 25, payments: [], today: '2026-11-02' })
assert.deepEqual([legacyPaidFallback.amountPaid, legacyPaidFallback.remainingBalance], [25, 95])

const zeroPayment = resolvePublicInvoiceFinancials({
  totalAmount: 200,
  payments: [{ amount: 0, status: 'recorded', payment_date: '2026-11-05' }],
  dueDate: '2026-11-20',
  today: '2026-11-09',
})
assert.deepEqual([zeroPayment.amountPaid, zeroPayment.remainingBalance, zeroPayment.paymentHistory[0].amount], [0, 200, 0])

const invoiceFixture = (overrides = {}) => ({
  invoice_number: 'INV-TEST-001',
  title: 'Test project',
  total_amount: 500,
  subtotal: 500,
  tax_amount: 0,
  amount_paid: 0,
  due_date: '2026-11-20',
  line_items: [],
  description: JSON.stringify({ summary: 'Invoice details' }),
  ...overrides,
})
const buildInvoice = (row, payments = []) => buildPublicInvoice(row, payments, { display_name: 'Abe Kim', preferred_language: 'en' })
const unpaidPublicInvoice = buildInvoice(invoiceFixture())
assert.deepEqual(
  [unpaidPublicInvoice.totalAmount, unpaidPublicInvoice.amountPaid, unpaidPublicInvoice.remainingBalance, unpaidPublicInvoice.status, unpaidPublicInvoice.paymentHistory],
  [500, 0, 500, 'Sent', []],
  'An unpaid invoice without payment history should map with a zero paid amount and full balance.',
)
const partialPublicInvoice = buildInvoice(invoiceFixture(), [
  { amount: 125, status: 'recorded', payment_date: '2026-11-10', payment_method: 'card' },
  { amount: 75, status: 'pending', payment_date: '2026-11-11' },
  { amount: 25, status: 'refunded', payment_date: '2026-11-12' },
])
assert.deepEqual(
  [partialPublicInvoice.amountPaid, partialPublicInvoice.remainingBalance, partialPublicInvoice.status, partialPublicInvoice.paymentHistory.map((payment) => payment.amount)],
  [125, 375, 'Partially Paid', [125]],
  'Only settled payments should affect the public invoice financials and history.',
)
const fullyPaidPublicInvoice = buildInvoice(invoiceFixture({ amount_paid: 500 }), [
  { amount: 500, status: 'settled', payment_date: '2026-11-10' },
])
assert.deepEqual(
  [fullyPaidPublicInvoice.amountPaid, fullyPaidPublicInvoice.remainingBalance, fullyPaidPublicInvoice.status],
  [500, 0, 'Paid'],
)
const zeroValuePublicInvoice = buildInvoice(invoiceFixture({ total_amount: 0, amount_paid: 0 }))
assert.deepEqual(
  [zeroValuePublicInvoice.totalAmount, zeroValuePublicInvoice.amount, zeroValuePublicInvoice.amountPaid, zeroValuePublicInvoice.remainingBalance],
  [0, 0, 0, 0],
  'Explicit zero invoice totals and paid amounts must remain zero.',
)
const noHistoryPublicInvoice = buildInvoice(invoiceFixture({ amount_paid: 40 }))
assert.deepEqual(
  [noHistoryPublicInvoice.amountPaid, noHistoryPublicInvoice.remainingBalance, noHistoryPublicInvoice.paymentHistory],
  [40, 460, []],
  'Invoices without linked payments must preserve their stored amount paid and expose no fabricated history.',
)

assert.match(publicInvoice, /InvoicePdfTemplate ref=\{documentRef\}/)
assert.match(sendDialog, /documentType !== 'invoice' \|\| !isDraftInvoice/)
assert.match(sendDialog, /!deliveryAvailability\[channel\] \|\| !canPrepareInvoiceMessage/)
assert.match(delivery, /documentLink/)
assert.match(delivery, /if \(requiresClientLink && !documentLink\)/)

console.log('Invoice Portal integration source and runtime mapper checks passed.')

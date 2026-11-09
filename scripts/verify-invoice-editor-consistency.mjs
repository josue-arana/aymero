import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatInvoiceCalendarDate, formatInvoiceDateInput, invoiceDateFromInput, normalizeInvoiceDate } from '../src/utils/invoiceDate.js'
import { removeInvoiceLineItem, resolveInvoiceFinancials } from '../src/utils/invoiceRecords.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

for (const timezone of ['America/Los_Angeles', 'America/New_York', 'UTC']) {
  process.env.TZ = timezone
  for (const value of ['2026-11-03', '2026-01-01', '2026-12-31', '2028-02-29']) {
    assert.equal(normalizeInvoiceDate(value), value)
    assert.equal(invoiceDateFromInput(formatInvoiceDateInput(value)), value)
    assert.notEqual(formatInvoiceCalendarDate(value, 'en'), '')
  }
}
assert.equal(formatInvoiceDateInput('2026-11-03'), '11/03/2026')
assert.equal(formatInvoiceDateInput('2028-02-29'), '02/29/2028')
assert.equal(normalizeInvoiceDate('2027-02-29'), '')
assert.equal(formatInvoiceCalendarDate('2026-11-03', 'en'), 'November 3, 2026')
assert.equal(formatInvoiceCalendarDate('2026-11-03', 'es'), '3 de noviembre de 2026')

const draftTax = resolveInvoiceFinancials({
  status: 'Draft',
  lineItems: [{ description: 'Work', amount: 1000 }],
  taxRate: 6,
  taxAmount: 0,
}, { recalculateDraft: true })
assert.deepEqual(draftTax, { subtotal: 1000, taxAmount: 60, total: 1060 })
assert.deepEqual(resolveInvoiceFinancials({
  status: 'Draft', lineItems: [{ description: 'Work', amount: 1000 }], taxRate: 0, taxAmount: 60,
}, { recalculateDraft: true }), { subtotal: 1000, taxAmount: 0, total: 1000 })
assert.deepEqual(resolveInvoiceFinancials({
  status: 'Paid', subtotal: 1000, taxRate: 6, taxAmount: 60, total: 1060,
}), { subtotal: 1000, taxAmount: 60, total: 1060 })
assert.deepEqual(resolveInvoiceFinancials({
  status: 'Draft', subtotal: 1000, taxAmount: 60, total: 1060,
}), { subtotal: 1000, taxAmount: 60, total: 1060 })

const sourceItems = [
  { description: '<p>Labor</p>', amount: 300 },
  { description: '<p>Materials</p>', amount: 200 },
  { description: '<p>Complimentary cleanup</p>', amount: 0 },
]
for (const index of [0, 1, 2]) {
  const kept = removeInvoiceLineItem(sourceItems, index)
  assert.equal(kept.length, 2)
  assert.deepEqual(kept, sourceItems.filter((_, itemIndex) => itemIndex !== index))
  assert.equal(resolveInvoiceFinancials({ status: 'Draft', lineItems: kept }, { recalculateDraft: true }).subtotal,
    kept.reduce((sum, item) => sum + item.amount, 0))
}
assert.equal(removeInvoiceLineItem(sourceItems.slice(0, 1), 0).length, 1)

const invoiceDate = read('../src/services/supabase/invoicesSupabaseService.js')
const dateComponent = read('../src/components/invoices/InvoiceDateInput.jsx')
const detail = read('../src/pages/InvoiceDetailPage.jsx')
const modal = read('../src/components/invoices/InvoiceCreationModal.jsx')
const pdf = read('../src/components/invoices/InvoicePdfTemplate.jsx')
const list = read('../src/pages/InvoicesPage.jsx')
const badge = read('../src/components/ui/StatusBadge.jsx')
assert.match(invoiceDate, /issueDate: normalizeInvoiceDate\(row\?\.issue_date\)/)
assert.match(invoiceDate, /dueDate: normalizeInvoiceDate\(row\?\.due_date\)/)
assert.match(invoiceDate, /taxRate: parsedDescription\.taxRate/)
assert.match(invoiceDate, /taxRate: taxRate === undefined/)
assert.match(dateComponent, /placeholder="MM\/DD\/YYYY"/)
assert.match(dateComponent, /type="date"/)
assert.match(detail, /<InvoiceLineItemsEditor isEditing=\{isEditingInvoice\} canEditDraftLineItems=\{canEditDraftLineItems\}/)
assert.match(detail, /canEditDraftInvoiceLineItems\(resolvedInvoice, \{ displayStatus: presentationStatus, archived: isArchived \}\)/)
assert.match(detail, /hasMeaningfulEstimateFormattedText/)
assert.match(detail, /invoice-edit-tax-rate/)
assert.match(modal, /defaultTaxRate/)
assert.match(pdf, /formatInvoiceCalendarDate\(value, language\)/)
assert.match(list, /formatInvoiceCalendarDate\(value, language\)/)
assert.match(badge, /getDocumentStatusTone/)
assert.match(badge, /'partially paid'.*return 'warning'/)
assert.match(badge, /'overdue'.*return 'danger'/)

console.log('Invoice editor/document consistency checks passed.')

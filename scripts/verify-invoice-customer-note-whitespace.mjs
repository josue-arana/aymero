import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { getInvoiceCustomerNoteForEditing, resolveInvoiceCustomerNote, sanitizeCustomerFacingInvoiceNote } from '../src/utils/invoiceCustomerNotes.js'
import { hydrateInvoiceRecord } from '../src/utils/invoiceRecords.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

function simulateSequentialTyping(initialInvoice, typedText) {
  let invoice = initialInvoice
  let typed = ''

  for (const character of typedText) {
    const controlledValue = getInvoiceCustomerNoteForEditing(invoice)
    assert.equal(controlledValue, typed, 'controlled input value must survive each render before the next keystroke')
    typed += character
    invoice = { ...invoice, customerNotes: typed }
    assert.equal(getInvoiceCustomerNoteForEditing(invoice), typed, `keystroke ${JSON.stringify(character)} must be preserved`)
  }

  return { invoice, typed }
}

for (const phrase of [
  'Thank you for your business',
  'Gracias por su preferencia',
  'Thank  you for your business',
  'First line\nSecond line\n',
]) {
  const { invoice, typed } = simulateSequentialTyping({ customerNotes: '' }, phrase)
  assert.equal(getInvoiceCustomerNoteForEditing(invoice), typed)
  assert.equal(resolveInvoiceCustomerNote(invoice), typed)
  assert.equal(sanitizeCustomerFacingInvoiceNote(typed), typed)
}

const legacy = getInvoiceCustomerNoteForEditing({ notes: 'Thank you for your business\nsample_data_key: internal' })
assert.equal(legacy, 'Thank you for your business')
const creationModal = read('../src/components/invoices/InvoiceCreationModal.jsx')
assert.match(creationModal, /onChange=\{\(event\) => setCustomerNotes\(event\.target\.value\)\}/)

const pdfTemplate = read('../src/components/invoices/InvoicePdfTemplate.jsx')
assert.match(pdfTemplate, /resolveInvoiceCustomerNote\(invoice\)/)
assert.match(pdfTemplate, /whitespace-pre-line break-words/)

const storage = new Map()
const priorWindow = globalThis.window
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
}

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })

try {
  const localInvoices = await server.ssrLoadModule('/src/services/local/invoicesLocalService.js')
  const contractorId = 'note-whitespace-fixture'
  const invoiceId = 'invoice-note-whitespace-fixture'
  const savedNote = 'Thank you for your business.\nWe appreciate your trust.\n'
  const fixture = {
    id: invoiceId,
    contractorId,
    status: 'Draft',
    amount: 725,
    subtotal: 680,
    taxAmount: 45,
    taxRate: 6.617647,
    issueDate: '2026-11-03',
    dueDate: '2026-11-17',
    description: 'Invoice metadata stays intact',
    customerNotes: '',
  }
  storage.set(`contractorflow.invoices:${contractorId}`, JSON.stringify([fixture]))

  const saveResult = await localInvoices.update(invoiceId, { customerNotes: savedNote }, { contractorId })
  assert.equal(saveResult.error, null)
  const reloadResult = await localInvoices.getById(invoiceId, { contractorId })
  const reloadedInvoice = hydrateInvoiceRecord(reloadResult.data)
  assert.equal(reloadedInvoice.customerNotes, savedNote)
  assert.equal(resolveInvoiceCustomerNote(reloadedInvoice), savedNote)
  assert.equal(reloadedInvoice.amount, fixture.amount)
  assert.equal(reloadedInvoice.subtotal, fixture.subtotal)
  assert.equal(reloadedInvoice.taxAmount, fixture.taxAmount)
  assert.equal(reloadedInvoice.taxRate, fixture.taxRate)
  assert.equal(reloadedInvoice.issueDate, fixture.issueDate)
  assert.equal(reloadedInvoice.dueDate, fixture.dueDate)
  assert.equal(reloadedInvoice.status, fixture.status)
  assert.equal(reloadedInvoice.description, fixture.description)

  console.log('Invoice customer note whitespace verification passed.')
} finally {
  await server.close()
  if (priorWindow === undefined) delete globalThis.window
  else globalThis.window = priorWindow
}

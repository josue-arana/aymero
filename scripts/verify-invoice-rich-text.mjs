import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calculateInvoiceTotal, hydrateInvoiceRecord, sanitizeInvoiceLineItemsForStorage } from '../src/utils/invoiceRecords.js'
import { normalizeEstimateRichText } from '../src/utils/estimateDocument.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const plainLineItems = sanitizeInvoiceLineItemsForStorage([
  { description: 'Existing invoice description with its original spacing. ', amount: 125 },
])
assert.equal(plainLineItems[0].description, 'Existing invoice description with its original spacing.')
assert.equal(plainLineItems[0].amount, 125)

const richDescription = [
  '[[aymero-size:small]]First paragraph with **bold** and ++underline++.',
  '',
  'Second paragraph.',
  '- **Bullet item**',
  '[[aymero-size:large]]Larger text',
].join('\n')
const storedItems = sanitizeInvoiceLineItemsForStorage([
  { description: richDescription, amount: 50 },
  { description: 'Another item', amount: 75.25 },
])
assert.equal(storedItems[0].description, richDescription)
assert.equal(calculateInvoiceTotal(storedItems), 125.25)

const formatted = normalizeEstimateRichText(storedItems[0].description)
assert.equal(formatted.blocks[0].type, 'paragraph')
assert.equal(formatted.blocks[0].size, 'small')
assert.ok(formatted.blocks[0].segments.some((segment) => segment.bold && segment.text === 'bold'))
assert.ok(formatted.blocks[0].segments.some((segment) => segment.underline && segment.text === 'underline'))
assert.ok(formatted.blocks.some((block) => block.type === 'lineBreak'))
assert.ok(formatted.blocks.some((block) => block.type === 'bulletList' && block.items[0].segments.some((segment) => segment.bold)))
assert.ok(formatted.blocks.some((block) => block.type === 'paragraph' && block.size === 'large'))

const hostile = sanitizeInvoiceLineItemsForStorage([{
  description: '<script>alert(1)</script><img src=x onerror=alert(1)>Safe text javascript:alert(1)',
  amount: 10,
}])[0].description
assert.doesNotMatch(hostile, /<script|<img|onerror|javascript:/i)
assert.match(hostile, /Safe text/)

const reloaded = hydrateInvoiceRecord({
  id: 'invoice-rich-text',
  amount: 125.25,
  lineItems: storedItems,
})
assert.equal(reloaded.lineItems[0].description, richDescription)
assert.equal(reloaded.lineItems[1].amount, 75.25)
assert.equal(reloaded.amount, 125.25)

for (const translations of [en, es]) {
  for (const key of ['bold', 'underline', 'toggleBulletList', 'decreaseTextSize', 'increaseTextSize', 'currentTextSize']) {
    assert.ok(translations[key], `Missing invoice formatting label ${key}`)
  }
}

const [modal, detailPage, template, invoiceService, localService, schema, pdfUtility, stylesheet] = await Promise.all([
  readSource('../src/components/invoices/InvoiceCreationModal.jsx'),
  readSource('../src/pages/InvoiceDetailPage.jsx'),
  readSource('../src/components/invoices/InvoicePdfTemplate.jsx'),
  readSource('../src/services/supabase/invoicesSupabaseService.js'),
  readSource('../src/services/local/invoicesLocalService.js'),
  readSource('../supabase/schema.sql'),
  readSource('../src/utils/invoicePdf.js'),
  readSource('../src/components/invoices/invoiceDocument.css'),
])

assert.match(modal, /LightweightFormattedTextarea/)
assert.match(modal, /lineItems\.\$\{index\}\.description/)
assert.match(detailPage, /LightweightFormattedTextarea/)
assert.match(detailPage, /type="text"[\s\S]*?inputMode="decimal"[\s\S]*?updateLineItem\(index, 'amount'/)
assert.match(template, /EstimateFormattedText/)
assert.doesNotMatch(template, /dangerouslySetInnerHTML/)
assert.match(template, /displayLineItems\.length > 1 \? <span/)
assert.match(template, /font-normal leading-\[1\.45\]/)
assert.doesNotMatch(stylesheet, /font-weight:\s*700/)
assert.match(modal, /type="text" inputMode="decimal"/)
assert.match(detailPage, /type="text"[\s\S]*?inputMode="decimal"[\s\S]*?self-start/)
assert.match(modal, /items-start[\s\S]*?sm:grid-cols-\[minmax\(0,1fr\)_10rem_auto\]/)
assert.match(invoiceService, /sanitizeInvoiceLineItemsForStorage\(lineItemsInput\)/)
assert.match(localService, /sanitizeInvoiceLineItemsForStorage\(updates\.lineItems\)/)
assert.match(schema, /line_items jsonb not null default '\[\]'::jsonb/)
assert.match(pdfUtility, /\.invoice-document-table tr/)
assert.match(stylesheet, /break-inside: avoid/)

console.log('Invoice rich-text description verification passed.')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'
import { buildCustomerDeliveryContent, getCustomerDeliveryAvailability } from '../src/utils/customerDelivery.js'
import { createInvoicePublicShareToken, normalizeInvoicePublicShareToken } from '../src/utils/invoiceShareToken.js'
import { resolveHostnameRoute } from '../src/utils/hostnameRouting.js'

const dictionaries = { en, es }
const translate = (language) => (key, params = {}) => Object.entries(params).reduce(
  (value, [name, replacement]) => String(value).replaceAll(`{{${name}}}`, replacement),
  dictionaries[language][key],
)
const token = 'c'.repeat(64)
const link = `https://portal.aymero.co/invoice/${token}`

assert.equal(normalizeInvoicePublicShareToken(token), token)
assert.equal(normalizeInvoicePublicShareToken('invoice-123'), '')
const generated = createInvoicePublicShareToken({ getRandomValues: (bytes) => { bytes.fill(31); return bytes } })
assert.equal(generated.length, 64)
assert.equal(normalizeInvoicePublicShareToken(generated), generated)

for (const language of ['en', 'es']) {
  const content = buildCustomerDeliveryContent({
    documentType: 'invoice',
    customerName: 'Abe Kim',
    projectTitle: 'Railing',
    invoiceNumber: 'INV-2026-001',
    amountValue: '$1,625.00',
    dueDate: 'November 20, 2026',
    documentLink: link,
    contentT: translate(language),
  })
  assert.ok(content.smsBody.includes(link))
  assert.ok(content.emailBody.includes(link))
  assert.ok(content.smsBody.includes('$1,625.00'))
  assert.ok(content.smsBody.includes('INV-2026-001'))
  assert.ok(content.emailBody.includes('November 20, 2026'))

  const noLink = buildCustomerDeliveryContent({
    documentType: 'invoice', customerName: 'Abe Kim', projectTitle: 'Railing', amountValue: '$1,625', contentT: translate(language),
  })
  assert.equal(noLink.smsBody, '')
  assert.equal(noLink.emailBody, '')
  assert.deepEqual(getCustomerDeliveryAvailability({
    documentType: 'invoice', phone: '5551234567', email: 'abe@example.com', documentLink: '',
  }), { requiresClientLink: true, hasRequiredClientLink: false, text: false, email: false })
}

const origins = { site: 'https://aymero.co', app: 'https://app.aymero.co', portal: 'https://portal.aymero.co', auth: 'https://auth.aymero.co' }
assert.equal(resolveHostnameRoute({ hostname: 'portal.aymero.co', pathname: `/invoice/${token}`, origins }).action, 'public-invoice')
assert.equal(resolveHostnameRoute({ hostname: 'app.aymero.co', pathname: `/invoice/${token}`, origins }).target, `https://portal.aymero.co/invoice/${token}`)

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const endpoint = read('../supabase/functions/super-endpoint/index.ts')
const migration = read('../supabase/migrations/20261104090000_add_invoice_public_share_tokens.sql')
const service = read('../src/services/supabase/invoicesSupabaseService.js')
const modal = read('../src/components/common/SendToCustomerModal.jsx')
const publicPage = read('../src/pages/PublicInvoicePage.jsx')
const listPage = read('../src/pages/InvoicesPage.jsx')
const detailPage = read('../src/pages/InvoiceDetailPage.jsx')

assert.match(endpoint, /resource === 'invoice'/)
assert.match(endpoint, /\.eq\('public_share_token', token\)/)
assert.match(endpoint, /\.in\('status', \['sent', 'partial', 'paid', 'overdue'\]\)/)
assert.match(endpoint, /\.is\('archived_at', null\)/)
assert.match(endpoint, /\.eq\('contractor_id', contractorId\)/)
assert.match(endpoint, /invoice_id', invoiceRow\.id/)
assert.match(endpoint, /linkedPaymentHistory\.length \? linkedPaymentHistory : legacyPaymentHistory/)
assert.match(endpoint, /const amountPaid = Number\(invoiceRow\.amount_paid \|\| 0\)/)
assert.match(endpoint, /new Set\(linkedClientIds\)\.size > 1/)
assert.doesNotMatch(endpoint, /console\.(?:log|error)\([^\n]*token/i)
assert.match(endpoint, /customerNotes: invoiceRow\.customer_notes/)
assert.doesNotMatch(endpoint, /publicInvoice\s*=\s*\{[^}]*public_share_token/s)
assert.match(migration, /add column if not exists public_share_token text/)
assert.match(migration, /create unique index if not exists invoices_public_share_token_idx/)
assert.doesNotMatch(migration, /update public\.invoices|delete from|drop table/i)
assert.match(service, /publicShareToken:\s*row\?\.public_share_token/)
assert.match(service, /payload\.public_share_token = publicShareToken \|\| null/)
assert.match(modal, /documentType !== 'invoice'/)
assert.match(modal, /onMarkSent\(\)/)
assert.match(modal, /!canPrepareInvoiceMessage/)
assert.match(modal, /invoiceMessagePreparationNote/)
assert.match(modal, /onSent\?\.\('text'\)/)
assert.match(modal, /onSent\?\.\('email'\)/)
assert.match(listPage, /ensureInvoicePublicShare/)
assert.match(listPage, /phone: sendInvoiceClient\?\.phone \|\| sendInvoiceLead\?\.phone/)
assert.match(detailPage, /clientRecord\?\.phone, lead\?\.phone/)
assert.match(listPage, /onMarkSent=\{markSelectedInvoiceSent\}/)
assert.match(detailPage, /onMarkSent=\{markCurrentInvoiceSent\}/)
assert.doesNotMatch(listPage, /onSent=\{async/)
assert.doesNotMatch(detailPage, /onSent=\{async/)
assert.match(publicPage, /InvoicePdfTemplate/)
assert.match(publicPage, /downloadInvoicePdf/)

assert.ok(en.invoiceClientLinkHelp && es.invoiceClientLinkHelp)
assert.ok(en.invoiceMessagePreparationNote && es.invoiceMessagePreparationNote)
assert.ok(en.markInvoiceSent && es.markInvoiceSent)
assert.ok(en.invoiceMarkSentBeforePrepare && es.invoiceMarkSentBeforePrepare)

console.log('Invoice public-sharing validation passed.')

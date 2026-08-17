import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_BRAND_COLOR,
  getReadableBrandTextColor,
  normalizeBrandColor,
  resolveDocumentBrandTokens,
} from '../src/data/brandColors.js'

const customTokens = resolveDocumentBrandTokens({ primaryColor: '#c2410c' })
assert.equal(customTokens.accentColor, '#C2410C')
assert.equal(customTokens.accentTextColor, getReadableBrandTextColor('#C2410C'))
assert.deepEqual(resolveDocumentBrandTokens({ primary_color: 'teal' }), {
  accentColor: '#0F8B8D',
  accentTextColor: getReadableBrandTextColor('#0F8B8D'),
})
assert.equal(resolveDocumentBrandTokens({}).accentColor, DEFAULT_BRAND_COLOR)
assert.equal(resolveDocumentBrandTokens({ primaryColor: 'malformed-color' }).accentColor, DEFAULT_BRAND_COLOR)
assert.equal(resolveDocumentBrandTokens({ primaryColor: '#059669' }).accentColor, normalizeBrandColor('#059669'))

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const estimateTemplate = read('../src/components/estimates/EstimatePdfTemplate.jsx')
const contractTemplate = read('../src/components/contracts/ContractPdfTemplate.jsx')
const invoiceTemplate = read('../src/components/invoices/InvoicePdfTemplate.jsx')
const estimatePdf = read('../src/utils/estimatePdf.js')
const contractPdf = read('../src/utils/contractPdf.js')
const invoicePreview = read('../src/components/invoices/InvoiceDocumentPreview.jsx')
const invoiceDetail = read('../src/pages/InvoiceDetailPage.jsx')

for (const source of [estimateTemplate, contractTemplate, invoiceTemplate, estimatePdf, contractPdf]) {
  assert.match(source, /resolveDocumentBrandTokens/)
}

assert.match(invoiceTemplate, /data-invoice-accent-color=\{accentColor\}/)
assert.match(invoiceTemplate, /--invoice-accent-color/)
assert.match(invoiceTemplate, /--invoice-accent-text-color/)
assert.doesNotMatch(invoiceTemplate, /#0f8b8d/i)
assert.match(invoicePreview, /company=\{company\}/)
assert.match(invoiceDetail, /company=\{displayCompany\}/)
assert.match(invoiceDetail, /element: invoiceDocumentRef\.current/)
assert.match(invoiceDetail, /printDocumentElement\(invoiceDocumentRef\.current/)

console.log('Document branding validation passed.')

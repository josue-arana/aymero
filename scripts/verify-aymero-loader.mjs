import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const componentSource = read('../src/components/common/AymeroLoader.jsx')
const styleSource = read('../src/components/common/aymeroLoader.css')
const publicEstimateSource = read('../src/pages/PublicEstimatePage.jsx')
const publicPortalSource = read('../src/pages/CustomerPortalPage.jsx')
const printSource = read('../src/utils/printDocument.js')
const invoicePreviewSource = read('../src/components/invoices/InvoiceDocumentPreview.jsx')

for (const variant of ['page', 'section', 'inline', 'document']) {
  assert.match(componentSource, new RegExp(`['"]${variant}['"]`))
  assert.match(styleSource, new RegExp(`aymero-loader--${variant}`))
}

assert.match(componentSource, /role="status"/)
assert.match(componentSource, /aria-live="polite"/)
assert.match(componentSource, /BrandLogo/)
assert.match(styleSource, /prefers-reduced-motion:\s*reduce/)
assert.match(styleSource, /@media print[\s\S]*\[data-aymero-loader\][\s\S]*display:\s*none\s*!important/)
assert.match(publicEstimateSource, /<AymeroLoader[\s\S]*variant="page"/)
assert.match(publicPortalSource, /<AymeroLoader[\s\S]*variant="page"/)
assert.match(invoicePreviewSource, /<AymeroLoader variant="document"/)
assert.match(printSource, /querySelectorAll\?\.\('\[data-aymero-loader\]'\)/)
assert.match(printSource, /\[data-print-loading="true"\], \[data-print-action="true"\] \{ display: none !important; \}/)
assert.doesNotMatch(publicEstimateSource, /animate-spin/)
assert.doesNotMatch(publicPortalSource, /client-portal-loader/)
assert.doesNotMatch(invoicePreviewSource, /LoaderCircle|animate-spin/)

console.log('AymeroLoader architecture validation passed.')

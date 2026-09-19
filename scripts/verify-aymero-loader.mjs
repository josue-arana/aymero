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
const appSource = read('../src/App.jsx')
const collectionPageSources = [
  read('../src/pages/LeadsPage.jsx'),
  read('../src/pages/ClientsPage.jsx'),
  read('../src/pages/EstimatesPage.jsx'),
  read('../src/pages/ContractsPage.jsx'),
  read('../src/pages/InvoicesPage.jsx'),
  read('../src/pages/CalendarPage.jsx'),
]
const jobsSource = read('../src/pages/JobsPage.jsx')
const projectDetailSource = read('../src/pages/ProjectDetailPage.jsx')
const portalSummarySource = read('../src/components/portal/PortalSummary.jsx')
const hostnameBoundarySource = read('../src/components/routing/HostnameRouteBoundary.jsx')

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
assert.match(appSource, /collectionLoadState/)
assert.match(appSource, /collectionLoadState\.projects/)
for (const pageSource of collectionPageSources) {
  assert.match(pageSource, /isCollectionInitialLoading/)
  assert.match(pageSource, /<AymeroLoader variant="section"/)
}
assert.match(jobsSource, /isCollectionInitialLoading/)
assert.doesNotMatch(jobsSource, /dataProvider\.projects\.list\(/)
assert.match(projectDetailSource, /isLoadingPhotos && galleryPhotos\.length === 0/)
assert.match(portalSummarySource, /isLoadingPhotos && projectPhotos\.length === 0/)
assert.match(hostnameBoundarySource, /<AymeroLoader variant="page"/)

console.log('AymeroLoader architecture validation passed.')

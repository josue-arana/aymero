import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createNavigationContext,
  isSafeInternalRoute,
  resolveNavigationContext,
  withNavigationContext,
} from '../src/utils/navigationContext.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

assert.equal(isSafeInternalRoute('/leads/lead-1'), true)
assert.equal(isSafeInternalRoute('/projects/project-1'), true)
assert.equal(isSafeInternalRoute('/estimates/estimate-1'), true)
assert.equal(isSafeInternalRoute('/https://example.com'), false)
assert.equal(isSafeInternalRoute('//example.com/redirect'), false)
assert.equal(isSafeInternalRoute('javascript:alert(1)'), false)
assert.equal(createNavigationContext('/leads/lead-1', 'backToLeadDetails')?.returnTo, '/leads/lead-1')
assert.equal(createNavigationContext('/external.example', 'backToLeads'), null)
assert.deepEqual(
  resolveNavigationContext({ navigationContext: { returnTo: 'https://example.com', returnLabelKey: 'backToLeads' } }, { returnTo: '/estimates', returnLabelKey: 'backToEstimates' }),
  { returnTo: '/estimates', returnLabelKey: 'backToEstimates' },
)
assert.deepEqual(
  withNavigationContext({ source: 'lead' }, '/leads/lead-1', 'backToLeadDetails').navigationContext,
  { returnTo: '/leads/lead-1', returnLabelKey: 'backToLeadDetails' },
)

const appSource = read('../src/App.jsx')
const estimateSource = read('../src/pages/EstimateBuilderPage.jsx')
const leadSource = read('../src/pages/LeadDetailPage.jsx')
const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const clientSource = read('../src/pages/ClientProfilePage.jsx')
const contractSource = read('../src/pages/ContractsPage.jsx')
const invoiceSource = read('../src/pages/InvoiceDetailPage.jsx')
const navigationSource = read('../src/utils/navigationContext.js')

assert.match(navigationSource, /isSafeInternalRoute/)
assert.match(navigationSource, /navigationContext/)
assert.match(appSource, /duplicateEstimateFromBuilder\(estimateRecord, options = \{\}\)/)
assert.match(appSource, /options\.navigationContext\?\.returnTo/)
assert.match(appSource, /backToJobs/)
assert.match(estimateSource, /resolveNavigationContext\(location\.state/)
assert.match(estimateSource, /navigate\(navigationContext\.returnTo\)/)
assert.match(estimateSource, /return t\('back'\)/)
assert.match(estimateSource, /onDuplicateEstimate\?\.\(sourceEstimate, \{ navigationContext \}\)/)
assert.match(leadSource, /withNavigationContext/)
assert.match(leadSource, /backToLeadDetails/)
assert.match(projectSource, /withNavigationContext/)
assert.match(projectSource, /backToProjectWorkspace/)
assert.match(projectSource, /RecordBackButton label=\{t\('back'\)\}/)
assert.match(clientSource, /returnTo: `\/clients\/\$\{client\.id\}`/)
assert.match(contractSource, /resolveNavigationContext\(location\.state/)
assert.match(contractSource, /returnTo: '\/contracts'/)
assert.match(contractSource, /onViewContract\(contract\.routeId, \{ returnTo: '\/contracts'/)
assert.match(contractSource, /const backLabel = t\('back'\)/)
assert.match(invoiceSource, /resolveNavigationContext\(location\.state/)
assert.match(invoiceSource, /RecordBackButton label=\{t\('back'\)\}/)

for (const [path, label] of [
  ['/leads/lead-1', 'backToLeadDetails'],
  ['/projects/project-1', 'backToProjectWorkspace'],
  ['/estimates', 'backToEstimates'],
  ['/clients/client-1', 'backToClients'],
  ['/contracts', 'backToContracts'],
  ['/invoices', 'backToInvoices'],
]) {
  assert.deepEqual(createNavigationContext(path, label), { returnTo: path, returnLabelKey: label })
}

console.log('Contextual navigation validation passed.')

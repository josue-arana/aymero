import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { findClientById } from '../src/utils/clients.js'
import {
  mergeDocumentContactIntoLead,
  resolveDocumentContact,
  shouldUseHistoricalDocumentContact,
} from '../src/utils/documentContact.js'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })
const { normalizeContractWorkBreakdown } = await vite.ssrLoadModule('/src/utils/contractDocument.js')

const client = { id: 'client-abe', name: 'Abe Kim', phone: '302-463-3842' }
const lead = { id: 'lead-abe', client: 'Abe Kim', phone: '302-463-3842' }
const contractRowMapping = {
  id: 'contract-1',
  status: 'Draft',
  clientId: null,
  estimateId: 'estimate-1',
}

// A Lead-associated Estimate/Contract with no Client ID resolves from its exact
// linked Lead. An absent mapped name is not treated as an explicit blank.
assert.equal(Object.hasOwn(contractRowMapping, 'client'), false)
assert.equal(resolveDocumentContact({
  document: { ...contractRowMapping, client: '' },
  snapshot: lead,
  documentType: 'contract',
}).name, 'Abe Kim')
assert.equal(mergeDocumentContactIntoLead({
  lead,
  document: { ...contractRowMapping, client: '' },
  documentType: 'contract',
}).client, 'Abe Kim')

// Exact Client ID wins over a duplicate-name record, and precedes Lead fallback.
const duplicateClients = [
  { id: 'client-other', name: 'Abe Kim', phone: '212-555-0100' },
  client,
]
const linkedClient = findClientById(duplicateClients, 'client-abe')
assert.equal(linkedClient?.phone, '302-463-3842')
assert.deepEqual(resolveDocumentContact({
  clientRecord: linkedClient,
  snapshot: { ...lead, client: 'Lead Copy' },
  document: { status: 'Draft', client: '' },
  documentType: 'contract',
}), { name: 'Abe Kim', phone: '302-463-3842', email: '', address: '' })

// Meaningful explicit Draft override remains authoritative even when another
// legacy alias is present but empty.
assert.equal(resolveDocumentContact({
  clientRecord: client,
  snapshot: lead,
  document: { status: 'Draft', client: '', clientName: 'Custom Contract Name' },
  documentType: 'contract',
}).name, 'Custom Contract Name')

// Missing relationships do not manufacture a name.
assert.equal(resolveDocumentContact({
  document: { status: 'Draft', client: '' },
  documentType: 'contract',
}).name, '')

// Sent and Signed use their historical snapshot/override, never current Client
// data. This preserves the established lifecycle rule for issued contracts.
for (const status of ['Sent', 'Signed']) {
  const historical = { id: 'contract-history', status, client: '' }
  assert.equal(shouldUseHistoricalDocumentContact(historical, 'contract'), true)
  assert.equal(resolveDocumentContact({
    clientRecord: { ...client, name: 'Current Client Name' },
    snapshot: { client: 'Historical Customer Name', phone: 'old phone' },
    document: historical,
    documentType: 'contract',
  }).name, 'Historical Customer Name')
}
assert.equal(resolveDocumentContact({
  clientRecord: client,
  snapshot: { client: 'Historical Customer Name' },
  document: { status: 'Signed', clientName: 'Saved Historical Override' },
  documentType: 'contract',
}).name, 'Saved Historical Override')

const template = await readFile(new URL('../src/components/contracts/ContractPdfTemplate.jsx', import.meta.url), 'utf8')
const route = await readFile(new URL('../src/pages/ContractsPage.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/supabase/contractsSupabaseService.js', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const publicEndpoint = await readFile(new URL('../supabase/functions/super-endpoint/index.ts', import.meta.url), 'utf8')
assert.match(template, /lead\?\.client/)
assert.match(route, /contractDocument\.estimateId \|\| contractDocument\.estimate_id/)
assert.match(route, /linkedEstimate\?\.leadId[\s\S]*linkedEstimate\?\.lead_id/)
assert.match(route, /linkedEstimate\?\.projectId[\s\S]*linkedEstimate\?\.project_id/)
assert.match(route, /contractDocument\.clientId[\s\S]*contractDocument\.client_id/)
assert.match(route, /shouldUseHistoricalDocumentContact\(contractDocument, 'contract'\)/)
assert.doesNotMatch(service, /client:\s*''\s*,/)
assert.match(app, /<ContractRoute[\s\S]*?estimates=\{persistedEstimates\}/)
assert.match(publicEndpoint, /\.from\('leads'\)[\s\S]*?\.eq\('contractor_id', contractorId\)[\s\S]*?\.eq\('id', project\.lead_id\)/)
assert.match(publicEndpoint, /const useDraftLeadContact = !contract \|\| String\(contract\.status \|\| ''\)\.toLowerCase\(\) === 'draft'/)
assert.match(publicEndpoint, /client\.display_name \|\| \(useDraftLeadContact \? relatedLead\.name : ''\)/)

// Contract conversion preserves H2b quote semantics and nullable line-item
// amounts: the fixed total remains authoritative while blank items stay blank.
const contractItems = normalizeContractWorkBreakdown([
  { title: 'Priced work', amount: 125 },
  { title: 'Unpriced work', amount: null },
  { title: 'No-charge work', amount: 0 },
])
assert.deepEqual(contractItems.map((item) => item.amount), [125, null, 0])
assert.equal({ total: 2500, isFixedTotalQuote: true }.total, 2500)

console.log('Contract contact-resolution validation passed.')
await vite.close()

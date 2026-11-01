import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { findClientById } from '../src/utils/clients.js'
import { mergeDocumentContactIntoLead } from '../src/utils/documentContact.js'

const estimateRow = { id: 'estimate-lead-without-price', total_amount: null }
const mappedEstimate = { id: estimateRow.id, status: 'Draft', clientId: 'client-abe', leadId: 'lead-abe', client: '', total: null }
const canonicalClient = {
  id: 'client-abe',
  name: 'Abe Kim',
  displayName: 'Abe Kim',
  phone: '410-555-0142',
}
const canonicalLead = {
  id: 'lead-abe',
  clientId: canonicalClient.id,
  client: 'Abe Kim',
  phone: canonicalClient.phone,
}

// Supabase Estimate rows do not store a client name; the mapper's empty `client`
// field must not mask the canonical name resolved by the related Client/Lead.
assert.equal(mappedEstimate.client, '')
assert.equal(mappedEstimate.total, null)
const clientEstimateContact = mergeDocumentContactIntoLead({
  lead: canonicalLead,
  clientRecord: canonicalClient,
  document: mappedEstimate,
  documentType: 'estimate',
})
assert.equal(clientEstimateContact.client, 'Abe Kim')
assert.equal(clientEstimateContact.phone, '410-555-0142')

// Lead-associated Estimates without a Client ID use only their directly related Lead.
const leadOnlyEstimate = { ...mappedEstimate, clientId: null }
const leadOnlyContact = mergeDocumentContactIntoLead({
  lead: { id: 'lead-abe', client: 'Abe Kim', phone: '410-555-0142' },
  clientRecord: null,
  document: leadOnlyEstimate,
  documentType: 'estimate',
})
assert.equal(leadOnlyContact.client, 'Abe Kim')
assert.equal(leadOnlyContact.phone, '410-555-0142')

// Project-associated records use the explicitly linked Client, never name matching.
const duplicateNameClients = [
  { id: 'client-other', name: 'Abe Kim', phone: '212-555-0100' },
  canonicalClient,
]
const projectClient = findClientById(duplicateNameClients, 'client-abe')
assert.equal(projectClient?.phone, '410-555-0142')
const projectContact = mergeDocumentContactIntoLead({
  lead: { id: 'project-1', client: '' },
  clientRecord: projectClient,
  document: mappedEstimate,
  documentType: 'estimate',
})
assert.equal(projectContact.client, 'Abe Kim')

// A non-empty document override remains authoritative; an absent relationship
// does not invent a name. Issued documents retain their saved contact snapshot.
const overriddenContact = mergeDocumentContactIntoLead({
  lead: canonicalLead,
  clientRecord: canonicalClient,
  document: { ...mappedEstimate, clientName: 'Document Override' },
  documentType: 'estimate',
})
assert.equal(overriddenContact.client, 'Document Override')
const missingRelationship = mergeDocumentContactIntoLead({
  lead: {},
  clientRecord: null,
  document: mappedEstimate,
  documentType: 'estimate',
})
assert.equal(missingRelationship.client, '')
const issuedSnapshot = mergeDocumentContactIntoLead({
  lead: { client: 'Current Lead Name' },
  clientRecord: canonicalClient,
  document: { status: 'Approved', clientName: 'Abe Kim — Issued Snapshot' },
  documentType: 'estimate',
})
assert.equal(issuedSnapshot.client, 'Abe Kim — Issued Snapshot')
assert.equal(estimateRow.total_amount, null)

const source = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const templateSource = source('../src/components/estimates/EstimatePdfTemplate.jsx')
const builderSource = source('../src/pages/EstimateBuilderPage.jsx')
const publicPageSource = source('../src/pages/PublicEstimatePage.jsx')
const publicFunctionSource = source('../supabase/functions/super-endpoint/index.ts')
const portalSource = source('../src/components/portal/PortalSummary.jsx')
const estimateMapperSource = source('../src/services/supabase/estimatesSupabaseService.js')

assert.match(templateSource, /lead\?\.client/)
assert.match(builderSource, /mergeDocumentContactIntoLead\(\{[\s\S]*?documentType: 'estimate'/)
assert.match(estimateMapperSource, /client: '',/)
assert.match(publicFunctionSource, /client\.display_name \|\| lead\.name \|\| ''/)
assert.match(publicFunctionSource, /\.eq\('contractor_id', contractorId\)/)
assert.match(publicPageSource, /client\.displayName \|\| client\.name \|\| ''/)
assert.match(portalSource, /client\?\.displayName \|\| client\?\.name \|\| project\?\.client/)

console.log('Estimate document contact resolution validation passed.')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import clientsLocalService from '../src/services/local/clientsLocalService.js'
import { isSuccessfulClientUpdateResponse } from '../src/utils/clientPersistence.js'
import { findClientById } from '../src/utils/clients.js'
import { mergeDocumentContactIntoLead, resolveDocumentContact } from '../src/utils/documentContact.js'

const successfulUpdate = await clientsLocalService.update('client-1', { phone: '484-560-1761' })
assert.equal(isSuccessfulClientUpdateResponse(successfulUpdate, 'client-1'), true)
assert.equal(isSuccessfulClientUpdateResponse({ data: null, error: { code: 'NETWORK' } }, 'client-1'), false)
assert.equal(isSuccessfulClientUpdateResponse({ data: null, error: { code: 'CLIENT_UPDATE_NO_ROWS' } }, 'client-1'), false)
assert.equal(isSuccessfulClientUpdateResponse({ data: { id: 'other-client' }, error: null }, 'client-1'), false)

const currentClient = { id: 'client-1', displayName: 'Current Client', phone: '484-560-1761', email: 'current@example.com', address: 'Current address' }
const staleSnapshot = { client: 'Old Client', phone: '410-555-0100', email: 'old@example.com', address: 'Old address' }
const snapshotBeforeHydration = structuredClone(staleSnapshot)

const draftEstimateLead = mergeDocumentContactIntoLead({
  lead: staleSnapshot,
  clientRecord: currentClient,
  document: { id: 'estimate-draft', status: 'Draft' },
  documentType: 'estimate',
})
assert.equal(draftEstimateLead.phone, currentClient.phone)
assert.equal(draftEstimateLead.email, currentClient.email)
assert.equal(draftEstimateLead.client, currentClient.displayName)

const sentEstimateLead = mergeDocumentContactIntoLead({
  lead: staleSnapshot,
  clientRecord: currentClient,
  document: { id: 'estimate-sent', status: 'Sent' },
  documentType: 'estimate',
})
assert.equal(sentEstimateLead.phone, staleSnapshot.phone)
assert.equal(sentEstimateLead.email, staleSnapshot.email)
assert.deepEqual(staleSnapshot, snapshotBeforeHydration)

const draftContractLead = mergeDocumentContactIntoLead({
  lead: staleSnapshot,
  clientRecord: currentClient,
  document: { id: 'contract-draft', status: 'Draft' },
  documentType: 'contract',
})
assert.equal(draftContractLead.phone, currentClient.phone)

const signedContractLead = mergeDocumentContactIntoLead({
  lead: staleSnapshot,
  clientRecord: currentClient,
  document: { id: 'contract-signed', status: 'Signed', signedAt: '2026-10-17T12:00:00Z' },
  documentType: 'contract',
})
assert.equal(signedContractLead.phone, staleSnapshot.phone)

const explicitOverride = resolveDocumentContact({
  clientRecord: currentClient,
  snapshot: staleSnapshot,
  document: { status: 'Draft', clientPhone: '301-555-0199', clientEmail: 'override@example.com' },
  documentType: 'estimate',
})
assert.equal(explicitOverride.phone, '301-555-0199')
assert.equal(explicitOverride.email, 'override@example.com')

assert.equal(resolveDocumentContact({ clientRecord: null, snapshot: staleSnapshot, document: { status: 'Draft' } }).phone, staleSnapshot.phone)
const clearedCurrentClientLead = mergeDocumentContactIntoLead({
  lead: staleSnapshot,
  clientRecord: { ...currentClient, phone: '', email: '' },
  document: { status: 'Draft' },
  documentType: 'estimate',
})
assert.equal(clearedCurrentClientLead.phone, '')
assert.equal(clearedCurrentClientLead.email, '')

const duplicateNameClients = [
  { id: 'client-a', name: 'Same Name', phone: '111' },
  { id: 'client-b', name: 'Same Name', phone: '222' },
]
assert.equal(findClientById(duplicateNameClients, 'client-b')?.phone, '222')
assert.equal(findClientById(duplicateNameClients, ''), null)
assert.equal(findClientById(duplicateNameClients, 'missing-client'), null)

const projectSource = readFileSync(fileURLToPath(new URL('../src/pages/ProjectDetailPage.jsx', import.meta.url)), 'utf8')
const appSource = readFileSync(fileURLToPath(new URL('../src/App.jsx', import.meta.url)), 'utf8')
const estimateSource = readFileSync(fileURLToPath(new URL('../src/pages/EstimateBuilderPage.jsx', import.meta.url)), 'utf8')
const contractSource = readFileSync(fileURLToPath(new URL('../src/pages/ContractsPage.jsx', import.meta.url)), 'utf8')
const clientsSource = readFileSync(fileURLToPath(new URL('../src/utils/clients.js', import.meta.url)), 'utf8')
assert.match(projectSource, /findClientById\(\s*clients,/)
assert.doesNotMatch(projectSource, /findRelatedClient\(clients, baseProject \|\| lead/)
assert.match(appSource, /const linkedProject = findProjectByLookup\(projects, projectId\)/)
assert.match(appSource, /const lead = linkedProject && linkedLead\n\s*\? \{/)
assert.match(estimateSource, /findClientById\(clients, linkedProject\?\.clientId/)
assert.match(contractSource, /findClientById\(\s*clients,\s*linkedProject\?\.clientId/)
assert.doesNotMatch(contractSource, /const clientRecord = findRelatedClient\(clients, lead \|\| \{\}\)/)
assert.match(clientsSource, /export function findClientById\(clients = \[\], clientId = ''\)/)

const clientsServiceSource = readFileSync(fileURLToPath(new URL('../src/services/supabase/clientsSupabaseService.js', import.meta.url)), 'utf8')
assert.match(clientsServiceSource, /prefer: 'return=representation,count=exact'/)
assert.match(clientsServiceSource, /CLIENT_UPDATE_NO_ROWS/)
assert.match(clientsServiceSource, /contractor_id: `eq\.\$\{contractorId\}`/)
assert.match(clientsServiceSource, /phone: row\?\.phone \|\| ''/)
assert.match(clientsServiceSource, /email: normalizeOptionalEmail\(row\?\.email\)/)

console.log('Client save and contact synchronization validation passed.')

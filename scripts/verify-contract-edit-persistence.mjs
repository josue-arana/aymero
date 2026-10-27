import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isSuccessfulContractPersistenceResponse } from '../src/utils/contractPersistence.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const contractsPage = read('../src/pages/ContractsPage.jsx')
const app = read('../src/App.jsx')
const contractTemplate = read('../src/components/contracts/ContractPdfTemplate.jsx')
const contractPdf = read('../src/utils/contractPdf.js')
const contractDocument = read('../src/utils/contractDocument.js')
const contractEditorState = read('../src/utils/contractEditorState.js')
const portalSummary = read('../src/components/portal/PortalSummary.jsx')
const formattedEditor = read('../src/components/estimates/LightweightFormattedTextarea.jsx')
const supabaseContracts = read('../src/services/supabase/contractsSupabaseService.js')
const localContractsSource = read('../src/services/local/contractsLocalService.js')

assert.equal((contractsPage.match(/<ContractSection[^>]*formatted t=\{t\}/g) || []).length, 3)
const payloadSource = contractsPage.match(/function getContractPayload[\s\S]*?async function openContractPrintDialog/)?.[0] || ''
for (const field of ['scope', 'paymentTerms', 'acceptanceLegalText']) {
  assert.match(payloadSource, new RegExp(`\\b${field},`))
}
assert.match(contractsPage, /const persistedContract = await onSaveContract\?\.\(lead\.id, contract\)/)
assert.match(contractsPage, /const canonicalContract = persistedContract \|\| contract/)
assert.match(contractsPage, /setLoadedContract\(canonicalContract\)/)
assert.match(contractEditorState, /scope: hasSavedScope/)
assert.match(contractEditorState, /paymentTerms: hasSavedPaymentTerms/)
assert.match(contractEditorState, /title: savedContract\.title/)
assert.match(portalSummary, /buildContractEditorState/)
assert.match(portalSummary, /scope: contractDocumentState\.scope/)
assert.match(portalSummary, /workBreakdown: contractDocumentState\.workBreakdown/)
assert.match(contractsPage, /await onPersist\?\.\(persistedContract\)/)
assert.match(contractsPage, /if \(stopEditing\) \{\s*setIsEditing\(false\)/)
assert.match(contractsPage, /response\.error\.code\?\.endsWith\('_NO_ROWS'\)/)

assert.match(app, /syncLeadContractState\(leadId, contract, persistedEstimate\)\s*showToast\(t\('contractSaved'\)\)\s*return contract/)
assert.match(contractTemplate, /normalizeEstimateRichText\(scope\)/)
assert.match(contractTemplate, /items, t/)
assert.match(contractPdf, /scope,\s*workBreakdown/)
assert.match(contractPdf, /notesAndTermsItems/)
assert.match(contractDocument, /acceptanceLegalText/)
assert.match(formattedEditor, /serializeEstimateSizedText/)
assert.match(supabaseContracts, /termsInput = serializeTerms\(contract\)/)
assert.match(supabaseContracts, /payload\.scope_of_work = scopeInput \|\| null/)
assert.match(supabaseContracts, /payload\.payment_terms = paymentTermsInput \|\| null/)
assert.match(supabaseContracts, /acceptanceLegalText: acceptanceLegalText \|\| ''/)
assert.match(supabaseContracts, /prefer: 'return=representation,count=exact'/)
assert.match(supabaseContracts, /createNoRowsError\('create', contractData\?\.id \|\| null, response\)/)
assert.match(supabaseContracts, /createNoRowsError\('update', id, response\)/)
assert.match(localContractsSource, /writeLinkedContractDrafts\(nextContract, nextContract\)/)

assert.equal(isSuccessfulContractPersistenceResponse({ data: [{ id: 'contract-1' }], count: 1 }), true)
assert.equal(isSuccessfulContractPersistenceResponse({ data: [{ id: 'contract-1' }], count: 0 }), false)
assert.equal(isSuccessfulContractPersistenceResponse({ data: [], count: 0 }), false)

console.log('Contract edit-persistence verification passed.')

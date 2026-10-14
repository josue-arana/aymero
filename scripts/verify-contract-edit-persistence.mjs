import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const contractsPage = read('../src/pages/ContractsPage.jsx')
const app = read('../src/App.jsx')
const contractTemplate = read('../src/components/contracts/ContractPdfTemplate.jsx')
const contractPdf = read('../src/utils/contractPdf.js')
const contractDocument = read('../src/utils/contractDocument.js')
const formattedEditor = read('../src/components/estimates/LightweightFormattedTextarea.jsx')
const supabaseContracts = read('../src/services/supabase/contractsSupabaseService.js')
const localContracts = read('../src/services/local/contractsLocalService.js')

assert.equal((contractsPage.match(/<ContractSection[^>]*formatted t=\{t\}/g) || []).length, 3)
const payloadSource = contractsPage.match(/function getContractPayload[\s\S]*?async function openContractPrintDialog/)?.[0] || ''
for (const field of ['scope', 'paymentTerms', 'acceptanceLegalText']) {
  assert.match(payloadSource, new RegExp(`\\b${field},`))
}
assert.match(contractsPage, /const persistedContract = await onSaveContract\?\.\(lead\.id, contract\)/)
assert.match(contractsPage, /const canonicalContract = persistedContract \|\| contract/)
assert.match(contractsPage, /setLoadedContract\(canonicalContract\)/)
assert.match(contractsPage, /scope: savedContract\.scope \|\| savedContract\.scopeOfWork \|\| estimate\.summary/)
assert.match(contractsPage, /await onPersist\?\.\(persistedContract\)/)
assert.match(contractsPage, /if \(stopEditing\) \{\s*setIsEditing\(false\)/)

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
assert.match(localContracts, /writeLinkedContractDrafts\(nextContract, nextContract\)/)

console.log('Contract edit-persistence verification passed.')

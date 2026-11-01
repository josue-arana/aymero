import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getContractCreationLookupIds } from '../src/utils/contractCreationContext.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const app = read('../src/App.jsx')
const estimateBuilder = read('../src/pages/EstimateBuilderPage.jsx')
const contractsPage = read('../src/pages/ContractsPage.jsx')
const contractEditorState = read('../src/utils/contractEditorState.js')
const contractService = read('../src/services/supabase/contractsSupabaseService.js')
const localContractService = read('../src/services/local/contractsLocalService.js')
const contractTemplate = read('../src/components/contracts/ContractPdfTemplate.jsx')
const contractPdf = read('../src/utils/contractPdf.js')

assert.deepEqual(
  getContractCreationLookupIds({
    leadId: 'estimate-generated-lead',
    estimate: { id: 'estimate-1', projectId: 'project-1' },
  }),
  ['estimate-generated-lead', 'project-1'],
  'Estimate conversion must resolve a project when the UI lead is synthetic'
)
assert.deepEqual(
  getContractCreationLookupIds({
    leadId: 'estimate-generated-lead',
    estimate: { lead_id: 'lead-1', project_id: 'project-1' },
  }),
  ['estimate-generated-lead', 'lead-1', 'project-1'],
  'Estimate conversion must support both app and persisted relationship field names'
)

assert.match(estimateBuilder, /onConvertEstimate\?\.\(lead\.id, estimate\)/)
assert.match(app, /getContractCreationLookupIds\(\{ leadId, estimate: estimateInput \}\)/)
assert.match(app, /findLeadByProjectLookup\(leads, creationLookupIds\)/)
assert.match(app, /findProjectByLookup\(\s*persistedProjects,\s*creationLookupIds/)
assert.match(app, /Contract creation stopped before persistence because its lead\/project could not be resolved/)
assert.match(app, /showToast\(t\('contractRequiresRealProject'\), 'error'\)/)
assert.match(app, /await dataProvider\.contracts\.create\(contractPayload/)
assert.match(app, /if \(response\?\.error\) \{[\s\S]*?showToast\(t\('contractSaveFailed'\), 'error'\)/)

assert.match(contractsPage, /const \[contractTitle, setContractTitle\] = useState\(editorState\.title\)/)
assert.match(contractsPage, /title: contractTitle\.trim\(\)/)
assert.match(contractsPage, /value=\{contractTitle\}/)
assert.match(contractsPage, /contractTitle=\{contractTitle\}/)
assert.match(contractEditorState, /title: savedContract\.title \|\| savedContract\.projectTitle/)
assert.match(contractService, /payload\.title = titleInput \|\| 'Contract'/)
assert.match(localContractService, /\.\.\.contractData,/)
assert.match(contractTemplate, /contractTitle = ''/)
assert.match(contractPdf, /contractTitle = ''/)

console.log('Contract creation regression verification passed.')

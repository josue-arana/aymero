import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canCreateContractFromEstimate } from '../src/utils/estimateFinalization.js'
import { resolveLeadLifecycle } from '../src/utils/leadLifecycle.js'
import { leadPipelineStages } from '../src/utils/leadPipeline.js'
import { selectEstimateForProject } from '../src/services/estimateSelectionService.js'
import { calculateProjectPaymentSummary } from '../src/utils/projectPayments.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

for (const status of ['Draft', 'Saved', 'Sent', 'Approved']) {
  assert.equal(canCreateContractFromEstimate(status), true)
}
for (const status of ['Rejected', 'Converted to Contract']) {
  assert.equal(canCreateContractFromEstimate(status), false)
}

const project = { id: 'project-1', clientId: 'client-1', contractorId: 'contractor-1', selectedEstimateId: null }
const estimateA = { id: 'estimate-a', projectId: project.id, contractorId: 'contractor-1', optionName: 'Pressure-Treated Wood', number: 'EST-001', total: 8500, status: 'Draft' }
const estimateB = { id: 'estimate-b', projectId: project.id, contractorId: 'contractor-1', optionName: 'Trex Composite', number: 'EST-002', total: 12000, status: 'Sent' }
const selection = await selectEstimateForProject(project, estimateB, {
  contractorId: 'contractor-1',
  estimates: [estimateA, estimateB],
  updateProject: async (id, updates) => ({ data: { id, ...updates }, error: null }),
})
assert.equal(selection.error, null)
assert.equal(selection.data.selectedEstimateId, estimateB.id)

const draftLead = {
  id: 'lead-1',
  clientId: 'client-1',
  projectId: project.id,
  projectTitle: 'Deck',
  portal: { estimate: { ...estimateA } },
}
const draftLifecycle = resolveLeadLifecycle({
  lead: draftLead,
  estimates: [estimateA],
  contract: { id: 'contract-1', projectId: project.id, estimateId: estimateA.id, status: 'Draft' },
  project: { ...project, id: project.id },
})
assert.notEqual(draftLifecycle.stage, leadPipelineStages.ESTIMATE_APPROVED)
const directContractLifecycle = resolveLeadLifecycle({
  lead: { id: 'lead-direct', clientId: 'client-1', status: 'New Lead' },
  contract: { id: 'contract-direct', projectId: 'project-1', status: 'Draft' },
})
assert.notEqual(directContractLifecycle.stage, leadPipelineStages.ESTIMATE_APPROVED)
assert.deepEqual(directContractLifecycle.actions.map((action) => action.actionType), ['viewContract'])
const legacyConvertedLifecycle = resolveLeadLifecycle({
  lead: { id: 'lead-legacy', clientId: 'client-1' },
  estimates: [{ ...estimateA, status: 'Converted to Contract' }],
})
assert.notEqual(legacyConvertedLifecycle.stage, leadPipelineStages.ESTIMATE_APPROVED)

const paymentSummary = calculateProjectPaymentSummary({
  id: project.id,
  value: 8500,
  estimatedValue: 8500,
  portal: { contract: { id: 'contract-1', status: 'Draft', total: 12000 } },
}, [])
assert.equal(paymentSummary.projectValue, 12000)

const appSource = read('../src/App.jsx')
const finalizationSource = read('../src/utils/estimateFinalization.js')
const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const estimatesPageSource = read('../src/pages/EstimatesPage.jsx')
const contractSource = read('../src/pages/ContractsPage.jsx')
const schemaSource = read('../supabase/schema.sql')
const englishSource = read('../src/translations/en.js')
const spanishSource = read('../src/translations/es.js')

assert.match(finalizationSource, /ESTIMATE_FINALIZATION_STATUS\.DRAFT[\s\S]*ESTIMATE_FINALIZATION_STATUS\.APPROVED/)
assert.match(appSource, /const persistedEstimate = hasEstimateData\(baseEstimate\)[\s\S]*saveEstimate\(leadId, \{[\s\S]*projectId:/)
assert.doesNotMatch(appSource.match(/async function ensureContractForLead[\s\S]*?function saveContract/)?.[0] || '', /status: 'Converted to Contract'/)
assert.match(appSource, /estimateId: directProject \? null : linkedEstimateRecord\?\.id \|\| refreshedLead\?\.estimateId \|\| null/)
assert.match(appSource, /selectedEstimateId: linkedEstimateRecord\.id/)
assert.match(appSource, /sourceLead && !directProject\s*\? await ensureProjectForLeadConversion/)
assert.match(appSource, /contractRequiresClient/)
assert.match(projectSource, /contractSourceSelectionId/)
assert.match(projectSource, /createFromProjectDetails/)
assert.match(projectSource, /t\('projectDocuments'\)/)
assert.match(projectSource, /documentCountSummary/)
assert.match(projectSource, /label=\{t\('newDocumentAction'\)\}/)
assert.match(projectSource, /ariaLabel=\{t\('newDocument'\)\}/)
assert.doesNotMatch(projectSource, /<h2[^>]*>\{t\('estimates'\)\}<\/h2>/)
assert.doesNotMatch(projectSource, /<p[^>]*>\{projectEstimateRecords\.length > 0 \? `\$\{t\('estimates'\)\}/)
assert.match(projectSource, /!resolvedContract && !projectIsCompleted/)
assert.match(projectSource, /projectEstimateRecords\.map\(\(estimate\)/)
assert.match(estimatesPageSource, /activeEstimates\.filter\(\(estimate\) => estimate\.status === 'Approved'\)/)
assert.match(contractSource, /findProjectByLookup\(projects, relatedProjectId\)/)
assert.match(contractSource, /hasExplicitEstimateId/)
assert.match(contractSource, /estimateId: hasExplicitEstimateId/)
assert.match(schemaSource, /estimate_id uuid references estimates\(id\) on delete set null/)
assert.match(englishSource, /"contractSource": "Contract Source"/)
assert.match(spanishSource, /"contractSource": "Origen del contrato"/)
assert.match(englishSource, /"newDocument": "New Document"/)
assert.match(spanishSource, /"newDocument": "Nuevo documento"/)
assert.match(englishSource, /"newDocumentAction": "\+ New Document"/)
assert.match(spanishSource, /"newDocumentAction": "\+ Nuevo documento"/)

console.log('Flexible contract handoff verification passed.')

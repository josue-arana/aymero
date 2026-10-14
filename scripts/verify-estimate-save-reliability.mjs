import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')
}

const builder = read('src/pages/EstimateBuilderPage.jsx')
const app = read('src/App.jsx')
const service = read('src/services/supabase/estimatesSupabaseService.js')
const workflow = read('src/utils/scopeAssistantWorkflow.js')
const en = read('src/translations/en.js')
const es = read('src/translations/es.js')

// Draft persistence must retain relationship context even when the route was
// opened directly and the lead lookup is unavailable.
for (const field of ['projectId', 'project_id', 'leadId', 'lead_id', 'clientId', 'client_id']) {
  assert.match(builder, new RegExp(`${field}: savedEstimate\\.`), `Missing ${field} in the builder save payload.`)
}

// Saving a draft must not depend on a positive total. Send readiness keeps the
// existing content restriction separate from draft persistence.
assert.match(builder, /async function persistEstimate\(/)
assert.doesNotMatch(builder.slice(builder.indexOf('async function persistEstimate('), builder.indexOf('async function saveEstimate(')), />\s*0/)
assert.match(app, /estimateSaveContextMissing/)
assert.match(en, /"estimateSaveContextMissing":/) 
assert.match(es, /"estimateSaveContextMissing":/)

// A 200 response with zero affected rows is not a successful authorized save.
assert.match(service, /prefer: 'return=representation,count=exact'/)
assert.match(service, /includeResponseMetadata: true/)
assert.match(service, /ESTIMATE_\$\{methodName\.toUpperCase\(\)\}_NO_ROWS/)
assert.match(service, /if \(!row\?\.id \|\| response\?\.count === 0\)/)

// Improve Scope must receive an id from persistence before it invokes AI.
assert.match(workflow, /if \(!persistedEstimate\?\.id\)/)
assert.match(workflow, /const response = await request\(persistedEstimate\.id\)/)

console.log('Estimate save reliability verification passed.')

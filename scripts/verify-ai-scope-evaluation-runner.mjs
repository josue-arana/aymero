import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  AI_SCOPE_EVALUATION_REQUESTS_PER_BATCH,
  createAiScopeEvaluationPlan,
  renderAiScopeEvaluationMarkdown,
  runAiScopeEvaluationBatch,
} from './lib/aiScopeEvaluationHarness.mjs'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const fixtures = JSON.parse(read('./fixtures/ai-scope-controlled-pipeline-cases.json'))
const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]))

const batchOne = createAiScopeEvaluationPlan({ batch: 1, fixtures })
assert.deepEqual(batchOne.caseIds, ['roof-replacement', 'cabinet-hardware'])
assert.equal(batchOne.expectedRequests, AI_SCOPE_EVALUATION_REQUESTS_PER_BATCH)
assert.equal(batchOne.sourcesReady, true)
assert.deepEqual(batchOne.blockedSources, [])

const batchTwo = createAiScopeEvaluationPlan({ batch: 2, fixtures })
assert.deepEqual(batchTwo.caseIds, ['kitchen-quartz', 'kitchen-flooring'])
assert.equal(batchTwo.expectedRequests, AI_SCOPE_EVALUATION_REQUESTS_PER_BATCH)
assert.equal(batchTwo.sourcesReady, true)
assert.deepEqual(batchTwo.blockedSources, [])

const expectedSourceHashes = {
  'kitchen-quartz': '2f80c896b1e8e39f79179f33e494963ef609816d21652c398260b05ec72fa990',
  'roof-replacement': '7a472b6781de3558b282031d1da86baf5e6c71e023b7e1c90405fae8323c035f',
  'kitchen-flooring': 'e55337d55bbd127ed0293b0894d2c317439a3cb23a3915e3c11248b0d53648dd',
  'cabinet-hardware': '2b6b8d0cc68ab7fff6658a312ef608b4c98649b1b97ed93da249a1b7fe64c203',
}
for (const fixture of fixtures) {
  assert.equal(fixture.sourceStatus, 'verbatim_historical')
  assert.equal(createHash('sha256').update(fixture.originalSource).digest('hex'), expectedSourceHashes[fixture.id])
}
const cabinet = fixtureById.get('cabinet-hardware')
assert.equal(cabinet.sourceStatus, 'verbatim_historical')
assert.equal(
  cabinet.originalSource,
  'Remover 26 Jaladores de puertas de gabinete de cocina para instalar nuevos Jaladores para gabinete de cocina de cuatro o cinco pulgadas de largo en material brush. Nicole, el trabajo consiste en remover todos los Jaladores de botón y instalar Jaladores con manija de cinco pulgadas, el precio por ese trabajo es de $485 incluyendo todos los Jaladores',
)

const flooring = fixtureById.get('kitchen-flooring')
assert.deepEqual(flooring.laterConfirmedFacts, [{
  field: 'flooringMaterial',
  value: 'laminate',
  source: 'Later contractor confirmation; this fact is not part of the historical source.',
}])
assert.ok(flooring.originalSource.includes('piso vinílico'))
assert.ok(flooring.originalSource.includes('piso laminado'))
assert.equal(flooring.originalSource.includes('Later contractor confirmation'), false)

const interpretation = {
  projectTitle: {
    present: true,
    text: 'Proyecto de prueba',
    evidence: 'Descripción original',
    status: 'interpreted',
  },
  workCategories: [{
    name: { text: 'Trabajo', evidence: 'Descripción original', status: 'stated' },
    activities: [{ text: 'Realizar trabajo', evidence: 'Descripción original', status: 'stated' }],
    materials: [],
    quantities: [],
    measurements: [],
    conditions: [],
  }],
  responsibilities: { contractor: [], homeowner: [] },
  ambiguities: [],
  commercialInformation: {
    totalPrice: { present: false, amount: 0, currency: '', evidence: '', status: 'not_provided' },
    downPayment: { present: false, amount: 0, currency: '', evidence: '', status: 'not_provided' },
    remainingBalance: { present: false, amount: 0, currency: '', evidence: '', status: 'not_provided' },
    itemizedPrices: [],
    additionalCosts: [],
    unknownCosts: [],
    paymentSchedule: [],
    materialsIncluded: { value: 'unknown', evidence: '', status: 'not_provided' },
  },
  reviewWarnings: [],
}

const executableFixtures = structuredClone(fixtures).map((fixture) => ({
  ...fixture,
  sourceStatus: 'verbatim_historical',
}))
const requests = []
const mockProvider = async ({ requestBody }) => {
  requests.push(requestBody)
  const format = requestBody.text.format.name
  let output
  if (format === 'aymero_construction_interpretation_v1') output = interpretation
  else if (format === 'aymero_professional_scope_v1') output = { scope: '- Alcance controlado.', reviewWarnings: [] }
  else if (format === 'aymero_scope_professionalize_v2') output = { scope: '- Alcance legado.', reviewWarnings: [] }
  else if (format === 'aymero_scope_translation_v1') output = { scope: '- Controlled scope.' }
  else if (format === 'aymero_scope_translate_v2') output = { scope: '- Legacy scope.' }
  else throw new Error(`Unexpected mock format ${format}`)
  return {
    output_text: JSON.stringify(output),
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  }
}

let clockValue = 0
const report = await runAiScopeEvaluationBatch({
  batch: 1,
  fixtures: executableFixtures,
  model: 'evaluation-model',
  apiKey: 'non-production-test-key',
  requestCap: 10,
  requestProvider: mockProvider,
  clock: () => { clockValue += 5; return clockValue },
  now: () => '2026-10-13T12:00:00.000Z',
})
assert.equal(report.actualRequests, 10)
assert.equal(requests.length, 10)
assert.equal(report.retries, 0)
assert.equal(report.cases.length, 2)
assert.equal(report.cases[0].legacy.professionalization.result.scope, '- Alcance legado.')
assert.equal(report.cases[0].controlled.professionalization.result.scope, '- Alcance controlado.')
assert.equal(report.cases[0].legacy.translation.result.scope, '- Legacy scope.')
assert.equal(report.cases[0].controlled.translation.result.scope, '- Controlled scope.')
assert.equal(report.cases[0].controlled.interpretation.result.projectTitle.text, 'Proyecto de prueba')

for (let caseIndex = 0; caseIndex < 2; caseIndex += 1) {
  const offset = caseIndex * 5
  const originalSource = report.cases[caseIndex].originalSource
  assert.equal(JSON.parse(requests[offset].input).source, originalSource)
  assert.equal(JSON.parse(requests[offset + 1].input).source, originalSource)
  assert.equal(JSON.parse(requests[offset + 3].input).source, '- Alcance legado.')
  assert.equal(JSON.parse(requests[offset + 4].input).approvedScope, '- Alcance controlado.')
}

const markdown = renderAiScopeEvaluationMarkdown(report)
assert.match(markdown, /Original contractor description/)
assert.match(markdown, /Legacy Spanish output/)
assert.match(markdown, /Controlled interpretation/)
assert.match(markdown, /Controlled English output/)
assert.match(markdown, /10 input \/ 5 output \/ 15 total tokens/)
assert.match(markdown, /Estimated cost: Not calculated/)

let cappedCalls = 0
await assert.rejects(
  runAiScopeEvaluationBatch({
    batch: 1,
    fixtures: executableFixtures,
    model: 'evaluation-model',
    apiKey: 'non-production-test-key',
    requestCap: 9,
    requestProvider: async () => { cappedCalls += 1 },
  }),
  /Request cap must equal the planned 10 requests/,
)
assert.equal(cappedCalls, 0)

const blockedFixtures = structuredClone(fixtures)
blockedFixtures.find(({ id }) => id === 'roof-replacement').sourceStatus = 'reconstructed_pending_verbatim_source'
await assert.rejects(
  runAiScopeEvaluationBatch({
    batch: 1,
    fixtures: blockedFixtures,
    model: 'evaluation-model',
    apiKey: 'non-production-test-key',
    requestCap: 10,
    requestProvider: mockProvider,
  }),
  /Verbatim historical source is required/,
)

const sourceBeforeFailure = executableFixtures[0].originalSource
let failureCall = 0
await assert.rejects(
  runAiScopeEvaluationBatch({
    batch: 1,
    fixtures: executableFixtures,
    model: 'evaluation-model',
    apiKey: 'non-production-test-key',
    requestCap: 10,
    requestProvider: async ({ requestBody }) => {
      failureCall += 1
      if (failureCall === 2) return { output_text: '{malformed' }
      return mockProvider({ requestBody })
    },
  }),
  /malformed structured output/,
)
assert.equal(executableFixtures[0].originalSource, sourceBeforeFailure)

const runnerSource = read('./evaluate-ai-scope-pipelines.mjs')
const harnessSource = read('./lib/aiScopeEvaluationHarness.mjs')
const providerSource = read('../supabase/functions/_shared/aiScopeAssistantProvider.js')
assert.match(runnerSource, /--execute/)
assert.match(runnerSource, /Dry readiness check complete\. No provider request was made\./)
assert.match(runnerSource, /process\.env\.OPENAI_API_KEY/)
assert.match(runnerSource, /process\.env\.AI_SCOPE_EVALUATION_MODEL/)
for (const line of runnerSource.split('\n')) {
  if (/console\.(?:log|error)/.test(line)) assert.doesNotMatch(line, /process\.env|apiKey/)
}
assert.doesNotMatch(harnessSource, /process\.env\.SUPABASE|createClient|\.from\(|fetch\([^)]*functions\/v1/i)
assert.doesNotMatch(harnessSource, /setInterval|while\s*\(/i)
assert.match(providerSource, /https:\/\/api\.openai\.com\/v1\/responses/)
assert.match(providerSource, /AI_SCOPE_PROVIDER_TIMEOUT_MS = 25000/)

console.log('Local AI evaluation source boundaries, request budgets, production-module reuse, and report contracts passed.')

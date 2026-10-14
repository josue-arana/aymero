import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  AI_SCOPE_CONTROLLED_PIPELINE_VERSIONS,
  AI_SCOPE_PROMPT_VERSIONS,
  buildConstructionAnalysisRequest,
  buildControlledTranslationRequest,
  buildProfessionalScopeRequest,
  mergeAiScopeProviderUsage,
  parseConstructionAnalysisResponse,
  validateAiScopeStructuredOutput,
  validateConstructionInterpretation,
} from '../supabase/functions/_shared/aiScopeAssistant.js'
import { AI_SCOPE_INSTRUCTION_VERSIONS } from '../supabase/functions/_shared/aiScopeAssistantInstructions.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

function fact(text, evidence, status = 'stated') {
  return { text, evidence, status }
}

function money(value, evidence) {
  return value === null
    ? { present: false, amount: 0, currency: '', evidence: '', status: 'not_provided' }
    : { present: true, amount: value, currency: 'USD', evidence, status: 'stated' }
}

function interpretationFromFixture(fixture) {
  const evidence = fixture.originalSource.slice(0, 500)
  const expected = fixture.expectedInterpretation
  const buildCategory = (category) => ({
    name: fact(category.name, evidence, 'interpreted'),
    activities: category.activities.map((text) => fact(text, evidence, 'interpreted')),
    materials: category.materials.map((text) => fact(text, evidence, 'interpreted')),
    quantities: category.quantities.map((item) => ({ ...item, evidence, status: 'stated' })),
    measurements: category.measurements.map((item) => ({ ...item, evidence, status: 'requires_confirmation' })),
    conditions: category.conditions.map((text) => fact(text, evidence)),
  })
  return {
    projectTitle: {
      present: true,
      text: expected.projectTitle,
      evidence,
      status: 'interpreted',
    },
    workCategories: expected.workCategories.map(buildCategory),
    responsibilities: {
      contractor: expected.contractorResponsibilities.map((text) => fact(text, evidence)),
      homeowner: expected.homeownerResponsibilities.map((text) => fact(text, evidence)),
    },
    ambiguities: expected.ambiguities,
    commercialInformation: {
      totalPrice: money(expected.commercial.totalPrice, evidence),
      downPayment: money(expected.commercial.downPayment, evidence),
      remainingBalance: money(expected.commercial.remainingBalance, evidence),
      itemizedPrices: expected.commercial.itemizedPrices.map((item) => ({ ...item, currency: 'USD', evidence, status: 'stated' })),
      additionalCosts: expected.commercial.additionalCosts.map((item) => ({ ...item, currency: 'USD', evidence, status: 'stated' })),
      unknownCosts: expected.commercial.unknownCosts.map((text) => fact(text, evidence, 'requires_confirmation')),
      paymentSchedule: expected.commercial.paymentSchedule.map((text) => fact(text, evidence)),
      materialsIncluded: expected.commercial.materialsIncluded === 'unknown'
        ? { value: 'unknown', evidence: '', status: 'not_provided' }
        : {
            value: expected.commercial.materialsIncluded,
            evidence,
            status: expected.commercial.materialsIncluded === 'mixed' ? 'requires_confirmation' : 'stated',
          },
    },
    reviewWarnings: expected.ambiguities.map((item) => item.clarificationQuestion).slice(0, 4),
  }
}

assert.deepEqual(AI_SCOPE_INSTRUCTION_VERSIONS, {
  legacyProfessionalize: 'professionalize-v3',
  legacyTranslate: 'translate-v3',
  constructionAnalysis: 'construction-analysis-v1',
  professionalScope: 'professional-scope-v1',
  translation: 'translation-specialist-v1',
})
assert.equal(AI_SCOPE_PROMPT_VERSIONS.professionalize, 'professionalize-v3')
assert.equal(AI_SCOPE_PROMPT_VERSIONS.translate, 'translate-v3')
assert.equal(AI_SCOPE_CONTROLLED_PIPELINE_VERSIONS.pipeline, 'controlled-pipeline-v1')

const cases = JSON.parse(read('./fixtures/ai-scope-controlled-pipeline-cases.json'))
assert.equal(cases.length, 4)
assert.deepEqual(cases.map(({ id }) => id), [
  'kitchen-quartz',
  'roof-replacement',
  'kitchen-flooring',
  'cabinet-hardware',
])

for (const fixture of cases) {
  const analysisRequest = buildConstructionAnalysisRequest({
    model: 'gpt-5.6-terra',
    source: fixture.originalSource,
    sourceLanguage: fixture.sourceLanguage,
  })
  const analysisInput = JSON.parse(analysisRequest.input)
  assert.equal(analysisInput.source, fixture.originalSource, `${fixture.id}: interpretation must receive the original description.`)
  assert.equal(analysisRequest.text.format.name, 'aymero_construction_interpretation_v1')
  assert.match(analysisRequest.instructions, /untrusted contractor data/)
  assert.match(analysisRequest.instructions, /not a replacement dictionary/)
  assert.match(analysisRequest.instructions, /Single Roof may mean shingle roofing/)
  assert.match(analysisRequest.instructions, /Alvesto may mean asbestos/)
  assert.match(analysisRequest.instructions, /brush Nicole may mean brushed nickel/)
  assert.match(analysisRequest.instructions, /safetySensitive=true/)
  assert.equal('tools' in analysisRequest, false)

  const interpretation = interpretationFromFixture(fixture)
  const validated = validateConstructionInterpretation(interpretation, fixture.sourceLanguage)
  assert.equal(validated.workCategories[0].name.text, fixture.expectedInterpretation.projectTitle)
  if (fixture.id === 'roof-replacement') assert.equal(validated.workCategories.length, 2)

  const parsed = parseConstructionAnalysisResponse({ output_text: JSON.stringify(interpretation) }, fixture.sourceLanguage)
  assert.deepEqual(parsed, validated, `${fixture.id}: structured interpretation must round-trip through parser validation.`)

  const writingRequest = buildProfessionalScopeRequest({
    model: 'gpt-5.6-terra',
    interpretation,
    sourceLanguage: fixture.sourceLanguage,
  })
  const writingInput = JSON.parse(writingRequest.input)
  assert.deepEqual(writingInput.interpretation, validated)
  assert.equal('source' in writingInput, false, `${fixture.id}: writer must not independently consume raw notes.`)
  assert.match(writingRequest.instructions, /only source of truth is the validated structured construction interpretation/)
  assert.match(writingRequest.instructions, /Do not independently reinterpret the original contractor description/)
  assert.equal(writingRequest.text.format.name, 'aymero_professional_scope_v1')

  const professionalResult = validateAiScopeStructuredOutput('professionalize', {
    scope: fixture.evaluationAssertions.expectedSpanishScope,
    reviewWarnings: validated.reviewWarnings,
  })
  assert.equal(professionalResult.scope, fixture.evaluationAssertions.expectedSpanishScope)

  const spanishToEnglish = buildControlledTranslationRequest({
    model: 'gpt-5.6-terra',
    source: fixture.evaluationAssertions.expectedSpanishScope,
    sourceLanguage: 'es',
    targetLanguage: 'en',
  })
  const spanishToEnglishInput = JSON.parse(spanishToEnglish.input)
  assert.equal(spanishToEnglishInput.approvedScope, fixture.evaluationAssertions.expectedSpanishScope)
  assert.equal('source' in spanishToEnglishInput, false)
  assert.match(spanishToEnglish.instructions, /Translate only the approved contractor scope/)
  assert.match(spanishToEnglish.instructions, /Do not translate or rewrite separate custom Payment Terms/)

  const englishToSpanish = buildControlledTranslationRequest({
    model: 'gpt-5.6-terra',
    source: fixture.evaluationAssertions.expectedEnglishScope,
    sourceLanguage: 'en',
    targetLanguage: 'es',
  })
  assert.equal(JSON.parse(englishToSpanish.input).approvedScope, fixture.evaluationAssertions.expectedEnglishScope)

  const translatedResult = validateAiScopeStructuredOutput('translate', { scope: fixture.evaluationAssertions.expectedEnglishScope })
  for (const term of fixture.evaluationAssertions.requiredEnglishTerms) {
    assert.ok(translatedResult.scope.toLowerCase().includes(term.toLowerCase()), `${fixture.id}: missing required fixture term ${term}`)
  }
  for (const forbidden of fixture.evaluationAssertions.forbiddenEnglishTerms) {
    assert.equal(translatedResult.scope.toLowerCase().includes(forbidden.toLowerCase()), false, `${fixture.id}: fixture introduced ${forbidden}`)
  }
}

const originalDescription = cases[0].originalSource
assert.throws(
  () => parseConstructionAnalysisResponse({ output_text: '{not-json' }, 'es'),
  /malformed structured output/,
)
assert.equal(cases[0].originalSource, originalDescription, 'A failed model response must not alter original contractor content.')

const invalidAmount = interpretationFromFixture(cases[0])
invalidAmount.commercialInformation.totalPrice.amount = Number.NaN
assert.throws(
  () => validateConstructionInterpretation(invalidAmount, 'es'),
  /invalid total price/,
)

const inconsistentAmounts = interpretationFromFixture(cases[0])
inconsistentAmounts.commercialInformation.remainingBalance.amount = 1500
const inconsistentValidated = validateConstructionInterpretation(inconsistentAmounts, 'es')
assert.ok(inconsistentValidated.reviewWarnings.some((warning) => warning.includes('no coinciden')))

assert.deepEqual(mergeAiScopeProviderUsage(
  { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  { input_tokens: 80, output_tokens: 25, total_tokens: 105 },
), {
  inputTokens: 180,
  cachedInputTokens: 0,
  outputTokens: 45,
  reasoningTokens: 0,
  totalTokens: 225,
})

const edgeFunction = read('../supabase/functions/ai-scope-assistant/index.ts')
assert.match(edgeFunction, /AI_SCOPE_CONTROLLED_PIPELINE_ENABLED/)
assert.match(edgeFunction, /=== 'true'/)
assert.match(edgeFunction, /controlledPipelineEnabled && action === AI_SCOPE_ACTIONS\.PROFESSIONALIZE/)
assert.match(edgeFunction, /controlledPipelineEnabled && action === AI_SCOPE_ACTIONS\.TRANSLATE/)
assert.match(edgeFunction, /buildAiScopeResponsesRequest/)
assert.match(edgeFunction, /buildConstructionAnalysisRequest/)
assert.match(edgeFunction, /buildProfessionalScopeRequest/)
assert.match(edgeFunction, /buildControlledTranslationRequest/)
assert.match(edgeFunction, /\.\.\.interpretation\.reviewWarnings/)
assert.match(edgeFunction, /modelCalls: 2/)
assert.match(edgeFunction, /modelCalls: 1/)
assert.match(edgeFunction, /modelCalls: 0/)
assert.doesNotMatch(edgeFunction, /\.from\('estimates'\)[\s\S]{0,500}\.update\(/)

const frontendService = read('../src/services/aiScopeAssistantService.js')
assert.doesNotMatch(frontendService, /AI_SCOPE_CONTROLLED_PIPELINE_ENABLED/)
assert.match(frontendService, /body: JSON\.stringify\(\{ action, estimateId: normalizedEstimateId \}\)/)

console.log('Controlled AI pipeline instructions, contracts, stage boundaries, fixtures, and rollout guard passed.')

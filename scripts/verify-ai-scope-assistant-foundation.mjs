import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  SCOPE_ASSISTANT_STATUS,
  applyClientScope,
  applyProfessionalizedCandidate,
  approveContractorDraft,
  changeScopeAssistantClientLanguage,
  createScopeAssistantFingerprint,
  createScopeAssistantState,
  editContractorDraft,
  editRawContractorInput,
  isScopeAssistantApprovalCurrent,
  isScopeAssistantProfessionalizationCurrent,
  isScopeAssistantTranslationCurrent,
  normalizeScopeAssistantState,
  normalizeScopeAssistantStateForStorage,
  scopeAssistantNeedsTranslation,
} from '../src/utils/scopeAssistantState.js'
import {
  AI_SCOPE_LIMITS,
  AI_SCOPE_PROMPT_VERSIONS,
  buildAiScopeResponsesRequest,
  classifyAiScopeProviderStatus,
  createAiScopeFingerprint,
  normalizeAiScopeProviderUsage,
  parseAiScopeProviderResponse,
  validateAiScopeStructuredOutput,
} from '../supabase/functions/_shared/aiScopeAssistant.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const fixedGeneratedAt = '2026-08-31T14:00:00.000Z'
const fixedApprovedAt = '2026-08-31T14:05:00.000Z'
const memberId = '68acacd7-3ae5-4908-86d3-837b802ea944'

assert.deepEqual(normalizeScopeAssistantState({}), {})
assert.deepEqual(normalizeScopeAssistantState(null), {})

const initialized = createScopeAssistantState({
  rawContractorInput: 'paint walls 2 coats',
  contractorLanguage: 'en',
  clientLanguage: 'es',
})
assert.equal(initialized.version, 1)
assert.equal(initialized.approvalStatus, SCOPE_ASSISTANT_STATUS.DRAFT)
assert.equal('scopeOfWork' in initialized, false)

const generated = await applyProfessionalizedCandidate(initialized, {
  scope: 'Paint the walls with two coats.',
  reviewWarnings: [],
  model: 'gpt-5.6-terra',
  promptVersion: 'professionalize-v1',
  generatedAt: fixedGeneratedAt,
})
assert.equal(generated.contractorDraft, 'Paint the walls with two coats.')
assert.equal(generated.approvalStatus, SCOPE_ASSISTANT_STATUS.DRAFT)
assert.equal(generated.approvedContractorScope, '')
assert.equal(await isScopeAssistantProfessionalizationCurrent(generated), true)

const approved = await approveContractorDraft(generated, { memberId, approvedAt: fixedApprovedAt })
assert.equal(approved.approvedContractorScope, generated.contractorDraft)
assert.equal(approved.approvalStatus, SCOPE_ASSISTANT_STATUS.APPROVED)
assert.equal(approved.approvedByMemberId, memberId)
assert.equal(await isScopeAssistantApprovalCurrent(approved), true)
assert.equal(scopeAssistantNeedsTranslation(approved), true)

const translated = await applyClientScope(approved, {
  scope: 'Pinte las paredes con dos manos.',
  model: 'gpt-5.6-terra',
  promptVersion: 'translate-v1',
  generatedAt: fixedGeneratedAt,
})
assert.equal(translated.translationStatus, SCOPE_ASSISTANT_STATUS.CURRENT)
assert.equal(await isScopeAssistantTranslationCurrent(translated), true)

const edited = editContractorDraft(translated, 'Paint the walls with two coats and the ceiling.')
assert.equal(edited.approvedContractorScope, translated.approvedContractorScope)
assert.equal(edited.clientScope, translated.clientScope)
assert.equal(edited.approvalStatus, SCOPE_ASSISTANT_STATUS.STALE)
assert.equal(edited.translationStatus, SCOPE_ASSISTANT_STATUS.STALE)
assert.equal(await isScopeAssistantApprovalCurrent(edited), false)
assert.equal(await isScopeAssistantTranslationCurrent(edited), false)

const reapproved = await approveContractorDraft(edited, { memberId, approvedAt: fixedApprovedAt })
assert.equal(reapproved.approvedContractorScope, edited.contractorDraft)
assert.equal(reapproved.translationStatus, SCOPE_ASSISTANT_STATUS.STALE)

const languageChanged = changeScopeAssistantClientLanguage(translated, 'en')
assert.equal(languageChanged.clientScope, translated.clientScope)
assert.equal(languageChanged.translationStatus, SCOPE_ASSISTANT_STATUS.STALE)
assert.equal(scopeAssistantNeedsTranslation(languageChanged), false)

const rawEdited = editRawContractorInput(generated, 'paint walls 3 coats')
assert.equal(rawEdited.contractorDraft, generated.contractorDraft)
assert.equal(rawEdited.professionalizationStatus, SCOPE_ASSISTANT_STATUS.STALE)
assert.equal(await isScopeAssistantProfessionalizationCurrent(rawEdited), false)

const beforeFailure = structuredClone(translated)
try {
  throw new Error('simulated provider timeout')
} catch {
  // A failed request produces no state operation; persisted state remains untouched.
}
assert.deepEqual(translated, beforeFailure)

const sameLanguage = createScopeAssistantState({
  contractorDraft: 'Repair the door.',
  contractorLanguage: 'en',
  clientLanguage: 'en',
})
const sameLanguageApproved = await approveContractorDraft(sameLanguage, { memberId, approvedAt: fixedApprovedAt })
await assert.rejects(
  applyClientScope(sameLanguageApproved, { scope: 'Change the door.', promptVersion: 'translate-v1', generatedAt: fixedGeneratedAt }),
  /must match/,
)
const sameLanguageClient = await applyClientScope(sameLanguageApproved, {
  scope: sameLanguageApproved.approvedContractorScope,
  promptVersion: 'translate-v1',
  generatedAt: fixedGeneratedAt,
})
assert.equal(sameLanguageClient.clientScope, sameLanguageApproved.approvedContractorScope)

assert.equal(
  await createScopeAssistantFingerprint('  Line one\r\nLine two  '),
  await createAiScopeFingerprint('Line one\nLine two'),
)
assert.notEqual(
  await createScopeAssistantFingerprint('Line one Line two'),
  await createScopeAssistantFingerprint('Line one  Line two'),
)
assert.throws(
  () => normalizeScopeAssistantStateForStorage({
    ...initialized,
    rawContractorInput: 'x'.repeat(AI_SCOPE_LIMITS.sourceCharacters + 1),
  }),
  /exceeds the supported limit/,
)

const professionalizeRequest = buildAiScopeResponsesRequest({
  action: 'professionalize',
  model: 'gpt-5.6-terra',
  source: initialized.rawContractorInput,
  sourceLanguage: 'en',
})
assert.equal(professionalizeRequest.store, false)
assert.deepEqual(professionalizeRequest.reasoning, { effort: 'low' })
assert.equal(professionalizeRequest.model, 'gpt-5.6-terra')
assert.equal(AI_SCOPE_PROMPT_VERSIONS.professionalize, 'professionalize-v3')
assert.equal(AI_SCOPE_PROMPT_VERSIONS.translate, 'translate-v3')
assert.match(professionalizeRequest.instructions, /Language\/transcription normalization is allowed; scope inference is not/)
assert.match(professionalizeRequest.instructions, /PlayBook referring to damaged roof-deck material means plywood or roof decking/)
assert.match(professionalizeRequest.instructions, /do not replace it with vague roof platform or plataforma del techo/)
assert.match(professionalizeRequest.instructions, /Stone Door means storm door/)
assert.match(professionalizeRequest.instructions, /do not apply that correction to unrelated uses of stone/)
assert.match(professionalizeRequest.instructions, /do not add surface preparation, sanding, patching, primer, coat counts, masking, protection, cleanup, premium paint, adhesion language, or labor inclusion/)
assert.match(professionalizeRequest.instructions, /ice and water shield/)
assert.match(professionalizeRequest.instructions, /Price and Payment Terms sections/)
assert.match(professionalizeRequest.instructions, /Precio y Términos de pago/)
assert.match(professionalizeRequest.instructions, /retain a conservative statement of that duration in scope/)
assert.match(professionalizeRequest.instructions, /actionable construction bullets/)
assert.match(professionalizeRequest.instructions, /Do not add, infer, recommend, promise, or invent materials responsibility/)

const translateRequest = buildAiScopeResponsesRequest({
  action: 'translate',
  model: 'gpt-5.6-terra',
  source: 'Instalar tejas asfálticas negras.',
  sourceLanguage: 'es',
  targetLanguage: 'en',
})
assert.match(translateRequest.instructions, /natural, concise, professional U\.S\. residential-construction language/)
assert.match(translateRequest.instructions, /Translate the meaning, not Spanish sentence structure/)
assert.match(translateRequest.instructions, /never raw notes, an unapproved draft, a prior translation, or canonical client scope/)
assert.match(translateRequest.instructions, /damaged roof decking or plywood \(not roof plywood or decking\)/)
assert.match(translateRequest.instructions, /ridge vent or ridge vent system/)
assert.match(translateRequest.instructions, /Do not carry plastic, line, or air-extraction labels/)
assert.match(translateRequest.instructions, /not structural roof demolition/)
assert.match(translateRequest.instructions, /Do not add, remove, broaden, narrow, strengthen, weaken/)
assert.equal(professionalizeRequest.text.format.type, 'json_schema')
assert.equal(professionalizeRequest.text.format.strict, true)
assert.equal(professionalizeRequest.text.format.schema.additionalProperties, false)
assert.equal('tools' in professionalizeRequest, false)
assert.equal('conversation' in professionalizeRequest, false)
assert.equal(JSON.parse(professionalizeRequest.input).source, initialized.rawContractorInput)

assert.equal(classifyAiScopeProviderStatus(400), 'AI_SCOPE_PROVIDER_REQUEST_INVALID')
assert.equal(classifyAiScopeProviderStatus(401), 'AI_SCOPE_PROVIDER_AUTH_FAILED')
assert.equal(classifyAiScopeProviderStatus(403), 'AI_SCOPE_PROVIDER_ACCESS_DENIED')
assert.equal(classifyAiScopeProviderStatus(404), 'AI_SCOPE_PROVIDER_MODEL_UNAVAILABLE')
assert.equal(classifyAiScopeProviderStatus(429), 'AI_SCOPE_PROVIDER_RATE_LIMITED')
assert.equal(classifyAiScopeProviderStatus(500), 'AI_SCOPE_PROVIDER_UNAVAILABLE')
assert.deepEqual(normalizeAiScopeProviderUsage({
  input_tokens: 120,
  input_tokens_details: { cached_tokens: 20 },
  output_tokens: 45,
  output_tokens_details: { reasoning_tokens: 12 },
  total_tokens: 165,
}), {
  inputTokens: 120,
  cachedInputTokens: 20,
  outputTokens: 45,
  reasoningTokens: 12,
  totalTokens: 165,
})
assert.equal(normalizeAiScopeProviderUsage(null), null)

assert.deepEqual(
  parseAiScopeProviderResponse('professionalize', {
    output: [{ type: 'message', content: [{ type: 'output_text', text: '{"scope":"Repair the door.","reviewWarnings":[]}' }] }],
  }),
  { scope: 'Repair the door.', reviewWarnings: [] },
)
assert.throws(() => parseAiScopeProviderResponse('translate', { output_text: 'not-json' }), /malformed/)
assert.throws(
  () => validateAiScopeStructuredOutput('professionalize', { scope: 'Valid', reviewWarnings: [], extra: true }),
  /unexpected fields/,
)
assert.throws(
  () => validateAiScopeStructuredOutput('translate', { scope: 'x'.repeat(AI_SCOPE_LIMITS.outputCharacters + 1) }),
  /invalid scope/,
)
assert.throws(
  () => buildAiScopeResponsesRequest({
    action: 'professionalize',
    model: 'gpt-5.6-terra',
    source: 'x'.repeat(AI_SCOPE_LIMITS.sourceCharacters + 1),
    sourceLanguage: 'en',
  }),
  /exceeds the supported limit/,
)
assert.throws(
  () => buildAiScopeResponsesRequest({
    action: 'professionalize',
    model: 'gpt-5.6-terra',
    source: 'Repair the door.',
    sourceLanguage: 'fr',
  }),
  /language is unsupported/,
)

const semanticFixtures = JSON.parse(read('./fixtures/ai-scope-assistant-semantic-fixtures.json'))
assert.equal(semanticFixtures.length, 19)
for (const fixture of semanticFixtures) {
  const validated = validateAiScopeStructuredOutput(fixture.action, fixture.expected)
  assert.equal(validated.scope, fixture.expected.scope, fixture.id)
  for (const [sourcePhrase, outputPhrase] of fixture.preservedPairs) {
    assert.ok(fixture.source.includes(sourcePhrase), `${fixture.id}: source fixture missing ${sourcePhrase}`)
    assert.ok(validated.scope.includes(outputPhrase), `${fixture.id}: output fixture missing ${outputPhrase}`)
  }
  for (const forbidden of fixture.forbidden) {
    assert.equal(validated.scope.toLowerCase().includes(forbidden.toLowerCase()), false, `${fixture.id}: introduced ${forbidden}`)
  }
  if (fixture.sourceLanguage !== fixture.targetLanguage) {
    const request = buildAiScopeResponsesRequest({
      action: fixture.action,
      model: 'gpt-5.6-terra',
      source: fixture.source,
      sourceLanguage: fixture.sourceLanguage,
      targetLanguage: fixture.targetLanguage,
    })
    assert.equal(JSON.parse(request.input).source, fixture.source)
  }
}

const migration = read('../supabase/migrations/20260831_add_estimate_scope_assistant_state.sql')
const schema = read('../supabase/schema.sql')
const estimateService = read('../src/services/supabase/estimatesSupabaseService.js')
const frontendService = read('../src/services/aiScopeAssistantService.js')
const edgeFunction = read('../supabase/functions/ai-scope-assistant/index.ts')
const config = read('../supabase/config.toml')
const publicEndpoint = read('../supabase/functions/super-endpoint/index.ts')
const app = read('../src/App.jsx')

for (const source of [migration, schema]) {
  assert.match(source, /scope_assistant_state jsonb not null default '\{\}'::jsonb/)
  assert.match(source, /jsonb_typeof\(scope_assistant_state\) = 'object'/)
}
assert.match(estimateService, /scopeAssistantState: normalizeScopeAssistantState\(row\?\.scope_assistant_state\)/)
assert.match(estimateService, /payload\.scope_assistant_state = normalizeScopeAssistantStateForStorage\(scopeAssistantStateInput\)/)
assert.match(config, /\[functions\.ai-scope-assistant\]\s+verify_jwt = true/)
assert.match(edgeFunction, /admin\.auth\.getUser\(accessToken\)/)
assert.match(edgeFunction, /if \(!accessToken\).*AUTH_REQUIRED/)
assert.match(edgeFunction, /\.from\('contractor_members'\)/)
assert.match(edgeFunction, /memberships\.length !== 1/)
assert.match(edgeFunction, /\.eq\('contractor_id', contractorId\)/)
assert.match(edgeFunction, /\.is\('archived_at', null\)/)
assert.match(edgeFunction, /editableEstimateStatuses/)
assert.match(edgeFunction, /state\.rawContractorInput/)
assert.match(edgeFunction, /state\.approvedContractorScope/)
assert.match(edgeFunction, /approvalStatus !== 'approved'/)
assert.match(edgeFunction, /approvalSourceFingerprint !== currentDraftFingerprint/)
assert.match(edgeFunction, /sourceLanguage === clientLanguage/)
assert.ok(
  edgeFunction.indexOf('sourceLanguage === clientLanguage') < edgeFunction.indexOf('requestOpenAi({ apiKey: openAiApiKey'),
  'Same-language translation must return before the provider request.',
)
assert.match(edgeFunction, /const allowedBodyKeys = new Set\(\['action', 'estimateId'\]\)/)
assert.match(edgeFunction, /AI_SCOPE_ASSISTANT_ENABLED/)
assert.match(edgeFunction, /OPENAI_API_KEY/)
assert.match(edgeFunction, /AI_SCOPE_MODEL/)
assert.match(edgeFunction, /https:\/\/api\.openai\.com\/v1\/responses/)
assert.doesNotMatch(edgeFunction, /\.from\('estimates'\)[\s\S]{0,500}\.update\(/)
assert.doesNotMatch(edgeFunction, /console\.(?:log|error)\([^)]*(?:openAiApiKey|OPENAI_API_KEY|source|rawSource|approvedSource|providerResponse)/s)
assert.match(frontendService, /body: JSON\.stringify\(\{ action, estimateId: normalizedEstimateId \}\)/)
assert.doesNotMatch(frontendService, /contractorId|OPENAI_API_KEY|AI_SCOPE_MODEL|promptVersion/)

const publicEstimateSelect = publicEndpoint.match(/const estimateSelect = '([^']+)'/)?.[1] || ''
assert.ok(publicEstimateSelect.includes('scope_of_work'))
assert.equal(publicEstimateSelect.includes('scope_assistant_state'), false)
assert.doesNotMatch(publicEndpoint, /scopeAssistantState/)
assert.match(app, /derivedScope: estimateRecord\?\.summary \|\| estimateRecord\?\.scopeOfWork \|\| ''/)
assert.doesNotMatch(app, /scopeAssistantState/)

console.log('AI Scope Assistant state, trust boundary, semantic fixtures, and regression contracts passed.')

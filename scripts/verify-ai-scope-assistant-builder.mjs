import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  SCOPE_ASSISTANT_SEND_REASON,
  acceptScopeAssistantCanonicalScope,
  applyClientScope,
  applyProfessionalizedCandidate,
  approveContractorDraft,
  changeScopeAssistantClientLanguage,
  createScopeAssistantState,
  editContractorDraft,
  editScopeAssistantClientScope,
  getScopeAssistantSendReadiness,
} from '../src/utils/scopeAssistantState.js'
import { runPersistedScopeAssistantRequest } from '../src/utils/scopeAssistantWorkflow.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const generatedAt = '2026-09-01T14:00:00.000Z'
const approvedAt = '2026-09-01T14:05:00.000Z'
const acceptedAt = '2026-09-01T14:10:00.000Z'
const memberId = '68acacd7-3ae5-4908-86d3-837b802ea944'

assert.deepEqual(await getScopeAssistantSendReadiness({}, 'Manual scope'), {
  ready: true,
  manual: true,
  reason: SCOPE_ASSISTANT_SEND_REASON.MANUAL,
})

const originalCanonicalScope = 'paint walls 2 coats. materials not included.'
const initialized = createScopeAssistantState({
  rawContractorInput: originalCanonicalScope,
  contractorLanguage: 'en',
  clientLanguage: 'es',
})
const candidate = await applyProfessionalizedCandidate(initialized, {
  scope: 'Paint the walls with two coats. Materials are not included.',
  reviewWarnings: [],
  model: 'gpt-5.6-terra',
  promptVersion: 'professionalize-v1',
  generatedAt,
})
assert.equal(originalCanonicalScope, 'paint walls 2 coats. materials not included.')
assert.equal(candidate.approvedContractorScope, '')
assert.equal(candidate.rawContractorInput, originalCanonicalScope)
assert.equal((await getScopeAssistantSendReadiness(candidate, originalCanonicalScope)).reason, SCOPE_ASSISTANT_SEND_REASON.APPROVAL_REQUIRED)

const editedCandidate = editContractorDraft(candidate, `${candidate.contractorDraft} Protect adjacent finishes.`)
assert.equal(editedCandidate.rawContractorInput, originalCanonicalScope)
assert.equal(editedCandidate.contractorDraft.endsWith('Protect adjacent finishes.'), true)
assert.equal((await getScopeAssistantSendReadiness(editedCandidate, originalCanonicalScope)).reason, SCOPE_ASSISTANT_SEND_REASON.APPROVAL_REQUIRED)

await assert.rejects(
  () => applyClientScope(candidate, {
    scope: 'No debe traducirse todavía.',
    promptVersion: 'translate-v1',
    generatedAt,
  }),
  /approved contractor scope/i,
)

const approved = await approveContractorDraft(candidate, { memberId, approvedAt })
assert.equal(approved.approvedContractorScope, candidate.contractorDraft)
assert.equal(approved.approvedByMemberId, memberId)
assert.equal((await getScopeAssistantSendReadiness(approved, originalCanonicalScope)).reason, SCOPE_ASSISTANT_SEND_REASON.TRANSLATION_REQUIRED)

const editedAfterApproval = editContractorDraft(approved, `${approved.contractorDraft} Protect adjacent finishes.`)
assert.equal(editedAfterApproval.approvedContractorScope, approved.approvedContractorScope)
assert.equal((await getScopeAssistantSendReadiness(editedAfterApproval, originalCanonicalScope)).reason, SCOPE_ASSISTANT_SEND_REASON.APPROVAL_STALE)

const translated = await applyClientScope(approved, {
  scope: 'Pinte las paredes con dos manos. Los materiales no están incluidos.',
  model: 'gpt-5.6-terra',
  promptVersion: 'translate-v1',
  generatedAt,
})
assert.equal(originalCanonicalScope, 'paint walls 2 coats. materials not included.')
assert.equal((await getScopeAssistantSendReadiness(translated, originalCanonicalScope)).reason, SCOPE_ASSISTANT_SEND_REASON.CLIENT_VERSION_NOT_ACCEPTED)

const acceptedTranslatedClient = await acceptScopeAssistantCanonicalScope(translated, {
  canonicalScope: translated.clientScope,
  acceptedAt,
})
assert.deepEqual(await getScopeAssistantSendReadiness(acceptedTranslatedClient, translated.clientScope), {
  ready: true,
  manual: false,
  reason: SCOPE_ASSISTANT_SEND_REASON.READY,
})
const editedAcceptedClient = editScopeAssistantClientScope(acceptedTranslatedClient, `${translated.clientScope} El cliente proporcionará acceso.`)
assert.equal(editedAcceptedClient.canonicalAcceptance, null)
assert.equal((await getScopeAssistantSendReadiness(editedAcceptedClient, translated.clientScope)).reason, SCOPE_ASSISTANT_SEND_REASON.CLIENT_VERSION_NOT_ACCEPTED)
const reacceptedClient = await acceptScopeAssistantCanonicalScope(editedAcceptedClient, {
  canonicalScope: editedAcceptedClient.clientScope,
  acceptedAt,
})
assert.equal((await getScopeAssistantSendReadiness(reacceptedClient, reacceptedClient.clientScope)).ready, true)
const regeneratedClient = await applyClientScope(acceptedTranslatedClient, {
  scope: 'Pinte las paredes con dos manos y repare las áreas visibles. Los materiales no están incluidos.',
  model: 'gpt-5.6-terra',
  promptVersion: 'translate-v1',
  generatedAt,
})
assert.equal(regeneratedClient.canonicalAcceptance, null)
assert.equal((await getScopeAssistantSendReadiness(regeneratedClient, translated.clientScope)).reason, SCOPE_ASSISTANT_SEND_REASON.CLIENT_VERSION_NOT_ACCEPTED)
const contractorEditedAfterClientAcceptance = editContractorDraft(acceptedTranslatedClient, `${approved.contractorDraft} Protect adjacent finishes.`)
assert.equal(contractorEditedAfterClientAcceptance.approvedContractorScope, approved.approvedContractorScope)
assert.equal(contractorEditedAfterClientAcceptance.canonicalAcceptance, null)
assert.equal((await getScopeAssistantSendReadiness(contractorEditedAfterClientAcceptance, translated.clientScope)).reason, SCOPE_ASSISTANT_SEND_REASON.APPROVAL_STALE)
const reapprovedAfterClientAcceptance = await approveContractorDraft(contractorEditedAfterClientAcceptance, { memberId, approvedAt })
assert.equal((await getScopeAssistantSendReadiness(reapprovedAfterClientAcceptance, translated.clientScope)).reason, SCOPE_ASSISTANT_SEND_REASON.TRANSLATION_STALE)
const retranslatedAfterReapproval = await applyClientScope(reapprovedAfterClientAcceptance, {
  scope: 'Pinte las paredes con dos manos y proteja los acabados cercanos.',
  model: 'gpt-5.6-terra',
  promptVersion: 'translate-v3',
  generatedAt,
})
assert.equal((await getScopeAssistantSendReadiness(retranslatedAfterReapproval, translated.clientScope)).reason, SCOPE_ASSISTANT_SEND_REASON.CLIENT_VERSION_NOT_ACCEPTED)
const acceptedRetranslatedClient = await acceptScopeAssistantCanonicalScope(retranslatedAfterReapproval, {
  canonicalScope: retranslatedAfterReapproval.clientScope,
  acceptedAt,
})
assert.equal((await getScopeAssistantSendReadiness(acceptedRetranslatedClient, acceptedRetranslatedClient.clientScope)).ready, true)
const reloadedAcceptedClient = JSON.parse(JSON.stringify(acceptedTranslatedClient))
assert.equal((await getScopeAssistantSendReadiness(reloadedAcceptedClient, translated.clientScope)).ready, true)

const manuallyEditedClient = editScopeAssistantClientScope(
  translated,
  `${translated.clientScope} El cliente proporcionará acceso.`,
)
assert.equal(manuallyEditedClient.clientScopeManuallyEdited, true)
assert.equal(manuallyEditedClient.approvedContractorScope, approved.approvedContractorScope)
assert.equal(manuallyEditedClient.canonicalAcceptance, null)

const temporarilyEmptyClient = editScopeAssistantClientScope(translated, '')
assert.equal(temporarilyEmptyClient.clientScope, '')
assert.equal(temporarilyEmptyClient.clientScopeManuallyEdited, true)
assert.equal(
  (await getScopeAssistantSendReadiness(temporarilyEmptyClient, originalCanonicalScope)).reason,
  SCOPE_ASSISTANT_SEND_REASON.TRANSLATION_REQUIRED,
)

const acceptedClient = await acceptScopeAssistantCanonicalScope(manuallyEditedClient, {
  canonicalScope: manuallyEditedClient.clientScope,
  acceptedAt,
})
assert.equal(acceptedClient.canonicalAcceptance.source, 'client')
assert.deepEqual(await getScopeAssistantSendReadiness(acceptedClient, manuallyEditedClient.clientScope), {
  ready: true,
  manual: false,
  reason: SCOPE_ASSISTANT_SEND_REASON.READY,
})
assert.equal(
  (await getScopeAssistantSendReadiness(acceptedClient, 'Different canonical scope')).reason,
  SCOPE_ASSISTANT_SEND_REASON.CANONICAL_SCOPE_MISMATCH,
)

const changedClientLanguage = changeScopeAssistantClientLanguage(acceptedClient, 'en')
assert.equal(changedClientLanguage.canonicalAcceptance, null)
assert.equal(changedClientLanguage.translationStatus, 'stale')

const editedTranslatedDraft = editContractorDraft(translated, `${translated.contractorDraft} Protect adjacent finishes.`)
const reapprovedChangedDraft = await approveContractorDraft(editedTranslatedDraft, { memberId, approvedAt })
assert.equal(reapprovedChangedDraft.approvedContractorScope, editedTranslatedDraft.contractorDraft)
assert.equal(reapprovedChangedDraft.approvedContractorScope.includes('Protect adjacent finishes.'), true)
assert.equal(reapprovedChangedDraft.translationStatus, 'stale')

const sameLanguageInitial = createScopeAssistantState({
  rawContractorInput: 'Repair door.',
  contractorLanguage: 'en',
  clientLanguage: 'en',
})
const sameLanguageCandidate = await applyProfessionalizedCandidate(sameLanguageInitial, {
  scope: 'Repair the door.',
  model: 'gpt-5.6-terra',
  promptVersion: 'professionalize-v1',
  generatedAt,
})
const sameLanguageApproved = await approveContractorDraft(sameLanguageCandidate, { memberId, approvedAt })
const sameLanguageAccepted = await acceptScopeAssistantCanonicalScope(sameLanguageApproved, {
  canonicalScope: sameLanguageApproved.approvedContractorScope,
  acceptedAt,
})
assert.equal(sameLanguageAccepted.canonicalAcceptance.source, 'contractor')
assert.equal(
  (await getScopeAssistantSendReadiness(sameLanguageAccepted, sameLanguageApproved.approvedContractorScope)).ready,
  true,
)
const sameLanguageEdited = editContractorDraft(sameLanguageAccepted, 'Repair the exterior door.')
assert.equal((await getScopeAssistantSendReadiness(sameLanguageEdited, sameLanguageApproved.approvedContractorScope)).reason, SCOPE_ASSISTANT_SEND_REASON.APPROVAL_STALE)
const sameLanguageReapproved = await approveContractorDraft(sameLanguageEdited, { memberId, approvedAt })
const sameLanguageReaccepted = await acceptScopeAssistantCanonicalScope(sameLanguageReapproved, {
  canonicalScope: sameLanguageReapproved.approvedContractorScope,
  acceptedAt,
})
assert.equal(sameLanguageReapproved.approvedContractorScope, 'Repair the exterior door.')
assert.equal((await getScopeAssistantSendReadiness(sameLanguageReaccepted, sameLanguageReapproved.approvedContractorScope)).ready, true)

let requestCount = 0
const persistenceFailure = await runPersistedScopeAssistantRequest({
  persist: async () => null,
  request: async () => {
    requestCount += 1
    return { data: { scope: 'Must not run.' } }
  },
})
assert.equal(persistenceFailure.requestInvoked, false)
assert.equal(requestCount, 0)

const candidateBeforeProviderFailure = structuredClone(candidate)
const failedProviderResponse = { data: null, error: { code: 'AI_SCOPE_REQUEST_FAILED' } }
assert.equal(Boolean(failedProviderResponse.error), true)
assert.deepEqual(candidate, candidateBeforeProviderFailure)

const sequence = []
const persistenceSuccess = await runPersistedScopeAssistantRequest({
  persist: async () => {
    sequence.push('persist')
    return { id: '00000000-0000-0000-0000-000000000001' }
  },
  afterPersist: async () => sequence.push('activate'),
  request: async (estimateId) => {
    sequence.push(`request:${estimateId}`)
    return { data: { scope: 'Candidate' } }
  },
})
assert.equal(persistenceSuccess.requestInvoked, true)
assert.deepEqual(sequence, ['persist', 'activate', 'request:00000000-0000-0000-0000-000000000001'])

const page = read('../src/pages/EstimateBuilderPage.jsx')
const panel = read('../src/components/estimates/ScopeAssistantPanel.jsx')
const service = read('../src/services/aiScopeAssistantService.js')
const backendConfig = read('../src/config/backendConfig.js')
const publicEndpoint = read('../supabase/functions/super-endpoint/index.ts')
const app = read('../src/App.jsx')

assert.match(page, /runPersistedScopeAssistantRequest/)
assert.match(page, /persistScopeAssistantTransition\(initializedState\)/)
assert.match(page, /professionalizeEstimateScope\(\{[\s\S]*estimateId,[\s\S]*accessToken: scopeAssistantAccessToken/)
assert.match(page, /translateApprovedEstimateScope\(\{[\s\S]*estimateId,[\s\S]*accessToken: scopeAssistantAccessToken/)
assert.match(page, /getScopeAssistantSendReadiness\(scopeAssistantState, scope\)/)
assert.match(page, /if \(!readiness\.ready\)/)
assert.match(page, /const isScopeAssistantSendBlocked = !scopeAssistantReadiness\.ready \|\| isScopeAssistantReadinessPending/)
assert.match(page, /disabled=\{isEstimateActionPending \|\| isScopeAssistantSendBlocked\}/)
assert.match(page, /aria-describedby=\{isScopeAssistantSendBlocked && scopeAssistantReadinessMessage/)
assert.match(page, /setScopeAssistantReadiness\(\{ ready: true, manual: false, reason: SCOPE_ASSISTANT_SEND_REASON.READY \}\)/)
assert.match(page, /scopeAssistantActionGuardRef\.current/)
assert.match(page, /if \(scopeAssistantActionGuardRef\.current \|\| estimateSaveGuardRef\.current\) return null/)
assert.match(page, /persistEstimate\([\s\S]*scopeAssistantState/)
assert.match(page, /summary: nextCanonicalScope/)
assert.match(page, /summary: scopeAssistantState\.clientScope/)
assert.match(page, /scopeAssistantState,/)
assert.match(page, /scopeAssistantMemberId/)
assert.match(page, /scopeAssistantWorkingLanguage=\{resolveScopeAssistantContractorLanguage\(\{ appLanguage \}\)\}/)
assert.match(page, /changeScopeAssistantClientLanguage/)
assert.match(service, /body: JSON\.stringify\(\{ action, estimateId: normalizedEstimateId \}\)/)
assert.doesNotMatch(service, /contractorId|rawContractorInput|approvedContractorScope/)
assert.match(backendConfig, /VITE_AI_SCOPE_ASSISTANT_ENABLED === 'true'/)
assert.match(panel, /isEditing && isEnabled/)
assert.match(panel, /approvalCurrent && !showApprovedEditor/)
assert.match(panel, /scopeAssistantApprovedDescription/)
assert.match(panel, /scopeAssistantViewApproved/)
assert.match(panel, /setShowApprovedEditor\(true\)/)
assert.match(panel, /isApprovedDisclosureOpen/)
assert.match(panel, /setIsApprovedDisclosureOpen\(false\)/)
assert.match(panel, /clientVersionAccepted/)
assert.match(panel, /scopeAssistantClientVersionReadyHelp/)
assert.match(panel, /translationCurrent && !clientVersionAccepted/)
assert.match(panel, /ReviewNotices warnings=\{state\.reviewWarnings\} approved/)
assert.match(panel, /function ReviewNotices\([\s\S]*if \(approved\)[\s\S]*scopeAssistantReviewItemOne/)
assert.match(panel, /approvalCurrent && translationRequired/)
assert.match(panel, /approvalCurrent && !translationRequired/)
assert.match(panel, /scopeAssistantTranslateToLanguage/)
assert.match(panel, /scopeAssistantClientLanguageNotice/)
assert.doesNotMatch(panel, /xl:grid-cols-2/)
assert.doesNotMatch(panel, /<VersionLabel title=\{t\('scopeAssistantContractorVersion'\)/)
assert.match(panel, /min-h-11/)
assert.match(panel, /w-full[\s\S]{0,400}sm:w-auto/)
assert.match(panel, /min-w-0/)
assert.match(panel, /flex flex-col gap-2 sm:flex-row sm:flex-wrap/)
assert.ok(panel.indexOf('onClick={onApprove}') < panel.indexOf('onClick={onRegenerate}'))
assert.match(panel, /focus-visible:ring-2/)
assert.match(panel, /role="status"/)
assert.match(panel, /role="alert"/)
assert.match(panel, /aria-label|ariaLabel/)
assert.doesNotMatch(panel, /purple|violet|chat bubble|AI POWERED/i)

const publicEstimateSelect = publicEndpoint.match(/const estimateSelect = '([^']+)'/)?.[1] || ''
assert.equal(publicEstimateSelect.includes('scope_assistant_state'), false)
assert.doesNotMatch(publicEndpoint, /rawContractorInput|contractorDraft|approvedByMemberId/)
assert.match(page, /normalizeEstimateDocument\(\{[\s\S]*scope,/)
assert.match(app, /derivedScope: estimateRecord\?\.summary \|\| estimateRecord\?\.scopeOfWork \|\| ''/)
assert.doesNotMatch(app, /scopeAssistantState[\s\S]{0,200}contracts/)

const translationKeys = [
  'scopeAssistantImprove',
  'scopeAssistantImproving',
  'scopeAssistantSuggestedScope',
  'scopeAssistantRegenerate',
  'scopeAssistantApprove',
  'scopeAssistantApproved',
  'scopeAssistantApprovedDescription',
  'scopeAssistantViewApproved',
  'scopeAssistantEdit',
  'scopeAssistantViewOriginal',
  'scopeAssistantTranslate',
  'scopeAssistantTranslateToLanguage',
  'scopeAssistantRetranslate',
  'scopeAssistantTranslating',
  'scopeAssistantContractorVersion',
  'scopeAssistantClientVersion',
  'scopeAssistantReadyToReview',
  'scopeAssistantClientVersionReady',
  'scopeAssistantClientVersionReadyHelp',
  'scopeAssistantNotTranslated',
  'scopeAssistantClientLanguageNotice',
  'scopeAssistantUseClientVersion',
  'scopeAssistantReviewItemOne',
  'scopeAssistantReviewItemMany',
  'scopeAssistantApprovalStaleNotice',
  'scopeAssistantTranslationStaleNotice',
  'scopeAssistantUnavailable',
]
for (const key of translationKeys) {
  assert.equal(typeof en[key], 'string', `Missing English translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish translation: ${key}`)
}

console.log('AI Scope Assistant Estimate Builder workflow validation passed.')

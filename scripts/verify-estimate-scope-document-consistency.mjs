import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  applyClientScope,
  applyProfessionalizedCandidate,
  approveContractorDraft,
  acceptScopeAssistantCanonicalScope,
  createScopeAssistantState,
  editScopeAssistantCanonicalScope,
  editContractorDraft,
  getScopeAssistantSendReadiness,
  SCOPE_ASSISTANT_SEND_REASON,
} from '../src/utils/scopeAssistantState.js'
import { normalizeEstimateDocument } from '../src/utils/estimateDocument.js'
import { canEditEstimate, buildEstimateRevisionReset } from '../src/utils/estimateFinalization.js'
import { buildDuplicatedEstimateDraft } from '../src/utils/estimateAlternatives.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const originalScope = '**Paint walls**\n- Protect trim'
const manuallySavedScope = '**Paint walls**\n- Protect trim\n- Apply two coats'
const manualState = editScopeAssistantCanonicalScope({}, originalScope, manuallySavedScope)
const draftDocument = normalizeEstimateDocument({ scope: manuallySavedScope, pricingMode: 'simple', total: 2400 })
assert.deepEqual(manualState, {})
assert.equal(draftDocument.scope.text, manuallySavedScope)
assert.equal(draftDocument.sections.scope.visible, true)
assert.equal((await getScopeAssistantSendReadiness(manualState, manuallySavedScope)).ready, true)

const detailedOnly = normalizeEstimateDocument({
  scope: '',
  pricingMode: 'detailed',
  lineItems: [{ title: 'Cabinets', description: '- Install cabinets', amount: 1200 }],
  total: 1200,
})
assert.equal(detailedOnly.sections.scope.visible, false)
assert.equal(detailedOnly.sections.workBreakdown.visible, true)

const initial = createScopeAssistantState({
  rawContractorInput: originalScope,
  contractorLanguage: 'en',
  clientLanguage: 'es',
})
const candidate = await applyProfessionalizedCandidate(initial, {
  scope: 'Paint the walls and protect the trim.',
  promptVersion: 'professionalize-v1',
})
const manuallyEditedPending = editScopeAssistantCanonicalScope(candidate, originalScope, manuallySavedScope)
assert.equal(manuallyEditedPending.contractorDraft, candidate.contractorDraft)
assert.equal(manuallyEditedPending.approvalStatus, candidate.approvalStatus)
assert.equal(manuallyEditedPending.canonicalAcceptance, null)
assert.equal(
  (await getScopeAssistantSendReadiness(manuallyEditedPending, manuallySavedScope)).reason,
  SCOPE_ASSISTANT_SEND_REASON.APPROVAL_REQUIRED,
)

const approved = await approveContractorDraft(candidate)
const translated = await applyClientScope(approved, {
  scope: 'Pinte las paredes y proteja las molduras.',
  promptVersion: 'translate-v1',
})
const accepted = await acceptScopeAssistantCanonicalScope(translated, { canonicalScope: translated.clientScope })
assert.equal((await getScopeAssistantSendReadiness(accepted, translated.clientScope)).ready, true)

const manuallyEditedAccepted = editScopeAssistantCanonicalScope(
  accepted,
  translated.clientScope,
  `${translated.clientScope}\n- Aplique dos manos.`,
)
assert.equal(manuallyEditedAccepted.canonicalAcceptance, null)
assert.equal(manuallyEditedAccepted.approvedContractorScope, accepted.approvedContractorScope)
assert.equal(manuallyEditedAccepted.approvalSourceFingerprint, accepted.approvalSourceFingerprint)
assert.equal(manuallyEditedAccepted.clientScope, accepted.clientScope)
assert.equal(manuallyEditedAccepted.translation.sourceFingerprint, accepted.translation.sourceFingerprint)
assert.equal(
  (await getScopeAssistantSendReadiness(manuallyEditedAccepted, `${translated.clientScope}\n- Aplique dos manos.`)).reason,
  SCOPE_ASSISTANT_SEND_REASON.CLIENT_VERSION_NOT_ACCEPTED,
)
assert.equal(editScopeAssistantCanonicalScope(accepted, translated.clientScope, translated.clientScope).canonicalAcceptance.scopeFingerprint, accepted.canonicalAcceptance.scopeFingerprint)

const unrelatedSaveState = editScopeAssistantCanonicalScope(accepted, translated.clientScope, translated.clientScope)
assert.equal((await getScopeAssistantSendReadiness(unrelatedSaveState, translated.clientScope)).ready, true)
const editedCandidate = editContractorDraft(accepted, `${accepted.contractorDraft} Add primer.`)
assert.equal(editedCandidate.canonicalAcceptance, null)
assert.equal((await getScopeAssistantSendReadiness(editedCandidate, translated.clientScope)).reason, SCOPE_ASSISTANT_SEND_REASON.APPROVAL_STALE)

const duplicated = buildDuplicatedEstimateDraft({
  project: { id: 'project-1' },
  estimate: { id: 'estimate-1', summary: manuallySavedScope, total: 2400, scopeAssistantState: manuallyEditedAccepted },
})
assert.equal(duplicated.summary, manuallySavedScope)
assert.deepEqual(duplicated.scopeAssistantState, {})
assert.equal(canEditEstimate('Approved'), false)
assert.equal(canEditEstimate('Converted to Contract'), false)
assert.deepEqual(buildEstimateRevisionReset(), { status: 'Saved', sentAt: null, approvedAt: null, rejectedAt: null })

const builder = read('../src/pages/EstimateBuilderPage.jsx')
const panel = read('../src/components/estimates/ScopeAssistantPanel.jsx')
const service = read('../src/services/supabase/estimatesSupabaseService.js')
const publicPage = read('../src/pages/PublicEstimatePage.jsx')
const portal = read('../src/components/portal/PortalSummary.jsx')
assert.match(builder, /setScopeAssistantState\(\(current\) => editScopeAssistantCanonicalScope\(current, scope, nextValue\)\)/)
assert.match(builder, /summary: hasMeaningfulEstimateFormattedText\(sanitizedScope\) \? sanitizedScope : ''/)
assert.match(builder, /scope,\s*lineItems,\s*total: estimateTotal/)
assert.match(panel, /ariaLabel=\{t\('scopeAssistantDocumentScope'\)\}/)
assert.match(panel, /onChange=\{onManualScopeChange\}/)
assert.match(service, /payload\.scope_of_work = normalizeEstimateFormattedTextForStorage\(scopeInput\) \|\| null/)
assert.match(service, /summary: row\?\.scope_of_work \|\| ''/)
assert.match(publicPage, /scope: estimate\.summary \?\? estimate\.scopeOfWork \?\? ''/)
assert.match(portal, /scope: estimate\?\.summary \?\? estimate\?\.scopeOfWork \?\? ''/)
assert.match(builder, /if \(result\) \{[\s\S]*?setIsDraftDirty\(false\)/)
assert.match(service, /if \(!row\?\.id \|\| response\?\.count === 0\)/)
assert.equal(Boolean(en.scopeAssistantDocumentScope), true)
assert.equal(Boolean(es.scopeAssistantDocumentScope), true)

console.log('Estimate Scope document consistency verification passed.')

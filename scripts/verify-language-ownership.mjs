import assert from 'node:assert/strict'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'
import {
  resolveClientFacingLanguage,
  resolveScopeAssistantContractorLanguage,
} from '../src/utils/language.js'
import {
  applyProfessionalizedCandidate,
  approveContractorDraft,
  changeScopeAssistantClientLanguage,
  createScopeAssistantState,
  editContractorDraft,
} from '../src/utils/scopeAssistantState.js'
import { buildAiScopeResponsesRequest } from '../supabase/functions/_shared/aiScopeAssistant.js'

const dictionaries = { en, es }
const translate = (language) => (key) => dictionaries[language]?.[key] ?? en[key] ?? key

function verifyDocumentScenario({ appLanguage, documentLanguage, documentKey, expectedDocumentLanguage }) {
  const appT = translate(appLanguage)
  const outputLanguage = resolveClientFacingLanguage({ documentLanguage, appLanguage })
  const documentT = translate(outputLanguage)

  assert.equal(appT('previewEstimate'), dictionaries[appLanguage].previewEstimate)
  assert.equal(appT('estimatePageCountSingle'), dictionaries[appLanguage].estimatePageCountSingle)
  assert.equal(documentT(documentKey), dictionaries[expectedDocumentLanguage][documentKey])
}

verifyDocumentScenario({ appLanguage: 'en', documentLanguage: 'en', documentKey: 'estimate', expectedDocumentLanguage: 'en' })
verifyDocumentScenario({ appLanguage: 'en', documentLanguage: 'es', documentKey: 'estimate', expectedDocumentLanguage: 'es' })
verifyDocumentScenario({ appLanguage: 'es', documentLanguage: 'en', documentKey: 'estimate', expectedDocumentLanguage: 'en' })
verifyDocumentScenario({ appLanguage: 'es', documentLanguage: 'es', documentKey: 'estimate', expectedDocumentLanguage: 'es' })
verifyDocumentScenario({ appLanguage: 'en', documentLanguage: 'es', documentKey: 'contract', expectedDocumentLanguage: 'es' })
verifyDocumentScenario({ appLanguage: 'es', documentLanguage: 'en', documentKey: 'contract', expectedDocumentLanguage: 'en' })

const appT = translate('en')
const portalT = translate('es')
const clientDefaultLanguage = resolveClientFacingLanguage({
  client: { preferredLanguage: 'es' },
  appLanguage: 'en',
})
assert.equal(appT('previewEstimate'), en.previewEstimate)
assert.equal(portalT('customerPortal'), es.customerPortal)
assert.equal(translate(clientDefaultLanguage)('estimate'), es.estimate)
assert.equal(appT('sendToCustomer'), en.sendToCustomer)
assert.equal(translate(clientDefaultLanguage)('estimateSmsMessage'), es.estimateSmsMessage)

const spanishEstimateLanguage = resolveClientFacingLanguage({ documentLanguage: 'es', appLanguage: 'en' })
const englishEstimateLanguage = resolveClientFacingLanguage({ documentLanguage: 'en', appLanguage: 'en' })
assert.equal(appT('previewEstimate'), en.previewEstimate)
assert.equal(translate(spanishEstimateLanguage)('estimate'), es.estimate)
assert.equal(translate(englishEstimateLanguage)('estimate'), en.estimate)

// Scope Assistant has two intentionally separate language owners. The
// contractor's authenticated app language controls professionalization;
// document/client language controls only the post-approval translation.
const scopeLanguageCases = [
  { id: 'contractor-es-client-en', contractorLanguage: 'es', clientLanguage: 'en', expectedLanguage: 'Spanish' },
  { id: 'contractor-en-client-es', contractorLanguage: 'en', clientLanguage: 'es', expectedLanguage: 'English' },
  { id: 'contractor-es-client-es', contractorLanguage: 'es', clientLanguage: 'es', expectedLanguage: 'Spanish' },
  { id: 'contractor-en-client-en', contractorLanguage: 'en', clientLanguage: 'en', expectedLanguage: 'English' },
]

for (const fixture of scopeLanguageCases) {
  const contractorLanguage = resolveScopeAssistantContractorLanguage({ appLanguage: fixture.contractorLanguage })
  const state = createScopeAssistantState({
    rawContractorInput: fixture.contractorLanguage === 'es' ? 'Retirar alfombra e instalar piso laminado.' : 'Remove carpet and install laminate flooring.',
    contractorLanguage,
    clientLanguage: fixture.clientLanguage,
  })
  const request = buildAiScopeResponsesRequest({
    action: 'professionalize',
    model: 'gpt-5.6-luna',
    source: state.rawContractorInput,
    sourceLanguage: state.contractorLanguage,
    // A client target is deliberately irrelevant to professionalization.
    targetLanguage: state.clientLanguage,
  })

  assert.equal(state.contractorLanguage, fixture.contractorLanguage, `${fixture.id}: contractor language must persist at initialization.`)
  assert.equal(JSON.parse(request.input).sourceLanguage, fixture.contractorLanguage, `${fixture.id}: professionalize must use contractor language.`)
  assert.match(request.instructions, new RegExp(`professional ${fixture.expectedLanguage}`), `${fixture.id}: professionalize output language must follow contractor language.`)
  assert.doesNotMatch(request.instructions, /Translate faithfully from/, `${fixture.id}: professionalize must not become translation.`)
}

const spanishContractorEnglishClient = createScopeAssistantState({
  rawContractorInput: 'Retirar alfombra e instalar piso laminado.',
  contractorLanguage: resolveScopeAssistantContractorLanguage({ appLanguage: 'es' }),
  clientLanguage: resolveClientFacingLanguage({ documentLanguage: 'en', appLanguage: 'es' }),
})
const regeneratedSpanishState = await applyProfessionalizedCandidate(spanishContractorEnglishClient, {
  scope: 'Retirar toda la alfombra del sótano e instalar piso laminado.',
  promptVersion: 'professionalize-v3',
})
assert.equal(regeneratedSpanishState.contractorLanguage, 'es', 'Regeneration must retain the initialized contractor language.')

const editedSpanishState = editContractorDraft(regeneratedSpanishState, 'Retirar la alfombra existente e instalar piso laminado.')
const approvedSpanishState = await approveContractorDraft(editedSpanishState, { memberId: 'language-routing-test' })
assert.equal(approvedSpanishState.contractorLanguage, 'es', 'Approval and contractor edits must retain contractor language.')

const translationRequest = buildAiScopeResponsesRequest({
  action: 'translate',
  model: 'gpt-5.6-luna',
  source: approvedSpanishState.approvedContractorScope,
  sourceLanguage: approvedSpanishState.contractorLanguage,
  targetLanguage: approvedSpanishState.clientLanguage,
})
assert.match(translationRequest.instructions, /Translate faithfully from Spanish to English/, 'Translation must happen only from approved contractor Spanish to client English.')

const changedClientLanguage = changeScopeAssistantClientLanguage(approvedSpanishState, 'es')
assert.equal(changedClientLanguage.contractorLanguage, 'es', 'Changing the client language must not change the contractor language.')
assert.equal(changedClientLanguage.translationStatus, 'none', 'Changing a client language before translation must remain un-translated.')

console.log('Language ownership validation passed.')

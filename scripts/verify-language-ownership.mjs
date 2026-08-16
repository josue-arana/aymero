import assert from 'node:assert/strict'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'
import { resolveClientFacingLanguage } from '../src/utils/language.js'

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

console.log('Language ownership validation passed.')

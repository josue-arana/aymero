import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getPaymentTermLabel,
  isKnownPaymentTermValue,
  normalizePaymentTermValue,
} from '../src/utils/paymentTerms.js'
import { buildDuplicatedEstimateDraft } from '../src/utils/estimateAlternatives.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const translator = (key) => ({
  onboardingPaymentDueReceipt: 'Due on receipt',
  onboardingPaymentNet7: '7 days after invoice',
  onboardingPaymentNet15: '15 days after invoice',
  onboardingPaymentNet30: '30 days after invoice',
}[key] || key)

const builder = read('src/pages/EstimateBuilderPage.jsx')
const settings = read('src/pages/SettingsPage.jsx')
const onboarding = read('src/pages/AuthOnboardingPage.jsx')
const estimatePersistence = read('src/services/supabase/estimatesSupabaseService.js')
const settingsPersistence = read('src/services/supabase/settingsSupabaseService.js')
const publicEstimate = read('src/pages/PublicEstimatePage.jsx')
const duplicateDraft = read('src/utils/estimateAlternatives.js')
const schema = read('supabase/schema.sql')
const defaults = read('src/data/defaultCompanySettings.js')
const en = read('src/translations/en.js')
const contractDocument = read('src/utils/contractDocument.js')

const customTerms = '50% deposit required to begin work.\nRemaining balance due upon completion.'
assert.equal(normalizePaymentTermValue('net_7'), 'net_7')
assert.equal(isKnownPaymentTermValue(customTerms), false)
assert.equal(getPaymentTermLabel(customTerms, translator), customTerms)
assert.match(builder, /companySettings\?\.defaults\?\.paymentTerms/)
assert.match(builder, /paymentTermsCustom/)
assert.match(builder, /paymentTermsUseCompanyDefault/)
assert.match(builder, /paymentTerms: String\(paymentTerms \|\| ''\)\.trim\(\)/)
assert.match(settings, /isKnownPaymentTermValue\(defaults\.paymentTerms\)/)
assert.match(settings, /<textarea value=\{defaults\.paymentTerms \|\| ''\}/)
assert.match(onboarding, /isKnownPaymentTermValue\(defaults\.paymentTerms\)/)
assert.match(onboarding, /<textarea id="onboarding-terms"/)
assert.match(estimatePersistence, /payload\.payment_terms = readField\(estimate, \['paymentTerms', 'payment_terms'\]\) \|\| null/)
assert.match(settingsPersistence, /default_payment_terms: String\(normalized\.defaults\.paymentTerms \|\| ''\)\.trim\(\) \|\| null/)
assert.match(publicEstimate, /estimate\.paymentTerms \|\| companySettings\.defaults\?\.paymentTerms/)
const duplicated = buildDuplicatedEstimateDraft({
  project: { id: 'project-1', leadId: 'lead-1' },
  estimate: { paymentTerms: customTerms, lineItems: [] },
})
assert.equal(duplicated.paymentTerms, customTerms)
assert.match(duplicateDraft, /Object\.entries\(estimate \|\| \{\}\)/)
assert.match(schema, /payment_terms text/)
assert.match(defaults, /50% down payment with remaining balance due weekly based on work progress\./)
assert.doesNotMatch(defaults, /downpayment/)
assert.match(en, /contractPaymentTermsDownPayment\": \"Down payment of \{\{deposit\}\}/)
assert.match(contractDocument, /currency\.format\(safeDeposit\)/)
console.log('Payment terms flexibility verification passed.')

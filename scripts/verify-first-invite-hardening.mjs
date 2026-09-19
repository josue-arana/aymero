import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const appSource = read('src/App.jsx')
const selectorSource = read('src/components/projects/ProjectPaymentSelectionModal.jsx')
const projectSource = read('src/pages/ProjectDetailPage.jsx')
const contractsSource = read('src/pages/ContractsPage.jsx')
const onboardingSource = read('src/pages/AuthOnboardingPage.jsx')
const onboardingServiceSource = read('src/services/supabase/contractorOnboardingSupabaseService.js')
const enSource = read('src/translations/en.js')
const esSource = read('src/translations/es.js')

assert.match(appSource, /ProjectPaymentSelectionModal/)
assert.match(appSource, /onRecordPayment=\{\(\) => setIsDashboardPaymentSelectionOpen\(true\)\}/)
assert.doesNotMatch(appSource, /onRecordPayment=\{\(\) => navigate\(appRoutes\.invoices\)\}/)
assert.match(appSource, /openRecordPayment: true/)
assert.match(selectorSource, /onSelectProject/)
assert.match(selectorSource, /calculateProjectFinancialSummary/)
assert.match(selectorSource, /onSelectProject\?\.\(project\.id\)/)
assert.doesNotMatch(selectorSource, /onSave|createInvoice|onRecordInvoicePayment/)
assert.match(projectSource, /openRecordPaymentOnLoad/)
assert.match(projectSource, /<RecordPaymentModal/)

assert.doesNotMatch(contractsSource, /contractsComingDescription/)
assert.match(contractsSource, /contractsDescription/)
assert.match(enSource, /"contractsDescription"\s*:/)
assert.match(esSource, /"contractsDescription"\s*:/)

assert.match(onboardingSource, /errorMessage \? t\('retry'\)/)
assert.match(onboardingSource, /t\('onboardingSaveError'\)/)
assert.match(onboardingServiceSource, /technicalMessage/)
assert.match(onboardingServiceSource, /console\.error\('\[dev\] Contractor onboarding failed\.'/)
for (const source of [enSource, esSource]) {
  const match = source.match(/"onboardingSaveError"\s*:\s*"([^"]+)"/)
  assert.ok(match, 'onboardingSaveError translation exists')
  assert.doesNotMatch(match[1], /Supabase|RPC|SQL|database|grants|policies|permisos|base de datos/i)
}

console.log('First-invite hardening validation passed.')

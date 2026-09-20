import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProjectPaymentSelectionSummary } from '../src/utils/projectPaymentSelection.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const appSource = read('src/App.jsx')
const selectorSource = read('src/components/projects/ProjectPaymentSelectionModal.jsx')
const selectionHelperSource = read('src/utils/projectPaymentSelection.js')
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
assert.match(selectorSource, /buildProjectPaymentSelectionSummary/)
assert.match(selectionHelperSource, /calculateProjectFinancialSummary/)
assert.match(selectionHelperSource, /getEstimatesForProject/)
assert.match(selectionHelperSource, /getContractForProject/)
assert.match(selectorSource, /onSelectProject\?\.\(project\.id\)/)
assert.doesNotMatch(selectorSource, /record\?\.remainingBalance|record\?\.remaining|relatedLead\?\.remainingBalance|relatedLead\?\.remaining/)
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

const summary = (project, options = {}) => buildProjectPaymentSelectionSummary({ project, ...options })
assert.equal(summary({ id: 'test-project', projectValue: 3000 }).remainingBalance, 3000)
assert.equal(summary({ id: 'test-new-lead', projectValue: 3445 }, { payments: [{ id: 'payment-400', projectId: 'test-new-lead', amount: 400 }] }).remainingBalance, 3045)
assert.equal(summary({ id: 'synthetic-bathroom', projectValue: 500 }).remainingBalance, 500)
assert.equal(summary({ id: 'missing-financial-summary' }).remainingBalance, null)

const multiple = [
  summary({ id: 'project-a', projectValue: 3000 }),
  summary({ id: 'project-b', projectValue: 3445 }, { payments: [{ id: 'payment-b', projectId: 'project-b', amount: 400 }] }),
]
assert.deepEqual(multiple.map((item) => item.remainingBalance), [3000, 3045])
assert.equal(summary({ id: 'updated-project', projectValue: 3000 }, { payments: [{ id: 'payment-updated', projectId: 'updated-project', amount: 750 }] }).remainingBalance, 2250)
assert.equal(summary({ id: 'invoiced-project', projectValue: 3000 }, { invoices: [{ id: 'invoice-1', projectId: 'invoiced-project', amount: 1000, amountPaid: 200, status: 'sent' }] }).remainingBalance, 3000)

console.log('First-invite hardening validation passed.')

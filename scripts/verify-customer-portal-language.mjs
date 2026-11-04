import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })
const {
  getCustomerPortalLanguageStorageKey,
  resolveCustomerPortalLanguage,
} = await vite.ssrLoadModule('/src/utils/customerPortalLanguage.js')

assert.equal(resolveCustomerPortalLanguage({
  explicitSelection: 'en',
  client: { preferredLanguage: 'es' },
  lead: { preferredLanguage: 'es' },
}), 'en')
assert.equal(resolveCustomerPortalLanguage({
  client: { preferredLanguage: 'es' },
  lead: { preferredLanguage: 'en' },
}), 'es')
assert.equal(resolveCustomerPortalLanguage({
  client: {},
  lead: { preferred_language: 'es' },
}), 'es')
assert.equal(resolveCustomerPortalLanguage({
  client: {},
  lead: { client_language: 'es' },
}), 'es')
assert.equal(resolveCustomerPortalLanguage({
  client: {},
  lead: {},
}), 'en')
assert.equal(resolveCustomerPortalLanguage({
  explicitSelection: 'es',
  client: { preferredLanguage: 'en' },
}), 'es')
assert.notEqual(
  getCustomerPortalLanguageStorageKey('portal-one'),
  getCustomerPortalLanguageStorageKey('portal-two'),
  'A customer selection must not leak to a different portal token.'
)

const portalLabels = [
  ['customerPortal', 'Client Portal', 'Portal del cliente'],
  ['projectValue', 'Project Value', 'Valor del proyecto'],
  ['amountPaid', 'Amount Paid', 'Monto pagado'],
  ['balanceDue', 'Balance Due', 'Saldo pendiente'],
  ['paymentHistory', 'Payment History', 'Historial de pagos'],
  ['projectSchedule', 'Project Schedule', 'Agenda del trabajo'],
  ['documents', 'Documents', 'Documentos'],
  ['downloadPdf', 'Download PDF', 'Descargar PDF'],
]

const englishPortalT = (key) => en[key] ?? key
const spanishPortalT = (key) => es[key] ?? en[key] ?? key
for (const [key, english, spanish] of portalLabels) {
  assert.equal(englishPortalT(key), english, `English portal key ${key} must render in English.`)
  assert.equal(spanishPortalT(key), spanish, `Spanish portal key ${key} must render in Spanish.`)
  assert.equal(en[key], english)
  assert.equal(es[key], spanish)
}

const pageSource = await readFile(new URL('../src/pages/CustomerPortalPage.jsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const endpointSource = await readFile(new URL('../supabase/functions/super-endpoint/index.ts', import.meta.url), 'utf8')
const leadLanguageMigration = await readFile(new URL('../supabase/migrations/20260707152523_add_client_language_preferences.sql', import.meta.url), 'utf8')
const summarySource = await readFile(new URL('../src/components/portal/PortalSummary.jsx', import.meta.url), 'utf8')

assert.match(pageSource, /explicitSelection: readCustomerPortalLanguageSelection\(resolvedPortalId\)/)
assert.match(pageSource, /resolvePortalRouteId\(project\) !== resolvedPortalId/, 'Wait for the matching portal project before resolving its language.')
assert.match(pageSource, /client,[\s\S]*lead: project,[\s\S]*fallback: 'en'/)
assert.match(pageSource, /<select id="customer-portal-language" value=\{language\}/)
assert.match(pageSource, /persistCustomerPortalLanguageSelection\(resolvedPortalId, nextLanguage\)/)
assert.match(appSource, /function PortalRoute\(\{ companySettings, projects, clients, onBack \}\)[\s\S]*?useState\('en'\)[\s\S]*?createTranslator\(customerPortalLanguage\)/)
assert.match(summarySource, /contractDocumentT = useMemo/)
assert.match(summarySource, /estimateLanguage|contractLanguage/)

// The public token handler exposes only the related customer's preference,
// queried by the token-resolved tenant/project relationship.
assert.match(endpointSource, /\.from\('leads'\)[\s\S]*?\.eq\('contractor_id', contractorId\)[\s\S]*?\.eq\('id', project\.lead_id\)/)
assert.match(leadLanguageMigration, /alter table public\.leads\s+add column if not exists client_language text/)
assert.match(endpointSource, /\.select\('name, phone, email, address, client_language'\)/)
assert.doesNotMatch(endpointSource, /\.from\('leads'\)\s*\.select\('[^']*preferred_language/)
assert.match(endpointSource, /const customerPreferredLanguage = client\.preferred_language \|\| relatedLead\.client_language \|\| ''/)
assert.match(endpointSource, /defaultLanguage: customerPreferredLanguage \|\| 'en'/)
assert.match(endpointSource, /if \(leadResult\.error\) return portalQueryFailure\('linked_lead', leadResult\.error, portalRequestId\)/)
assert.match(endpointSource, /operation: 'portal',[\s\S]*step,[\s\S]*requestId,[\s\S]*code: safeCode/)
assert.match(endpointSource, /\.eq\('public_portal_token', token\)/)

// Project titles and saved document content remain data, not interface labels.
assert.match(pageSource, /const projectTitle = project\?\.projectTitle \|\| project\?\.projectType/)
assert.match(summarySource, /scope: estimate\?\.summary \?\? estimate\?\.scopeOfWork/)

console.log('Customer Portal language resolution validation passed.')
await vite.close()

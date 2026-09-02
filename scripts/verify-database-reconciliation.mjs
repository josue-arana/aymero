import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migrationDirectory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const migrationArchiveDirectory = fileURLToPath(new URL('../supabase/migrations_archive/', import.meta.url))
const activeMigrationFiles = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()
const scopeAssistantMigrationName = '20260831_add_estimate_scope_assistant_state.sql'
const coreCrmRlsMigrationName = '20260901143000_enable_core_crm_rls.sql'
const pendingForwardMigrationNames = [scopeAssistantMigrationName, coreCrmRlsMigrationName]
const migrationFiles = activeMigrationFiles.filter((name) => !pendingForwardMigrationNames.includes(name))
const archivedMigrationFiles = readdirSync(migrationArchiveDirectory).filter((name) => name.endsWith('.sql')).sort()
const repositoryMigrationFiles = [...migrationFiles, ...archivedMigrationFiles].sort()
const reconciliation = read('../docs/PRODUCTION_DATABASE_RECONCILIATION.md')
const repairPlan = read('../docs/PRODUCTION_MIGRATION_REPAIR_PLAN.md')
const broadAuditSql = read('../docs/PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql')
const evidenceAuditSql = read('../docs/PRODUCTION_MIGRATION_EVIDENCE_AUDIT.sql')
const cleanupSql = read('../docs/STRIPE_SANDBOX_BILLING_CLEANUP.sql')
const billingMigration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
const cancelAtMigration = read('../supabase/migrations/20260828_add_billing_subscription_cancel_at.sql')
const onboardingMigration = read('../supabase/migrations/20260622235647_enable_self_service_beta_onboarding.sql')
const onboardingAclMigrationName = '20260829191542_restrict_beta_onboarding_function_execute.sql'
const onboardingAclMigration = read(`../supabase/migrations/${onboardingAclMigrationName}`)
const scopeAssistantMigration = read(`../supabase/migrations/${scopeAssistantMigrationName}`)
const coreCrmRlsMigration = read(`../supabase/migrations/${coreCrmRlsMigrationName}`)
const greenfieldManifest = JSON.parse(read('../supabase/bootstrap/greenfield-manifest.json'))
const greenfieldBootstrap = read('../scripts/bootstrap-aymero-greenfield.mjs')
const greenfieldDocumentation = read('../docs/STAGING_DATABASE_BOOTSTRAP.md')
const stagingSchemaVerification = read('../scripts/verify-aymero-staging-schema.mjs')
const app = read('../src/App.jsx')
const authContext = read('../src/contexts/AuthContext.jsx')
const onboardingService = read('../src/services/supabase/contractorOnboardingSupabaseService.js')
const supabaseClient = read('../src/lib/supabaseClient.js')
const checkout = read('../supabase/functions/create-billing-checkout/index.ts')
const portal = read('../supabase/functions/create-billing-portal/index.ts')
const webhook = read('../supabase/functions/stripe-billing-webhook/index.ts')

assert.equal(activeMigrationFiles.length, 25)
assert.equal(migrationFiles.length, 23)
assert.equal(archivedMigrationFiles.length, 2)
assert.deepEqual(archivedMigrationFiles, [
  '20260628211023_add_simple_mode_to_company_settings.sql',
  '20260629002609_fix_project_photos_rls.sql',
])

// Empty non-production environments use a schema-only historical baseline,
// while production keeps its already-reconciled forward-history guarantees.
assert.equal(greenfieldManifest.productionProjectRef, 'qespkkmxaxzsfqrlghev')
assert.equal(greenfieldManifest.baseline.sourceCommit, 'b8ee1e7c58b6c5a86d25173256c6883984f0db4c')
assert.equal(greenfieldManifest.baseline.sourcePath, 'supabase/schema.sql')
assert.match(greenfieldManifest.baseline.sha256, /^[0-9a-f]{64}$/)
assert.equal(greenfieldManifest.baseline.temporaryLedgerVersion, '00000000000000')
assert.deepEqual(
  greenfieldManifest.productionOnlyHistorical.map(({ filename }) => filename).sort(),
  [
    '20260622235648_link_miguel_contractor_membership.sql',
    '20260622_create_miguel_contractor_profile.sql',
  ],
)
assert.deepEqual(greenfieldManifest.pendingForward, pendingForwardMigrationNames)
assert.deepEqual(greenfieldManifest.supersededHistoryOnly.sort(), archivedMigrationFiles)

const classifiedActiveMigrations = [
  ...greenfieldManifest.productionOnlyHistorical.map(({ filename }) => filename),
  ...greenfieldManifest.reusableHistorical,
  ...greenfieldManifest.pendingForward,
].sort()
assert.deepEqual(classifiedActiveMigrations, activeMigrationFiles)
assert.equal(new Set(classifiedActiveMigrations).size, activeMigrationFiles.length)
assert.equal(greenfieldManifest.reusableHistorical.length, 21)

assert.match(greenfieldBootstrap, /projectRef === manifest\.productionProjectRef/)
assert.match(greenfieldBootstrap, /--confirm-empty-non-production/)
assert.match(greenfieldBootstrap, /inspect', 'db', 'table-stats', '--project-ref', projectRef/)
assert.match(greenfieldBootstrap, /Historical baseline hash mismatch/)
assert.match(greenfieldBootstrap, /Historical baseline contains row-data SQL/)
assert.match(greenfieldBootstrap, /to_regclass\('public\.contractors'\)/)
assert.match(greenfieldBootstrap, /'--project-ref', projectRef/)
assert.match(greenfieldBootstrap, /manifest\.productionOnlyHistorical\.map/)
assert.doesNotMatch(greenfieldBootstrap, /qespkkmxaxzsfqrlghev/)
assert.match(greenfieldDocumentation, /EMPTY NON-PRODUCTION|empty non-production/i)
assert.match(greenfieldDocumentation, /never run.*Aymero Production/i)
assert.match(greenfieldDocumentation, /20260831_add_estimate_scope_assistant_state\.sql/)
assert.match(greenfieldDocumentation, /20260622_create_miguel_contractor_profile\.sql/)
assert.match(greenfieldDocumentation, /20260622235648_link_miguel_contractor_membership\.sql/)
assert.match(stagingSchemaVerification, /projectRef === productionRef/)
assert.match(stagingSchemaVerification, /scope_assistant_state/)
assert.match(stagingSchemaVerification, /estimates_scope_assistant_state_object_check/)
assert.match(stagingSchemaVerification, /Unexpected row data in staging table/)
assert.match(stagingSchemaVerification, /has_function_privilege/)
assert.match(stagingSchemaVerification, /'--project-ref', projectRef/)
const historicalMigrationFiles = migrationFiles.filter((name) => name !== onboardingAclMigrationName)
assert.equal(historicalMigrationFiles.length, 22)
assert.equal(repositoryMigrationFiles.length, 25)
for (const migrationFile of repositoryMigrationFiles) {
  const escaped = migrationFile.replaceAll('.', '\\.')
  assert.match(reconciliation, new RegExp(escaped))
  assert.match(repairPlan, new RegExp(escaped))
}

// Active migration history is normalized to one file per unique version.
const versions = activeMigrationFiles.map((name) => name.match(/^(\d+)_/)?.[1] || '').filter(Boolean)
const versionCounts = versions.reduce(
  (result, version) => result.set(version, (result.get(version) || 0) + 1),
  new Map(),
)
assert.equal(versionCounts.size, 25)
const duplicateVersions = [...versionCounts].filter(([, count]) => count > 1).map(([version]) => version)
assert.deepEqual(duplicateVersions, [])

// The final matrix has one allowed classification and ledger action per migration.
const allowedClassifications = [
  'FULLY PRESENT',
  'PARTIALLY PRESENT',
  'SUPERSEDED',
  'NOT PRESENT',
  'CANNOT DETERMINE',
]
const matrixSection = reconciliation
  .split('## Final 25-file classification')[1]
  ?.split('## Onboarding ACL conclusion')[0] || ''
const matrixRows = matrixSection
  .split('\n')
  .filter((line) => /^\| `\d+_[^`]+\.sql` \|/.test(line))
assert.equal(matrixRows.length, repositoryMigrationFiles.length)

const matrix = new Map()
for (const row of matrixRows) {
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim())
  assert.equal(cells.length, 7)
  const filename = cells[0].replaceAll('`', '')
  const classification = cells[4].replaceAll('`', '')
  const ledgerAction = cells[5].replaceAll('`', '')
  assert.ok(repositoryMigrationFiles.includes(filename), `Unknown matrix filename: ${filename}`)
  assert.ok(allowedClassifications.includes(classification), `Invalid classification for ${filename}`)
  assert.match(ledgerAction, /^(?:KEEP EXISTING|MARK APPLIED|DO NOT MARK APPLIED|RENUMBER BEFORE FUTURE USE|ARCHIVE AFTER APPROVAL|NO ACTION|CONDITIONAL MARK AFTER APPROVAL|MARK ONLY IF QUERY 17 MATCHES)$/)
  assert.equal(matrix.has(filename), false, `Duplicate matrix row for ${filename}`)
  if (classification !== 'FULLY PRESENT') {
    assert.doesNotMatch(ledgerAction, /^(?:KEEP EXISTING|MARK APPLIED|RENUMBER BEFORE FUTURE USE)$/)
  }
  matrix.set(filename, { classification, ledgerAction })
}
assert.deepEqual([...matrix.keys()].sort(), repositoryMigrationFiles)

const classificationCounts = Object.fromEntries(allowedClassifications.map((classification) => [classification, 0]))
for (const { classification } of matrix.values()) classificationCounts[classification] += 1
assert.deepEqual(classificationCounts, {
  'FULLY PRESENT': 23,
  'PARTIALLY PRESENT': 0,
  SUPERSEDED: 2,
  'NOT PRESENT': 0,
  'CANNOT DETERMINE': 0,
})
assert.deepEqual(
  [...matrix].filter(([, value]) => value.classification === 'PARTIALLY PRESENT').map(([filename]) => filename),
  [],
)

// Existing remote identities, supersession, ACL mismatch, and the approved gates remain explicit.
for (const document of [reconciliation, repairPlan]) {
  assert.match(document, /20260622[\s\S]*create_miguel_contractor_profile/)
  assert.match(document, /20260828[\s\S]*add_billing_subscription_cancel_at/)
  assert.match(document, /Query 17[\s\S]*(?:matched|FULLY PRESENT)/i)
}
assert.match(reconciliation, /Simple Mode[\s\S]*intentionally superseded by Analytics Mode/)
assert.match(reconciliation, /before F\.6[\s\S]*anon EXECUTE was true/)
assert.match(reconciliation, /PUBLIC=false, anon=false, authenticated=true, and service_role=true/)
assert.match(reconciliation, /historical migration's explicit PUBLIC revoke/)
assert.match(onboardingMigration, /revoke all on function[\s\S]*from public/)
assert.match(onboardingMigration, /grant execute on function[\s\S]*to authenticated/)
assert.match(onboardingAclMigration, /revoke execute on function[\s\S]*from public/)
assert.match(onboardingAclMigration, /revoke execute on function[\s\S]*from anon/)
assert.match(onboardingAclMigration, /grant execute on function[\s\S]*to authenticated/)
assert.match(onboardingAclMigration, /grant execute on function[\s\S]*to service_role/)
assert.doesNotMatch(onboardingAclMigration, /create or replace function/i)
assert.match(app, /USE_AUTH && isAuthenticated && \(onboardingRequired/)
assert.match(authContext, /const isAuthenticated = Boolean\(user\)/)
assert.match(authContext, /completeBetaContractorOnboarding\(profile\)/)
assert.match(onboardingService, /rpc\/complete_beta_contractor_onboarding/)
assert.match(supabaseClient, /Authorization: `Bearer \$\{accessToken \|\| supabaseAnonKey\}`/)
assert.match(reconciliation, /eighth[\s\S]*`project`/i)
assert.match(reconciliation, /LegacyDbPushMissingRemoteError/)
assert.match(reconciliation, /20260829191542_restrict_beta_onboarding_function_execute\.sql[\s\S]*FULLY PRESENT/i)
assert.match(reconciliation, /Pre-repair linked ledger snapshot/)
assert.match(reconciliation, /"remote":"20260622"/)
assert.match(reconciliation, /"remote":"20260828"/)
for (const document of [reconciliation, repairPlan]) {
  assert.match(document, /DATABASE MIGRATION RECONCILIATION COMPLETE/)
  assert.match(document, /Post-repair linked ledger/)
  assert.match(document, /Would push these migrations:[\s\S]*20260829191542_restrict_beta_onboarding_function_execute\.sql/)
  assert.match(document, /LegacyDbPushMissingRemoteError[\s\S]*(?:gone|no historical)/i)
  assert.match(document, /"upToDate":true,"dryRun":true,"migrations":\[\]/)
  assert.match(document, /Remote database is up to date/)
}

// The normalization map covers all files and preserves both recorded identities.
const normalizationSection = repairPlan
  .split('## Complete repository normalization mapping')[1]
  ?.split('## Evidence gates')[0] || ''
const normalizationRows = normalizationSection
  .split('\n')
  .filter((line) => /^\| `\d+_[^`]+\.sql` \|/.test(line))
assert.equal(normalizationRows.length, repositoryMigrationFiles.length)
const normalizedFiles = normalizationRows.map((row) => {
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim())
  assert.equal(cells.length, 7)
  return cells[0].replaceAll('`', '')
})
assert.deepEqual(normalizedFiles.sort(), repositoryMigrationFiles)
assert.match(normalizationSection, /20260622_create_miguel_contractor_profile\.sql[\s\S]*unchanged[\s\S]*Keep existing/)
assert.match(normalizationSection, /20260828_add_billing_subscription_cancel_at\.sql[\s\S]*unchanged[\s\S]*Keep existing/)

// Proposed repair and inverse commands are exact, paired, and exclude unsafe versions.
const expectedRepairVersions = [
  '20260622235647',
  '20260622235648',
  '20260624',
  '20260625',
  '20260629002608',
  '20260629002610',
  '20260630',
  '20260707152523',
  '20260707170751',
  '20260718',
  '20260719020608',
  '20260719020609',
  '20260721003929',
  '20260721173314',
  '20260721173315',
  '20260725',
  '20260726',
  '20260812',
  '20260816',
  '20260826',
]
const appliedRepairVersions = [...repairPlan.matchAll(/^supabase migration repair (\d+) --status applied --linked$/gm)].map((match) => match[1])
const revertedRepairVersions = [...repairPlan.matchAll(/^supabase migration repair (\d+) --status reverted --linked$/gm)].map((match) => match[1])
assert.deepEqual(appliedRepairVersions, expectedRepairVersions)
assert.deepEqual(revertedRepairVersions, expectedRepairVersions)
for (const unsafeVersion of ['20260622', '20260628211023', '20260629002609', '20260828', '20260829191542']) {
  assert.equal(appliedRepairVersions.includes(unsafeVersion), false)
}
assert.match(repairPlan, /Sprint 3\.44F\.5/)
assert.match(repairPlan, /Never use a blanket loop or `--include-all`/)
assert.match(repairPlan, /exited `0` and showed exactly one pending forward migration/)
assert.match(repairPlan, /20260622235647_enable_self_service_beta_onboarding\.sql/)
assert.match(repairPlan, /20260624_enable_payments_supabase_beta\.sql/)
const successfulRepairRows = [...repairPlan.matchAll(/^\| \d+ \| `([^`]+)` \| applied \| 0 \|$/gm)].map((match) => match[1])
assert.deepEqual(successfulRepairRows, expectedRepairVersions)

// Renames/archive operations preserve the historical SQL byte-for-byte.
const expectedMigrationHashes = new Map([
  ['../supabase/migrations/20260622235647_enable_self_service_beta_onboarding.sql', '5d10015b91c764ec21ca7ec4f351c7e2cfc4e0c79c4b8ced0f823feb3bc737e1'],
  ['../supabase/migrations/20260622235648_link_miguel_contractor_membership.sql', '4ff30d2071bdf131a969d99cf5f165f77e46018fc82d7474c8cfec3dfd6d5703'],
  ['../supabase/migrations_archive/20260628211023_add_simple_mode_to_company_settings.sql', '3e3b759d7f48dbbf501b7665de5e08671af173a9d850c8f48cd41e0ec93a75b6'],
  ['../supabase/migrations/20260629002608_enable_project_photos_storage_beta.sql', 'a6b334ad7c034781cc06a6085bf31ec0ca6a00947ffbe8b2139f7276aa74f2e1'],
  ['../supabase/migrations_archive/20260629002609_fix_project_photos_rls.sql', '86454210f8a56a1fa51edde3eaad7d15f3b01ffc2a1972818fe0131894073cb4'],
  ['../supabase/migrations/20260629002610_fix_project_photos_identity_rls.sql', '737aacbc6be40e2ee24021361606680d52ff05e07e961e299b6f51fde14f6878'],
  ['../supabase/migrations/20260707152523_add_client_language_preferences.sql', '2eb418a27d5de2ac295bc6036b449f1fcf1cc84295b1340d4f5ee45cabfe3ebc'],
  ['../supabase/migrations/20260707170751_add_estimate_language.sql', '69decc0d149881917a576e366c8e2e828cf1b58df083d24e0409429aec9d76b6'],
  ['../supabase/migrations/20260719020608_add_sample_workspace_manifest.sql', '697d1d78a2aa99e2043a8fbe2aaad236422813c85948514e02aa2fe936dea14f'],
  ['../supabase/migrations/20260719020609_connect_sample_workspace_journey.sql', 'bdc9381c5b619caceef35b6a58e0bfb00f330ec6bc2a8fe09a2e87fdaac891f5'],
  ['../supabase/migrations/20260721003929_enable_invoices_supabase_rls.sql', '8ed5214be29266e128437d5f9f9ecba22267fe45c89a175146119d7b31a04392'],
  ['../supabase/migrations/20260721173314_enable_contracts_delete_rls.sql', 'a133cfe730807c20d8e36b8db2cfac2deb403a01534cbdf3e559c3c73cc6f3e4'],
  ['../supabase/migrations/20260721173315_enable_estimates_delete_rls.sql', '4f206db51987085ab4ae5eb4d100a8eeb8028982d88a742d17349984ddebf663'],
])
for (const [relativePath, expectedHash] of expectedMigrationHashes) {
  const hash = createHash('sha256').update(read(relativePath)).digest('hex')
  assert.equal(hash, expectedHash, `Historical SQL changed during normalization: ${relativePath}`)
}

// Both audit artifacts remain read-only; the targeted file has 17 documented queries.
assert.doesNotMatch(broadAuditSql, /^\s*(?:insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/im)
const queryNumbers = [...evidenceAuditSql.matchAll(/^-- Query (\d{2}) —/gm)].map((match) => match[1])
assert.deepEqual(queryNumbers, Array.from({ length: 17 }, (_, index) => String(index + 1).padStart(2, '0')))
const documentedQuerySections = evidenceAuditSql.split(/^-- Query \d{2} —/gm).slice(1)
assert.equal(documentedQuerySections.length, 17)
for (const [index, section] of documentedQuerySections.entries()) {
  assert.match(section, /Migration(?:s| context)?:/, `Evidence Query ${index + 1} lacks migration mapping`)
  assert.match(section, /FULLY PRESENT/, `Evidence Query ${index + 1} lacks success interpretation`)
  assert.match(section, /PARTIAL\/ABSENT/, `Evidence Query ${index + 1} lacks mismatch interpretation`)
  assert.match(section, /Absence/, `Evidence Query ${index + 1} lacks empty-result interpretation`)
}
const executableEvidenceSql = evidenceAuditSql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--.*$/gm, '')
const evidenceStatements = executableEvidenceSql.split(';').map((statement) => statement.trim()).filter(Boolean)
assert.equal(evidenceStatements.length, 17)
for (const [index, statement] of evidenceStatements.entries()) {
  assert.match(statement, /^(?:select|with)\b/i, `Evidence Query ${index + 1} is not SELECT/CTE SELECT`)
  const withoutStrings = statement.replace(/'(?:''|[^'])*'/gs, "''")
  assert.doesNotMatch(
    withoutStrings,
    /\b(?:insert|update|delete|merge|alter|create|drop|grant|revoke|truncate|call|do|copy|vacuum|reindex|cluster|refresh)\b/i,
  )
  assert.doesNotMatch(withoutStrings, /\b(?:public|auth|storage)\.\w+\s*\(/i)
  assert.doesNotMatch(withoutStrings, /\b(?:nextval|setval|dblink|lo_import|lo_export)\s*\(/i)
}

// Billing source intent and current Edge Function compatibility remain covered.
for (const column of [
  'contractor_id',
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_price_id',
  'plan_key',
  'status',
  'current_period_start',
  'current_period_end',
  'cancel_at_period_end',
  'last_payment_status',
  'processed_at',
]) assert.match(billingMigration, new RegExp(`\\b${column}\\b`))
assert.match(cancelAtMigration, /add column if not exists cancel_at timestamptz/)
assert.match(billingMigration, /billing_customers_contractor_id_key unique \(contractor_id\)/)
assert.match(billingMigration, /unique \(stripe_customer_id\)/)
assert.match(billingMigration, /unique \(stripe_subscription_id\)/)
assert.match(billingMigration, /active_members_can_read_billing_customers/)
assert.match(billingMigration, /active_members_can_read_billing_subscriptions/)
assert.match(billingMigration, /revoke all on table public\.billing_webhook_events from anon, authenticated/)
assert.match(checkout, /\.from\('billing_customers'\)/)
assert.match(checkout, /\.from\('billing_subscriptions'\)/)
assert.match(portal, /\.from\('billing_customers'\)/)
assert.match(webhook, /\.from\('billing_webhook_events'\)/)
assert.match(webhook, /cancel_at: stripeTimestampToIso\(subscription\?\.cancel_at\)/)

// Stripe cleanup remains exact-ID, fail-closed, and rollback-first.
assert.match(cleanupSql, /MANUAL REVIEW REQUIRED — DO NOT RUN AUTOMATICALLY/)
assert.match(cleanupSql, /livemode=false/)
assert.match(cleanupSql, /Unclassified billing customer exists/)
assert.match(cleanupSql, /Unclassified billing subscription exists/)
assert.match(cleanupSql, /Unclassified billing webhook event exists/)
assert.doesNotMatch(cleanupSql, /delete from public\.billing_(?:customers|subscriptions|webhook_events);/)
assert.match(cleanupSql, /rollback;/)

// Both pre-existing remote identities and the forward ACL filename remain exact.
assert.ok(migrationFiles.includes('20260622_create_miguel_contractor_profile.sql'))
assert.ok(migrationFiles.includes('20260828_add_billing_subscription_cancel_at.sql'))
assert.ok(migrationFiles.includes(onboardingAclMigrationName))
assert.ok(activeMigrationFiles.includes(scopeAssistantMigrationName))
assert.ok(activeMigrationFiles.includes(coreCrmRlsMigrationName))
assert.match(scopeAssistantMigration, /add column if not exists scope_assistant_state jsonb not null default '\{\}'::jsonb/)
assert.match(scopeAssistantMigration, /jsonb_typeof\(scope_assistant_state\) = 'object'/)
assert.match(coreCrmRlsMigration, /alter table public\.clients enable row level security/)
assert.match(coreCrmRlsMigration, /alter table public\.estimates enable row level security/)
assert.match(coreCrmRlsMigration, /beta_active_members_can_insert_estimates/)
assert.match(coreCrmRlsMigration, /beta_active_members_can_insert_contracts/)
assert.match(coreCrmRlsMigration, /to authenticated/)

console.log('Database reconciliation validated: the 23-migration production baseline and 2 archives remain intact; the Scope Assistant and core CRM RLS migrations are forward-only.')

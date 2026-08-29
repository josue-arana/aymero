import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migrationDirectory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const migrationFiles = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()
const reconciliation = read('../docs/PRODUCTION_DATABASE_RECONCILIATION.md')
const repairPlan = read('../docs/PRODUCTION_MIGRATION_REPAIR_PLAN.md')
const auditSql = read('../docs/PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql')
const cleanupSql = read('../docs/STRIPE_SANDBOX_BILLING_CLEANUP.sql')
const billingMigration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
const cancelAtMigration = read('../supabase/migrations/20260828_add_billing_subscription_cancel_at.sql')
const checkout = read('../supabase/functions/create-billing-checkout/index.ts')
const portal = read('../supabase/functions/create-billing-portal/index.ts')
const webhook = read('../supabase/functions/stripe-billing-webhook/index.ts')

assert.equal(migrationFiles.length, 24)

// Every local migration is represented in both reconciliation documents.
for (const migrationFile of migrationFiles) {
  const escaped = migrationFile.replaceAll('.', '\\.')
  assert.match(reconciliation, new RegExp(escaped))
  assert.match(repairPlan, new RegExp(escaped))
}

// Duplicate versions are detected from the repository, not copied from prose.
const versions = migrationFiles.map((name) => name.match(/^(\d+)_/)?.[1] || '').filter(Boolean)
const versionCounts = versions.reduce(
  (result, version) => result.set(version, (result.get(version) || 0) + 1),
  new Map(),
)
assert.equal(versionCounts.size, 15)
const duplicateVersions = [...versionCounts].filter(([, count]) => count > 1).map(([version]) => version)
assert.deepEqual(duplicateVersions, ['20260622', '20260628', '20260707', '20260719', '20260721'])
for (const version of duplicateVersions) {
  assert.match(reconciliation, new RegExp(`\`${version}\``))
  assert.match(repairPlan, new RegExp(`\`${version}\``))
}

// The matrix has exactly one row and one allowed classification per migration.
const allowedClassifications = [
  'FULLY PRESENT',
  'PARTIALLY PRESENT',
  'SUPERSEDED',
  'NOT PRESENT',
  'CANNOT DETERMINE',
]
const matrixRows = reconciliation
  .split('\n')
  .filter((line) => /^\| `\d+_[^`]+\.sql` \|/.test(line))
assert.equal(matrixRows.length, migrationFiles.length)

const matrix = new Map()
for (const row of matrixRows) {
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim())
  assert.equal(cells.length, 11)
  const filename = cells[0].replaceAll('`', '')
  const classification = cells[7].replaceAll('`', '')
  assert.ok(migrationFiles.includes(filename), `Unknown matrix filename: ${filename}`)
  assert.ok(allowedClassifications.includes(classification), `Invalid classification for ${filename}`)
  assert.equal(matrix.has(filename), false, `Duplicate matrix row for ${filename}`)
  matrix.set(filename, { classification, safeToMark: cells[8] })
}
assert.deepEqual([...matrix.keys()].sort(), migrationFiles)

const classificationCounts = Object.fromEntries(allowedClassifications.map((classification) => [classification, 0]))
for (const { classification, safeToMark } of matrix.values()) {
  classificationCounts[classification] += 1
  if (classification !== 'FULLY PRESENT') assert.doesNotMatch(safeToMark, /^YES\b/)
}
assert.deepEqual(classificationCounts, {
  'FULLY PRESENT': 5,
  'PARTIALLY PRESENT': 3,
  SUPERSEDED: 2,
  'NOT PRESENT': 0,
  'CANNOT DETERMINE': 14,
})

// Exact known remote rows and the current failure remain explicit.
for (const document of [reconciliation, repairPlan]) {
  assert.match(document, /\| `20260622` \| `create_miguel_contractor_profile` \| 1 \|/)
  assert.match(document, /\| `20260828` \| `add_billing_subscription_cancel_at` \| 2 \|/)
  assert.match(document, /company_settings\.simple_mode`? is absent|`simple_mode` is absent/)
  assert.match(document, /NO-GO/)
}
assert.match(reconciliation, /LegacyDbPushMissingRemoteError/)
assert.match(repairPlan, /one version per command|one at a time/)
assert.match(repairPlan, /Never use a blanket loop, `--include-all`/)
assert.match(repairPlan, /Do \*\*not\*\* run migration repair yet/)
assert.match(repairPlan, /20260622_create_miguel_contractor_profile\.sql[\s\S]*unchanged/)
assert.match(repairPlan, /20260828_add_billing_subscription_cancel_at\.sql[\s\S]*unchanged/)

// Only three unrecorded files are current FULLY PRESENT repair candidates.
for (const candidate of [
  '20260719_add_sample_workspace_manifest.sql',
  '20260726_add_invoice_customer_notes.sql',
  '20260826_add_saas_billing_foundation.sql',
]) assert.match(repairPlan, new RegExp(`\`${candidate.replaceAll('.', '\\.')}\`[\\s\\S]*Candidate`))

// The read-only SQL captures required catalog and data evidence.
for (const requiredCatalog of [
  'supabase_migrations.schema_migrations',
  'information_schema.columns',
  'pg_constraint',
  'pg_indexes',
  'relrowsecurity',
  'pg_policies',
  'has_table_privilege',
  'information_schema.triggers',
  'billing_customers',
  'billing_subscriptions',
  'billing_webhook_events',
]) assert.match(auditSql, new RegExp(requiredCatalog.replaceAll('.', '\\.')))
assert.doesNotMatch(auditSql, /^\s*(?:insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/im)

// Billing source intent includes the proven schema, uniqueness, indexes, RLS, and browser restrictions.
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
assert.match(billingMigration, /billing_subscriptions_contractor_id_idx/)
assert.match(billingMigration, /billing_subscriptions_contractor_status_idx/)
assert.match(billingMigration, /billing_webhook_events_processed_at_idx/)
assert.match(billingMigration, /active_members_can_read_billing_customers/)
assert.match(billingMigration, /active_members_can_read_billing_subscriptions/)
assert.match(billingMigration, /revoke all on table public\.billing_webhook_events from anon, authenticated/)
assert.match(billingMigration, /revoke insert, update, delete[\s\S]*billing_customers from authenticated/)
assert.match(billingMigration, /revoke insert, update, delete[\s\S]*billing_subscriptions from authenticated/)

// Current Edge Functions use fields and conflict identities present in production.
assert.match(checkout, /\.from\('billing_customers'\)/)
assert.match(checkout, /\.from\('billing_subscriptions'\)/)
assert.match(portal, /\.from\('billing_customers'\)/)
assert.match(webhook, /\.from\('billing_webhook_events'\)/)
assert.match(webhook, /\.from\('billing_subscriptions'\)/)
assert.match(webhook, /cancel_at: stripeTimestampToIso\(subscription\?\.cancel_at\)/)
assert.match(webhook, /onConflict: 'stripe_subscription_id'/)

// Cleanup remains exact-ID, fail-closed, CRM-isolated, and rollback-first.
assert.match(cleanupSql, /MANUAL REVIEW REQUIRED — DO NOT RUN AUTOMATICALLY/)
assert.match(cleanupSql, /livemode=false/)
assert.match(cleanupSql, /Unclassified billing customer exists/)
assert.match(cleanupSql, /Unclassified billing subscription exists/)
assert.match(cleanupSql, /Unclassified billing webhook event exists/)
assert.doesNotMatch(cleanupSql, /delete from public\.billing_(?:customers|subscriptions|webhook_events);/)
assert.doesNotMatch(cleanupSql, /delete from public\.(?:contractors|contractor_members|clients|leads|projects|estimates|contracts|invoices|payments|events)/)
assert.match(cleanupSql, /rollback;/)

// This sprint must not alter the active migration files.
const changedMigrations = execFileSync('git', ['diff', '--name-only', '--', 'supabase/migrations'], { encoding: 'utf8' }).trim()
assert.equal(changedMigrations, '')

console.log('Production migration reconciliation plan validated: 24 files classified, duplicate versions held, and no production repair authorized.')

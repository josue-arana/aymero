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
const auditSql = read('../docs/PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql')
const cleanupSql = read('../docs/STRIPE_SANDBOX_BILLING_CLEANUP.sql')
const billingMigration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
const cancelAtMigration = read('../supabase/migrations/20260828_add_billing_subscription_cancel_at.sql')
const checkout = read('../supabase/functions/create-billing-checkout/index.ts')
const portal = read('../supabase/functions/create-billing-portal/index.ts')
const webhook = read('../supabase/functions/stripe-billing-webhook/index.ts')

// Every local migration is inventoried, and every duplicate version is explicit.
for (const migrationFile of migrationFiles) assert.match(reconciliation, new RegExp(migrationFile.replaceAll('.', '\\.')))

const versions = migrationFiles.map((name) => name.match(/^(\d+)_/)?.[1] || '').filter(Boolean)
const counts = versions.reduce((result, version) => result.set(version, (result.get(version) || 0) + 1), new Map())
const duplicateVersions = [...counts].filter(([, count]) => count > 1).map(([version]) => version)
assert.deepEqual(duplicateVersions, ['20260622', '20260628', '20260707', '20260719', '20260721'])
for (const version of duplicateVersions) assert.match(reconciliation, new RegExp(`\`${version}\``))
assert.match(reconciliation, /separate SQL, not duplicate copies/)

// The observed remote ledger and dry-run failure are recorded without pretending reconciliation succeeded.
assert.match(reconciliation, /only remote versions `20260622` and `20260828`/)
assert.match(reconciliation, /LegacyDbPushMissingRemoteError/)
assert.match(reconciliation, /Do not rename migrations|historical filenames must remain unchanged/i)
assert.match(reconciliation, /Did \*\*not\*\* run `migration repair`/)
assert.match(reconciliation, /Did \*\*not\*\* run an actual `db push`/)
assert.match(reconciliation, /Production Stripe billing remains \*\*NO-GO\*\*/)

// Actual production findings that distinguish schema reality from migration filenames.
assert.match(reconciliation, /`company_settings\.simple_mode`[\s\S]*is absent/)
assert.match(reconciliation, /nullable `cancel_at`/)
assert.match(reconciliation, /1 billing Customer row/)
assert.match(reconciliation, /1 Subscription row/)
assert.match(reconciliation, /10 webhook Event rows/)
assert.match(reconciliation, /HTTP 401[\s\S]*42501/)

// The read-only SQL captures the missing catalog and data evidence required before any repair.
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

// Billing source intent includes the required schema, uniqueness, indexes, RLS, and browser restrictions.
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

// Current Edge Functions use fields and conflict identities present in the production evidence.
assert.match(checkout, /\.from\('billing_customers'\)/)
assert.match(checkout, /\.from\('billing_subscriptions'\)/)
assert.match(portal, /\.from\('billing_customers'\)/)
assert.match(webhook, /\.from\('billing_webhook_events'\)/)
assert.match(webhook, /\.from\('billing_subscriptions'\)/)
assert.match(webhook, /cancel_at: stripeTimestampToIso\(subscription\?\.cancel_at\)/)
assert.match(webhook, /onConflict: 'stripe_subscription_id'/)

// Cleanup is exact-ID, fail-closed, CRM-isolated, and rollback-first.
assert.match(cleanupSql, /MANUAL REVIEW REQUIRED — DO NOT RUN AUTOMATICALLY/)
assert.match(cleanupSql, /reviewed_sandbox_customers/)
assert.match(cleanupSql, /reviewed_sandbox_subscriptions/)
assert.match(cleanupSql, /reviewed_sandbox_webhook_events/)
assert.match(cleanupSql, /livemode=false/)
assert.match(cleanupSql, /Unclassified billing customer exists/)
assert.match(cleanupSql, /Unclassified billing subscription exists/)
assert.match(cleanupSql, /Unclassified billing webhook event exists/)
assert.match(cleanupSql, /delete from public\.billing_subscriptions as subscription[\s\S]*using reviewed_sandbox_subscriptions/)
assert.match(cleanupSql, /delete from public\.billing_customers as customer[\s\S]*using reviewed_sandbox_customers/)
assert.match(cleanupSql, /delete from public\.billing_webhook_events as webhook_event[\s\S]*using reviewed_sandbox_webhook_events/)
assert.doesNotMatch(cleanupSql, /delete from public\.billing_(?:customers|subscriptions|webhook_events);/)
assert.doesNotMatch(cleanupSql, /delete from public\.(?:contractors|contractor_members|clients|leads|projects|estimates|contracts|invoices|payments|events)/)
assert.match(cleanupSql, /rollback;/)

// This sprint introduces no migration SQL, renamed migration, or destructive production action.
const changedMigrations = execFileSync('git', ['diff', '--name-only', '--', 'supabase/migrations'], { encoding: 'utf8' }).trim()
assert.equal(changedMigrations, '')

console.log('Production database reconciliation evidence validation passed; remote history remains intentionally NO-GO pending catalog and Stripe mode evidence.')

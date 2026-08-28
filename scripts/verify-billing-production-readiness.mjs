import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'
import { canStartSaasBillingCheckout } from '../src/utils/saasBilling.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const checkout = read('../supabase/functions/create-billing-checkout/index.ts')
const portal = read('../supabase/functions/create-billing-portal/index.ts')
const webhook = read('../supabase/functions/stripe-billing-webhook/index.ts')
const shared = read('../supabase/functions/_shared/saasBilling.ts')
const config = read('../supabase/config.toml')
const migration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
const cancellationMigration = read('../supabase/migrations/20260828_add_billing_subscription_cancel_at.sql')
const service = read('../src/services/saasBillingService.js')
const card = read('../src/components/settings/SaasBillingCard.jsx')
const app = read('../src/App.jsx')
const envExample = read('../.env.example')
const gitignore = read('../.gitignore')
const docs = read('../docs/STRIPE_LIVE_MODE_CUTOVER.md')
const health = read('../src/config/developerHealthRegistry.js')

// Browser submits only the stable plan key; the configured Price remains server-side.
assert.match(service, /JSON\.stringify\(\{ planKey \}\)/)
assert.match(shared, /AYMERO_MANAGED_PLAN_KEY = 'aymero_managed'/)
assert.match(shared, /Deno\.env\.get\('STRIPE_PRICE_AYMERO_MANAGED_MONTHLY'\)/)
assert.doesNotMatch(`${service}\n${card}`, /stripePrice|priceId|STRIPE_PRICE_AYMERO_MANAGED_MONTHLY/)
assert.doesNotMatch(`${checkout}\n${shared}`, /price_[A-Za-z0-9]{12,}/)
assert.match(checkout, /'line_items\[0\]\[quantity\]': 1/)
assert.match(docs, /licensed recurring Price[\s\S]*amount \*\*100\.00\*\*[\s\S]*interval \*\*Monthly\*\*/)

// Scan tracked text files without exposing values; committed server-secret-shaped values fail.
const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const textExtensions = new Set(['', '.css', '.example', '.html', '.js', '.jsx', '.json', '.md', '.mjs', '.sql', '.toml', '.ts', '.txt', '.yml', '.yaml'])
const trackedText = trackedFiles
  .filter((path) => textExtensions.has(extname(path)))
  .map((path) => {
    try { return readFileSync(path, 'utf8') } catch { return '' }
  })
  .join('\n')
const stripeSecretPattern = new RegExp(`${['s', 'k'].join('')}_(?:test|live)_[A-Za-z0-9]{12,}`)
const webhookSecretPattern = new RegExp(`${['w', 'h', 's', 'e', 'c'].join('')}_[A-Za-z0-9]{12,}`)
assert.doesNotMatch(trackedText, stripeSecretPattern)
assert.doesNotMatch(trackedText, webhookSecretPattern)
assert.doesNotMatch(trackedText, /VITE_[A-Z0-9_]*STRIPE|STRIPE_[A-Z0-9_]*VITE_/)
assert.match(gitignore, /^\.env$/m)
assert.match(gitignore, /^\.env\.local$/m)
assert.doesNotMatch(envExample, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|STRIPE_PRICE_/)

// Legacy migration history is an explicit production gate, not a reason to push blindly.
const migrationVersions = trackedFiles
  .filter((path) => path.startsWith('supabase/migrations/'))
  .map((path) => path.split('/').at(-1)?.match(/^(\d+)_/)?.[1] || '')
  .filter(Boolean)
const migrationVersionCounts = migrationVersions.reduce((counts, version) => {
  counts.set(version, (counts.get(version) || 0) + 1)
  return counts
}, new Map())
const duplicateMigrationVersions = [...migrationVersionCounts]
  .filter(([, count]) => count > 1)
  .map(([version]) => version)

if (duplicateMigrationVersions.length) {
  assert.match(docs, /linked production migration ledger is not currently trustworthy/)
  assert.match(docs, /Do not mark all missing versions applied blindly/)
  for (const version of duplicateMigrationVersions) assert.match(docs, new RegExp(version))
}
assert.match(docs, /supabase migration list --linked/)
assert.match(docs, /supabase db push --linked --dry-run/)
assert.doesNotMatch(docs, /^supabase db push\s*$/m)
assert.match(cancellationMigration, /add column if not exists cancel_at timestamptz/)

// Return destinations are derived only from the validated server-controlled canonical origin.
for (const edgeFunction of [checkout, portal]) {
  assert.match(edgeFunction, /Deno\.env\.get\('AYMERO_APP_URL'\)/)
  assert.match(edgeFunction, /parsed\.protocol !== 'https:'/)
  assert.doesNotMatch(edgeFunction, /body\?\.(?:return|redirect|success|cancel)/)
  assert.doesNotMatch(edgeFunction, /netlify\.app|localhost:\d+/)
}
assert.doesNotMatch(checkout, /Deno\.env\.get\('APP_URL'\)/)
assert.match(checkout, /success_url: `\$\{appOrigin\}\/settings\/subscription\?billing=success`/)
assert.match(checkout, /cancel_url: `\$\{appOrigin\}\/settings\/subscription\?billing=canceled`/)
assert.match(portal, /return_url: `\$\{appOrigin\}\/settings\/subscription\?billing=portal`/)
assert.match(envExample, /VITE_APP_URL=https:\/\/app\.aymero\.co/)
assert.match(docs, /AYMERO_APP_URL`: exactly `https:\/\/app\.aymero\.co/)

// Live webhook boundary: signed raw body, exact consumed events, no session JWT, and idempotency.
assert.match(config, /\[functions\.stripe-billing-webhook\][\s\S]*verify_jwt = false/)
assert.match(webhook, /const rawBody = await request\.text\(\)/)
assert.match(webhook, /request\.headers\.get\('stripe-signature'\)/)
assert.match(webhook, /await verifyStripeSignature\(rawBody, signatureHeader, webhookSecret\)/)
assert.match(webhook, /signatureToleranceSeconds = 300/)
assert.match(webhook, /if \(supportedEventTypes\.has\(eventType\)\)/)
for (const eventType of [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]) {
  assert.match(webhook, new RegExp(eventType.replaceAll('.', '\\.')))
}
assert.match(webhook, /ledgerInsertError\?\.code === '23505'/)
assert.match(webhook, /processed_at: new Date\(\)\.toISOString\(\)/)
assert.ok(webhook.indexOf('await verifyStripeSignature') < webhook.indexOf('const admin = createClient'))
const apiVersion = shared.match(/STRIPE_API_VERSION = '([^']+)'/)?.[1] || ''
assert.ok(apiVersion)
assert.match(docs, new RegExp(apiVersion.replaceAll('.', '\\.')))
assert.match(docs, /do not upgrade it as part of cutover/i)

// Tenant ownership/customer reuse/RLS are contractor-scoped with no identity fallback.
assert.match(checkout, /admin\.auth\.getUser\(accessToken\)/)
assert.match(checkout, /\.from\('contractor_members'\)/)
assert.match(checkout, /storedBillingCustomer\?\.stripe_customer_id/)
assert.match(checkout, /\.eq\('contractor_id', contractorId\)/)
assert.match(checkout, /billingRoles = new Set\(\['owner', 'admin'\]\)/)
assert.match(portal, /billingRoles = new Set\(\['owner', 'admin'\]\)/)
assert.doesNotMatch(`${checkout}\n${portal}`, /body\?\.(?:contractor|customer|stripe|price)/i)
assert.match(webhook, /\.eq\('stripe_customer_id', stripeCustomerId\)/)
assert.match(webhook, /metadataContractorId !== billingCustomer\.contractor_id/)
assert.doesNotMatch(webhook, /company_name|\.email|customer_email/)
assert.match(migration, /is_active_contractor_member\(contractor_id\)/)
assert.match(migration, /revoke all on table public\.billing_webhook_events from anon, authenticated/)
assert.doesNotMatch(migration, /billing_(?:customers|subscriptions)"[\s\S]{0,120}for (?:insert|update|delete|all)/)

// Duplicate protection and non-blocking billing policy survive live cutover.
const activeStatuses = checkout.match(/existingSubscriptionStatuses = \[[^\]]+\]/)?.[0] || ''
for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) {
  assert.match(activeStatuses, new RegExp(status))
}
assert.equal(canStartSaasBillingCheckout({ status: 'active', cancel_at_period_end: true }), false)
assert.equal(canStartSaasBillingCheckout({ status: 'active', cancel_at: '2099-01-01T00:00:00.000Z' }), false)
assert.equal(canStartSaasBillingCheckout({ status: 'past_due' }), false)
assert.equal(canStartSaasBillingCheckout({ status: 'unpaid' }), false)
assert.equal(canStartSaasBillingCheckout({ status: 'canceled' }), true)
assert.match(card, /billingPaymentAttention/)
assert.doesNotMatch(app, /billing.*(?:lock|logout|signOut)/i)
assert.doesNotMatch(`${checkout}\n${webhook}`, /\.from\('payments'\)|\.from\('invoices'\)/)

// The test/live collision is a documented blocking gate, never silently ignored.
assert.match(docs, /mandatory data cutover gate/)
assert.match(docs, /test `billing_customers\.stripe_customer_id`/)
assert.match(docs, /active test `billing_subscriptions` row could also block live Checkout/)
assert.match(docs, /delete test `billing_subscriptions` rows first, then test `billing_customers`/)
const deleteSubscriptions = docs.indexOf('delete from public.billing_subscriptions;')
const deleteCustomers = docs.indexOf('delete from public.billing_customers;')
const deleteEvents = docs.indexOf('delete from public.billing_webhook_events;')
assert.ok(deleteSubscriptions >= 0 && deleteSubscriptions < deleteCustomers && deleteCustomers < deleteEvents)
assert.match(docs, /rollback; -- Replace with commit only after manual review/)
assert.match(docs, /never restore test secrets into this production project after live objects exist/)
assert.match(docs, /production is \*\*NO-GO\*\*/)
assert.match(health, /id: 'billingLiveCutover'[\s\S]*status: 'PENDING'/)

// Safe errors and operator diagnostics expose no server secrets to React.
assert.doesNotMatch(`${service}\n${card}`, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY/)
assert.match(checkout, /Unable to start Stripe Checkout right now/)
assert.match(portal, /Subscription management could not be opened right now/)
assert.match(webhook, /Webhook processing failed/)
assert.match(migration, /stripe_subscription_id text not null/)
assert.match(migration, /last_payment_status text/)
assert.match(migration, /processed_at timestamptz/)

// Contractor-facing subscription copy remains bilingual and Client Portal stays a separate domain.
for (const key of ['aymeroSubscription', 'manageSubscription', 'billingStatusPastDue', 'billingPaymentIssue']) {
  assert.equal(typeof en[key], 'string')
  assert.equal(typeof es[key], 'string')
  assert.notEqual(en[key], es[key])
}
for (const key of ['releaseCheckBillingLiveCutover', 'releaseEvidenceBillingLiveCutover']) {
  assert.equal(typeof en[key], 'string')
  assert.equal(typeof es[key], 'string')
  assert.notEqual(en[key], es[key])
}
assert.doesNotMatch(card, /Customer Portal|Stripe Portal|Billing Customer Portal/)

console.log('Stripe live-mode production readiness validation passed; operational GO gate remains documented as NO-GO.')

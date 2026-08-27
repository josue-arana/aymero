import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
const checkout = read('../supabase/functions/create-billing-checkout/index.ts')
const webhook = read('../supabase/functions/stripe-billing-webhook/index.ts')
const sharedBilling = read('../supabase/functions/_shared/saasBilling.ts')
const functionConfig = read('../supabase/config.toml')
const billingService = read('../src/services/saasBillingService.js')
const billingCard = read('../src/components/settings/SaasBillingCard.jsx')
const settingsPage = read('../src/pages/SettingsPage.jsx')
const environmentService = read('../src/services/system/environmentService.js')
const backendConfig = read('../src/config/backendConfig.js')
const healthRegistry = read('../src/config/developerHealthRegistry.js')
const app = read('../src/App.jsx')

// Contractor tenant owns SaaS billing; no auth user owns a billing row.
assert.match(migration, /billing_customers[\s\S]*contractor_id uuid not null references public\.contractors\(id\)/)
assert.match(migration, /billing_subscriptions[\s\S]*contractor_id uuid not null references public\.contractors\(id\)/)
assert.doesNotMatch(migration, /billing_(?:customers|subscriptions)[\s\S]{0,500}user_id/)

// Checkout resolves authenticated membership and enforces existing Owner/Admin roles.
assert.match(checkout, /admin\.auth\.getUser\(accessToken\)/)
assert.match(checkout, /\.from\('contractor_members'\)/)
assert.match(checkout, /new Set\(\['owner', 'admin'\]\)/)
assert.match(checkout, /BILLING_PERMISSION_REQUIRED/)
assert.match(checkout, /MEMBERSHIP_REQUIRED/)
assert.match(checkout, /MEMBERSHIP_AMBIGUOUS/)

// The browser sends only a stable plan key; server configuration owns Price IDs.
assert.match(sharedBilling, /AYMERO_MANAGED_PLAN_KEY = 'aymero_managed'/)
assert.match(sharedBilling, /STRIPE_PRICE_AYMERO_MANAGED_MONTHLY/)
assert.match(checkout, /UNKNOWN_BILLING_PLAN/)
assert.match(billingService, /JSON\.stringify\(\{ planKey \}\)/)
assert.doesNotMatch(billingService, /stripePrice|priceId|STRIPE_PRICE/)
assert.doesNotMatch(billingCard, /stripePrice|priceId|STRIPE_PRICE/)

// Customer reuse and duplicate subscription prevention precede Checkout creation.
assert.match(migration, /unique \(contractor_id\)/)
assert.match(migration, /unique \(stripe_customer_id\)/)
assert.match(checkout, /storedBillingCustomer\?\.stripe_customer_id/)
assert.match(checkout, /aymero-billing-customer-\$\{contractorId\}/)
assert.match(checkout, /aymero-billing-checkout-\$\{contractorId\}-\$\{planKey\}/)
assert.match(checkout, /existingSubscriptionStatuses/)
assert.ok(checkout.indexOf('existingSubscriptions?.length') < checkout.indexOf("stripeRequest('/checkout/sessions'"))

// Stripe-hosted subscription Checkout returns safely and cannot activate browser state.
assert.match(checkout, /mode: 'subscription'/)
assert.match(checkout, /success_url: `\$\{appOrigin\}\/settings\?billing=success`/)
assert.match(checkout, /cancel_url: `\$\{appOrigin\}\/settings\?billing=canceled`/)
assert.match(billingCard, /billingSyncPending/)
assert.doesNotMatch(billingService, /PATCH|POST.*billing_subscriptions|status:\s*['"]active/)

// Signature verification happens before service-role database access.
assert.match(webhook, /request\.headers\.get\('stripe-signature'\)/)
assert.match(webhook, /crypto\.subtle\.sign\('HMAC'/)
assert.match(webhook, /signatureToleranceSeconds = 300/)
assert.ok(webhook.indexOf('await verifyStripeSignature') < webhook.indexOf('const admin = createClient'))
assert.match(functionConfig, /\[functions\.stripe-billing-webhook\][\s\S]*verify_jwt = false/)

// Webhook tenant resolution is deterministic and event handling is idempotent.
assert.match(webhook, /\.from\('billing_customers'\)/)
assert.match(webhook, /\.eq\('stripe_customer_id', stripeCustomerId\)/)
assert.match(webhook, /metadataContractorId !== billingCustomer\.contractor_id/)
assert.doesNotMatch(webhook, /company_name|\.email|customer_email/)
assert.match(migration, /stripe_event_id text primary key/)
assert.match(webhook, /ledgerInsertError\?\.code === '23505'/)
assert.match(webhook, /processed_at: new Date\(\)\.toISOString\(\)/)
assert.match(webhook, /\.delete\(\)\.eq\('stripe_event_id', eventId\)/)

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
assert.match(sharedBilling, /subscription\.items\.data|subscription\?\.items\?\.data/)
assert.match(webhook, /parent\.subscription_details\?\.subscription/)
assert.match(webhook, /eventType === 'invoice\.paid' \? 'paid' : 'failed'/)

// SaaS state is isolated from client invoices/payments and never enforces CRM access.
assert.doesNotMatch(checkout, /\.from\('payments'\)|\.from\('invoices'\)/)
assert.doesNotMatch(webhook, /\.from\('payments'\)|\.from\('invoices'\)/)
assert.doesNotMatch(webhook, /signOut|navigate\(|\.from\('(?:projects|estimates|contracts)'\)/)
assert.doesNotMatch(app, /billing_subscriptions|billingStatus.*(?:redirect|navigate|signOut)/i)
assert.equal(backendConfig.includes('export const USE_SUPABASE = false'), true)

// RLS allows tenant reads and no direct billing writes.
assert.match(migration, /is_active_contractor_member\(contractor_id\)/)
assert.match(migration, /for select[\s\S]*to authenticated/)
assert.match(migration, /revoke all on table public\.billing_webhook_events from anon, authenticated/)
assert.doesNotMatch(migration, /billing_(?:customers|subscriptions)"[\s\S]{0,120}for (?:insert|update|delete|all)/)

// Frontend secrets are absent and the Settings card is bilingual/mobile-contained.
assert.doesNotMatch(environmentService, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/)
assert.doesNotMatch(`${billingService}\n${billingCard}\n${settingsPage}`, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/)
assert.match(settingsPage, /<SaasBillingCard language=\{language\} t=\{t\}/)
assert.match(billingCard, /min-w-0/)
assert.match(billingCard, /w-full/)
assert.match(billingCard, /billingPaymentAttention/)
assert.match(billingCard, /canManageBilling/)

const billingTranslationKeys = [
  'saasBilling',
  'saasBillingHelp',
  'aymeroManaged',
  'aymeroManagedPrice',
  'billingSubscribeWithStripe',
  'billingSyncPending',
  'billingPaymentAttention',
  'billingStatusActive',
  'billingStatusPastDue',
  'billingLoadFailed',
]
for (const key of billingTranslationKeys) {
  assert.equal(typeof en[key], 'string', `Missing English billing translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish billing translation: ${key}`)
  if (key !== 'aymeroManaged') {
    assert.notEqual(en[key], es[key], `Billing translation is not localized: ${key}`)
  }
}

for (const backlogId of [
  'stripeCustomerPortal',
  'subscriptionPlanChanges',
  'subscriptionCancellationUx',
  'pastDueGraceEnforcement',
  'billingNotifications',
  'billingPlanCatalog',
  'annualBilling',
  'billingTrialsDiscounts',
  'stripeTaxHandling',
]) {
  assert.match(healthRegistry, new RegExp(`['"]${backlogId}['"]`))
}

assert.match(sharedBilling, /STRIPE_API_VERSION = '2026-02-25\.clover'/)
console.log('Aymero SaaS billing foundation validation passed.')

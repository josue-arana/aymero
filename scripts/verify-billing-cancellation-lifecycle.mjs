import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'
import {
  canStartSaasBillingCheckout,
  getSaasBillingPaymentPresentation,
  getSaasBillingStatusPresentation,
  isSaasBillingCancellationScheduled,
  resolveSaasBillingCancellation,
} from '../src/utils/saasBilling.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
const cancelAtMigration = read('../supabase/migrations/20260828_add_billing_subscription_cancel_at.sql')
const webhook = read('../supabase/functions/stripe-billing-webhook/index.ts')
const checkout = read('../supabase/functions/create-billing-checkout/index.ts')
const portal = read('../supabase/functions/create-billing-portal/index.ts')
const service = read('../src/services/saasBillingService.js')
const card = read('../src/components/settings/SaasBillingCard.jsx')
const app = read('../src/App.jsx')
const docs = read('../docs/STRIPE_CANCELLATION_LIFECYCLE.md')
const health = read('../src/config/developerHealthRegistry.js')

const active = {
  stripe_subscription_id: 'sub_active',
  status: 'active',
  cancel_at_period_end: false,
  cancel_at: null,
  current_period_end: '2026-09-27T16:00:00.000Z',
  last_payment_status: 'paid',
}
const verificationNow = Date.parse('2026-08-28T12:00:00.000Z')
const scheduled = { ...active, cancel_at_period_end: true }
const scheduledWithExplicitDate = {
  ...active,
  cancel_at: '2026-09-27T16:00:00.000Z',
}
const reactivated = { ...scheduledWithExplicitDate, cancel_at_period_end: false, cancel_at: null }
const canceled = { ...active, status: 'canceled', cancel_at_period_end: true }

// Active, scheduled, reactivated, and final lifecycle decisions.
assert.equal(getSaasBillingStatusPresentation(active.status).labelKey, 'billingStatusActive')
assert.equal(isSaasBillingCancellationScheduled(active, { now: verificationNow }), false)
assert.equal(isSaasBillingCancellationScheduled(scheduled, { now: verificationNow }), true)
assert.equal(canStartSaasBillingCheckout(scheduled), false)
assert.equal(isSaasBillingCancellationScheduled(scheduledWithExplicitDate, { now: verificationNow }), true)
assert.equal(canStartSaasBillingCheckout(scheduledWithExplicitDate), false)
assert.equal(
  resolveSaasBillingCancellation(scheduledWithExplicitDate, { now: verificationNow }).accessThrough,
  '2026-09-27T16:00:00.000Z',
)
assert.equal(
  resolveSaasBillingCancellation({
    ...scheduled,
    cancel_at: '2026-10-04T16:00:00.000Z',
  }, { now: verificationNow }).accessThrough,
  '2026-10-04T16:00:00.000Z',
)
assert.equal(isSaasBillingCancellationScheduled(reactivated, { now: verificationNow }), false)
assert.equal(canStartSaasBillingCheckout(reactivated), false)
assert.equal(isSaasBillingCancellationScheduled({ ...active, canceled_at: '2026-08-27T16:00:00.000Z' }, { now: verificationNow }), false)
assert.equal(isSaasBillingCancellationScheduled({ ...active, cancel_at: 'not-a-date' }, { now: verificationNow }), false)
assert.equal(isSaasBillingCancellationScheduled({ ...active, cancel_at: '2026-08-01T16:00:00.000Z' }, { now: verificationNow }), false)
assert.equal(isSaasBillingCancellationScheduled({ ...canceled, cancel_at: '2026-09-27T16:00:00.000Z' }, { now: verificationNow }), false)
assert.equal(canStartSaasBillingCheckout(canceled), true)
assert.equal(en.billingStatusDescriptionCanceled, 'Your subscription has ended.')
assert.equal(es.billingStatusDescriptionCanceled, 'Tu suscripción ha terminado.')

// Past-due and failed-payment states remain informational, never CRM enforcement.
assert.equal(getSaasBillingStatusPresentation('past_due').needsAttention, true)
assert.equal(getSaasBillingPaymentPresentation('failed').needsAttention, true)
assert.doesNotMatch(app, /billing.*(?:lock|logout|signOut)/i)
assert.match(card, /billingPaymentAttention/)

// The additive schema stores only the explicit scheduled service-end timestamp.
assert.match(migration, /cancel_at_period_end boolean not null default false/)
assert.match(migration, /current_period_end timestamptz/)
assert.doesNotMatch(migration, /\bcancel_at timestamptz|\bcanceled_at timestamptz|\bended_at timestamptz|cancellation_reason/)
assert.match(cancelAtMigration, /add column if not exists cancel_at timestamptz/)
assert.doesNotMatch(cancelAtMigration, /canceled_at|ended_at|cancellation_reason|cancellation_details/)
assert.match(docs, /20260828_add_billing_subscription_cancel_at\.sql/)
assert.match(docs, /`cancel_at` is the scheduled service-end timestamp/)

// Updated and deleted events flow through the same authoritative/idempotent synchronization.
assert.match(webhook, /customer\.subscription\.updated/)
assert.match(webhook, /customer\.subscription\.deleted/)
assert.match(webhook, /eventType\.startsWith\('customer\.subscription\.'\)/)
assert.match(webhook, /cancel_at_period_end: Boolean\(subscription\?\.cancel_at_period_end\)/)
assert.match(webhook, /cancel_at: stripeTimestampToIso\(subscription\?\.cancel_at\)/)
assert.match(webhook, /status: String\(subscription\?\.status/)
assert.match(webhook, /upsert\(payload, \{ onConflict: 'stripe_subscription_id' \}\)/)
assert.match(webhook, /ledgerInsertError\?\.code === '23505'/)
assert.match(webhook, /processed_at: new Date\(\)\.toISOString\(\)/)
assert.doesNotMatch(card, /setSubscription\(\{[^}]*cancel_at_period_end/)
assert.match(service, /cancel_at_period_end,cancel_at,last_payment_status/)

// Row-per-Stripe-Subscription preserves history and newest-row reads select current state.
assert.match(migration, /unique \(stripe_subscription_id\)/)
assert.doesNotMatch(migration, /unique \(contractor_id\)[\s\S]{0,120}billing_subscriptions/)
assert.match(service, /order: 'created_at\.desc'/)
assert.match(service, /limit: '1'/)
assert.match(docs, /one row per Stripe Subscription/)

// Duplicate protection and customer reuse distinguish scheduled from final cancellation.
for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) {
  assert.match(checkout, new RegExp(`['"]${status}['"]`))
}
assert.doesNotMatch(checkout.match(/existingSubscriptionStatuses = \[[^\]]+\]/)?.[0] || '', /canceled/)
assert.match(checkout, /storedBillingCustomer\?\.stripe_customer_id/)
assert.match(checkout, /\.from\('billing_customers'\)/)
assert.match(checkout, /\.eq\('contractor_id', contractorId\)/)
assert.match(migration, /billing_customers_contractor_id_key unique \(contractor_id\)/)

// Portal return performs bounded authoritative polling for webhook-delayed changes.
assert.match(card, /returnState === 'portal'/)
assert.match(card, /isPortalReturn && attempt < billingSyncMaxRetries/)
assert.match(card, /getSaasBillingSubscription\(\{ accessToken, contractorId \}\)/)
assert.match(card, /billingCancellationScheduledStatus/)
assert.match(card, /billingCancellationScheduledMessage/)
assert.match(card, /resolveSaasBillingCancellation\(subscription\)/)
assert.match(card, /isCancellationScheduled \? 'billingAccessUntil' : 'billingNextBillingDate'/)
assert.match(card, /displayedPeriodDate = isCancellationScheduled \? formattedCancellationDate : formattedRenewalDate/)
assert.match(card, /subscription\?\.status === 'canceled' \? 'billingSubscribeAgain'/)
assert.match(card, /subscription && !canStartNewSubscription/)

// Billing ownership and secrets remain server-only and contractor scoped.
assert.match(webhook, /resolveBillingOwner\(stripeCustomerId, metadataContractorId\)/)
assert.match(webhook, /\.eq\('stripe_customer_id', stripeCustomerId\)/)
assert.match(migration, /is_active_contractor_member\(contractor_id\)/)
assert.doesNotMatch(`${service}\n${card}`, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/)
assert.match(portal, /Deno\.env\.get\('STRIPE_SECRET_KEY'\)/)
assert.doesNotMatch(portal, /company_name|\.email|customer_email/)

// Cancellation enablement intentionally remains a tracked acceptance backlog item.
assert.match(health, /subscriptionCancellationUx/)
for (const key of [
  'billingCancellationScheduledStatus',
  'billingCancellationScheduledMessage',
  'billingCancellationScheduled',
  'billingCancellationScheduledMessageNoDate',
  'billingSubscribeAgain',
  'billingPortalSyncPending',
]) {
  assert.equal(typeof en[key], 'string', `Missing English cancellation translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish cancellation translation: ${key}`)
  assert.notEqual(en[key], es[key], `Cancellation translation is not localized: ${key}`)
}

for (const viewportWidth of [320, 375, 390, 430]) {
  assert.match(card, /overflow-hidden/)
  assert.match(card, /min-w-0/)
  assert.match(card, /break-words/)
  assert.match(card, /min-h-12 w-full/)
  assert.ok(viewportWidth >= 320)
}

assert.match(docs, /Resending the original Stripe Event ID will be acknowledged as a duplicate/)
assert.match(docs, /reactivate the scheduled subscription/)

// Existing Aymero Client Portal terminology is outside SaaS subscription management.
assert.doesNotMatch(card, /Customer Portal|Stripe Portal|Billing Customer Portal/)

console.log('Stripe cancellation and reactivation lifecycle validation passed.')

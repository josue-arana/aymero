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
} from '../src/utils/saasBilling.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
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
  current_period_end: '2026-09-27T16:00:00.000Z',
  last_payment_status: 'paid',
}
const scheduled = { ...active, cancel_at_period_end: true }
const reactivated = { ...scheduled, cancel_at_period_end: false }
const canceled = { ...active, status: 'canceled', cancel_at_period_end: true }

// Active, scheduled, reactivated, and final lifecycle decisions.
assert.equal(getSaasBillingStatusPresentation(active.status).labelKey, 'billingStatusActive')
assert.equal(isSaasBillingCancellationScheduled(active), false)
assert.equal(isSaasBillingCancellationScheduled(scheduled), true)
assert.equal(canStartSaasBillingCheckout(scheduled), false)
assert.equal(isSaasBillingCancellationScheduled(reactivated), false)
assert.equal(canStartSaasBillingCheckout(reactivated), false)
assert.equal(isSaasBillingCancellationScheduled(canceled), false)
assert.equal(canStartSaasBillingCheckout(canceled), true)
assert.equal(en.billingStatusDescriptionCanceled, 'Your subscription has ended.')
assert.equal(es.billingStatusDescriptionCanceled, 'Tu suscripción ha terminado.')

// Past-due and failed-payment states remain informational, never CRM enforcement.
assert.equal(getSaasBillingStatusPresentation('past_due').needsAttention, true)
assert.equal(getSaasBillingPaymentPresentation('failed').needsAttention, true)
assert.doesNotMatch(app, /billing.*(?:lock|logout|signOut)/i)
assert.match(card, /billingPaymentAttention/)

// Existing additive schema is sufficient; no misleading request-time cancellation fields are used.
assert.match(migration, /cancel_at_period_end boolean not null default false/)
assert.match(migration, /current_period_end timestamptz/)
assert.doesNotMatch(migration, /\bcancel_at timestamptz|\bcanceled_at timestamptz|\bended_at timestamptz|cancellation_reason/)
assert.match(docs, /No migration is required/)

// Updated and deleted events flow through the same authoritative/idempotent synchronization.
assert.match(webhook, /customer\.subscription\.updated/)
assert.match(webhook, /customer\.subscription\.deleted/)
assert.match(webhook, /eventType\.startsWith\('customer\.subscription\.'\)/)
assert.match(webhook, /cancel_at_period_end: Boolean\(subscription\?\.cancel_at_period_end\)/)
assert.match(webhook, /status: String\(subscription\?\.status/)
assert.match(webhook, /upsert\(payload, \{ onConflict: 'stripe_subscription_id' \}\)/)
assert.match(webhook, /ledgerInsertError\?\.code === '23505'/)
assert.match(webhook, /processed_at: new Date\(\)\.toISOString\(\)/)
assert.doesNotMatch(card, /setSubscription\(\{[^}]*cancel_at_period_end/)

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
  'billingSubscribeAgain',
  'billingPortalSyncPending',
]) {
  assert.equal(typeof en[key], 'string', `Missing English cancellation translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish cancellation translation: ${key}`)
  assert.notEqual(en[key], es[key], `Cancellation translation is not localized: ${key}`)
}

// Existing Aymero Client Portal terminology is outside SaaS subscription management.
assert.doesNotMatch(card, /Customer Portal|Stripe Portal|Billing Customer Portal/)

console.log('Stripe cancellation and reactivation lifecycle validation passed.')

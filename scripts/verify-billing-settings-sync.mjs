import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'
import { formatDisplayDate } from '../src/utils/formatters.js'
import {
  canStartSaasBillingCheckout,
  getSaasBillingPaymentPresentation,
  getSaasBillingStatusPresentation,
} from '../src/utils/saasBilling.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const billingService = read('../src/services/saasBillingService.js')
const billingCard = read('../src/components/settings/SaasBillingCard.jsx')
const migration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
const app = read('../src/App.jsx')
const settingsPage = read('../src/pages/SettingsPage.jsx')
const subscriptionPage = read('../src/pages/SubscriptionPage.jsx')

const activePaidSubscription = {
  contractor_id: '00000000-0000-4000-8000-000000000101',
  plan_key: 'aymero_managed',
  status: 'active',
  last_payment_status: 'paid',
  current_period_end: '2026-09-27T16:00:00.000Z',
}

const activePresentation = getSaasBillingStatusPresentation(activePaidSubscription.status)
const paidPresentation = getSaasBillingPaymentPresentation(activePaidSubscription.last_payment_status)
assert.equal(activePresentation.labelKey, 'billingStatusActive')
assert.equal(activePresentation.descriptionKey, 'billingStatusDescriptionActive')
assert.equal(activePresentation.tone, 'success')
assert.equal(paidPresentation.labelKey, 'billingPaymentPaid')
assert.equal(paidPresentation.needsAttention, false)
assert.equal(canStartSaasBillingCheckout(activePaidSubscription), false)
assert.equal(formatDisplayDate(activePaidSubscription.current_period_end, '', 'en-US'), 'September 27, 2026')

for (const status of ['active', 'trialing', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'paused', 'canceled']) {
  const presentation = getSaasBillingStatusPresentation(status)
  assert.match(presentation.labelKey, /^billingStatus/)
  assert.match(presentation.descriptionKey, /^billingStatusDescription/)
}

assert.equal(getSaasBillingStatusPresentation('past_due').needsAttention, true)
assert.equal(getSaasBillingStatusPresentation('unpaid').needsAttention, true)
assert.equal(getSaasBillingPaymentPresentation('failed').labelKey, 'billingPaymentIssue')
assert.equal(getSaasBillingPaymentPresentation('failed').needsAttention, true)
assert.equal(getSaasBillingPaymentPresentation(null), null)
assert.equal(canStartSaasBillingCheckout(null), true)
assert.equal(canStartSaasBillingCheckout({ status: 'canceled' }), true)
assert.equal(canStartSaasBillingCheckout({ status: 'incomplete_expired' }), true)
assert.equal(canStartSaasBillingCheckout({ status: 'past_due' }), false)

// SaaS billing is always server-backed and never silently gated into local/demo state.
assert.doesNotMatch(billingService, /supabaseClient|isSupabaseDataEnabled|USE_SUPABASE/)
assert.match(billingService, /rest\/v1\/billing_subscriptions/)
assert.match(billingService, /Authorization: `Bearer \$\{token\}`/)
assert.match(billingService, /contractor_id: `eq\.\$\{contractorId\}`/)
assert.match(billingService, /cache: 'no-store'/)
assert.match(billingService, /BILLING_RESPONSE_INVALID/)
assert.match(billingService, /refreshSession/)

// Checkout return performs bounded authoritative reads and never creates local active state.
assert.match(billingCard, /returnState === 'success'/)
assert.match(billingCard, /getSaasBillingSubscription\(\{ accessToken, contractorId \}\)/)
assert.match(billingCard, /billingSyncMaxRetries = 6/)
assert.match(billingCard, /window\.setTimeout\(\(\) => loadAfterReturn\(attempt \+ 1\), billingSyncRetryDelayMs\)/)
assert.match(billingCard, /setIsSyncDelayed\(isSuccessReturn\)/)
assert.match(billingCard, /hasHandledReturnRef/)
assert.doesNotMatch(billingCard, /setSubscription\(\{[^}]*status:\s*['"]active/)

// Empty, canceled, failed-read, active, and permission states remain distinct.
assert.match(billingCard, /hasAuthoritativeResult && canStartNewSubscription/)
assert.match(billingCard, /!isSyncPending && !isSyncDelayed && !loadError/)
assert.match(billingCard, /if \(isStartingCheckout \|\| !canManageBilling\) return/)
assert.match(billingCard, /returnState === 'canceled'/)
assert.match(billingCard, /billingCheckoutCanceled/)
assert.match(billingCard, /setHasAuthoritativeResult\(true\)/)
assert.match(billingCard, /billingPaymentAttention/)
assert.doesNotMatch(app, /billing.*(?:lock|logout|signOut|redirect)/i)
assert.doesNotMatch(settingsPage, /SaasBillingCard/)
assert.match(subscriptionPage, /SaasBillingCard/)

// RLS remains the final cross-tenant boundary in addition to the explicit contractor filter.
assert.match(migration, /active_members_can_read_billing_subscriptions/)
assert.match(migration, /is_active_contractor_member\(contractor_id\)/)
assert.doesNotMatch(migration, /billing_subscriptions"[\s\S]{0,120}for (?:insert|update|delete|all)/)

// Mobile-first containment applies at all requested narrow widths.
for (const viewportWidth of [320, 375, 390, 430]) {
  assert.match(billingCard, /overflow-hidden/)
  assert.match(billingCard, /min-w-0/)
  assert.match(billingCard, /w-full md:w-56/)
  assert.doesNotMatch(billingCard, /min-w-\[(?:3[2-9]\d|4\d\d)px\]/)
  assert.ok(viewportWidth >= 320)
}

for (const key of [
  'billingStatusDescriptionActive',
  'billingStatusDescriptionPastDue',
  'billingPaymentStatus',
  'billingPaymentPaid',
  'billingPaymentIssue',
  'billingNextBillingDate',
  'billingSyncDelayed',
  'billingRefreshStatus',
  'billingContextUnavailable',
]) {
  assert.equal(typeof en[key], 'string', `Missing English billing Settings translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish billing Settings translation: ${key}`)
  assert.notEqual(en[key], es[key], `Billing Settings translation is not localized: ${key}`)
}

console.log('SaaS billing Settings synchronization validation passed.')

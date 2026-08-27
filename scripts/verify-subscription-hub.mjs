import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const app = read('../src/App.jsx')
const routes = read('../src/config/appRoutes.js')
const menu = read('../src/components/layout/AccountMenu.jsx')
const topbar = read('../src/components/layout/Topbar.jsx')
const settings = read('../src/pages/SettingsPage.jsx')
const page = read('../src/pages/SubscriptionPage.jsx')
const card = read('../src/components/settings/SaasBillingCard.jsx')
const service = read('../src/services/saasBillingService.js')
const portal = read('../supabase/functions/create-billing-portal/index.ts')
const checkout = read('../supabase/functions/create-billing-checkout/index.ts')
const webhook = read('../supabase/functions/stripe-billing-webhook/index.ts')
const migration = read('../supabase/migrations/20260826_add_saas_billing_foundation.sql')
const config = read('../supabase/config.toml')
const environment = read('../src/services/system/environmentService.js')

// Dedicated product surface and terminology.
assert.doesNotMatch(settings, /SaasBillingCard|saasBillingService|billing_subscriptions/)
assert.match(menu, /t\('aymeroSubscription'\)/)
assert.match(topbar, /onOpenSubscription/)
assert.match(routes, /subscription: '\/settings\/subscription'/)
assert.match(app, /path=\{appRoutes\.subscription\}/)
assert.match(page, /<h1[\s\S]*t\('aymeroSubscription'\)/)
assert.match(page, /<SaasBillingCard/)
assert.equal(en.aymeroSubscription, 'Aymero Subscription')
assert.equal(es.aymeroSubscription, 'Suscripción de Aymero')
assert.equal(en.manageSubscription, 'Manage Subscription')
assert.equal(es.manageSubscription, 'Administrar suscripción')
assert.doesNotMatch(`${menu}\n${page}\n${card}`, /Customer Portal|Stripe Portal|Billing Customer Portal/)

// Persisted plan/status/renewal/payment state remains authoritative and price is secondary.
assert.match(card, /subscription\?\.status/)
assert.match(card, /subscription\?\.current_period_end/)
assert.match(card, /subscription\?\.last_payment_status/)
assert.match(card, /text-sm font-semibold text-slate-500[^>]*>\{t\('aymeroManagedPrice'\)\}/)
assert.match(card, /hasAuthoritativeResult && canStartNewSubscription/)
assert.match(card, /subscription && !canStartNewSubscription/)
assert.match(card, /billingPaymentAttention/)
assert.doesNotMatch(app, /billing.*(?:lock|logout|signOut)/i)

// Owner/Admin management is enforced in both UI and server; member requests fail.
assert.match(card, /manageableRoles = new Set\(\['owner', 'admin'\]\)/)
assert.match(card, /if \(isOpeningPortal \|\| !canManageBilling \|\| !subscription\) return/)
assert.match(portal, /billingRoles = new Set\(\['owner', 'admin'\]\)/)
assert.match(portal, /BILLING_PERMISSION_REQUIRED/)
assert.match(portal, /admin\.auth\.getUser\(accessToken\)/)
assert.match(portal, /\.from\('contractor_members'\)/)
assert.match(portal, /MEMBERSHIP_AMBIGUOUS/)

// The browser supplies no tenant/customer identity; mapping and return are server-owned.
assert.match(service, /functions\/v1\/create-billing-portal/)
assert.match(service, /body: JSON\.stringify\(\{\}\)/)
assert.doesNotMatch(service, /stripe_customer_id|stripeCustomerId|customerId/)
assert.match(portal, /\.from\('billing_customers'\)/)
assert.match(portal, /\.eq\('contractor_id', contractorId\)/)
assert.match(portal, /billingCustomer\?\.stripe_customer_id/)
assert.match(portal, /BILLING_CUSTOMER_MISSING/)
assert.doesNotMatch(portal, /company_name|\.email|customer_email/)
assert.match(portal, /stripeRequest\('\/billing_portal\/sessions'/)
assert.match(portal, /return_url: `\$\{appOrigin\}\/settings\/subscription\?billing=portal`/)
assert.match(portal, /return jsonResponse\(\{ url: session\.url \}\)/)
assert.doesNotMatch(portal, /return jsonResponse\(\{[^}]*stripeCustomerId/)

// Stripe returns always cause a read; Checkout/webhook foundations stay intact.
assert.match(card, /returnState === 'portal'/)
assert.match(card, /getSaasBillingSubscription\(\{ accessToken, contractorId \}\)/)
assert.match(checkout, /success_url: `\$\{appOrigin\}\/settings\/subscription\?billing=success`/)
assert.match(checkout, /existingSubscriptionStatuses/)
assert.match(webhook, /stripe-signature/)
assert.match(migration, /is_active_contractor_member\(contractor_id\)/)
assert.match(config, /\[functions\.create-billing-portal\][\s\S]*verify_jwt = true/)

// No browser secrets or new dependency architecture.
assert.doesNotMatch(`${service}\n${card}\n${page}\n${environment}`, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/)
assert.match(portal, /Deno\.env\.get\('STRIPE_SECRET_KEY'\)/)
assert.match(portal, /Deno\.env\.get\('AYMERO_APP_URL'\)/)
assert.doesNotMatch(portal, /stripe-node|from 'stripe'/)

// Narrow-width containment, touch targets, status text, and EN/ES parity.
for (const width of [320, 375, 390, 430]) {
  assert.match(page, /overflow-hidden/)
  assert.match(card, /overflow-hidden/)
  assert.match(card, /min-w-0/)
  assert.match(card, /min-h-12 w-full/)
  assert.ok(width >= 320)
}
assert.match(card, /AymeroLoader/)
assert.match(card, /aria-busy/)
assert.match(card, /role="alert"/)
for (const key of [
  'aymeroSubscription',
  'aymeroSubscriptionHelp',
  'manageSubscription',
  'billingOpeningPortal',
  'billingManageOwnerAdminOnly',
  'billingPortalFailed',
]) {
  assert.equal(typeof en[key], 'string', `Missing English Subscription Hub translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish Subscription Hub translation: ${key}`)
  assert.notEqual(en[key], es[key], `Subscription Hub translation is not localized: ${key}`)
}

console.log('Aymero Subscription Hub and Stripe Billing Portal validation passed.')

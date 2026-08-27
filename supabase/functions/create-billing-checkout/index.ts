import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  AYMERO_MANAGED_PLAN_KEY,
  getBillingPlanMap,
  stripeRequest,
} from '../_shared/saasBilling.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

const billingRoles = new Set(['owner', 'admin'])
const existingSubscriptionStatuses = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
}

function getSafeAppOrigin() {
  const configuredUrl = String(Deno.env.get('AYMERO_APP_URL') || '').trim()
  try {
    const parsed = new URL(configuredUrl)
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname)
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) return ''
    if (parsed.username || parsed.password) return ''
    return parsed.origin
  } catch {
    return ''
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405)

  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim()
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  const stripeSecretKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '').trim()
  const appOrigin = getSafeAppOrigin()
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !appOrigin) {
    return jsonResponse({ error: 'Billing is not configured yet.', code: 'BILLING_CONFIGURATION_MISSING' }, 503)
  }

  const accessToken = readBearerToken(request)
  if (!accessToken) return jsonResponse({ error: 'Authentication is required.', code: 'AUTH_REQUIRED' }, 401)

  let planKey = ''
  try {
    const body = await request.json()
    planKey = String(body?.planKey || '').trim()
  } catch {
    return jsonResponse({ error: 'Invalid request.', code: 'INVALID_REQUEST' }, 400)
  }

  const planMap = getBillingPlanMap()
  if (!planMap.has(planKey)) {
    return jsonResponse({ error: 'That billing plan is not available.', code: 'UNKNOWN_BILLING_PLAN' }, 400)
  }

  const stripePriceId = planMap.get(planKey) || ''
  if (!stripePriceId) {
    return jsonResponse({ error: 'Billing is not configured yet.', code: 'BILLING_PRICE_MISSING' }, 503)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userResult, error: userError } = await admin.auth.getUser(accessToken)
  const user = userResult?.user
  if (userError || !user?.id) {
    return jsonResponse({ error: 'Your session is no longer valid.', code: 'AUTH_INVALID' }, 401)
  }

  const { data: memberships, error: membershipError } = await admin
    .from('contractor_members')
    .select('id, contractor_id, role, status, email')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(2)

  if (membershipError) return jsonResponse({ error: 'Unable to verify billing access.', code: 'MEMBERSHIP_LOOKUP_FAILED' }, 500)
  if (!memberships?.length) return jsonResponse({ error: 'No active company membership was found.', code: 'MEMBERSHIP_REQUIRED' }, 403)
  if (memberships.length !== 1) return jsonResponse({ error: 'Billing access could not be resolved.', code: 'MEMBERSHIP_AMBIGUOUS' }, 409)

  const membership = memberships[0]
  const role = String(membership.role || '').toLowerCase()
  const contractorId = String(membership.contractor_id || '')
  if (!billingRoles.has(role)) {
    return jsonResponse({ error: 'Owner or Admin access is required to start billing.', code: 'BILLING_PERMISSION_REQUIRED' }, 403)
  }

  const { data: existingSubscriptions, error: subscriptionLookupError } = await admin
    .from('billing_subscriptions')
    .select('id, plan_key, status, current_period_end')
    .eq('contractor_id', contractorId)
    .in('status', existingSubscriptionStatuses)
    .order('created_at', { ascending: false })
    .limit(1)

  if (subscriptionLookupError) return jsonResponse({ error: 'Unable to check billing status.', code: 'BILLING_LOOKUP_FAILED' }, 500)
  if (existingSubscriptions?.length) {
    return jsonResponse({
      existingSubscription: true,
      subscription: existingSubscriptions[0],
    })
  }

  const [{ data: contractor, error: contractorError }, { data: storedBillingCustomer, error: customerLookupError }] = await Promise.all([
    admin.from('contractors').select('id, company_name, email').eq('id', contractorId).maybeSingle(),
    admin.from('billing_customers').select('id, stripe_customer_id').eq('contractor_id', contractorId).maybeSingle(),
  ])

  if (contractorError || !contractor) return jsonResponse({ error: 'Company billing owner was not found.', code: 'CONTRACTOR_NOT_FOUND' }, 404)
  if (customerLookupError) return jsonResponse({ error: 'Unable to prepare billing.', code: 'BILLING_CUSTOMER_LOOKUP_FAILED' }, 500)

  let stripeCustomerId = String(storedBillingCustomer?.stripe_customer_id || '').trim()
  if (!stripeCustomerId) {
    let stripeCustomer
    try {
      stripeCustomer = await stripeRequest('/customers', {
        secretKey: stripeSecretKey,
        idempotencyKey: `aymero-billing-customer-${contractorId}`,
        form: {
          name: contractor.company_name || undefined,
          email: contractor.email || membership.email || user.email || undefined,
          'metadata[aymero_contractor_id]': contractorId,
          'metadata[billing_domain]': 'aymero_saas',
        },
      })
    } catch {
      return jsonResponse({ error: 'Unable to prepare Stripe Checkout.', code: 'STRIPE_CUSTOMER_FAILED' }, 502)
    }

    stripeCustomerId = String(stripeCustomer?.id || '').trim()
    if (!stripeCustomerId) {
      return jsonResponse({ error: 'Unable to prepare Stripe Checkout.', code: 'STRIPE_CUSTOMER_FAILED' }, 502)
    }
    const { error: insertCustomerError } = await admin.from('billing_customers').insert({
      contractor_id: contractorId,
      stripe_customer_id: stripeCustomerId,
    })

    if (insertCustomerError) {
      const { data: concurrentlyStoredCustomer, error: concurrentLookupError } = await admin
        .from('billing_customers')
        .select('stripe_customer_id')
        .eq('contractor_id', contractorId)
        .maybeSingle()

      if (concurrentLookupError || !concurrentlyStoredCustomer?.stripe_customer_id) {
        return jsonResponse({ error: 'Unable to save the billing customer.', code: 'BILLING_CUSTOMER_PERSIST_FAILED' }, 500)
      }
      stripeCustomerId = concurrentlyStoredCustomer.stripe_customer_id
    }
  }

  try {
    const checkoutWindow = Math.floor(Date.now() / (30 * 60 * 1000))
    const session = await stripeRequest('/checkout/sessions', {
      secretKey: stripeSecretKey,
      idempotencyKey: `aymero-billing-checkout-${contractorId}-${planKey}-${checkoutWindow}`,
      form: {
        mode: 'subscription',
        customer: stripeCustomerId,
        client_reference_id: contractorId,
        'line_items[0][price]': stripePriceId,
        'line_items[0][quantity]': 1,
        success_url: `${appOrigin}/settings/subscription?billing=success`,
        cancel_url: `${appOrigin}/settings/subscription?billing=canceled`,
        'metadata[aymero_contractor_id]': contractorId,
        'metadata[plan_key]': AYMERO_MANAGED_PLAN_KEY,
        'metadata[billing_domain]': 'aymero_saas',
        'subscription_data[metadata][aymero_contractor_id]': contractorId,
        'subscription_data[metadata][plan_key]': AYMERO_MANAGED_PLAN_KEY,
        'subscription_data[metadata][billing_domain]': 'aymero_saas',
      },
    })

    if (!session?.url) throw new Error('Stripe Checkout URL missing.')
    return jsonResponse({ url: session.url, sessionId: session.id })
  } catch {
    return jsonResponse({ error: 'Unable to start Stripe Checkout right now.', code: 'STRIPE_CHECKOUT_FAILED' }, 502)
  }
})

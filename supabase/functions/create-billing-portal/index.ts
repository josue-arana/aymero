import { createClient } from 'npm:@supabase/supabase-js@2'
import { stripeRequest } from '../_shared/saasBilling.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

const billingRoles = new Set(['owner', 'admin'])

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
    return jsonResponse({ error: 'Subscription management is not configured yet.', code: 'BILLING_CONFIGURATION_MISSING' }, 503)
  }

  const accessToken = readBearerToken(request)
  if (!accessToken) return jsonResponse({ error: 'Authentication is required.', code: 'AUTH_REQUIRED' }, 401)

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
    .select('id, contractor_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(2)

  if (membershipError) return jsonResponse({ error: 'Unable to verify subscription access.', code: 'MEMBERSHIP_LOOKUP_FAILED' }, 500)
  if (!memberships?.length) return jsonResponse({ error: 'No active company membership was found.', code: 'MEMBERSHIP_REQUIRED' }, 403)
  if (memberships.length !== 1) return jsonResponse({ error: 'Subscription access could not be resolved.', code: 'MEMBERSHIP_AMBIGUOUS' }, 409)

  const membership = memberships[0]
  const contractorId = String(membership.contractor_id || '').trim()
  if (!billingRoles.has(String(membership.role || '').toLowerCase())) {
    return jsonResponse({ error: 'Owner or Admin access is required to manage the subscription.', code: 'BILLING_PERMISSION_REQUIRED' }, 403)
  }

  const { data: billingCustomer, error: customerError } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('contractor_id', contractorId)
    .maybeSingle()

  if (customerError) return jsonResponse({ error: 'Unable to load subscription management.', code: 'BILLING_CUSTOMER_LOOKUP_FAILED' }, 500)
  const stripeCustomerId = String(billingCustomer?.stripe_customer_id || '').trim()
  if (!stripeCustomerId) {
    return jsonResponse({ error: 'No billing account is available to manage yet.', code: 'BILLING_CUSTOMER_MISSING' }, 404)
  }

  try {
    const session = await stripeRequest('/billing_portal/sessions', {
      secretKey: stripeSecretKey,
      form: {
        customer: stripeCustomerId,
        return_url: `${appOrigin}/settings/subscription?billing=portal`,
      },
    })

    if (!session?.url) throw new Error('Stripe Billing Portal URL missing.')
    return jsonResponse({ url: session.url })
  } catch {
    return jsonResponse({ error: 'Subscription management could not be opened right now.', code: 'STRIPE_PORTAL_FAILED' }, 502)
  }
})

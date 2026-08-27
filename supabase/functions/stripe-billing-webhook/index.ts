import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  getPlanKeyForPrice,
  isUuid,
  readStripeId,
  readSubscriptionPeriod,
  stripeRequest,
  stripeTimestampToIso,
} from '../_shared/saasBilling.ts'

const signatureToleranceSeconds = 300
const supportedEventTypes = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
])

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string) {
  const parts = signatureHeader.split(',').map((part) => part.trim())
  const timestampPart = parts.find((part) => part.startsWith('t='))
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3))
  const timestamp = Number(timestampPart?.slice(2) || 0)

  if (!timestamp || !signatures.length) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > signatureToleranceSeconds) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  const expectedSignature = bytesToHex(digest)
  return signatures.some((signature) => secureEqual(signature, expectedSignature))
}

function readInvoiceSubscriptionId(invoice: Record<string, any>) {
  if (invoice?.parent?.type === 'subscription_details') {
    return readStripeId(invoice.parent.subscription_details?.subscription)
  }
  return readStripeId(invoice?.subscription)
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  const webhookSecret = String(Deno.env.get('STRIPE_WEBHOOK_SECRET') || '').trim()
  const stripeSecretKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '').trim()
  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim()
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (!webhookSecret || !stripeSecretKey || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Webhook is not configured.' }, 503)
  }

  const rawBody = await request.text()
  const signatureHeader = request.headers.get('stripe-signature') || ''
  if (!signatureHeader || !(await verifyStripeSignature(rawBody, signatureHeader, webhookSecret))) {
    return jsonResponse({ error: 'Invalid webhook signature.' }, 400)
  }

  let event: Record<string, any>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'Invalid webhook payload.' }, 400)
  }

  const eventId = String(event?.id || '').trim()
  const eventType = String(event?.type || '').trim()
  if (!eventId || !eventType || !event?.data?.object) {
    return jsonResponse({ error: 'Invalid webhook event.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: ledgerInsertError } = await admin.from('billing_webhook_events').insert({
    stripe_event_id: eventId,
    event_type: eventType,
  })

  if (ledgerInsertError?.code === '23505') {
    return jsonResponse({ received: true, duplicate: true })
  }
  if (ledgerInsertError) return jsonResponse({ error: 'Unable to record webhook event.' }, 500)

  async function resolveBillingOwner(stripeCustomerId: string, metadataContractorId = '') {
    if (!stripeCustomerId) throw new Error('Stripe customer identity is missing.')

    const { data: billingCustomer, error } = await admin
      .from('billing_customers')
      .select('contractor_id, stripe_customer_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle()

    if (error || !billingCustomer?.contractor_id) throw new Error('Billing customer mapping was not found.')
    if (metadataContractorId && (!isUuid(metadataContractorId) || metadataContractorId !== billingCustomer.contractor_id)) {
      throw new Error('Billing tenant metadata does not match the persisted customer mapping.')
    }
    return String(billingCustomer.contractor_id)
  }

  async function synchronizeSubscription(subscription: Record<string, any>, lastPaymentStatus?: 'paid' | 'failed') {
    const stripeSubscriptionId = String(subscription?.id || '').trim()
    const stripeCustomerId = readStripeId(subscription?.customer)
    const metadataContractorId = String(subscription?.metadata?.aymero_contractor_id || '').trim()
    const contractorId = await resolveBillingOwner(stripeCustomerId, metadataContractorId)
    const subscriptionItems = Array.isArray(subscription?.items?.data) ? subscription.items.data : []
    const stripePriceId = readStripeId(subscriptionItems[0]?.price)
    const planKey = getPlanKeyForPrice(stripePriceId, subscription?.metadata?.plan_key)
    const period = readSubscriptionPeriod(subscription)

    if (!stripeSubscriptionId || !stripePriceId || !planKey) {
      throw new Error('Subscription plan identity could not be resolved.')
    }

    const { data: existingSubscription, error: existingLookupError } = await admin
      .from('billing_subscriptions')
      .select('contractor_id, last_payment_status')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle()

    if (existingLookupError) throw existingLookupError
    if (existingSubscription?.contractor_id && existingSubscription.contractor_id !== contractorId) {
      throw new Error('Subscription is already associated with another contractor.')
    }

    const payload = {
      contractor_id: contractorId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_price_id: stripePriceId,
      plan_key: planKey,
      status: String(subscription?.status || '').trim(),
      current_period_start: stripeTimestampToIso(period.start),
      current_period_end: stripeTimestampToIso(period.end),
      cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
      last_payment_status: lastPaymentStatus || existingSubscription?.last_payment_status || null,
    }

    const { error: upsertError } = await admin
      .from('billing_subscriptions')
      .upsert(payload, { onConflict: 'stripe_subscription_id' })

    if (upsertError) throw upsertError

    console.info('[saas-billing] synchronized', {
      eventType,
      stripeObjectId: stripeSubscriptionId,
      contractorId,
      status: payload.status,
    })
  }

  try {
    const object = event.data.object as Record<string, any>

    if (supportedEventTypes.has(eventType)) {
      if (eventType === 'checkout.session.completed') {
        const stripeCustomerId = readStripeId(object.customer)
        const metadataContractorId = String(object?.metadata?.aymero_contractor_id || '').trim()
        await resolveBillingOwner(stripeCustomerId, metadataContractorId)

        const subscriptionId = readStripeId(object.subscription)
        if (subscriptionId) {
          const subscription = await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
            secretKey: stripeSecretKey,
            method: 'GET',
          })
          await synchronizeSubscription(subscription)
        }
      } else if (eventType.startsWith('customer.subscription.')) {
        await synchronizeSubscription(object)
      } else if (eventType === 'invoice.paid' || eventType === 'invoice.payment_failed') {
        const subscriptionId = readInvoiceSubscriptionId(object)
        if (subscriptionId) {
          const subscription = await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
            secretKey: stripeSecretKey,
            method: 'GET',
          })
          await synchronizeSubscription(subscription, eventType === 'invoice.paid' ? 'paid' : 'failed')
        }
      }
    }

    const { error: ledgerUpdateError } = await admin
      .from('billing_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('stripe_event_id', eventId)

    if (ledgerUpdateError) throw ledgerUpdateError
    return jsonResponse({ received: true })
  } catch (error) {
    console.error('[saas-billing] webhook processing failed', {
      eventType,
      stripeEventId: eventId,
      code: error instanceof Error ? error.name : 'UNKNOWN',
    })

    await admin.from('billing_webhook_events').delete().eq('stripe_event_id', eventId)
    return jsonResponse({ error: 'Webhook processing failed.' }, 500)
  }
})

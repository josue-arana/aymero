export const STRIPE_API_VERSION = '2026-02-25.clover'
export const AYMERO_MANAGED_PLAN_KEY = 'aymero_managed'

export {
  hasMatchingBillingTenant,
  isPostgresUuid as isUuid,
} from './saasBillingIdentity.js'

export function readStripeId(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id?: unknown }).id || '').trim()
  }
  return ''
}

export function getBillingPlanMap() {
  return new Map([
    [AYMERO_MANAGED_PLAN_KEY, String(Deno.env.get('STRIPE_PRICE_AYMERO_MANAGED_MONTHLY') || '').trim()],
  ])
}

export function getPlanKeyForPrice(stripePriceId: string, metadataPlanKey = '') {
  for (const [planKey, configuredPriceId] of getBillingPlanMap()) {
    if (configuredPriceId && configuredPriceId === stripePriceId) return planKey
  }

  const normalizedMetadataPlan = String(metadataPlanKey || '').trim()
  return getBillingPlanMap().has(normalizedMetadataPlan) ? normalizedMetadataPlan : ''
}

function encodeStripeForm(form: Record<string, unknown>) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(form)) {
    if (value === undefined || value === null || value === '') continue
    params.append(key, String(value))
  }

  return params
}

export async function stripeRequest(
  path: string,
  {
    secretKey,
    method = 'POST',
    form,
    idempotencyKey = '',
  }: {
    secretKey: string
    method?: 'GET' | 'POST'
    form?: Record<string, unknown>
    idempotencyKey?: string
  },
) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_API_VERSION,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: form ? encodeStripeForm(form) : undefined,
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Stripe request failed with status ${response.status}.`)
    ;(error as Error & { status?: number; code?: string }).status = response.status
    ;(error as Error & { status?: number; code?: string }).code = data?.error?.code || 'STRIPE_REQUEST_FAILED'
    throw error
  }

  return data as Record<string, any>
}

export function readSubscriptionPeriod(subscription: Record<string, any>) {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : []
  const starts = items.map((item: Record<string, any>) => Number(item?.current_period_start || 0)).filter(Boolean)
  const ends = items.map((item: Record<string, any>) => Number(item?.current_period_end || 0)).filter(Boolean)

  return {
    start: starts.length ? Math.min(...starts) : Number(subscription?.current_period_start || 0),
    end: ends.length ? Math.min(...ends) : Number(subscription?.current_period_end || 0),
  }
}

export function stripeTimestampToIso(value: unknown) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null
  return new Date(timestamp * 1000).toISOString()
}

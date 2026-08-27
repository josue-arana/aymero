import { supabaseClient } from '../lib/supabaseClient'
import { getSupabaseEnvironmentConfig } from './system/environmentService'

export const AYMERO_MANAGED_PLAN_KEY = 'aymero_managed'

function normalizeError(error, fallbackMessage) {
  return {
    message: error?.message || fallbackMessage,
    code: error?.code || null,
    status: error?.status || null,
  }
}

export async function getSaasBillingSubscription() {
  try {
    const rows = await supabaseClient.request('billing_subscriptions', {
      method: 'GET',
      query: {
        select: 'id,plan_key,status,current_period_start,current_period_end,cancel_at_period_end,last_payment_status,created_at,updated_at',
        order: 'created_at.desc',
        limit: '1',
      },
    })

    return {
      data: Array.isArray(rows) ? rows[0] || null : rows || null,
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to load SaaS billing status.'),
    }
  }
}

export async function createSaasBillingCheckout({
  planKey = AYMERO_MANAGED_PLAN_KEY,
  accessToken = '',
} = {}) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnvironmentConfig()
  if (!supabaseUrl || !supabaseAnonKey || !accessToken) {
    return {
      data: null,
      error: {
        message: 'Billing authentication is not available.',
        code: 'BILLING_AUTH_UNAVAILABLE',
        status: null,
      },
    }
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-billing-checkout`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ planKey }),
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const error = new Error(data?.error || 'Unable to start Stripe Checkout.')
      error.code = data?.code || `BILLING_CHECKOUT_${response.status}`
      error.status = response.status
      throw error
    }

    return { data, error: null }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to start Stripe Checkout.'),
    }
  }
}

export default {
  getSaasBillingSubscription,
  createSaasBillingCheckout,
}

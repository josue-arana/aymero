import { getSupabaseEnvironmentConfig } from './system/environmentService'
import { refreshSession } from './authService'

export const AYMERO_MANAGED_PLAN_KEY = 'aymero_managed'

function normalizeError(error, fallbackMessage) {
  return {
    message: error?.message || fallbackMessage,
    code: error?.code || null,
    status: error?.status || null,
  }
}

function createBillingServiceError(message, code, status = null) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

async function parseResponse(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function getSaasBillingSubscription({ accessToken = '', contractorId = '' } = {}) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnvironmentConfig()

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw createBillingServiceError('Supabase billing configuration is missing.', 'BILLING_ENV_MISSING')
    }
    if (!accessToken || !contractorId) {
      throw createBillingServiceError('Authenticated contractor billing context is required.', 'BILLING_CONTEXT_MISSING')
    }

    const query = new URLSearchParams({
      select: 'id,contractor_id,plan_key,status,current_period_start,current_period_end,cancel_at_period_end,last_payment_status,created_at,updated_at',
      contractor_id: `eq.${contractorId}`,
      order: 'created_at.desc',
      limit: '1',
    })
    const requestBillingRows = (token) => fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/billing_subscriptions?${query}`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Cache-Control': 'no-store',
      },
      cache: 'no-store',
    })

    let response = await requestBillingRows(accessToken)
    if (response.status === 401) {
      const refreshResult = await refreshSession({ error: createBillingServiceError('Billing session expired.', 'BILLING_SESSION_EXPIRED', 401) })
      if (refreshResult?.data?.access_token) {
        response = await requestBillingRows(refreshResult.data.access_token)
      }
    }
    const rows = await parseResponse(response)

    if (!response.ok) {
      throw createBillingServiceError(
        rows?.message || 'Unable to load SaaS billing status.',
        rows?.code || `BILLING_READ_${response.status}`,
        response.status,
      )
    }
    if (!Array.isArray(rows)) {
      throw createBillingServiceError('Billing status returned an invalid response.', 'BILLING_RESPONSE_INVALID')
    }

    return {
      data: rows[0] || null,
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

export async function createSaasBillingPortal({ accessToken = '' } = {}) {
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
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-billing-portal`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const error = new Error(data?.error || 'Unable to open subscription management.')
      error.code = data?.code || `BILLING_PORTAL_${response.status}`
      error.status = response.status
      throw error
    }
    if (!data?.url) {
      throw createBillingServiceError('Subscription management URL is missing.', 'BILLING_PORTAL_URL_MISSING')
    }

    return { data: { url: data.url }, error: null }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to open subscription management.'),
    }
  }
}

export default {
  getSaasBillingSubscription,
  createSaasBillingCheckout,
  createSaasBillingPortal,
}

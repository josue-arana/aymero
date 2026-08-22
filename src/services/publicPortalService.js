import { getSupabaseEnvironmentConfig } from './system/environmentService'

function createPortalError(message, code, status = null) {
  return { message, code, status }
}

export async function getPublicPortalByToken(portalToken, { signal } = {}) {
  const token = String(portalToken || '').trim()
  if (!token) {
    return { data: null, error: createPortalError('Client Portal Not Found.', 'PORTAL_NOT_FOUND', 404) }
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnvironmentConfig()
  if (!supabaseUrl || !supabaseAnonKey) {
    return { data: null, error: createPortalError('Public portal service is not configured.', 'PORTAL_SERVICE_NOT_CONFIGURED') }
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/super-endpoint`, {
      method: 'POST',
      signal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        data: null,
        error: createPortalError(
          payload?.error || 'Unable to load the Client Portal.',
          response.status === 404 ? 'PORTAL_NOT_FOUND' : 'PORTAL_LOAD_FAILED',
          response.status,
        ),
      }
    }

    return { data: payload, error: null }
  } catch (error) {
    if (error?.name === 'AbortError') throw error

    return {
      data: null,
      error: createPortalError(error?.message || 'Unable to load the Client Portal.', 'PORTAL_LOAD_FAILED'),
    }
  }
}

export async function getPublicEstimateByToken(estimateToken, { signal } = {}) {
  const token = String(estimateToken || '').trim()
  if (!token) {
    return { data: null, error: createPortalError('Estimate Not Found.', 'ESTIMATE_NOT_FOUND', 404) }
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnvironmentConfig()
  if (!supabaseUrl || !supabaseAnonKey) {
    return { data: null, error: createPortalError('Public estimate service is not configured.', 'ESTIMATE_SERVICE_NOT_CONFIGURED') }
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/super-endpoint`, {
      method: 'POST',
      signal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, resource: 'estimate' }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        data: null,
        error: createPortalError(
          payload?.error || 'Unable to load the estimate.',
          response.status === 404 ? 'ESTIMATE_NOT_FOUND' : 'ESTIMATE_LOAD_FAILED',
          response.status,
        ),
      }
    }

    return { data: payload, error: null }
  } catch (error) {
    if (error?.name === 'AbortError') throw error

    return {
      data: null,
      error: createPortalError(error?.message || 'Unable to load the estimate.', 'ESTIMATE_LOAD_FAILED'),
    }
  }
}

export async function respondToPublicEstimate(estimateToken, decision, { signal } = {}) {
  const token = String(estimateToken || '').trim()
  const action = String(decision || '').trim().toLowerCase()
  if (!token) {
    return { data: null, error: createPortalError('Estimate Not Found.', 'ESTIMATE_NOT_FOUND', 404) }
  }
  if (!['approve', 'decline'].includes(action)) {
    return { data: null, error: createPortalError('Invalid estimate response.', 'ESTIMATE_RESPONSE_INVALID', 400) }
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnvironmentConfig()
  if (!supabaseUrl || !supabaseAnonKey) {
    return { data: null, error: createPortalError('Public estimate service is not configured.', 'ESTIMATE_SERVICE_NOT_CONFIGURED') }
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/super-endpoint`, {
      method: 'POST',
      signal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, resource: 'estimate', action }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const errorCode = response.status === 404
        ? 'ESTIMATE_NOT_FOUND'
        : response.status === 409
          ? 'ESTIMATE_RESPONSE_CONFLICT'
          : response.status === 400
            ? 'ESTIMATE_RESPONSE_INVALID'
            : 'ESTIMATE_RESPONSE_FAILED'
      return {
        data: null,
        error: createPortalError(payload?.error || 'Unable to record the estimate response.', errorCode, response.status),
      }
    }

    return { data: payload, error: null }
  } catch (error) {
    if (error?.name === 'AbortError') throw error

    return {
      data: null,
      error: createPortalError(error?.message || 'Unable to record the estimate response.', 'ESTIMATE_RESPONSE_FAILED'),
    }
  }
}

export default {
  getByToken: getPublicPortalByToken,
  getEstimateByToken: getPublicEstimateByToken,
  respondToEstimate: respondToPublicEstimate,
}

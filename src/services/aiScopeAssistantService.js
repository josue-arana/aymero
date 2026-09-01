import { refreshSession } from './authService'
import { getSupabaseEnvironmentConfig } from './system/environmentService'
import { ENABLE_AI_SCOPE_ASSISTANT } from '../config/backendConfig'

const endpointName = 'ai-scope-assistant'
const supportedActions = new Set(['professionalize', 'translate'])

function createServiceError(message, code, status = null) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function normalizeError(error) {
  return {
    message: error?.message || 'Scope Assistant could not complete the request.',
    code: error?.code || 'AI_SCOPE_REQUEST_FAILED',
    status: error?.status || null,
  }
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

async function invokeScopeAssistant({ action, estimateId, accessToken }) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnvironmentConfig()
  const normalizedEstimateId = String(estimateId || '').trim()
  if (!supabaseUrl || !supabaseAnonKey) {
    return { data: null, error: normalizeError(createServiceError('Scope Assistant is not configured.', 'AI_SCOPE_ENV_MISSING')) }
  }
  if (!accessToken || !normalizedEstimateId || !supportedActions.has(action)) {
    return { data: null, error: normalizeError(createServiceError('Authenticated estimate context is required.', 'AI_SCOPE_CONTEXT_MISSING')) }
  }

  const makeRequest = (token) => fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${endpointName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, estimateId: normalizedEstimateId }),
  })

  try {
    let response = await makeRequest(accessToken)
    if (response.status === 401) {
      const refreshResult = await refreshSession({
        error: createServiceError('Scope Assistant session expired.', 'AI_SCOPE_SESSION_EXPIRED', 401),
      })
      if (refreshResult?.data?.access_token) response = await makeRequest(refreshResult.data.access_token)
    }

    const data = await parseResponse(response)
    if (!response.ok) {
      throw createServiceError(
        data?.error || 'Scope Assistant could not complete the request.',
        data?.code || `AI_SCOPE_HTTP_${response.status}`,
        response.status,
      )
    }
    if (!data?.scope || data?.estimateId !== normalizedEstimateId || data?.action !== action) {
      throw createServiceError('Scope Assistant returned an invalid response.', 'AI_SCOPE_RESPONSE_INVALID')
    }

    return { data, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export function professionalizeEstimateScope({ estimateId, accessToken = '' } = {}) {
  return invokeScopeAssistant({ action: 'professionalize', estimateId, accessToken })
}

export function translateApprovedEstimateScope({ estimateId, accessToken = '' } = {}) {
  return invokeScopeAssistant({ action: 'translate', estimateId, accessToken })
}

export function isAiScopeAssistantEnabled() {
  return ENABLE_AI_SCOPE_ASSISTANT
}

export default {
  professionalizeEstimateScope,
  translateApprovedEstimateScope,
  isAiScopeAssistantEnabled,
}

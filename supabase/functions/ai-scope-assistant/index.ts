import { createClient } from 'npm:@supabase/supabase-js@2'
import { isPostgresUuid } from '../_shared/saasBillingIdentity.js'
import {
  AI_SCOPE_ACTIONS,
  AI_SCOPE_LIMITS,
  AI_SCOPE_PROMPT_VERSIONS,
  AiScopeContractError,
  buildAiScopeResponsesRequest,
  createAiScopeFingerprint,
  normalizeAiScopeLanguage,
  parseAiScopeProviderResponse,
} from '../_shared/aiScopeAssistant.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

const editableEstimateStatuses = new Set(['draft', 'saved', 'sent', 'rejected'])
const allowedBodyKeys = new Set(['action', 'estimateId'])
const defaultModel = 'gpt-5.6-terra'
const providerTimeoutMs = 25000

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

function normalizePersistedState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const state = value as Record<string, unknown>
  return Number(state.version) === 1 ? state : null
}

function safeErrorDetails(error: unknown) {
  const typedError = error as { name?: unknown; message?: unknown; code?: unknown; providerStatus?: unknown }
  return {
    name: String(typedError?.name || 'Error').slice(0, 100),
    message: String(typedError?.message || 'Unknown AI Scope Assistant failure.').slice(0, 500),
    code: String(typedError?.code || 'AI_SCOPE_REQUEST_FAILED').slice(0, 100),
    providerStatus: Number(typedError?.providerStatus) || null,
  }
}

async function requestOpenAi({
  apiKey,
  requestBody,
}: {
  apiKey: string
  requestBody: Record<string, unknown>
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), providerTimeoutMs)
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(`OpenAI Responses request failed with status ${response.status}.`)
      ;(error as Error & { code?: string }).code = 'AI_SCOPE_PROVIDER_REQUEST_FAILED'
      ;(error as Error & { providerStatus?: number }).providerStatus = response.status
      throw error
    }
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405)

  if (String(Deno.env.get('AI_SCOPE_ASSISTANT_ENABLED') || '').trim().toLowerCase() !== 'true') {
    return jsonResponse({ error: 'Scope Assistant is unavailable.', code: 'AI_SCOPE_UNAVAILABLE' }, 503)
  }

  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim()
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  const openAiApiKey = String(Deno.env.get('OPENAI_API_KEY') || '').trim()
  const model = String(Deno.env.get('AI_SCOPE_MODEL') || defaultModel).trim()
  if (!supabaseUrl || !serviceRoleKey || !openAiApiKey || !model) {
    return jsonResponse({ error: 'Scope Assistant is unavailable.', code: 'AI_SCOPE_CONFIGURATION_MISSING' }, 503)
  }

  const accessToken = readBearerToken(request)
  if (!accessToken) return jsonResponse({ error: 'Authentication is required.', code: 'AUTH_REQUIRED' }, 401)

  let action = ''
  let estimateId = ''
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body.')
    if (Object.keys(body).some((key) => !allowedBodyKeys.has(key))) throw new Error('Unexpected body field.')
    action = String(body.action || '').trim()
    estimateId = String(body.estimateId || '').trim()
  } catch {
    return jsonResponse({ error: 'Invalid request.', code: 'INVALID_REQUEST' }, 400)
  }

  if (!Object.values(AI_SCOPE_ACTIONS).includes(action) || !isPostgresUuid(estimateId)) {
    return jsonResponse({ error: 'Invalid request.', code: 'INVALID_REQUEST' }, 400)
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
    .select('id, contractor_id, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(2)

  if (membershipError) return jsonResponse({ error: 'Unable to verify access.', code: 'ACCESS_LOOKUP_FAILED' }, 500)
  if (!memberships?.length) return jsonResponse({ error: 'Access is unavailable.', code: 'ACCESS_REQUIRED' }, 403)
  if (memberships.length !== 1) return jsonResponse({ error: 'Access could not be resolved.', code: 'ACCESS_AMBIGUOUS' }, 409)

  const membership = memberships[0]
  const contractorId = String(membership.contractor_id || '').trim()
  const { data: estimate, error: estimateError } = await admin
    .from('estimates')
    .select('id, contractor_id, status, archived_at, scope_assistant_state')
    .eq('id', estimateId)
    .eq('contractor_id', contractorId)
    .is('archived_at', null)
    .maybeSingle()

  if (estimateError) return jsonResponse({ error: 'Unable to load the estimate.', code: 'ESTIMATE_LOOKUP_FAILED' }, 500)
  if (!estimate) return jsonResponse({ error: 'Estimate is unavailable.', code: 'ESTIMATE_UNAVAILABLE' }, 404)
  if (!editableEstimateStatuses.has(String(estimate.status || '').trim().toLowerCase())) {
    return jsonResponse({ error: 'Estimate is not editable.', code: 'ESTIMATE_NOT_EDITABLE' }, 409)
  }

  const state = normalizePersistedState(estimate.scope_assistant_state)
  if (!state) return jsonResponse({ error: 'Scope Assistant state is unavailable.', code: 'AI_SCOPE_STATE_REQUIRED' }, 409)

  const sourceLanguage = normalizeAiScopeLanguage(state.contractorLanguage)
  const clientLanguage = normalizeAiScopeLanguage(state.clientLanguage)
  const rawSource = typeof state.rawContractorInput === 'string' ? state.rawContractorInput : ''
  const approvedSource = typeof state.approvedContractorScope === 'string' ? state.approvedContractorScope : ''
  const contractorDraft = typeof state.contractorDraft === 'string' ? state.contractorDraft : ''
  const approvalStatus = String(state.approvalStatus || '').trim().toLowerCase()
  const approvalSourceFingerprint = String(state.approvalSourceFingerprint || '').trim()
  const source = action === AI_SCOPE_ACTIONS.PROFESSIONALIZE ? rawSource : approvedSource

  if (!sourceLanguage) return jsonResponse({ error: 'Scope Assistant state is unavailable.', code: 'AI_SCOPE_STATE_INVALID' }, 409)
  if (!source.trim() || source.length > AI_SCOPE_LIMITS.sourceCharacters) {
    return jsonResponse({ error: 'Persisted scope source is unavailable.', code: 'AI_SCOPE_SOURCE_INVALID' }, 409)
  }
  if (action === AI_SCOPE_ACTIONS.TRANSLATE) {
    if (approvalStatus !== 'approved' || !approvedSource.trim() || !clientLanguage) {
      return jsonResponse({ error: 'An approved scope and client language are required.', code: 'AI_SCOPE_APPROVAL_REQUIRED' }, 409)
    }
    const currentDraftFingerprint = await createAiScopeFingerprint(contractorDraft)
    const approvedSourceFingerprint = await createAiScopeFingerprint(approvedSource)
    if (
      contractorDraft !== approvedSource
      || !approvalSourceFingerprint
      || approvalSourceFingerprint !== currentDraftFingerprint
      || approvalSourceFingerprint !== approvedSourceFingerprint
    ) {
      return jsonResponse({ error: 'The approved scope is no longer current.', code: 'AI_SCOPE_APPROVAL_STALE' }, 409)
    }
  }

  const promptVersion = AI_SCOPE_PROMPT_VERSIONS[action]
  const sourceFingerprint = await createAiScopeFingerprint(source)
  const generatedAt = new Date().toISOString()

  if (action === AI_SCOPE_ACTIONS.TRANSLATE && sourceLanguage === clientLanguage) {
    return jsonResponse({
      action,
      estimateId,
      scope: approvedSource,
      translationRequired: false,
      metadata: { model: null, promptVersion, generatedAt, sourceFingerprint },
    })
  }

  const startedAt = Date.now()
  try {
    const requestBody = buildAiScopeResponsesRequest({
      action,
      model,
      source,
      sourceLanguage,
      targetLanguage: clientLanguage,
    })
    const providerResponse = await requestOpenAi({ apiKey: openAiApiKey, requestBody })
    const result = parseAiScopeProviderResponse(action, providerResponse)

    return jsonResponse({
      action,
      estimateId,
      ...result,
      ...(action === AI_SCOPE_ACTIONS.TRANSLATE ? { translationRequired: true } : {}),
      metadata: { model, promptVersion, generatedAt, sourceFingerprint },
    })
  } catch (error) {
    console.error('AI Scope Assistant request failed.', {
      action,
      estimateId,
      promptVersion,
      model,
      elapsedMs: Date.now() - startedAt,
      ...safeErrorDetails(error),
    })
    const status = error instanceof AiScopeContractError ? 422 : 502
    return jsonResponse({ error: 'Scope Assistant could not complete the request.', code: 'AI_SCOPE_REQUEST_FAILED' }, status)
  }
})

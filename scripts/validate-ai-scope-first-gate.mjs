import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyProfessionalizedCandidate,
  createScopeAssistantState,
  normalizeScopeAssistantStateForStorage,
} from '../src/utils/scopeAssistantState.js'

const STAGING_REF = 'mhaxxekgupjxifmjukop'
const PRODUCTION_REF = 'qespkkmxaxzsfqrlghev'
const STAGING_NAME = 'Aymero Staging'
const STAGING_URL = `https://${STAGING_REF}.supabase.co`
const SAMPLE_DATA_KEY = 'staging-runtime-estimate-en'
const ROUGH_NOTES = 'quitar vanity viejo poner vanity nuevo cambiar toilet pintar baño instalar espejo y dos luces materiales no incluidos'
const CANONICAL_SENTINEL = 'Alcance manual sintético sin aceptar antes de usar el asistente.'
const CONTROLLED_FAILURE_ONLY = process.argv.includes('--controlled-failure-only')

const root = resolve(import.meta.dirname, '..')
const linkedRefPath = resolve(root, 'supabase/.temp/project-ref')
const credentialsPath = resolve(root, '.env.staging.test.local')

function runSupabase(args) {
  return execFileSync('supabase', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function parseCliJson(args) {
  return JSON.parse(runSupabase([...args, '-o', 'json']) || '[]')
}

function verifyStagingTarget() {
  const linkedRef = readFileSync(linkedRefPath, 'utf8').trim()
  assert.equal(linkedRef, STAGING_REF, `Refusing to continue: linked ref is ${linkedRef || 'missing'}.`)
  assert.notEqual(linkedRef, PRODUCTION_REF, 'Refusing to target Aymero Production.')

  const projects = parseCliJson(['projects', 'list'])
  const staging = projects.find((project) => project.ref === STAGING_REF)
  const production = projects.find((project) => project.ref === PRODUCTION_REF)
  assert.equal(staging?.name, STAGING_NAME, 'Staging ref/name verification failed.')
  assert.equal(staging?.linked, true, 'Aymero Staging is not the linked project.')
  assert.equal(production?.linked, false, 'Aymero Production must remain unlinked.')
}

function readPublishableKey() {
  verifyStagingTarget()
  const rows = parseCliJson(['projects', 'api-keys', '--project-ref', STAGING_REF])
  const key = rows.find((row) => row.type === 'publishable')?.api_key
    || rows.find((row) => row.name === 'anon')?.api_key
  assert.ok(key, 'Staging publishable/anon API key is unavailable.')
  return key
}

function parseEnvFile(path) {
  assert.ok(existsSync(path), `${path} is missing.`)
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

async function readResponse(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function apiRequest(path, {
  apiKey,
  token = apiKey,
  method = 'GET',
  body,
  prefer,
} = {}) {
  const response = await fetch(`${STAGING_URL}${path}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await readResponse(response)
  if (!response.ok) {
    const code = data && typeof data === 'object' ? data.code || data.error_code : null
    const message = data && typeof data === 'object'
      ? data.error || data.message || data.msg || `HTTP ${response.status}`
      : `HTTP ${response.status}`
    const error = new Error(`${method} ${path} failed (${response.status}${code ? ` ${code}` : ''}): ${String(message).slice(0, 300)}`)
    error.status = response.status
    error.code = code
    error.sanitizedMessage = String(message).slice(0, 300)
    throw error
  }
  return { data, status: response.status }
}

async function signIn(apiKey, email, password) {
  const { data } = await apiRequest('/auth/v1/token?grant_type=password', {
    apiKey,
    method: 'POST',
    body: { email, password },
  })
  assert.ok(data?.access_token, 'Staging sign-in did not return an access token.')
  assert.ok(data?.user?.id, 'Staging sign-in did not return a user.')
  return data
}

async function readEstimate(apiKey, token) {
  const params = new URLSearchParams({
    select: 'id,contractor_id,status,scope_of_work,scope_assistant_state,sample_data_key',
    sample_data_key: `eq.${SAMPLE_DATA_KEY}`,
    limit: '1',
  })
  const { data } = await apiRequest(`/rest/v1/estimates?${params}`, { apiKey, token })
  assert.equal(data?.length, 1, 'The primary staging estimate fixture was not available through authenticated RLS.')
  return data[0]
}

async function patchEstimate(apiKey, token, estimateId, body) {
  verifyStagingTarget()
  const params = new URLSearchParams({ id: `eq.${estimateId}` })
  const { data } = await apiRequest(`/rest/v1/estimates?${params}`, {
    apiKey,
    token,
    method: 'PATCH',
    body,
    prefer: 'return=representation',
  })
  assert.equal(data?.length, 1, 'The authenticated staging estimate update did not return exactly one row.')
  return data[0]
}

function evaluateSemanticGate(scope, reviewWarnings) {
  const normalized = String(scope || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const required = {
    removeVanity: /\b(retirar|quitar|remover|desmontar)\b/.test(normalized) && /\b(vanity|tocador|gabinete)\b/.test(normalized),
    installVanity: /\b(instalar|colocar|montar)\b/.test(normalized) && /\b(vanity|tocador|gabinete)\b/.test(normalized),
    replaceToilet: /\b(reemplazar|cambiar|sustituir)\b/.test(normalized)
      && /\b(toilet|inodoro|sanitario)\b/.test(normalized),
    paintBathroom: /\b(pintar|pintura)\b/.test(normalized) && /\b(bano|paredes|muros)\b/.test(normalized),
    installMirror: /\b(instalar|colocar|montar)\b/.test(normalized) && /\b(espejo)\b/.test(normalized),
    installTwoLights: /\b(instalar|colocar|montar)\b/.test(normalized)
      && /\b(2|dos)\b/.test(normalized)
      && /\b(luces|luminarias|lamparas)\b/.test(normalized),
    materialsExcluded: /materiales/.test(normalized) && /\b(no|excluid|sin)\w*/.test(normalized),
  }
  const prohibitedPatterns = {
    priceOrCost: /\b(precio|costo|coste|\$|usd|dolares)\b/.test(normalized),
    warranty: /\bgarantia\b/.test(normalized),
    permitOrCode: /\b(permiso|codigo de construccion|normativa)\b/.test(normalized),
    inventedCleanup: /\b(limpieza|escombros|desechos|disposicion)\b/.test(normalized),
    inventedMeasurements: /\b(pulgadas|pies cuadrados|metros cuadrados|dimensiones|medidas)\b/.test(normalized),
  }
  const warningsSafe = Array.isArray(reviewWarnings)
    && reviewWarnings.length <= 5
    && reviewWarnings.every((warning) => typeof warning === 'string' && warning.length <= 300)

  return {
    passed: Object.values(required).every(Boolean) && !Object.values(prohibitedPatterns).some(Boolean) && warningsSafe,
    required,
    prohibitedPatterns,
    warningsSafe,
  }
}

async function main() {
  verifyStagingTarget()
  const apiKey = readPublishableKey()
  const credentials = parseEnvFile(credentialsPath)
  assert.ok(credentials.STAGING_PRIMARY_EMAIL && credentials.STAGING_PRIMARY_PASSWORD, 'Primary staging credentials are missing.')
  const session = await signIn(apiKey, credentials.STAGING_PRIMARY_EMAIL, credentials.STAGING_PRIMARY_PASSWORD)
  const estimateBefore = await readEstimate(apiKey, session.access_token)
  assert.ok(['draft', 'saved', 'sent', 'rejected'].includes(estimateBefore.status), 'The staging estimate is not editable.')

  if (CONTROLLED_FAILURE_ONLY) {
    let invocationError = null
    try {
      await apiRequest('/functions/v1/ai-scope-assistant', {
        apiKey,
        token: session.access_token,
        method: 'POST',
        body: { action: 'professionalize', estimateId: estimateBefore.id },
      })
    } catch (error) {
      invocationError = error
    }
    assert.ok(invocationError, 'The controlled provider failure unexpectedly succeeded.')
    const estimateAfter = await readEstimate(apiKey, session.access_token)
    const previousAssistantStateUnchanged = JSON.stringify(estimateAfter.scope_assistant_state)
      === JSON.stringify(estimateBefore.scope_assistant_state)
    const canonicalScopeUnchanged = estimateAfter.scope_of_work === estimateBefore.scope_of_work
    assert.equal(previousAssistantStateUnchanged, true, 'Controlled provider failure changed assistant state.')
    assert.equal(canonicalScopeUnchanged, true, 'Controlled provider failure changed canonical scope.')
    console.log(JSON.stringify({
      target: { name: STAGING_NAME, ref: STAGING_REF, productionRefUntouched: PRODUCTION_REF },
      providerCalls: 1,
      failure: {
        httpStatus: invocationError.status || null,
        classification: invocationError.code || 'UNKNOWN',
        sanitizedMessage: invocationError.sanitizedMessage || 'Scope Assistant could not complete the request.',
        usageMetadataExists: false,
      },
      persistence: {
        previousAssistantStateUnchanged,
        canonicalScopeUnchanged,
        approvedSnapshotUnchanged: estimateAfter.scope_assistant_state?.approvedContractorScope
          === estimateBefore.scope_assistant_state?.approvedContractorScope,
        priorCandidateUnchanged: estimateAfter.scope_assistant_state?.contractorDraft
          === estimateBefore.scope_assistant_state?.contractorDraft,
        priorTranslationUnchanged: estimateAfter.scope_assistant_state?.clientScope
          === estimateBefore.scope_assistant_state?.clientScope,
        canonicalAcceptanceUnchanged: JSON.stringify(estimateAfter.scope_assistant_state?.canonicalAcceptance)
          === JSON.stringify(estimateBefore.scope_assistant_state?.canonicalAcceptance),
      },
    }, null, 2))
    return
  }

  const initializedState = normalizeScopeAssistantStateForStorage(createScopeAssistantState({
    rawContractorInput: ROUGH_NOTES,
    contractorDraft: '',
    contractorLanguage: 'es',
    clientLanguage: 'en',
  }))
  await patchEstimate(apiKey, session.access_token, estimateBefore.id, {
    scope_of_work: CANONICAL_SENTINEL,
    scope_assistant_state: initializedState,
  })

  // This is the only provider-backed call in the first semantic gate.
  const startedAt = Date.now()
  let invocation
  try {
    invocation = await apiRequest('/functions/v1/ai-scope-assistant', {
      apiKey,
      token: session.access_token,
      method: 'POST',
      body: { action: 'professionalize', estimateId: estimateBefore.id },
    })
  } catch (error) {
    const estimateAfterFailure = await readEstimate(apiKey, session.access_token)
    const previousStateUnchanged = JSON.stringify(estimateAfterFailure.scope_assistant_state) === JSON.stringify(initializedState)
    const canonicalScopeUnchanged = estimateAfterFailure.scope_of_work === CANONICAL_SENTINEL
    console.log(JSON.stringify({
      target: { name: STAGING_NAME, ref: STAGING_REF, productionRefUntouched: PRODUCTION_REF },
      providerCalls: 1,
      request: { action: 'professionalize', estimateId: estimateBefore.id, sourceLanguage: 'es', notes: ROUGH_NOTES },
      failure: {
        httpStatus: error.status || null,
        classification: error.code || 'UNKNOWN',
        sanitizedMessage: error.sanitizedMessage || 'Scope Assistant could not complete the request.',
        usageMetadataExists: false,
      },
      persistence: {
        candidatePersisted: false,
        previousAssistantStateUnchanged: previousStateUnchanged,
        canonicalScopeUnchanged,
      },
    }, null, 2))
    assert.equal(previousStateUnchanged, true, 'Provider failure changed the pre-call assistant state.')
    assert.equal(canonicalScopeUnchanged, true, 'Provider failure changed the canonical scope.')
    throw error
  }
  const { data: result, status } = invocation
  const elapsedMs = Date.now() - startedAt

  assert.equal(result?.action, 'professionalize')
  assert.equal(result?.estimateId, estimateBefore.id)
  assert.ok(result?.scope, 'The deployed function returned no professionalized scope.')
  assert.ok(result?.metadata?.promptVersion, 'The deployed function returned no prompt version.')
  assert.ok(result?.metadata?.generatedAt, 'The deployed function returned no generation timestamp.')
  assert.ok(result?.metadata?.sourceFingerprint, 'The deployed function returned no source fingerprint.')
  assert.equal(result?.metadata?.model, 'gpt-5.6-luna', 'The first staging gate did not use Luna.')

  const persistedState = normalizeScopeAssistantStateForStorage(await applyProfessionalizedCandidate(initializedState, {
    scope: result.scope,
    reviewWarnings: result.reviewWarnings,
    model: result.metadata.model,
    promptVersion: result.metadata.promptVersion,
    generatedAt: result.metadata.generatedAt,
  }))
  await patchEstimate(apiKey, session.access_token, estimateBefore.id, {
    scope_assistant_state: persistedState,
  })

  const estimateAfter = await readEstimate(apiKey, session.access_token)
  assert.equal(estimateAfter.scope_of_work, CANONICAL_SENTINEL, 'AI generation changed the canonical estimate scope before acceptance.')
  assert.equal(estimateAfter.scope_assistant_state?.contractorDraft, result.scope, 'The candidate did not survive persistence.')
  assert.equal(estimateAfter.scope_assistant_state?.professionalizationStatus, 'current')
  assert.equal(estimateAfter.scope_assistant_state?.approvalStatus, 'draft')

  const semanticGate = evaluateSemanticGate(result.scope, result.reviewWarnings)
  console.log(JSON.stringify({
    target: { name: STAGING_NAME, ref: STAGING_REF, productionRefUntouched: PRODUCTION_REF },
    providerCalls: 1,
    request: { action: 'professionalize', estimateId: estimateBefore.id, sourceLanguage: 'es', notes: ROUGH_NOTES },
    response: {
      httpStatus: status,
      elapsedMs,
      scope: result.scope,
      reviewWarnings: result.reviewWarnings || [],
      metadata: result.metadata,
    },
    semanticGate,
    persistence: {
      candidatePersisted: true,
      canonicalScopeUnchanged: true,
      approvalStatus: estimateAfter.scope_assistant_state.approvalStatus,
      professionalizationStatus: estimateAfter.scope_assistant_state.professionalizationStatus,
    },
  }, null, 2))

  assert.equal(semanticGate.passed, true, 'FIRST_SEMANTIC_GATE_FAILED')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

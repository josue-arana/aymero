import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SCOPE_ASSISTANT_SEND_REASON,
  acceptScopeAssistantCanonicalScope,
  applyClientScope,
  applyProfessionalizedCandidate,
  approveContractorDraft,
  createScopeAssistantState,
  editContractorDraft,
  editScopeAssistantClientScope,
  getScopeAssistantSendReadiness,
  normalizeScopeAssistantStateForStorage,
} from '../src/utils/scopeAssistantState.js'

const STAGING_REF = 'mhaxxekgupjxifmjukop'
const PRODUCTION_REF = 'qespkkmxaxzsfqrlghev'
const STAGING_NAME = 'Aymero Staging'
const STAGING_URL = `https://${STAGING_REF}.supabase.co`
const EXPECTED_MODEL = 'gpt-5.6-luna'
const PRIMARY_ESTIMATE_KEY = 'staging-runtime-estimate-en'
const SAME_LANGUAGE_ESTIMATE_KEY = 'staging-runtime-estimate-es'
const NON_EDITABLE_ESTIMATE_KEY = 'staging-runtime-estimate-conversion'
const ISOLATION_ESTIMATE_KEY = 'staging-isolation-estimate'
const FIRST_GATE_SOURCE = 'quitar vanity viejo poner vanity nuevo cambiar toilet pintar baño instalar espejo y dos luces materiales no incluidos'
const CANONICAL_SENTINEL = 'Alcance manual sintético sin aceptar durante la evaluación Luna.'

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
  assert.equal(projects.find((project) => project.ref === STAGING_REF)?.name, STAGING_NAME)
  assert.equal(projects.find((project) => project.ref === STAGING_REF)?.linked, true)
  assert.equal(projects.find((project) => project.ref === PRODUCTION_REF)?.linked, false)
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
  allowError = false,
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
  if (!response.ok && !allowError) {
    const code = data && typeof data === 'object' ? data.code || data.error_code : null
    const message = data && typeof data === 'object'
      ? data.error || data.message || data.msg || `HTTP ${response.status}`
      : `HTTP ${response.status}`
    throw new Error(`${method} ${path} failed (${response.status}${code ? ` ${code}` : ''}): ${String(message).slice(0, 300)}`)
  }
  return { data, status: response.status, ok: response.ok }
}

async function signIn(apiKey, email, password) {
  const { data } = await apiRequest('/auth/v1/token?grant_type=password', {
    apiKey,
    method: 'POST',
    body: { email, password },
  })
  assert.ok(data?.access_token && data?.user?.id, `Staging sign-in failed for ${email}.`)
  return data
}

function restPath(table, query = {}) {
  const params = new URLSearchParams(query)
  return `/rest/v1/${table}${params.size ? `?${params}` : ''}`
}

async function readRows(apiKey, token, table, query) {
  const { data } = await apiRequest(restPath(table, query), { apiKey, token })
  return Array.isArray(data) ? data : []
}

async function readEstimateByKey(apiKey, token, sampleDataKey) {
  const rows = await readRows(apiKey, token, 'estimates', {
    select: 'id,contractor_id,status,scope_of_work,scope_assistant_state,sample_data_key',
    sample_data_key: `eq.${sampleDataKey}`,
    limit: '1',
  })
  assert.equal(rows.length, 1, `Estimate fixture ${sampleDataKey} is unavailable.`)
  return rows[0]
}

async function readEstimateById(apiKey, token, estimateId) {
  const rows = await readRows(apiKey, token, 'estimates', {
    select: 'id,contractor_id,status,scope_of_work,scope_assistant_state,sample_data_key',
    id: `eq.${estimateId}`,
    limit: '1',
  })
  assert.equal(rows.length, 1, `Estimate ${estimateId} is unavailable.`)
  return rows[0]
}

async function patchEstimate(apiKey, token, estimateId, body) {
  verifyStagingTarget()
  const { data } = await apiRequest(restPath('estimates', { id: `eq.${estimateId}` }), {
    apiKey,
    token,
    method: 'PATCH',
    body,
    prefer: 'return=representation',
  })
  assert.equal(data?.length, 1, 'Authenticated estimate update did not return exactly one row.')
  return data[0]
}

async function invokeAssistant(apiKey, token, action, estimateId, allowError = false) {
  const startedAt = Date.now()
  const response = await apiRequest('/functions/v1/ai-scope-assistant', {
    apiKey,
    token,
    method: 'POST',
    body: { action, estimateId },
    allowError,
  })
  return { ...response, elapsedMs: Date.now() - startedAt }
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text))
}

function evaluateCommon(scope, { required = {}, forbidden = [] } = {}) {
  const normalized = normalizeText(scope)
  const requiredResults = Object.fromEntries(
    Object.entries(required).map(([name, predicate]) => [name, Boolean(predicate(normalized))]),
  )
  const invented = forbidden.filter((pattern) => pattern.test(normalized)).map((pattern) => pattern.source)
  return {
    required: requiredResults,
    invented,
    passed: Object.values(requiredResults).every(Boolean) && invented.length === 0,
  }
}

const fixtures = [
  {
    id: 'materials-not-included',
    sourceLanguage: 'en',
    source: 'install cabinet hardware. materials not included.',
    required: {
      installHardware: (text) => /install/.test(text) && /cabinet/.test(text) && /hardware/.test(text),
      materialsExcluded: (text) => /materials/.test(text) && /(not included|excluded)/.test(text),
    },
    forbidden: [/provide materials/, /warranty/, /permit/, /cleanup/],
  },
  {
    id: 'exact-dimensions',
    sourceLanguage: 'en',
    source: 'replace 36 x 48 bathroom window only',
    required: {
      replaceWindow: (text) => /replace/.test(text) && /window/.test(text),
      exactDimensions: (text) => /36\s*(?:x|by)\s*48/.test(text),
      qualificationOnly: (text) => /only/.test(text),
    },
    forbidden: [/trim/, /permit/, /code/, /warranty/],
  },
  {
    id: 'exact-quantities',
    sourceLanguage: 'en',
    source: 'install 12 cabinet pulls and replace 3 hinges.',
    required: {
      twelvePulls: (text) => /(?:12|twelve)/.test(text) && /cabinet pulls?/.test(text),
      threeHinges: (text) => /(?:3|three)/.test(text) && /hinges?/.test(text),
      actions: (text) => /install/.test(text) && /replace/.test(text),
    },
    forbidden: [/(?:13|thirteen) cabinet/, /(?:4|four) hinges/, /warranty/, /materials included/],
  },
  {
    id: 'exclusion-and-qualification',
    sourceLanguage: 'en',
    source: 'repair damaged siding if matching boards available. painting excluded.',
    required: {
      repairSiding: (text) => /repair/.test(text) && /siding/.test(text),
      availabilityCondition: (text) => /if/.test(text) && /matching boards/.test(text) && /available/.test(text),
      paintingExcluded: (text) => /painting/.test(text) && /excluded|not included/.test(text),
    },
    forbidden: [/paint the siding/, /guaranteed match/, /replace all/, /warranty/],
  },
  {
    id: 'ambiguous-source',
    sourceLanguage: 'en',
    source: 'repair bad boards if needed maybe around 8',
    required: {
      repairBoards: (text) => /repair/.test(text) && /boards/.test(text),
      conditional: (text) => /if needed|as needed/.test(text),
      approximateEight: (text) => includesAny(text, [/(?:about|around|approximately) (?:8|eight)/, /(?:8|eight)\s+(?:approximately|estimated)/]),
    },
    forbidden: [/exactly (?:8|eight)/, /all boards/, /replace/, /guarantee/],
    warningExpectation: 'optional-if-ambiguity-preserved',
  },
  {
    id: 'electrical-no-code-claims',
    sourceLanguage: 'en',
    source: 'replace 4 kitchen outlets. owner supplies outlets.',
    required: {
      fourOutlets: (text) => /replace/.test(text) && /(?:4|four) kitchen outlets/.test(text),
      ownerSupplies: (text) => /owner/.test(text) && /suppl/.test(text) && /outlets/.test(text),
    },
    forbidden: [/code/, /permit/, /inspection/, /gfci/, /warranty/],
  },
  {
    id: 'multi-room-renovation',
    sourceLanguage: 'en',
    source: 'living room: patch walls. bedroom: replace baseboard. kitchen: paint ceiling only.',
    required: {
      livingRoomWalls: (text) => /living room/.test(text) && /patch/.test(text) && /walls/.test(text),
      bedroomBaseboard: (text) => /bedroom/.test(text) && /replace/.test(text) && /baseboard/.test(text),
      kitchenCeilingOnly: (text) => /kitchen/.test(text) && /paint/.test(text) && /ceiling/.test(text) && /only/.test(text),
    },
    forbidden: [/bathroom/, /flooring/, /cabinets/, /trim/, /cleanup/],
  },
  {
    id: 'english-contractor-input',
    sourceLanguage: 'en',
    source: 'remove old door and put new one. disposal by customer.',
    required: {
      replaceDoor: (text) => /remove/.test(text) && /install/.test(text) && /door/.test(text),
      customerDisposal: (text) => /customer/.test(text) && /disposal/.test(text),
    },
    forbidden: [/contractor.*disposal/, /paint/, /warranty/, /materials included/],
  },
]

function evaluateFirstGateTranslation(scope) {
  return evaluateCommon(scope, {
    required: {
      removeVanity: (text) => /remove/.test(text) && /vanity/.test(text),
      installVanity: (text) => /install/.test(text) && /vanity/.test(text),
      replaceToilet: (text) => /replace|change/.test(text) && /toilet/.test(text),
      paintBathroom: (text) => /paint/.test(text) && /bathroom/.test(text),
      installMirror: (text) => /install/.test(text) && /mirror/.test(text),
      exactlyTwoLights: (text) => /(?:2|two) lights/.test(text),
      materialsExcluded: (text) => /materials/.test(text) && /not included|excluded/.test(text),
    },
    forbidden: [/price/, /cost/, /warranty/, /permit/, /code/, /cleanup/, /disposal/, /dimensions/],
  })
}

function usageFrom(result) {
  const usage = result?.metadata?.usage
  assert.equal(result?.metadata?.model, EXPECTED_MODEL, 'Provider response did not use Luna.')
  assert.ok(usage && Number.isInteger(usage.totalTokens), 'Provider response did not include usage metadata.')
  return usage
}

async function main() {
  verifyStagingTarget()
  const apiKey = readPublishableKey()
  const credentials = parseEnvFile(credentialsPath)
  const [primary, isolation] = await Promise.all([
    signIn(apiKey, credentials.STAGING_PRIMARY_EMAIL, credentials.STAGING_PRIMARY_PASSWORD),
    signIn(apiKey, credentials.STAGING_ISOLATION_EMAIL, credentials.STAGING_ISOLATION_PASSWORD),
  ])
  const membershipRows = await readRows(apiKey, primary.access_token, 'contractor_members', {
    select: 'id,contractor_id,role,status',
    user_id: `eq.${primary.user.id}`,
    status: 'eq.active',
    limit: '2',
  })
  assert.equal(membershipRows.length, 1)
  const memberId = membershipRows[0].id
  const primaryEstimate = await readEstimateByKey(apiKey, primary.access_token, PRIMARY_ESTIMATE_KEY)
  const suiteEstimate = await readEstimateByKey(apiKey, primary.access_token, SAME_LANGUAGE_ESTIMATE_KEY)
  const nonEditableEstimate = await readEstimateByKey(apiKey, primary.access_token, NON_EDITABLE_ESTIMATE_KEY)
  const isolationEstimate = await readEstimateByKey(apiKey, isolation.access_token, ISOLATION_ESTIMATE_KEY)

  const providerResults = []
  const firstGateState = primaryEstimate.scope_assistant_state
  assert.equal(firstGateState?.rawContractorInput, FIRST_GATE_SOURCE, 'First-gate source is not current.')
  assert.equal(firstGateState?.professionalizationStatus, 'current')
  assert.equal(firstGateState?.approvalStatus, 'draft')
  const firstGateCandidate = firstGateState.contractorDraft
  assert.ok(firstGateCandidate)

  const approved = normalizeScopeAssistantStateForStorage(await approveContractorDraft(firstGateState, { memberId }))
  await patchEstimate(apiKey, primary.access_token, primaryEstimate.id, { scope_assistant_state: approved })
  const approvedReloaded = await readEstimateById(apiKey, primary.access_token, primaryEstimate.id)
  assert.equal(approvedReloaded.scope_assistant_state.approvedContractorScope, firstGateCandidate)
  assert.equal(approvedReloaded.scope_assistant_state.approvalStatus, 'approved')
  assert.notEqual(approvedReloaded.scope_of_work, firstGateCandidate, 'Approval silently changed canonical scope.')

  const translatedResponse = await invokeAssistant(apiKey, primary.access_token, 'translate', primaryEstimate.id)
  assert.equal(translatedResponse.status, 200)
  assert.equal(translatedResponse.data.translationRequired, true)
  const translationEvaluation = evaluateFirstGateTranslation(translatedResponse.data.scope)
  assert.equal(translationEvaluation.passed, true, 'Spanish-to-English translation changed source semantics.')
  providerResults.push({
    id: 'spanish-to-english-translation',
    action: 'translate',
    sourceLanguage: 'es',
    targetLanguage: 'en',
    source: approved.approvedContractorScope,
    output: translatedResponse.data.scope,
    reviewWarnings: [],
    evaluation: translationEvaluation,
    usage: usageFrom(translatedResponse.data),
    elapsedMs: translatedResponse.elapsedMs,
  })

  const translatedState = normalizeScopeAssistantStateForStorage(await applyClientScope(approved, {
    scope: translatedResponse.data.scope,
    model: translatedResponse.data.metadata.model,
    promptVersion: translatedResponse.data.metadata.promptVersion,
    generatedAt: translatedResponse.data.metadata.generatedAt,
  }))
  await patchEstimate(apiKey, primary.access_token, primaryEstimate.id, { scope_assistant_state: translatedState })
  const translatedReloaded = await readEstimateById(apiKey, primary.access_token, primaryEstimate.id)
  assert.equal(translatedReloaded.scope_assistant_state.clientScope, translatedResponse.data.scope)
  assert.equal(translatedReloaded.scope_assistant_state.approvedContractorScope, approved.approvedContractorScope)
  assert.equal((await getScopeAssistantSendReadiness(translatedState, translatedReloaded.scope_of_work)).reason, SCOPE_ASSISTANT_SEND_REASON.CLIENT_VERSION_NOT_ACCEPTED)

  const acceptedClient = normalizeScopeAssistantStateForStorage(await acceptScopeAssistantCanonicalScope(translatedState, {
    canonicalScope: translatedState.clientScope,
  }))
  await patchEstimate(apiKey, primary.access_token, primaryEstimate.id, {
    scope_of_work: translatedState.clientScope,
    scope_assistant_state: acceptedClient,
  })
  const acceptedReloaded = await readEstimateById(apiKey, primary.access_token, primaryEstimate.id)
  assert.deepEqual(await getScopeAssistantSendReadiness(
    acceptedReloaded.scope_assistant_state,
    acceptedReloaded.scope_of_work,
  ), { ready: true, manual: false, reason: SCOPE_ASSISTANT_SEND_REASON.READY })

  const manuallyEditedText = `Scope of work:\n${acceptedClient.clientScope}`
  const manuallyEdited = normalizeScopeAssistantStateForStorage(editScopeAssistantClientScope(acceptedClient, manuallyEditedText))
  await patchEstimate(apiKey, primary.access_token, primaryEstimate.id, { scope_assistant_state: manuallyEdited })
  const manualEditReloaded = await readEstimateById(apiKey, primary.access_token, primaryEstimate.id)
  assert.equal(manualEditReloaded.scope_assistant_state.clientScopeManuallyEdited, true)
  assert.equal(manualEditReloaded.scope_assistant_state.approvedContractorScope, approved.approvedContractorScope)
  assert.equal(manualEditReloaded.scope_assistant_state.canonicalAcceptance, null)
  assert.equal(manualEditReloaded.scope_of_work, acceptedClient.clientScope)
  assert.equal((await getScopeAssistantSendReadiness(manuallyEdited, manualEditReloaded.scope_of_work)).reason, SCOPE_ASSISTANT_SEND_REASON.CLIENT_VERSION_NOT_ACCEPTED)

  const reacceptedClient = normalizeScopeAssistantStateForStorage(await acceptScopeAssistantCanonicalScope(manuallyEdited, {
    canonicalScope: manuallyEdited.clientScope,
  }))
  await patchEstimate(apiKey, primary.access_token, primaryEstimate.id, {
    scope_of_work: manuallyEdited.clientScope,
    scope_assistant_state: reacceptedClient,
  })
  const reacceptedReloaded = await readEstimateById(apiKey, primary.access_token, primaryEstimate.id)
  assert.equal((await getScopeAssistantSendReadiness(reacceptedReloaded.scope_assistant_state, reacceptedReloaded.scope_of_work)).ready, true)

  const editedContractorText = reacceptedClient.contractorDraft.replace('vanity nuevo', 'tocador nuevo')
  assert.notEqual(editedContractorText, reacceptedClient.contractorDraft, 'Controlled contractor edit did not change the draft.')
  const staleState = normalizeScopeAssistantStateForStorage(editContractorDraft(reacceptedClient, editedContractorText))
  await patchEstimate(apiKey, primary.access_token, primaryEstimate.id, { scope_assistant_state: staleState })
  const staleReloaded = await readEstimateById(apiKey, primary.access_token, primaryEstimate.id)
  assert.equal(staleReloaded.scope_assistant_state.approvedContractorScope, approved.approvedContractorScope)
  assert.equal(staleReloaded.scope_assistant_state.approvalStatus, 'stale')
  assert.equal(staleReloaded.scope_assistant_state.translationStatus, 'stale')
  assert.equal(staleReloaded.scope_assistant_state.canonicalAcceptance, null)
  assert.equal((await getScopeAssistantSendReadiness(staleReloaded.scope_assistant_state, staleReloaded.scope_of_work)).reason, SCOPE_ASSISTANT_SEND_REASON.APPROVAL_STALE)

  const explicitlyReapproved = normalizeScopeAssistantStateForStorage(await approveContractorDraft(staleState, { memberId }))
  await patchEstimate(apiKey, primary.access_token, primaryEstimate.id, { scope_assistant_state: explicitlyReapproved })
  const reapprovedReloaded = await readEstimateById(apiKey, primary.access_token, primaryEstimate.id)
  assert.equal(reapprovedReloaded.scope_assistant_state.approvedContractorScope, editedContractorText)
  assert.equal(reapprovedReloaded.scope_assistant_state.approvalStatus, 'approved')
  assert.equal(reapprovedReloaded.scope_assistant_state.translationStatus, 'stale')

  for (const fixture of fixtures) {
    const initialState = normalizeScopeAssistantStateForStorage(createScopeAssistantState({
      rawContractorInput: fixture.source,
      contractorLanguage: fixture.sourceLanguage,
      clientLanguage: fixture.sourceLanguage,
    }))
    await patchEstimate(apiKey, primary.access_token, suiteEstimate.id, {
      scope_of_work: CANONICAL_SENTINEL,
      scope_assistant_state: initialState,
    })
    const response = await invokeAssistant(apiKey, primary.access_token, 'professionalize', suiteEstimate.id)
    assert.equal(response.status, 200, `${fixture.id}: provider request failed.`)
    const evaluation = evaluateCommon(response.data.scope, fixture)
    const warnings = Array.isArray(response.data.reviewWarnings) ? response.data.reviewWarnings : []
    if (fixture.warningExpectation !== 'optional-if-ambiguity-preserved') assert.equal(warnings.length, 0, `${fixture.id}: unexpected warning.`)
    assert.equal(evaluation.passed, true, `${fixture.id}: semantic fidelity failed.`)
    const candidate = normalizeScopeAssistantStateForStorage(await applyProfessionalizedCandidate(initialState, {
      scope: response.data.scope,
      reviewWarnings: warnings,
      model: response.data.metadata.model,
      promptVersion: response.data.metadata.promptVersion,
      generatedAt: response.data.metadata.generatedAt,
    }))
    await patchEstimate(apiKey, primary.access_token, suiteEstimate.id, { scope_assistant_state: candidate })
    const reloaded = await readEstimateById(apiKey, primary.access_token, suiteEstimate.id)
    assert.equal(reloaded.scope_assistant_state.contractorDraft, response.data.scope)
    assert.equal(reloaded.scope_of_work, CANONICAL_SENTINEL)
    providerResults.push({
      id: fixture.id,
      action: 'professionalize',
      sourceLanguage: fixture.sourceLanguage,
      source: fixture.source,
      output: response.data.scope,
      reviewWarnings: warnings,
      warningBehavior: fixture.warningExpectation || (warnings.length ? 'unexpected' : 'N/A'),
      evaluation,
      usage: usageFrom(response.data),
      elapsedMs: response.elapsedMs,
    })
    console.log(JSON.stringify({ fixture: fixture.id, result: 'PASS', output: response.data.scope, reviewWarnings: warnings }))
  }

  const sameLanguageSource = 'quitar cuatro azulejos dañados y poner reemplazos; el cliente trae los azulejos'
  const sameLanguageInitial = normalizeScopeAssistantStateForStorage(createScopeAssistantState({
    rawContractorInput: sameLanguageSource,
    contractorLanguage: 'es',
    clientLanguage: 'es',
  }))
  await patchEstimate(apiKey, primary.access_token, suiteEstimate.id, {
    scope_of_work: CANONICAL_SENTINEL,
    scope_assistant_state: sameLanguageInitial,
  })
  const sameLanguageResponse = await invokeAssistant(apiKey, primary.access_token, 'professionalize', suiteEstimate.id)
  assert.equal(sameLanguageResponse.status, 200)
  const sameLanguageEvaluation = evaluateCommon(sameLanguageResponse.data.scope, {
    required: {
      fourTiles: (text) => /(?:4|cuatro) azulejos/.test(text),
      replaceTiles: (text) => /retirar|quitar/.test(text) && /reemplaz|colocar|instalar/.test(text),
      clientSupplies: (text) => /cliente/.test(text) && /proporcion|suministr|trae/.test(text),
    },
    forbidden: [/contratista.*(?:proporcion|suministr)/, /garantia/, /permiso/, /limpieza/],
  })
  assert.equal(sameLanguageEvaluation.passed, true)
  providerResults.push({
    id: 'same-language-spanish',
    action: 'professionalize',
    sourceLanguage: 'es',
    targetLanguage: 'es',
    source: sameLanguageSource,
    output: sameLanguageResponse.data.scope,
    reviewWarnings: sameLanguageResponse.data.reviewWarnings || [],
    evaluation: sameLanguageEvaluation,
    usage: usageFrom(sameLanguageResponse.data),
    elapsedMs: sameLanguageResponse.elapsedMs,
  })
  let sameLanguageState = normalizeScopeAssistantStateForStorage(await applyProfessionalizedCandidate(sameLanguageInitial, {
    scope: sameLanguageResponse.data.scope,
    reviewWarnings: sameLanguageResponse.data.reviewWarnings,
    model: sameLanguageResponse.data.metadata.model,
    promptVersion: sameLanguageResponse.data.metadata.promptVersion,
    generatedAt: sameLanguageResponse.data.metadata.generatedAt,
  }))
  sameLanguageState = normalizeScopeAssistantStateForStorage(await approveContractorDraft(sameLanguageState, { memberId }))
  sameLanguageState = normalizeScopeAssistantStateForStorage(await acceptScopeAssistantCanonicalScope(sameLanguageState, {
    canonicalScope: sameLanguageState.approvedContractorScope,
  }))
  await patchEstimate(apiKey, primary.access_token, suiteEstimate.id, {
    scope_of_work: sameLanguageState.approvedContractorScope,
    scope_assistant_state: sameLanguageState,
  })
  const sameLanguageReloaded = await readEstimateById(apiKey, primary.access_token, suiteEstimate.id)
  assert.equal(sameLanguageReloaded.scope_of_work, sameLanguageReloaded.scope_assistant_state.approvedContractorScope)
  assert.equal((await getScopeAssistantSendReadiness(sameLanguageReloaded.scope_assistant_state, sameLanguageReloaded.scope_of_work)).ready, true)
  assert.equal(sameLanguageReloaded.scope_assistant_state.translation, null)
  assert.equal(sameLanguageReloaded.scope_assistant_state.translationStatus, 'none')

  assert.deepEqual(await getScopeAssistantSendReadiness({}, 'Manual estimate scope.'), {
    ready: true,
    manual: true,
    reason: SCOPE_ASSISTANT_SEND_REASON.MANUAL,
  })

  const crossTenantProfessionalize = await invokeAssistant(
    apiKey,
    isolation.access_token,
    'professionalize',
    primaryEstimate.id,
    true,
  )
  assert.equal(crossTenantProfessionalize.status, 404)
  assert.equal(crossTenantProfessionalize.data?.code, 'ESTIMATE_UNAVAILABLE')
  assert.equal(JSON.stringify(crossTenantProfessionalize.data).includes(FIRST_GATE_SOURCE), false)

  const crossTenantTranslate = await invokeAssistant(
    apiKey,
    primary.access_token,
    'translate',
    isolationEstimate.id,
    true,
  )
  assert.equal(crossTenantTranslate.status, 404)
  assert.equal(crossTenantTranslate.data?.code, 'ESTIMATE_UNAVAILABLE')

  const nonEditable = await invokeAssistant(
    apiKey,
    primary.access_token,
    'professionalize',
    nonEditableEstimate.id,
    true,
  )
  assert.equal(nonEditable.status, 409)
  assert.equal(nonEditable.data?.code, 'ESTIMATE_NOT_EDITABLE')

  const totalUsage = providerResults.reduce((total, result) => ({
    inputTokens: total.inputTokens + result.usage.inputTokens,
    cachedInputTokens: total.cachedInputTokens + result.usage.cachedInputTokens,
    outputTokens: total.outputTokens + result.usage.outputTokens,
    reasoningTokens: total.reasoningTokens + result.usage.reasoningTokens,
    totalTokens: total.totalTokens + result.usage.totalTokens,
  }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 })

  console.log(JSON.stringify({
    target: { name: STAGING_NAME, ref: STAGING_REF, productionRefUntouched: PRODUCTION_REF },
    model: EXPECTED_MODEL,
    providerRequestCountInThisSuite: providerResults.length,
    providerResults,
    runtimeState: {
      translationFidelity: 'PASS',
      approvalSnapshotImmutableAfterEdit: true,
      staleApprovalBlocksSend: true,
      explicitReapprovalRequired: true,
      manualClientEditPreservesApprovedSource: true,
      manualClientEditInvalidatesAcceptance: true,
      explicitClientReacceptanceRequired: true,
      hardRefreshPersistence: 'PASS',
      sameLanguageTranslationProviderCalls: 0,
      manualEstimateUnaffected: true,
    },
    boundaries: {
      crossTenantProfessionalize: { status: crossTenantProfessionalize.status, code: crossTenantProfessionalize.data?.code },
      crossTenantTranslate: { status: crossTenantTranslate.status, code: crossTenantTranslate.data?.code },
      nonEditableEstimate: { status: nonEditable.status, code: nonEditable.data?.code },
    },
    totalUsage,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})

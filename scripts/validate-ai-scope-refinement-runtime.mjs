import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyProfessionalizedCandidate,
  approveContractorDraft,
  createScopeAssistantState,
  normalizeScopeAssistantStateForStorage,
} from '../src/utils/scopeAssistantState.js'

const STAGING_REF = 'mhaxxekgupjxifmjukop'
const PRODUCTION_REF = 'qespkkmxaxzsfqrlghev'
const STAGING_NAME = 'Aymero Staging'
const STAGING_URL = `https://${STAGING_REF}.supabase.co`
const EXPECTED_MODEL = 'gpt-5.6-luna'
const FIXTURE_KEY = 'staging-runtime-estimate-es'
const ROOFING_SOURCE = 'Demolición y instalación de Roofing completo, el trabajo consiste en demoler y retirar todo el Roof en mal estado por completo de todo el tejado, revisar los PlayBook dañados para reemplazarlos, reemplazar todas las salidas ductos de ventilación de aire que vienen del ático hacia afuera, instalar un rollo de aislamiento que detiene y deshace el hielo o la nieve cuando está en el tejado por las orillas, agregar todos los metales alrededor del tejado, forrar toda la cubierta plana con du pont underlayment, colocar una línea de plastic roof ridge exhaust vent, colocar líneas de metal Flashing para luego instalar las capas de Shingle Roof en color negro, todo ese trabajo tiene una garantía de 25 años bajo una manufacturación de la compañía. También incluye remover todos los escombros y basuras restantes ocasionados por la demolición y la nueva instalación del tejado. Todo ese trabajo tiene un costo de $6000 con un Don payment de $4000 al empezar y $2000 al terminar el trabajo.'

const root = resolve(import.meta.dirname, '..')
const linkedRefPath = resolve(root, 'supabase/.temp/project-ref')
const credentialsPath = resolve(root, '.env.staging.test.local')

function runSupabase(args) {
  return execFileSync('supabase', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
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

function parseEnvFile(path) {
  assert.ok(existsSync(path), `${path} is missing.`)
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
}

function readPublishableKey() {
  verifyStagingTarget()
  const rows = parseCliJson(['projects', 'api-keys', '--project-ref', STAGING_REF])
  const key = rows.find((row) => row.type === 'publishable')?.api_key || rows.find((row) => row.name === 'anon')?.api_key
  assert.ok(key, 'Staging publishable/anon API key is unavailable.')
  return key
}

async function request(path, { apiKey, token = apiKey, method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${STAGING_URL}${path}`, {
    method,
    headers: { apikey: apiKey, Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${String(data?.code || data?.error || '').slice(0, 200)}`)
  return data
}

async function signIn(apiKey, email, password) {
  const data = await request('/auth/v1/token?grant_type=password', { apiKey, method: 'POST', body: { email, password } })
  assert.ok(data?.access_token && data?.user?.id, 'Primary staging sign-in failed.')
  return data
}

async function readFixture(apiKey, token) {
  const query = new URLSearchParams({ select: 'id,scope_of_work,scope_assistant_state', sample_data_key: `eq.${FIXTURE_KEY}`, limit: '1' })
  const rows = await request(`/rest/v1/estimates?${query}`, { apiKey, token })
  assert.equal(rows.length, 1, 'Scope refinement fixture estimate is unavailable.')
  return rows[0]
}

async function patchFixture(apiKey, token, estimateId, body) {
  const rows = await request(`/rest/v1/estimates?id=eq.${estimateId}`, { apiKey, token, method: 'PATCH', body, prefer: 'return=representation' })
  assert.equal(rows.length, 1, 'Fixture update did not return one estimate.')
  return rows[0]
}

async function invoke(apiKey, token, action, estimateId) {
  const startedAt = Date.now()
  const data = await request('/functions/v1/ai-scope-assistant', { apiKey, token, method: 'POST', body: { action, estimateId } })
  assert.equal(data?.metadata?.model, EXPECTED_MODEL, 'Refinement evaluation did not use Luna.')
  assert.equal(data?.metadata?.promptVersion, action === 'professionalize' ? 'professionalize-v2' : 'translate-v2')
  assert.ok(Number.isInteger(data?.metadata?.usage?.totalTokens), 'Provider usage metadata is missing.')
  return { data, elapsedMs: Date.now() - startedAt }
}

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function has(text, pattern) {
  return pattern.test(normalized(text))
}

function noUnsupportedCommitments(scope) {
  assert.equal(has(scope, /materiales? (?:y mano de obra )?incluid|all materials and labor included/), false, 'Unsupported materials commitment added.')
  assert.equal(has(scope, /permiso|code compliance|cumplimiento de codigo|workmanship warranty|garantia de mano de obra/), false, 'Unsupported commitment added.')
}

function usageTotal(results) {
  return results.reduce((total, result) => {
    const usage = result.data.metadata.usage
    return {
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      reasoningTokens: total.reasoningTokens + usage.reasoningTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    }
  }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 })
}

async function main() {
  verifyStagingTarget()
  const apiKey = readPublishableKey()
  const credentials = parseEnvFile(credentialsPath)
  const session = await signIn(apiKey, credentials.STAGING_PRIMARY_EMAIL, credentials.STAGING_PRIMARY_PASSWORD)
  const members = await request(`/rest/v1/contractor_members?${new URLSearchParams({ select: 'id', user_id: `eq.${session.user.id}`, status: 'eq.active', limit: '1' })}`, { apiKey, token: session.access_token })
  assert.equal(members.length, 1, 'Primary staging membership is not active.')
  const memberId = members[0].id
  const original = await readFixture(apiKey, session.access_token)
  const results = []

  async function professionalize({ id, source, sourceLanguage, clientLanguage, evaluate }) {
    const state = normalizeScopeAssistantStateForStorage(createScopeAssistantState({ rawContractorInput: source, contractorLanguage: sourceLanguage, clientLanguage }))
    await patchFixture(apiKey, session.access_token, original.id, { scope_assistant_state: state })
    const result = await invoke(apiKey, session.access_token, 'professionalize', original.id)
    console.log(JSON.stringify({ id, output: result.data.scope, reviewWarnings: result.data.reviewWarnings || [], usage: result.data.metadata.usage }))
    evaluate(result.data.scope, result.data.reviewWarnings || [])
    results.push({ id, ...result })
    return { state, result }
  }

  try {
    const roofing = await professionalize({
      id: 'roofing-terminology', source: ROOFING_SOURCE, sourceLanguage: 'es', clientLanguage: 'en',
      evaluate: (scope, warnings) => {
        assert.equal(has(scope, /plywood|madera contrachapada|roof decking/), true, 'PlayBook was not normalized in roofing context.')
        assert.equal(has(scope, /ventilacion.*atico|atico.*ventilacion/), true, 'Attic ventilation was lost.')
        assert.equal(has(scope, /hielo.*(?:agua|nieve)|ice.*(?:water|snow)/), true, 'Ice/water roof-edge protection was lost.')
        assert.equal(has(scope, /du\s*pont.*underlayment|underlayment.*du\s*pont/), true, 'DuPont underlayment was lost.')
        assert.equal(has(scope, /ridge.*vent|ventilacion.*cumbrera/), true, 'Ridge vent was not normalized.')
        assert.equal(has(scope, /flashing/), true, 'Flashing was lost.')
        assert.equal(has(scope, /shingles?.*negro|tejas?.*(?:negra|negro|color negro)/), true, 'Black roofing shingles were lost.')
        assert.equal(has(scope, /25.*garantia|garantia.*25/), true, '25-year manufacturer warranty was lost.')
        assert.equal(has(scope, /escombro|basura|desecho/), true, 'Supported debris disposal was lost.')
        assert.equal(has(scope, /\$\s*(?:6[, ]?000|4[, ]?000|2[, ]?000)|don payment|down payment/), false, 'Commercial facts remained in the professional scope.')
        assert.equal(warnings.length <= 2, true, 'Only commercial and genuine warranty ambiguity warnings are allowed.')
        assert.equal(warnings.some((warning) => has(warning, /precio|pago/)), true, 'Spanish commercial review notice is missing.')
        assert.equal(warnings.some((warning) => has(warning, /garantia/)), true, 'Genuine warranty ambiguity warning is missing.')
        noUnsupportedCommitments(scope)
      },
    })

    const candidate = normalizeScopeAssistantStateForStorage(await applyProfessionalizedCandidate(roofing.state, {
      scope: roofing.result.data.scope,
      reviewWarnings: roofing.result.data.reviewWarnings,
      model: roofing.result.data.metadata.model,
      promptVersion: roofing.result.data.metadata.promptVersion,
      generatedAt: roofing.result.data.metadata.generatedAt,
    }))
    const approved = normalizeScopeAssistantStateForStorage(await approveContractorDraft(candidate, { memberId }))
    await patchFixture(apiKey, session.access_token, original.id, { scope_assistant_state: approved })
    const translation = await invoke(apiKey, session.access_token, 'translate', original.id)
    console.log(JSON.stringify({ id: 'roofing-approved-translation', output: translation.data.scope, usage: translation.data.metadata.usage }))
    assert.equal(has(translation.data.scope, /plywood|roof decking/), true, 'Translation reconsidered normalized roof-decking terminology.')
    assert.equal(has(translation.data.scope, /ridge (?:vent|ventilation|exhaust)/), true, 'Translation lost normalized ridge vent terminology.')
    assert.equal(has(translation.data.scope, /warranty.*25|25-year/), true, 'Translation lost the conservative warranty statement.')
    noUnsupportedCommitments(translation.data.scope)
    results.push({ id: 'roofing-approved-translation', ...translation })

    await professionalize({
      id: 'spanglish-transcription', source: 'Cambiar el Sam pum dañado del sótano, instalar shu molding alrededor de la pared reparada y aplicar Coqui en las juntas abiertas.', sourceLanguage: 'es', clientLanguage: 'es',
      evaluate: (scope, warnings) => {
        assert.equal(has(scope, /sump pump|bomba de (?:sumidero|achique)/), true, 'Sam pum was not normalized.')
        assert.equal(has(scope, /shoe molding|moldura.*(?:zocalo|remate|zapata)|zocalo|cuarto de cana/), true, 'Shu molding was not normalized.')
        assert.equal(has(scope, /caulking|calafate|sellador|masilla/), true, 'Coqui was not normalized.')
        assert.equal(warnings.length, 0, 'Clear Spanglish/transcription corrections should not warn.')
        noUnsupportedCommitments(scope)
      },
    })

    await professionalize({
      id: 'genuine-ambiguity', source: 'Reparar el material azul dañado en el techo cerca de la salida de ventilación.', sourceLanguage: 'es', clientLanguage: 'es',
      evaluate: (scope, warnings) => {
        assert.equal(has(scope, /shingle|plywood|flashing|teja|decking/), false, 'Ambiguous material was turned into a specific construction fact.')
        assert.equal(has(scope, /material azul/), true, 'Ambiguous material was not preserved broadly.')
        assert.equal(warnings.length <= 1, true, 'Ambiguity produced excessive warnings.')
        noUnsupportedCommitments(scope)
      },
    })

    await professionalize({
      id: 'materials-responsibility', source: 'Replace 4 kitchen outlets. Owner supplies the outlets. Materials are not included.', sourceLanguage: 'en', clientLanguage: 'en',
      evaluate: (scope, warnings) => {
        assert.equal(has(scope, /(?:4|four).*kitchen.*outlets?/), true, 'Outlet quantity was not preserved.')
        assert.equal(has(scope, /owner.*suppl/), true, 'Owner material responsibility was lost.')
        assert.equal(has(scope, /materials?.*(?:not included|excluded)/), true, 'Materials exclusion was lost.')
        assert.equal(warnings.length, 0, 'Explicit materials responsibility should not warn.')
        noUnsupportedCommitments(scope)
      },
    })
  } finally {
    await patchFixture(apiKey, session.access_token, original.id, {
      scope_of_work: original.scope_of_work,
      scope_assistant_state: original.scope_assistant_state,
    })
  }

  console.log(JSON.stringify({
    target: { name: STAGING_NAME, ref: STAGING_REF, productionRefUntouched: PRODUCTION_REF },
    model: EXPECTED_MODEL,
    providerRequestCount: results.length,
    totalUsage: usageTotal(results),
    fixtureRestored: true,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})

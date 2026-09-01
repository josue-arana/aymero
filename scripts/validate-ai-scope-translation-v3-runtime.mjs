import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
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
const ROOFING_SCOPE = `- Demoler y retirar por completo el tejado existente en mal estado.
- Revisar el plywood o entablado de cubierta dañado y reemplazarlo cuando corresponda.
- Reemplazar todas las salidas y ductos de ventilación que van del ático hacia el exterior.
- Instalar rollo de protección contra hielo y agua en los bordes del tejado.
- Agregar todos los metales alrededor del tejado.
- Cubrir toda la cubierta plana con underlayment DuPont.
- Instalar una línea de ventilación plástica de cumbrera para extracción de aire.
- Instalar líneas de flashing metálico.
- Instalar las capas de tejas asfálticas negras.
- El trabajo se indica con una garantía de 25 años otorgada por la compañía fabricante.
- Retirar todos los escombros y residuos restantes ocasionados por la demolición y la nueva instalación del tejado.`

const root = resolve(import.meta.dirname, '..')
const credentialsPath = resolve(root, '.env.staging.test.local')
const linkedRefPath = resolve(root, 'supabase/.temp/project-ref')

function runSupabase(args) {
  return execFileSync('supabase', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function verifyStagingTarget() {
  const linkedRef = readFileSync(linkedRefPath, 'utf8').trim()
  assert.equal(linkedRef, STAGING_REF, `Refusing to continue: linked ref is ${linkedRef || 'missing'}.`)
  assert.notEqual(linkedRef, PRODUCTION_REF, 'Refusing to target Aymero Production.')
  const projects = JSON.parse(runSupabase(['projects', 'list', '-o', 'json']) || '[]')
  assert.equal(projects.find((project) => project.ref === STAGING_REF)?.name, STAGING_NAME)
  assert.equal(projects.find((project) => project.ref === STAGING_REF)?.linked, true)
  assert.equal(projects.find((project) => project.ref === PRODUCTION_REF)?.linked, false)
}

function readCredentials() {
  assert.ok(existsSync(credentialsPath), 'Synthetic staging credentials are missing.')
  return Object.fromEntries(readFileSync(credentialsPath, 'utf8').split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
}

function readApiKey() {
  const rows = JSON.parse(runSupabase(['projects', 'api-keys', '--project-ref', STAGING_REF, '-o', 'json']) || '[]')
  const key = rows.find((row) => row.type === 'publishable')?.api_key || rows.find((row) => row.name === 'anon')?.api_key
  assert.ok(key, 'Staging publishable key is unavailable.')
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

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function has(value, pattern) {
  return pattern.test(normalize(value))
}

function assertSafe(scope) {
  assert.equal(has(scope, /\b(?:permit|code compliance|gfci|afci|workmanship warranty|lifetime warranty|all labor and materials included)\b/), false, 'Translation invented an unsupported commitment.')
}

const cases = [
  {
    id: 'roofing-golden', scope: ROOFING_SCOPE,
    verify: (output) => {
      assert.equal(has(output, /roof decking|damaged plywood/), true, 'Roof decking terminology is not natural.')
      assert.equal(has(output, /ice and water shield/), true, 'Ice-and-water terminology is not natural.')
      assert.equal(has(output, /ridge vent/), true, 'Ridge-vent terminology is not natural.')
      assert.equal(has(output, /metal components/) && has(output, /flashing/), true, 'Metal/flashing terminology is not natural.')
      assert.equal(has(output, /black asphalt shingles/), true, 'Shingle terminology is not natural.')
      assert.equal(has(output, /25-year.*(?:manufacturer warranty|warranty.*manufacturer)|manufacturer.*25-year warranty/), true, 'Warranty wording is not natural and conservative.')
      assert.equal(has(output, /debris|waste/), true, 'Supported debris removal was lost.')
      assert.equal(has(output, /\bdemolish\b|plastic ridge ventilation line for air extraction|manufacturing company|metalwork around the roof|roof plywood or sheathing/), false, 'Roofing translation remained literal or overbroad.')
      assertSafe(output)
    },
  },
  {
    id: 'flooring', scope: '- Retirar la alfombra existente, las tiras de tachuelas y los accesorios.\n- Nivelar el piso según sea necesario.\n- Instalar piso laminado y shoe molding.\n- Pintar la moldura de blanco semi brillante.',
    verify: (output) => {
      assert.equal(has(output, /carpet/), true)
      assert.equal(has(output, /tack strips/), true)
      assert.equal(has(output, /level.*floor.*as needed/), true)
      assert.equal(has(output, /laminate flooring/), true)
      assert.equal(has(output, /shoe molding/), true)
      assert.equal(has(output, /white.*semi-gloss|semi-gloss.*white/), true)
      assert.equal(has(output, /subfloor|moisture|primer|two coats/), false)
      assertSafe(output)
    },
  },
  {
    id: 'electrical-responsibility', scope: '- Reemplazar exactamente cuatro tomacorrientes de cocina.\n- El propietario suministra los tomacorrientes.\n- Los materiales no están incluidos.',
    verify: (output) => {
      assert.equal(has(output, /exactly four kitchen (?:outlets|receptacles)/), true)
      assert.equal(has(output, /homeowner.*supply.*(?:outlets|receptacles)/), true)
      assert.equal(has(output, /materials.*(?:not included|excluded)/), true)
      assertSafe(output)
    },
  },
  {
    id: 'conditional-work', scope: '- Reparar el revestimiento dañado si es necesario y solo a solicitud del propietario.',
    verify: (output) => {
      assert.equal(has(output, /if needed|as needed|if necessary/), true)
      assert.equal(has(output, /(?:homeowner|owner).*request/), true)
      assert.equal(has(output, /replace all|guaranteed/), false)
      assertSafe(output)
    },
  },
  {
    id: 'dimensions-and-quantities', scope: '- Instalar 12 tiradores y reemplazar 3 bisagras.\n- Reemplazar únicamente la ventana de baño de 36 x 48.',
    verify: (output) => {
      assert.equal(has(output, /12.*(?:cabinet )?pulls/), true)
      assert.equal(has(output, /3 hinges/), true)
      assert.equal(has(output, /36\s*(?:x|by)\s*48/), true)
      assert.equal(has(output, /only.*bathroom window|bathroom window only/), true)
      assertSafe(output)
    },
  },
  {
    id: 'ambiguous-material', scope: '- Reparar el material azul dañado cerca de la salida de ventilación.',
    verify: (output) => {
      assert.equal(has(output, /blue material/), true)
      assert.equal(has(output, /shingle|plywood|flashing|roof decking/), false)
      assertSafe(output)
    },
  },
  {
    id: 'customer-disposal', scope: '- Retirar la puerta existente e instalar una puerta nueva.\n- El cliente es responsable de la disposición.',
    verify: (output) => {
      assert.equal(has(output, /remove.*existing door.*install.*new door/), true)
      assert.equal(has(output, /(?:customer|client).*responsible for disposal/), true)
      assert.equal(has(output, /contractor.*disposal|cleanup included/), false)
      assertSafe(output)
    },
  },
  {
    id: 'no-disposal-invention', scope: '- Retirar la puerta existente e instalar una puerta nueva.',
    verify: (output) => {
      assert.equal(has(output, /remove.*existing door.*install.*new door/), true)
      assert.equal(has(output, /disposal|cleanup|haul away/), false)
      assertSafe(output)
    },
  },
]

async function main() {
  verifyStagingTarget()
  const apiKey = readApiKey()
  const credentials = readCredentials()
  const session = await request('/auth/v1/token?grant_type=password', { apiKey, method: 'POST', body: { email: credentials.STAGING_PRIMARY_EMAIL, password: credentials.STAGING_PRIMARY_PASSWORD } })
  const query = new URLSearchParams({ select: 'id,scope_of_work,scope_assistant_state', sample_data_key: `eq.${FIXTURE_KEY}`, limit: '1' })
  const rows = await request(`/rest/v1/estimates?${query}`, { apiKey, token: session.access_token })
  assert.equal(rows.length, 1, 'Translation fixture estimate is unavailable.')
  const original = rows[0]
  const results = []

  try {
    for (const fixture of cases) {
      const initial = createScopeAssistantState({ contractorDraft: fixture.scope, contractorLanguage: 'es', clientLanguage: 'en' })
      const approved = normalizeScopeAssistantStateForStorage(await approveContractorDraft(initial, { memberId: 'translation-v3-staging-evaluator' }))
      await request(`/rest/v1/estimates?id=eq.${original.id}`, { apiKey, token: session.access_token, method: 'PATCH', body: { scope_assistant_state: approved }, prefer: 'return=representation' })
      const startedAt = Date.now()
      const result = await request('/functions/v1/ai-scope-assistant', { apiKey, token: session.access_token, method: 'POST', body: { action: 'translate', estimateId: original.id } })
      assert.equal(result?.metadata?.model, EXPECTED_MODEL, `${fixture.id}: expected Luna.`)
      assert.equal(result?.metadata?.promptVersion, 'translate-v3', `${fixture.id}: wrong prompt version.`)
      console.log(JSON.stringify({ id: fixture.id, output: result.scope, usage: result.metadata.usage }))
      fixture.verify(result.scope)
      results.push({ id: fixture.id, output: result.scope, usage: result.metadata.usage, elapsedMs: Date.now() - startedAt })
    }
  } finally {
    await request(`/rest/v1/estimates?id=eq.${original.id}`, { apiKey, token: session.access_token, method: 'PATCH', body: { scope_of_work: original.scope_of_work, scope_assistant_state: original.scope_assistant_state }, prefer: 'return=representation' })
  }

  const usage = results.reduce((total, result) => ({
    inputTokens: total.inputTokens + Number(result.usage?.inputTokens || 0),
    outputTokens: total.outputTokens + Number(result.usage?.outputTokens || 0),
    reasoningTokens: total.reasoningTokens + Number(result.usage?.reasoningTokens || 0),
    totalTokens: total.totalTokens + Number(result.usage?.totalTokens || 0),
  }), { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 })
  console.log(JSON.stringify({ target: { name: STAGING_NAME, ref: STAGING_REF, productionRefUntouched: PRODUCTION_REF }, model: EXPECTED_MODEL, providerRequestCount: results.length, usage, fixtureRestored: true }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})

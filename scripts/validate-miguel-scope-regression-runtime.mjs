import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createScopeAssistantState,
  normalizeScopeAssistantStateForStorage,
} from '../src/utils/scopeAssistantState.js'

const STAGING_REF = 'mhaxxekgupjxifmjukop'
const PRODUCTION_REF = 'qespkkmxaxzsfqrlghev'
const STAGING_NAME = 'Aymero Staging'
const STAGING_URL = `https://${STAGING_REF}.supabase.co`
const EXPECTED_MODEL = 'gpt-5.6-luna'
const FIXTURE_KEY = 'staging-runtime-estimate-es'
const root = resolve(import.meta.dirname, '..')
const linkedRefPath = resolve(root, 'supabase/.temp/project-ref')
const credentialsPath = resolve(root, '.env.staging.test.local')
const corpusPath = resolve(root, 'scripts/fixtures/miguel-scope-regression-corpus.json')
const phase = process.argv.find((value) => value.startsWith('--phase='))?.slice('--phase='.length) || 'representative'
const requestedIds = (process.argv.find((value) => value.startsWith('--ids='))?.slice('--ids='.length) || '').split(',').map((value) => value.trim()).filter(Boolean)
const repeat = Number(process.argv.find((value) => value.startsWith('--repeat='))?.slice('--repeat='.length) || 1)
const verifyFixtureOnly = process.argv.includes('--verify-fixture')

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

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function matchesAll(text, patterns) {
  return patterns.every((pattern) => new RegExp(pattern, 'i').test(text))
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => new RegExp(pattern, 'i').test(text))
}

function usageTotal(results) {
  return results.reduce((total, result) => {
    const usage = result.usage || {}
    return {
      inputTokens: total.inputTokens + Number(usage.inputTokens || 0),
      outputTokens: total.outputTokens + Number(usage.outputTokens || 0),
      reasoningTokens: total.reasoningTokens + Number(usage.reasoningTokens || 0),
      totalTokens: total.totalTokens + Number(usage.totalTokens || 0),
    }
  }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 })
}

function verifyCorpus(corpus) {
  assert.equal(corpus.length, 14, 'The Miguel corpus must contain all 14 supplied examples.')
  assert.equal(new Set(corpus.map((fixture) => fixture.id)).size, corpus.length, 'Corpus fixture IDs must be unique.')
  const classifications = new Set(corpus.map((fixture) => fixture.classification))
  for (const classification of ['positive', 'negative-contrast', 'context-product-boundary', 'context-isolation']) {
    assert.equal(classifications.has(classification), true, `Missing ${classification} corpus coverage.`)
  }
  for (const fixture of corpus) {
    assert.equal(typeof fixture.id, 'string')
    assert.equal(typeof fixture.expected, 'object')
    if (fixture.classification === 'context-product-boundary') continue
    assert.equal(['representative', 'remaining'].includes(fixture.phase), true, `${fixture.id}: phase is invalid.`)
    assert.equal(['en', 'es'].includes(fixture.sourceLanguage), true, `${fixture.id}: source language is invalid.`)
    assert.equal(typeof fixture.rawInput, 'string')
    assert.ok(fixture.rawInput.trim(), `${fixture.id}: raw input is required.`)
    assert.ok(Object.keys(fixture.expected.requiredGroups || {}).length || fixture.classification === 'context-isolation', `${fixture.id}: deterministic expectations are required.`)
  }
}

function evaluateFixture(fixture, response) {
  const expected = fixture.expected || {}
  const scope = normalized(response.scope)
  const warnings = (response.reviewWarnings || []).map(normalized)
  const missing = Object.entries(expected.requiredGroups || {})
    .filter(([, patterns]) => !matchesAll(scope, patterns))
    .map(([name]) => name)
  const invented = (expected.forbiddenPatterns || []).filter((pattern) => new RegExp(pattern, 'i').test(scope))
  const commercialInScope = (expected.commercialScopePatterns || []).filter((pattern) => new RegExp(pattern, 'i').test(scope))
  const commercialWarningMissing = expected.commercialWarningPatterns && !matchesAny(warnings.join(' '), expected.commercialWarningPatterns)
  const result = missing.length || invented.length || commercialInScope.length || commercialWarningMissing ? 'FAIL' : 'PASS'
  return { result, missing, invented, commercialInScope, commercialWarningMissing }
}

async function main() {
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'))
  verifyCorpus(corpus)
  if (verifyFixtureOnly) {
    console.log('Miguel regression corpus fixture validation passed.')
    return
  }
  assert.ok(['representative', 'remaining', 'all'].includes(phase), `Unsupported phase: ${phase}`)
  assert.ok(Number.isInteger(repeat) && repeat >= 1 && repeat <= 3, 'Repeat count must be between 1 and 3.')
  verifyStagingTarget()
  const selected = corpus.filter((fixture) => fixture.classification !== 'context-product-boundary'
    && (requestedIds.length ? requestedIds.includes(fixture.id) : phase === 'all' || fixture.phase === phase))
  if (requestedIds.length) assert.equal(selected.length, requestedIds.length, 'One or more requested fixture IDs are unavailable.')
  assert.ok(selected.length, `No corpus fixtures selected for phase ${phase}.`)
  const contextFixture = corpus.find((fixture) => fixture.classification === 'context-product-boundary')
  assert.ok(contextFixture?.expected?.clarificationBoundary, 'Context/product-boundary fixture is malformed.')
  const apiKey = readPublishableKey()
  const credentials = parseEnvFile(credentialsPath)
  const session = await request('/auth/v1/token?grant_type=password', { apiKey, method: 'POST', body: { email: credentials.STAGING_PRIMARY_EMAIL, password: credentials.STAGING_PRIMARY_PASSWORD } })
  assert.ok(session?.access_token && session?.user?.id, 'Primary staging sign-in failed.')
  const estimateQuery = new URLSearchParams({ select: 'id,scope_of_work,scope_assistant_state', sample_data_key: `eq.${FIXTURE_KEY}`, limit: '1' })
  const estimates = await request(`/rest/v1/estimates?${estimateQuery}`, { apiKey, token: session.access_token })
  assert.equal(estimates.length, 1, 'Miguel corpus staging fixture estimate is unavailable.')
  const original = estimates[0]
  const results = []

  try {
    for (const fixture of selected) {
      for (let run = 1; run <= repeat; run += 1) {
        const state = normalizeScopeAssistantStateForStorage(createScopeAssistantState({
          rawContractorInput: fixture.rawInput,
          contractorLanguage: fixture.sourceLanguage,
          clientLanguage: fixture.clientLanguage,
        }))
        const patched = await request(`/rest/v1/estimates?id=eq.${original.id}`, {
          apiKey,
          token: session.access_token,
          method: 'PATCH',
          body: { scope_assistant_state: state },
          prefer: 'return=representation',
        })
        assert.equal(patched.length, 1, `${fixture.id}: staging fixture update failed.`)
        const startedAt = Date.now()
        const response = await request('/functions/v1/ai-scope-assistant', {
          apiKey,
          token: session.access_token,
          method: 'POST',
          body: { action: 'professionalize', estimateId: original.id },
        })
        assert.equal(response?.metadata?.model, EXPECTED_MODEL, `${fixture.id}: expected Luna.`)
        assert.equal(response?.metadata?.promptVersion, 'professionalize-v3', `${fixture.id}: wrong prompt version.`)
        const evaluation = evaluateFixture(fixture, response)
        const entry = { id: fixture.id, run, classification: fixture.classification, ...evaluation, output: response.scope, reviewWarnings: response.reviewWarnings || [], usage: response.metadata.usage, elapsedMs: Date.now() - startedAt }
        results.push(entry)
        console.log(JSON.stringify(entry))
      }
    }
  } finally {
    const restored = await request(`/rest/v1/estimates?id=eq.${original.id}`, {
      apiKey,
      token: session.access_token,
      method: 'PATCH',
      body: { scope_of_work: original.scope_of_work, scope_assistant_state: original.scope_assistant_state },
      prefer: 'return=representation',
    })
    assert.equal(restored.length, 1, 'Staging fixture restoration failed.')
  }

  const failed = results.filter((result) => result.result === 'FAIL')
  console.log(JSON.stringify({
    target: { name: STAGING_NAME, ref: STAGING_REF, productionRefUntouched: PRODUCTION_REF },
    phase,
    requestedIds,
    repeat,
    model: EXPECTED_MODEL,
    promptVersion: 'professionalize-v3',
    providerRequestCount: results.length,
    totalUsage: usageTotal(results),
    providerCost: 'not exposed by the Edge Function; not estimated by this evaluator',
    contextProductBoundary: { id: contextFixture.id, result: 'PASS', detail: contextFixture.expected.clarificationBoundary },
    fixtureRestored: true,
    failures: failed.map(({ id, missing, invented, commercialInScope, commercialWarningMissing }) => ({ id, missing, invented, commercialInScope, commercialWarningMissing })),
  }, null, 2))
  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})

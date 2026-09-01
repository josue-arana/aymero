import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const packageJson = JSON.parse(read('../package.json'))
const preparation = read('./prepare-aymero-staging-runtime.mjs')
const documentation = read('../docs/STAGING_RUNTIME_PREPARATION.md')
const backendConfig = read('../src/config/backendConfig.js')
const edgeFunction = read('../supabase/functions/ai-scope-assistant/index.ts')
const functionConfig = read('../supabase/config.toml')
const coreCrmRlsMigration = read('../supabase/migrations/20260901143000_enable_core_crm_rls.sql')

assert.equal(
  packageJson.scripts['prepare:staging-runtime'],
  'node scripts/prepare-aymero-staging-runtime.mjs',
)
assert.equal(
  packageJson.scripts['verify:staging-runtime'],
  'node scripts/verify-aymero-staging-runtime-preparation.mjs',
)

assert.match(preparation, /const STAGING_REF = 'mhaxxekgupjxifmjukop'/)
assert.match(preparation, /const PRODUCTION_REF = 'qespkkmxaxzsfqrlghev'/)
assert.match(preparation, /assert\.notEqual\(linkedRef, PRODUCTION_REF/)
assert.match(preparation, /assert\.equal\(production\?\.linked, false/)
assert.match(preparation, /verifyTarget\(\)[\s\S]*ensureAuthUser/)
assert.match(preparation, /complete_beta_contractor_onboarding/)
assert.match(preparation, /email_confirm: true/)
assert.match(preparation, /preferred_language: 'es'/)
assert.match(preparation, /scope_assistant_state: createScopeState\('en'/)
assert.match(preparation, /scope_assistant_state: createScopeState\('es'/)
assert.match(preparation, /crossTenantReadsBlocked: true/)
assert.match(preparation, /crossTenantWriteBlocked: true/)
assert.match(preparation, /billingSubscriptions\.length, 0/)
assert.match(preparation, /credentialsPath[\s\S]*\.env\.staging\.test\.local/)
assert.match(preparation, /chmodSync\(credentialsPath, 0o600\)/)
assert.doesNotMatch(preparation, /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/)
assert.doesNotMatch(preparation, /STRIPE_(?:SECRET|WEBHOOK|PRICE)/)

assert.match(backendConfig, /export const USE_SUPABASE = false/)
assert.match(backendConfig, /VITE_AI_SCOPE_ASSISTANT_ENABLED/)
assert.match(functionConfig, /\[functions\.ai-scope-assistant\][\s\S]*verify_jwt = true/)
assert.match(edgeFunction, /allowedBodyKeys = new Set\(\['action', 'estimateId'\]\)/)
assert.match(edgeFunction, /\.eq\('contractor_id', contractorId\)/)
assert.doesNotMatch(edgeFunction, /allowedBodyKeys[^\n]*(?:contractorId|source|rawSource)/)
assert.match(coreCrmRlsMigration, /alter table public\.clients enable row level security/)
assert.match(coreCrmRlsMigration, /alter table public\.leads enable row level security/)
assert.match(coreCrmRlsMigration, /beta_active_members_can_insert_estimates/)
assert.match(coreCrmRlsMigration, /beta_active_members_can_insert_contracts/)

assert.match(documentation, /mhaxxekgupjxifmjukop/)
assert.match(documentation, /qespkkmxaxzsfqrlghev/)
assert.match(documentation, /OPENAI_API_KEY/)
assert.match(documentation, /AI_SCOPE_MODEL=gpt-5\.6-terra/)
assert.match(documentation, /AI_SCOPE_ASSISTANT_ENABLED=true/)
assert.match(documentation, /VITE_AI_SCOPE_ASSISTANT_ENABLED=true/)
assert.match(documentation, /supabase functions deploy ai-scope-assistant/)
assert.match(documentation, /\.env\.production\.local/)
assert.doesNotMatch(documentation, /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/)

console.log('Aymero staging runtime preparation verification passed.')

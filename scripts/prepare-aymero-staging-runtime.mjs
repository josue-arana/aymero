import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'

const STAGING_REF = 'mhaxxekgupjxifmjukop'
const PRODUCTION_REF = 'qespkkmxaxzsfqrlghev'
const STAGING_NAME = 'Aymero Staging'
const STAGING_URL = `https://${STAGING_REF}.supabase.co`
const LOCAL_ORIGIN = 'http://localhost:5173'

const APPLY = process.argv.includes('--apply')
const ENABLE_AI_CLIENT = process.argv.includes('--enable-ai-client')
const root = resolve(import.meta.dirname, '..')
const linkedRefPath = resolve(root, 'supabase/.temp/project-ref')
const credentialsPath = resolve(root, '.env.staging.test.local')
const localEnvPath = resolve(root, '.env.local')
const productionLocalBackupPath = resolve(root, '.env.production.local')

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

function verifyTarget() {
  const linkedRef = readFileSync(linkedRefPath, 'utf8').trim()
  assert.equal(linkedRef, STAGING_REF, `Refusing to continue: linked ref is ${linkedRef || 'missing'}.`)
  assert.notEqual(linkedRef, PRODUCTION_REF, 'Refusing to target Aymero Production.')

  const projects = parseCliJson(['projects', 'list'])
  const staging = projects.find((project) => project.ref === STAGING_REF)
  const production = projects.find((project) => project.ref === PRODUCTION_REF)
  assert.equal(staging?.name, STAGING_NAME, 'Staging ref/name verification failed.')
  assert.equal(staging?.linked, true, 'Aymero Staging is not the linked project.')
  assert.equal(production?.linked, false, 'Aymero Production must not be linked for this workflow.')
}

function readApiKeys() {
  verifyTarget()
  const rows = parseCliJson(['projects', 'api-keys', '--project-ref', STAGING_REF])
  const publishable = rows.find((row) => row.type === 'publishable')?.api_key
    || rows.find((row) => row.name === 'anon')?.api_key
  const serviceRole = rows.find((row) => row.name === 'service_role')?.api_key
    || rows.find((row) => row.type === 'secret' && row.secret_jwt_template?.role === 'service_role')?.api_key
  assert.ok(publishable, 'Staging publishable/anon API key is unavailable.')
  assert.ok(serviceRole, 'Staging service-role API key is unavailable.')
  return { publishable, serviceRole }
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
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

function createPassword() {
  return `Aymero-Staging-${randomBytes(24).toString('base64url')}!9a`
}

function ensureSyntheticCredentials() {
  const current = parseEnvFile(credentialsPath)
  const credentials = {
    STAGING_PRIMARY_EMAIL: current.STAGING_PRIMARY_EMAIL || 'staging.owner@aymero.co',
    STAGING_PRIMARY_PASSWORD: current.STAGING_PRIMARY_PASSWORD || createPassword(),
    STAGING_ISOLATION_EMAIL: current.STAGING_ISOLATION_EMAIL || 'staging.isolation@aymero.co',
    STAGING_ISOLATION_PASSWORD: current.STAGING_ISOLATION_PASSWORD || createPassword(),
  }

  writeFileSync(
    credentialsPath,
    [
      '# Synthetic Aymero Staging accounts. Ignored by Git; never use in production.',
      ...Object.entries(credentials).map(([key, value]) => `${key}=${value}`),
      '',
    ].join('\n'),
    { mode: 0o600 },
  )
  chmodSync(credentialsPath, 0o600)
  return credentials
}

function writeLocalStagingEnvironment(publishable) {
  if (existsSync(localEnvPath) && !existsSync(productionLocalBackupPath)) {
    copyFileSync(localEnvPath, productionLocalBackupPath)
    chmodSync(productionLocalBackupPath, 0o600)
  }

  writeFileSync(
    localEnvPath,
    [
      '# Local-only Aymero Staging configuration. Ignored by Git.',
      `VITE_SUPABASE_URL=${STAGING_URL}`,
      `VITE_SUPABASE_ANON_KEY=${publishable}`,
      `VITE_SITE_URL=${LOCAL_ORIGIN}`,
      `VITE_APP_URL=${LOCAL_ORIGIN}`,
      `VITE_PORTAL_URL=${LOCAL_ORIGIN}`,
      `VITE_AUTH_URL=${LOCAL_ORIGIN}`,
      `VITE_AUTH_REDIRECT_URL=${LOCAL_ORIGIN}`,
      'VITE_ENABLE_DEVELOPER_ROUTES=true',
      `VITE_AI_SCOPE_ASSISTANT_ENABLED=${ENABLE_AI_CLIENT ? 'true' : 'false'}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  )
  chmodSync(localEnvPath, 0o600)
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
    const message = typeof data === 'object'
      ? data?.message || data?.msg || data?.error_description || data?.error || `HTTP ${response.status}`
      : `HTTP ${response.status}`
    throw new Error(`${method} ${path} failed (${response.status}): ${String(message).slice(0, 300)}`)
  }
  return { data, status: response.status, headers: response.headers }
}

async function auditAuth(publishable) {
  const { data } = await apiRequest('/auth/v1/settings', { apiKey: publishable })
  return {
    emailProviderEnabled: Boolean(data?.external?.email),
    signupDisabled: Boolean(data?.disable_signup),
    emailAutoconfirm: Boolean(data?.mailer_autoconfirm),
    phoneAutoconfirm: Boolean(data?.sms_autoconfirm),
  }
}

async function listAuthUsers(serviceRole) {
  const { data } = await apiRequest('/auth/v1/admin/users?page=1&per_page=1000', {
    apiKey: serviceRole,
    token: serviceRole,
  })
  return Array.isArray(data?.users) ? data.users : []
}

async function ensureAuthUser({ serviceRole, email, password, fullName, companyName }) {
  verifyTarget()
  const users = await listAuthUsers(serviceRole)
  const existing = users.find((user) => String(user.email || '').toLowerCase() === email.toLowerCase())
  const payload = {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      company_name: companyName,
      preferred_language: 'es',
      synthetic_staging_fixture: true,
    },
  }

  if (existing) {
    const { data } = await apiRequest(`/auth/v1/admin/users/${existing.id}`, {
      apiKey: serviceRole,
      token: serviceRole,
      method: 'PUT',
      body: payload,
    })
    return { user: data, created: false }
  }

  const { data } = await apiRequest('/auth/v1/admin/users', {
    apiKey: serviceRole,
    token: serviceRole,
    method: 'POST',
    body: payload,
  })
  return { user: data, created: true }
}

async function signIn(publishable, email, password) {
  const { data } = await apiRequest('/auth/v1/token?grant_type=password', {
    apiKey: publishable,
    method: 'POST',
    body: { email, password },
  })
  assert.ok(data?.access_token, `Staging sign-in did not return a session for ${email}.`)
  assert.ok(data?.user?.id, `Staging sign-in did not return a user for ${email}.`)
  return data
}

async function completeOnboarding({ publishable, accessToken, companyName, ownerName, email }) {
  verifyTarget()
  const { data } = await apiRequest('/rest/v1/rpc/complete_beta_contractor_onboarding', {
    apiKey: publishable,
    token: accessToken,
    method: 'POST',
    body: {
      company_name_input: companyName,
      owner_name_input: ownerName,
      phone_input: '(555) 010-3450',
      business_email_input: email,
      business_address_input: '100 Synthetic Staging Way, Test City, MD 20000',
    },
  })
  const row = Array.isArray(data) ? data[0] : data
  assert.ok(row?.contractor_id, `Onboarding did not return a contractor for ${companyName}.`)
  assert.ok(row?.membership_id, `Onboarding did not return a membership for ${companyName}.`)
  return row
}

function buildRestQuery(table, query = {}) {
  const params = new URLSearchParams(query)
  return `/rest/v1/${table}${params.size ? `?${params}` : ''}`
}

async function restRows({ publishable, accessToken, table, query }) {
  const { data } = await apiRequest(buildRestQuery(table, query), {
    apiKey: publishable,
    token: accessToken,
  })
  return Array.isArray(data) ? data : []
}

async function insertRow({ publishable, accessToken, table, body }) {
  verifyTarget()
  const { data } = await apiRequest(`/rest/v1/${table}`, {
    apiKey: publishable,
    token: accessToken,
    method: 'POST',
    body,
    prefer: 'return=representation',
  })
  const row = Array.isArray(data) ? data[0] : data
  assert.ok(row?.id, `Insert into ${table} returned no row.`)
  return row
}

async function patchRows({ publishable, accessToken, table, query, body }) {
  verifyTarget()
  const { data } = await apiRequest(buildRestQuery(table, query), {
    apiKey: publishable,
    token: accessToken,
    method: 'PATCH',
    body,
    prefer: 'return=representation',
  })
  return Array.isArray(data) ? data : []
}

async function ensureFixtureRow({ publishable, accessToken, table, contractorId, sampleDataKey, body }) {
  const existing = await restRows({
    publishable,
    accessToken,
    table,
    query: {
      select: '*',
      contractor_id: `eq.${contractorId}`,
      sample_data_key: `eq.${sampleDataKey}`,
      limit: '1',
    },
  })
  if (existing[0]) return existing[0]
  return insertRow({
    publishable,
    accessToken,
    table,
    body: { ...body, contractor_id: contractorId, sample_data_key: sampleDataKey },
  })
}

function createScopeState(clientLanguage, rawContractorInput) {
  return {
    version: 1,
    rawContractorInput,
    contractorDraft: '',
    contractorLanguage: 'es',
    professionalizationStatus: 'none',
    professionalization: null,
    reviewWarnings: [],
    approvedContractorScope: '',
    approvalStatus: 'draft',
    approvedAt: null,
    approvedByMemberId: null,
    approvalSourceFingerprint: null,
    clientScope: '',
    clientScopeManuallyEdited: false,
    clientLanguage,
    translationStatus: 'none',
    translation: null,
    canonicalAcceptance: null,
  }
}

async function setSyntheticLanguageFixture({ serviceRole, membershipId, contractorId }) {
  verifyTarget()
  await apiRequest(`/rest/v1/contractor_members?id=eq.${membershipId}`, {
    apiKey: serviceRole,
    token: serviceRole,
    method: 'PATCH',
    body: { preferred_language: 'es' },
    prefer: 'return=minimal',
  })
  await apiRequest(`/rest/v1/company_settings?contractor_id=eq.${contractorId}`, {
    apiKey: serviceRole,
    token: serviceRole,
    method: 'PATCH',
    body: {
      contractor_app_language: 'es',
      customer_portal_language: 'es',
      onboarding_completed: true,
      onboarding_step: 5,
    },
    prefer: 'return=minimal',
  })
}

async function seedPrimaryData({ publishable, accessToken, contractorId }) {
  const clientEnglish = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'clients',
    contractorId,
    sampleDataKey: 'staging-runtime-client-en',
    body: {
      first_name: 'Elena',
      last_name: 'English Fixture',
      display_name: 'Elena English Fixture',
      email: 'client.english@example.invalid',
      phone: '(555) 010-3451',
      address: '101 Synthetic Staging Way, Test City, MD 20000',
      preferred_language: 'en',
      notes: 'Synthetic staging fixture for Spanish-to-English scope validation.',
      status: 'active',
    },
  })
  const clientSpanish = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'clients',
    contractorId,
    sampleDataKey: 'staging-runtime-client-es',
    body: {
      first_name: 'Sofía',
      last_name: 'Spanish Fixture',
      display_name: 'Sofía Spanish Fixture',
      email: 'client.spanish@example.invalid',
      phone: '(555) 010-3452',
      address: '102 Synthetic Staging Way, Test City, MD 20000',
      preferred_language: 'es',
      notes: 'Synthetic staging fixture for same-language scope validation.',
      status: 'active',
    },
  })

  const leadEnglish = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'leads',
    contractorId,
    sampleDataKey: 'staging-runtime-lead-en',
    body: {
      client_id: clientEnglish.id,
      name: clientEnglish.display_name,
      email: clientEnglish.email,
      address: clientEnglish.address,
      service_type: 'Synthetic kitchen paint refresh',
      client_language: 'en',
      source: 'staging-runtime',
      estimated_value: 1850,
      status: 'qualified',
      priority: 'normal',
      notes: 'Synthetic staging data only.',
    },
  })
  const leadSpanish = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'leads',
    contractorId,
    sampleDataKey: 'staging-runtime-lead-es',
    body: {
      client_id: clientSpanish.id,
      name: clientSpanish.display_name,
      email: clientSpanish.email,
      address: clientSpanish.address,
      service_type: 'Synthetic bathroom tile repair',
      client_language: 'es',
      source: 'staging-runtime',
      estimated_value: 950,
      status: 'qualified',
      priority: 'normal',
      notes: 'Synthetic staging data only.',
    },
  })

  const estimateEnglish = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'estimates',
    contractorId,
    sampleDataKey: 'staging-runtime-estimate-en',
    body: {
      client_id: clientEnglish.id,
      lead_id: leadEnglish.id,
      estimate_number: 'STG-EN-001',
      title: 'Synthetic kitchen paint refresh',
      scope_of_work: 'Preparar y pintar las paredes de la cocina. El cliente suministra la pintura.',
      scope_assistant_state: createScopeState('en', 'preparar paredes cocina pintar 2 capas cliente pone pintura no techo'),
      estimate_language: 'en',
      line_items: [{ id: 'stg-en-labor', description: 'Synthetic labor', quantity: 1, rate: 1850, amount: 1850 }],
      subtotal: 1850,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: 1850,
      materials_included: false,
      payment_terms: 'Synthetic staging terms only.',
      status: 'draft',
    },
  })
  const estimateSpanish = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'estimates',
    contractorId,
    sampleDataKey: 'staging-runtime-estimate-es',
    body: {
      client_id: clientSpanish.id,
      lead_id: leadSpanish.id,
      estimate_number: 'STG-ES-001',
      title: 'Reparación sintética de azulejo',
      scope_of_work: 'Retirar cuatro azulejos dañados y colocar reemplazos suministrados por el cliente.',
      scope_assistant_state: createScopeState('es', 'quitar 4 azulejos dañados poner reemplazos cliente trae azulejos'),
      estimate_language: 'es',
      line_items: [{ id: 'stg-es-labor', description: 'Mano de obra sintética', quantity: 1, rate: 950, amount: 950 }],
      subtotal: 950,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: 950,
      materials_included: false,
      payment_terms: 'Términos sintéticos de staging.',
      status: 'draft',
    },
  })

  const conversionEstimate = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'estimates',
    contractorId,
    sampleDataKey: 'staging-runtime-estimate-conversion',
    body: {
      client_id: clientSpanish.id,
      lead_id: leadSpanish.id,
      estimate_number: 'STG-CONVERT-001',
      title: 'Synthetic manual conversion fixture',
      scope_of_work: 'Reparación manual sintética aprobada para validar la conversión a contrato.',
      estimate_language: 'es',
      line_items: [{ id: 'stg-convert-labor', description: 'Trabajo sintético', quantity: 1, rate: 500, amount: 500 }],
      subtotal: 500,
      total_amount: 500,
      status: 'approved',
      approved_at: '2026-09-01T12:00:00.000Z',
    },
  })
  const contract = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'contracts',
    contractorId,
    sampleDataKey: 'staging-runtime-contract-conversion',
    body: {
      client_id: clientSpanish.id,
      estimate_id: conversionEstimate.id,
      contract_number: 'STG-CONTRACT-001',
      title: conversionEstimate.title,
      scope_of_work: conversionEstimate.scope_of_work,
      terms: 'Synthetic staging contract terms.',
      total_amount: 500,
      payment_terms: 'Synthetic staging terms only.',
      status: 'draft',
    },
  })
  await patchRows({
    publishable,
    accessToken,
    table: 'estimates',
    query: { id: `eq.${conversionEstimate.id}`, contractor_id: `eq.${contractorId}` },
    body: { status: 'converted', converted_at: '2026-09-01T12:05:00.000Z' },
  })

  const savedRows = await patchRows({
    publishable,
    accessToken,
    table: 'estimates',
    query: { id: `eq.${estimateEnglish.id}`, contractor_id: `eq.${contractorId}` },
    body: { status: 'saved' },
  })
  assert.equal(savedRows.length, 1, 'Authenticated Estimate Builder save simulation failed.')
  await patchRows({
    publishable,
    accessToken,
    table: 'estimates',
    query: { id: `eq.${estimateEnglish.id}`, contractor_id: `eq.${contractorId}` },
    body: { status: 'draft' },
  })

  return { clientEnglish, clientSpanish, estimateEnglish, estimateSpanish, conversionEstimate, contract }
}

async function seedIsolationData({ publishable, accessToken, contractorId }) {
  const client = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'clients',
    contractorId,
    sampleDataKey: 'staging-isolation-client',
    body: {
      display_name: 'Isolation Client Fixture',
      email: 'isolation.client@example.invalid',
      preferred_language: 'en',
      status: 'active',
    },
  })
  const estimate = await ensureFixtureRow({
    publishable,
    accessToken,
    table: 'estimates',
    contractorId,
    sampleDataKey: 'staging-isolation-estimate',
    body: {
      client_id: client.id,
      estimate_number: 'STG-ISO-001',
      title: 'Isolation boundary fixture',
      scope_of_work: 'Synthetic isolation-only scope.',
      scope_assistant_state: createScopeState('en', 'synthetic isolation scope'),
      estimate_language: 'en',
      line_items: [],
      subtotal: 0,
      total_amount: 0,
      status: 'draft',
    },
  })
  return { client, estimate }
}

async function verifyRls({ publishable, primary, isolation, primaryTenant, isolationTenant, primaryData, isolationData }) {
  const ownContractor = await restRows({
    publishable,
    accessToken: primary.access_token,
    table: 'contractors',
    query: { select: 'id,company_name', id: `eq.${primaryTenant.contractor_id}` },
  })
  const ownMembership = await restRows({
    publishable,
    accessToken: primary.access_token,
    table: 'contractor_members',
    query: { select: 'id,contractor_id,role,status,preferred_language', id: `eq.${primaryTenant.membership_id}` },
  })
  const ownClients = await restRows({
    publishable,
    accessToken: primary.access_token,
    table: 'clients',
    query: { select: 'id,contractor_id,preferred_language', contractor_id: `eq.${primaryTenant.contractor_id}` },
  })
  const ownEstimate = await restRows({
    publishable,
    accessToken: primary.access_token,
    table: 'estimates',
    query: { select: 'id,contractor_id,status,scope_assistant_state', id: `eq.${primaryData.estimateEnglish.id}` },
  })
  assert.equal(ownContractor.length, 1, 'Tenant A cannot read its contractor.')
  assert.equal(ownMembership.length, 1, 'Tenant A cannot read its membership.')
  assert.ok(ownClients.length >= 2, 'Tenant A cannot read its clients.')
  assert.equal(ownEstimate.length, 1, 'Tenant A cannot read its estimate/assistant state.')
  assert.equal(ownMembership[0].role, 'owner')
  assert.equal(ownMembership[0].status, 'active')
  assert.equal(ownMembership[0].preferred_language, 'es')

  const forbiddenReads = await Promise.all([
    restRows({ publishable, accessToken: primary.access_token, table: 'contractors', query: { select: 'id', id: `eq.${isolationTenant.contractor_id}` } }),
    restRows({ publishable, accessToken: primary.access_token, table: 'contractor_members', query: { select: 'id', id: `eq.${isolationTenant.membership_id}` } }),
    restRows({ publishable, accessToken: primary.access_token, table: 'clients', query: { select: 'id', id: `eq.${isolationData.client.id}` } }),
    restRows({ publishable, accessToken: primary.access_token, table: 'estimates', query: { select: 'id', id: `eq.${isolationData.estimate.id}` } }),
  ])
  forbiddenReads.forEach((rows) => assert.equal(rows.length, 0, 'Tenant A read Tenant B data through RLS.'))

  const forbiddenWrite = await patchRows({
    publishable,
    accessToken: primary.access_token,
    table: 'estimates',
    query: { id: `eq.${isolationData.estimate.id}` },
    body: { title: 'RLS SHOULD BLOCK THIS' },
  })
  assert.equal(forbiddenWrite.length, 0, 'Tenant A updated Tenant B estimate through RLS.')
  const isolationOwnEstimate = await restRows({
    publishable,
    accessToken: isolation.access_token,
    table: 'estimates',
    query: { select: 'id,title', id: `eq.${isolationData.estimate.id}` },
  })
  assert.equal(isolationOwnEstimate.length, 1, 'Tenant B cannot read its own estimate.')
  assert.equal(isolationOwnEstimate[0].title, 'Isolation boundary fixture', 'Tenant B estimate changed during blocked write test.')

  const billingCustomers = await restRows({
    publishable,
    accessToken: primary.access_token,
    table: 'billing_customers',
    query: { select: 'id' },
  })
  const billingSubscriptions = await restRows({
    publishable,
    accessToken: primary.access_token,
    table: 'billing_subscriptions',
    query: { select: 'id' },
  })
  assert.equal(billingCustomers.length, 0, 'Staging billing customer state must stay empty.')
  assert.equal(billingSubscriptions.length, 0, 'Staging billing subscription state must stay empty.')

  return {
    tenantAOwnContractor: true,
    tenantAOwnMembership: true,
    tenantAOwnClients: ownClients.length,
    tenantAOwnEstimateAssistantState: true,
    crossTenantReadsBlocked: true,
    crossTenantWriteBlocked: true,
    tenantBOwnEstimate: true,
    billingEmpty: true,
  }
}

verifyTarget()
const { publishable, serviceRole } = readApiKeys()
const auth = await auditAuth(publishable)

if (!APPLY) {
  console.log(JSON.stringify({
    project: { ref: STAGING_REF, name: STAGING_NAME, linked: true },
    auth,
    readyToApply: true,
  }, null, 2))
  process.exit(0)
}

const credentials = ensureSyntheticCredentials()
writeLocalStagingEnvironment(publishable)

const primaryAuth = await ensureAuthUser({
  serviceRole,
  email: credentials.STAGING_PRIMARY_EMAIL,
  password: credentials.STAGING_PRIMARY_PASSWORD,
  fullName: 'Aymero Staging Owner',
  companyName: 'Aymero Staging Contractor',
})
const isolationAuth = await ensureAuthUser({
  serviceRole,
  email: credentials.STAGING_ISOLATION_EMAIL,
  password: credentials.STAGING_ISOLATION_PASSWORD,
  fullName: 'Aymero Isolation Owner',
  companyName: 'Aymero Isolation Test',
})

const primarySession = await signIn(publishable, credentials.STAGING_PRIMARY_EMAIL, credentials.STAGING_PRIMARY_PASSWORD)
const isolationSession = await signIn(publishable, credentials.STAGING_ISOLATION_EMAIL, credentials.STAGING_ISOLATION_PASSWORD)
const primaryTenant = await completeOnboarding({
  publishable,
  accessToken: primarySession.access_token,
  companyName: 'Aymero Staging Contractor',
  ownerName: 'Aymero Staging Owner',
  email: credentials.STAGING_PRIMARY_EMAIL,
})
const isolationTenant = await completeOnboarding({
  publishable,
  accessToken: isolationSession.access_token,
  companyName: 'Aymero Isolation Test',
  ownerName: 'Aymero Isolation Owner',
  email: credentials.STAGING_ISOLATION_EMAIL,
})

await setSyntheticLanguageFixture({ serviceRole, membershipId: primaryTenant.membership_id, contractorId: primaryTenant.contractor_id })
await setSyntheticLanguageFixture({ serviceRole, membershipId: isolationTenant.membership_id, contractorId: isolationTenant.contractor_id })
const primaryData = await seedPrimaryData({ publishable, accessToken: primarySession.access_token, contractorId: primaryTenant.contractor_id })
const isolationData = await seedIsolationData({ publishable, accessToken: isolationSession.access_token, contractorId: isolationTenant.contractor_id })
const rls = await verifyRls({
  publishable,
  primary: primarySession,
  isolation: isolationSession,
  primaryTenant,
  isolationTenant,
  primaryData,
  isolationData,
})

console.log(JSON.stringify({
  project: { ref: STAGING_REF, name: STAGING_NAME, linked: true },
  auth,
  users: {
    primary: { id: primarySession.user.id, email: credentials.STAGING_PRIMARY_EMAIL, created: primaryAuth.created, confirmed: true },
    isolation: { id: isolationSession.user.id, email: credentials.STAGING_ISOLATION_EMAIL, created: isolationAuth.created, confirmed: true },
  },
  tenants: {
    primary: { contractorId: primaryTenant.contractor_id, membershipId: primaryTenant.membership_id, role: 'owner', language: 'es' },
    isolation: { contractorId: isolationTenant.contractor_id, membershipId: isolationTenant.membership_id, role: 'owner', language: 'es' },
  },
  fixtures: {
    clients: [primaryData.clientEnglish.id, primaryData.clientSpanish.id],
    editableEstimates: [primaryData.estimateEnglish.id, primaryData.estimateSpanish.id],
    nonEditableEstimate: primaryData.conversionEstimate.id,
    convertedContract: primaryData.contract.id,
    isolationEstimate: isolationData.estimate.id,
  },
  manualWorkflow: {
    authenticatedOnboardingRpc: true,
    estimateDraftSave: true,
    previewDataAvailable: true,
    estimateToContractConversion: true,
    billingDependency: false,
  },
  rls,
  localFrontend: {
    targetRef: STAGING_REF,
    aiClientFlag: ENABLE_AI_CLIENT,
    credentialsFilePresent: true,
    productionBackupPresent: existsSync(productionLocalBackupPath),
  },
}, null, 2))

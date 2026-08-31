import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  hasMatchingBillingTenant,
  isPostgresUuid,
  normalizePostgresUuid,
} from '../supabase/functions/_shared/saasBillingIdentity.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const webhook = read('../supabase/functions/stripe-billing-webhook/index.ts')
const sharedBilling = read('../supabase/functions/_shared/saasBilling.ts')

const demoContractorId = '00000000-0000-0000-0000-000000000001'
const normalContractorId = '68acacd7-3ae5-4908-86d3-837b802ea944'

for (const value of [
  demoContractorId,
  normalContractorId,
  normalContractorId.toUpperCase(),
]) {
  assert.equal(isPostgresUuid(value), true, `Expected PostgreSQL UUID to be accepted: ${value}`)
}

for (const value of [
  '',
  null,
  undefined,
  'gggggggg-0000-0000-0000-000000000001',
  '00000000-0000-0000-00000000-00000001',
  `${demoContractorId}-extra`,
]) {
  assert.equal(isPostgresUuid(value), false, `Expected malformed UUID to be rejected: ${value}`)
}

assert.equal(normalizePostgresUuid(normalContractorId.toUpperCase()), normalContractorId)
assert.equal(hasMatchingBillingTenant(demoContractorId, demoContractorId), true)
assert.equal(hasMatchingBillingTenant(normalContractorId, normalContractorId), true)
assert.equal(hasMatchingBillingTenant(normalContractorId.toUpperCase(), normalContractorId), true)
assert.equal(hasMatchingBillingTenant(demoContractorId, normalContractorId), false)
assert.equal(hasMatchingBillingTenant('', demoContractorId), false)
assert.equal(hasMatchingBillingTenant(undefined, demoContractorId), false)
assert.equal(hasMatchingBillingTenant('not-a-uuid', demoContractorId), false)

assert.match(sharedBilling, /isPostgresUuid as isUuid/)
assert.match(webhook, /hasMatchingBillingTenant\(metadataContractorId, billingCustomer\.contractor_id\)/)
assert.doesNotMatch(webhook, /metadataContractorId &&/)
assert.match(webhook, /errorName: error instanceof Error \? error\.name : 'UNKNOWN'/)
assert.match(webhook, /errorMessage: error instanceof Error \? error\.message/)
assert.match(webhook, /return jsonResponse\(\{ error: 'Webhook processing failed\.' \}, 500\)/)
assert.doesNotMatch(webhook, /console\.error\([^)]*(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|rawBody|signatureHeader)/s)

console.log('Production billing webhook PostgreSQL UUID and tenant validation passed.')

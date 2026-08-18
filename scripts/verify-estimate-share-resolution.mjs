import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ESTIMATE_SHARE_RESOLUTION,
  resolveEstimatePublicShareToken,
  resolveEstimateShareLink,
} from '../src/utils/estimateShare.js'
import { getCustomerDeliveryAvailability } from '../src/utils/customerDelivery.js'

const PORTAL_ORIGIN = 'https://portal.aymero.co'
const validToken = '4fd4a895ba7f4c8b91019f91c98c85fa'
const buildUrl = (token) => `${PORTAL_ORIGIN}/estimate/${token}`

function resolve(record, options = {}) {
  return resolveEstimateShareLink(record, {
    buildUrl,
    ...options,
  })
}

const freshlyCreatedEstimate = {
  id: 'estimate-new',
  publicShareToken: validToken,
  public_share_token: validToken,
}
assert.equal(resolve(freshlyCreatedEstimate).status, ESTIMATE_SHARE_RESOLUTION.TOKEN_PRESENT)

const existingSupabaseEstimate = {
  id: 'estimate-existing',
  public_share_token: validToken,
}
assert.equal(resolveEstimatePublicShareToken(existingSupabaseEstimate), validToken)
assert.equal(resolve(existingSupabaseEstimate).url, `${PORTAL_ORIGIN}/estimate/${validToken}`)

const archivedEstimate = {
  ...existingSupabaseEstimate,
  id: 'estimate-archived',
  archivedAt: '2026-08-18T12:00:00.000Z',
}
assert.equal(resolve(archivedEstimate).status, ESTIMATE_SHARE_RESOLUTION.TOKEN_PRESENT)

assert.equal(resolve({ id: 'estimate-without-token' }).status, ESTIMATE_SHARE_RESOLUTION.TOKEN_MISSING)
assert.equal(resolve({ id: 'estimate-malformed', publicShareToken: 'not a valid token' }).status, ESTIMATE_SHARE_RESOLUTION.TOKEN_INVALID)
assert.equal(resolve(null).status, ESTIMATE_SHARE_RESOLUTION.ESTIMATE_MISSING)
assert.equal(resolve(existingSupabaseEstimate, { buildUrl: () => '' }).status, ESTIMATE_SHARE_RESOLUTION.URL_GENERATION_FAILED)
assert.equal(resolve(existingSupabaseEstimate, { buildUrl: () => { throw new Error('test failure') } }).status, ESTIMATE_SHARE_RESOLUTION.UNEXPECTED_ERROR)

const resolvedUrl = resolve(existingSupabaseEstimate).url
const deliveryAvailability = getCustomerDeliveryAvailability({
  documentType: 'estimate',
  documentLink: resolvedUrl,
  phone: '5551234567',
  email: 'client@example.com',
})
assert.equal(deliveryAvailability.text, true)
assert.equal(deliveryAvailability.email, true)
assert.equal(getCustomerDeliveryAvailability({
  documentType: 'estimate',
  documentLink: '',
  phone: '5551234567',
  email: 'client@example.com',
}).text, false)

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const portalSource = read('../src/utils/portal.js')
const estimateServiceSource = read('../src/services/supabase/estimatesSupabaseService.js')
const builderSource = read('../src/pages/EstimateBuilderPage.jsx')
const modalSource = read('../src/components/common/SendToCustomerModal.jsx')

assert.match(estimateServiceSource, /publicShareToken:\s*row\?\.public_share_token/)
assert.match(estimateServiceSource, /public_share_token:\s*row\?\.public_share_token/)
assert.match(portalSource, /resolveEstimateShareLink\(record, \{ buildUrl: buildEstimateShareUrl \}\)/)
assert.doesNotMatch(portalSource, /resolvePublicEstimateShareUrl\(record = \{\}\) \{\s*if \(!hasUsableClientDeliveryOrigin\(\)\)/)
assert.match(builderSource, /const persistedEstimate = result \|\| \(hasExistingEstimate \? savedEstimate : null\)/)
assert.match(builderSource, /resolvePublicEstimateShare\(persistedEstimate\)/)
assert.match(builderSource, /setSendDocumentLink\(publicEstimateLink \|\| ''\)/)
assert.match(modalSource, /getCustomerDeliveryAvailability/)
assert.match(modalSource, /disabled=\{isSubmitting \|\| !deliveryAvailability\[channel\]\}/)

console.log('Estimate share-link resolution validation passed.')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  isValidEstimateResponseToken,
  resolveEstimateResponseTransition,
  getEstimateClientResponseView,
} from '../src/utils/estimateClientResponse.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

assert.deepEqual(resolveEstimateResponseTransition('sent', 'approve'), {
  kind: 'update', currentStatus: 'sent', targetStatus: 'approved',
})
assert.deepEqual(resolveEstimateResponseTransition('sent', 'decline'), {
  kind: 'update', currentStatus: 'sent', targetStatus: 'rejected',
})
assert.equal(resolveEstimateResponseTransition('approved', 'approve').kind, 'idempotent')
assert.equal(resolveEstimateResponseTransition('rejected', 'decline').kind, 'idempotent')
assert.equal(resolveEstimateResponseTransition('approved', 'decline').kind, 'blocked')
assert.equal(resolveEstimateResponseTransition('rejected', 'approve').kind, 'blocked')
assert.equal(resolveEstimateResponseTransition('converted', 'approve').kind, 'blocked')
assert.equal(resolveEstimateResponseTransition('draft', 'approve').kind, 'blocked')
assert.equal(resolveEstimateResponseTransition('saved', 'decline').kind, 'blocked')

const validToken = '4fd4a895ba7f4c8b91019f91c98c85fa'
assert.equal(isValidEstimateResponseToken(validToken), true)
assert.equal(isValidEstimateResponseToken(''), false)
assert.equal(isValidEstimateResponseToken('malformed token'), false)
assert.equal(isValidEstimateResponseToken('2f930a25-91c7-42d3-8c1e-f7f5ebf2915a'), false)

assert.equal(getEstimateClientResponseView('Sent').isActionable, true)
assert.equal(getEstimateClientResponseView('Approved').isActionable, false)
assert.equal(getEstimateClientResponseView('Approved').isApproved, true)
assert.equal(getEstimateClientResponseView('Rejected').isRejected, true)
assert.equal(getEstimateClientResponseView('Converted to Contract').isConverted, true)

const endpointSource = read('../supabase/functions/super-endpoint/index.ts')
const publicPageSource = read('../src/pages/PublicEstimatePage.jsx')
const publicServiceSource = read('../src/services/publicPortalService.js')
const leadDetailSource = read('../src/pages/LeadDetailPage.jsx')
const estimateBuilderSource = read('../src/pages/EstimateBuilderPage.jsx')
const dashboardConsistencySource = read('../src/utils/dashboardConsistency.js')

assert.match(endpointSource, /\.eq\('public_share_token', token\)/)
assert.doesNotMatch(endpointSource, /from '\.\/estimateResponsePolicy/)
assert.match(endpointSource, /function resolveEstimateResponseTransition\(status: unknown, decision: unknown\)/)
assert.match(endpointSource, /\.eq\('contractor_id', estimateRow\.contractor_id\)/)
assert.match(endpointSource, /\.eq\('status', 'sent'\)/)
assert.match(endpointSource, /\.is\('archived_at', null\)/)
assert.match(endpointSource, /approved_at: responseTimestamp/)
assert.match(endpointSource, /rejected_at: responseTimestamp/)
assert.match(endpointSource, /concurrentTransition\.kind !== 'idempotent'/)
assert.match(endpointSource, /status: estimateStatusLabels/)
assert.match(endpointSource, /approvedAt: row\.approved_at/)
assert.match(endpointSource, /rejectedAt: row\.rejected_at/)
assert.doesNotMatch(endpointSource.match(/function mapEstimate[\s\S]*?\n\}/)?.[0] || '', /contractorId|estimateId|clientId|leadId|projectId/)

assert.match(publicServiceSource, /JSON\.stringify\(\{ token, resource: 'estimate', action \}\)/)
assert.doesNotMatch(publicServiceSource, /contractor_id|estimate_id|lead_id|client_id|project_id/)
assert.match(publicPageSource, /responseView\.isActionable/)
assert.match(publicPageSource, /responseView\.isApproved/)
assert.match(publicPageSource, /responseView\.isRejected/)
assert.match(publicPageSource, /responseView\.isConverted/)
assert.match(publicPageSource, /isSubmittingResponse \? undefined/)
assert.match(publicPageSource, /ariaLabelledBy="public-estimate-confirm-title"/)
assert.match(leadDetailSource, /estimate\?\.rejectedAt \|\| estimate\?\.rejected_at/)
assert.match(estimateBuilderSource, /projectAvailable && estimateCanCreateContract && !hasLinkedContract/)
assert.match(dashboardConsistencySource, /DASHBOARD_PENDING_ESTIMATE_STATUSES\.includes\(explicitStatus\)/)

const responseTranslationKeys = [
  'publicEstimateResponseTitle',
  'publicEstimateResponseHelp',
  'approveEstimate',
  'declineEstimate',
  'publicEstimateApproveConfirmTitle',
  'publicEstimateApproveConfirmHelp',
  'publicEstimateDeclineConfirmTitle',
  'publicEstimateDeclineConfirmHelp',
  'publicEstimateApprovedTitle',
  'publicEstimateApprovedHelp',
  'publicEstimateDeclinedTitle',
  'publicEstimateDeclinedHelp',
  'publicEstimateConvertedTitle',
  'publicEstimateConvertedHelp',
  'publicEstimateResponseError',
  'leadActivityEstimateDeclined',
]
responseTranslationKeys.forEach((key) => {
  assert.equal(typeof en[key], 'string', `Missing English translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish translation: ${key}`)
})

console.log('Estimate client-response validation passed.')

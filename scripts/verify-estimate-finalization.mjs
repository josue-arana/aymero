import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildEstimateResendTransition,
  buildEstimateRevisionReset,
  canCreateContractFromEstimate,
  canEditEstimate,
  canSendEstimate,
  shouldConfirmSentEstimateEdit,
} from '../src/utils/estimateFinalization.js'
import { getEstimateClientResponseView } from '../src/utils/estimateClientResponse.js'
import { resolveLeadLifecycle } from '../src/utils/leadLifecycle.js'
import { resolveEstimateShareLink } from '../src/utils/estimateShare.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

assert.equal(shouldConfirmSentEstimateEdit('Sent'), true)
assert.equal(shouldConfirmSentEstimateEdit('Saved'), false)

const revisionReset = buildEstimateRevisionReset()
assert.deepEqual(revisionReset, {
  status: 'Saved',
  sentAt: null,
  approvedAt: null,
  rejectedAt: null,
})
assert.equal(getEstimateClientResponseView(revisionReset.status).isActionable, false)

const publicShareToken = '4fd4a895ba7f4c8b91019f91c98c85fa'
const originalEstimate = { publicShareToken, public_share_token: publicShareToken, status: 'Sent' }
const revisedEstimate = { ...originalEstimate, ...revisionReset }
assert.equal(revisedEstimate.publicShareToken, publicShareToken)
assert.equal(revisedEstimate.public_share_token, publicShareToken)
const buildUrl = (token) => `https://portal.aymero.co/estimate/${token}`
assert.equal(resolveEstimateShareLink(originalEstimate, { buildUrl }).url, resolveEstimateShareLink(revisedEstimate, { buildUrl }).url)

const resendTimestamp = '2026-08-22T12:00:00.000Z'
assert.deepEqual(buildEstimateResendTransition(resendTimestamp), {
  status: 'Sent',
  sentAt: resendTimestamp,
  approvedAt: null,
  rejectedAt: null,
})

assert.equal(canEditEstimate('Draft'), true)
assert.equal(canEditEstimate('Saved'), true)
assert.equal(canEditEstimate('Sent'), true)
assert.equal(canEditEstimate('Rejected'), true)
assert.equal(canEditEstimate('Approved'), false)
assert.equal(canEditEstimate('Converted to Contract'), false)
assert.equal(canSendEstimate('Draft'), true)
assert.equal(canSendEstimate('Saved'), true)
assert.equal(canSendEstimate('Sent'), true)
assert.equal(canSendEstimate('Rejected'), true)
assert.equal(canSendEstimate('Approved'), false)
assert.equal(canSendEstimate('Converted to Contract'), false)
assert.equal(canCreateContractFromEstimate('Approved'), true)
assert.equal(canCreateContractFromEstimate('Rejected'), false)

const approvedLifecycle = resolveLeadLifecycle({
  lead: { id: 'lead-approved', portal: { estimate: { id: 'estimate-approved', status: 'Approved' } } },
  estimates: [{ id: 'estimate-approved', leadId: 'lead-approved', status: 'Approved' }],
})
assert.equal(approvedLifecycle.nextStepKey, 'leadNextStepCreateContract')
assert.deepEqual(approvedLifecycle.actions.map((action) => action.actionType), ['createContract'])

const rejectedLifecycle = resolveLeadLifecycle({
  lead: { id: 'lead-rejected', portal: { estimate: { id: 'estimate-rejected', status: 'Rejected' } } },
  estimates: [{ id: 'estimate-rejected', leadId: 'lead-rejected', status: 'Rejected' }],
})
assert.equal(rejectedLifecycle.nextStepKey, 'leadNextStepUpdateEstimate')
assert.deepEqual(rejectedLifecycle.actions.map((action) => action.actionType), ['editEstimate', 'resendEstimate'])

const builderSource = read('../src/pages/EstimateBuilderPage.jsx')
const estimatesPageSource = read('../src/pages/EstimatesPage.jsx')
const dashboardSource = read('../src/pages/DashboardPage.jsx')
const leadDetailSource = read('../src/pages/LeadDetailPage.jsx')
const appSource = read('../src/App.jsx')

assert.match(builderSource, /isOpen=\{showSentEditConfirmation\}/)
assert.match(builderSource, /buildEstimateRevisionReset\(\)/)
assert.match(builderSource, /buildEstimateResendTransition\(\)/)
assert.match(builderSource, /estimateApprovedByClient/)
assert.match(builderSource, /estimateDeclinedByClient/)
assert.match(builderSource, /min-h-12/)
assert.match(estimatesPageSource, /canCreateContractFromEstimate\(lifecycleStatus\)/)
assert.match(dashboardSource, /dashboardEstimateWaitingForClient/)
assert.match(dashboardSource, /dashboardEstimateReadyForContract/)
assert.match(dashboardSource, /dashboardEstimateNeedsReview/)
assert.match(leadDetailSource, /<StatusBadge status=\{status\} t=\{t\} \/>/)
assert.match(leadDetailSource, /<StatusBadge status="Archived" t=\{t\} \/>/)
assert.match(appSource, /: leadPipelineStages\.ESTIMATE_CREATED/)

const translationKeys = [
  'createContract',
  'resendEstimate',
  'sentEstimateEditTitle',
  'sentEstimateEditHelp',
  'continueEditing',
  'estimateApprovedByClient',
  'estimateApprovedOn',
  'estimateRecommendedCreateContract',
  'estimateDeclinedByClient',
  'estimateDeclinedOn',
  'estimateRecommendedUpdateOrResend',
  'dashboardEstimateWaitingForClient',
  'dashboardEstimateReadyForContract',
  'dashboardEstimateNeedsReview',
  'leadNextStepUpdateEstimate',
  'leadNextStepCreateContract',
  'leadNextStepReviewContract',
]
translationKeys.forEach((key) => {
  assert.equal(typeof en[key], 'string', `Missing English translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish translation: ${key}`)
})

console.log('Estimate finalization validation passed.')

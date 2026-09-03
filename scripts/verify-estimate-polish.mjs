import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  getEstimateClientResponseView,
  getEstimatePortalStatusPresentation,
} from '../src/utils/estimateClientResponse.js'
import { canEditEstimate } from '../src/utils/estimateFinalization.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

assert.equal(getEstimateClientResponseView('Sent').isActionable, true)
assert.equal(getEstimateClientResponseView('Approved').isApproved, true)
assert.equal(getEstimateClientResponseView('Rejected').isRejected, true)
assert.equal(getEstimateClientResponseView('Converted to Contract').isConverted, true)

assert.equal(getEstimatePortalStatusPresentation('Sent')?.labelKey, 'portalEstimateAwaitingResponse')
assert.equal(getEstimatePortalStatusPresentation('Approved')?.labelKey, 'portalEstimateApproved')
assert.equal(getEstimatePortalStatusPresentation('Rejected')?.labelKey, 'portalEstimateDeclined')
assert.equal(getEstimatePortalStatusPresentation('Draft'), null)
assert.equal(getEstimatePortalStatusPresentation('Saved'), null)
assert.equal(getEstimatePortalStatusPresentation('Converted to Contract'), null)

assert.equal(canEditEstimate('Draft'), true)
assert.equal(canEditEstimate('Saved'), true)
assert.equal(canEditEstimate('Sent'), true)
assert.equal(canEditEstimate('Rejected'), true)
assert.equal(canEditEstimate('Approved'), false)
assert.equal(canEditEstimate('Converted to Contract'), false)

const estimatesSource = read('../src/pages/EstimatesPage.jsx')
const publicEstimateSource = read('../src/pages/PublicEstimatePage.jsx')
const portalSummarySource = read('../src/components/portal/PortalSummary.jsx')
const statusBadgeSource = read('../src/components/ui/StatusBadge.jsx')
const appSource = read('../src/App.jsx')
const notificationCenterSource = read('../src/components/layout/NotificationCenter.jsx')
const estimateBuilderSource = read('../src/pages/EstimateBuilderPage.jsx')
const scopeAssistantPanelSource = read('../src/components/estimates/ScopeAssistantPanel.jsx')

assert.match(estimatesSource, /'Draft', 'Saved', 'Sent', 'Approved', 'Rejected', 'Converted to Contract'/)
assert.match(estimatesSource, /const estimateFilters = \['All', 'Archived', 'Draft', 'Saved', 'Sent', 'Approved', 'Rejected', 'Converted to Contract'\]/)
assert.match(estimatesSource, /selectedFilter === 'Draft' && estimate\.status === 'Saved'/)
assert.match(estimatesSource, /canEditEstimate\(lifecycleStatus\)/)
assert.match(estimatesSource, /rightTimestamp - leftTimestamp/)
assert.match(estimatesSource, /<StatusBadge status=\{estimate\.status\} t=\{t\} \/>/)
assert.match(estimatesSource, /<StatusBadge status="Archived" t=\{t\} \/>/)
assert.match(statusBadgeSource, /Saved: 'bg-slate-100/)
assert.match(statusBadgeSource, /Approved: 'bg-emerald-50/)
assert.match(statusBadgeSource, /Rejected: 'bg-rose-50/)

const approvedStatePosition = publicEstimateSource.indexOf('responseView.isApproved')
const documentPreviewPosition = publicEstimateSource.indexOf("aria-label={t('previewEstimate')}")
const actionableStatePosition = publicEstimateSource.indexOf('responseView.isActionable')
assert.ok(approvedStatePosition > -1 && approvedStatePosition < documentPreviewPosition)
assert.ok(actionableStatePosition > documentPreviewPosition)
assert.match(publicEstimateSource, /role="status"/)
assert.match(publicEstimateSource, /<AymeroLoader/)
assert.match(publicEstimateSource, /publicEstimateUnavailable/)
assert.match(publicEstimateSource, /safe-area-inset-left/)
assert.match(publicEstimateSource, /min-h-12/)

assert.match(portalSummarySource, /getEstimatePortalStatusPresentation\(estimate\?\.status\)/)
assert.match(portalSummarySource, /statusPresentation=\{estimateStatusPresentation\}/)
assert.match(portalSummarySource, /t\(statusPresentation\.labelKey\)/)
assert.match(portalSummarySource, /flex flex-wrap items-center gap-2/)

// The current notification store is local, non-navigable UI state. Estimate response
// notifications must not be simulated until the shared system can persist, scope,
// deduplicate, and route public events safely.
assert.match(appSource, /const initialNotifications = \[\]/)
assert.doesNotMatch(appSource, /estimateApprovedNotification|estimateDeclinedNotification/)
assert.doesNotMatch(notificationCenterSource, /onNotificationClick|navigate\(/)

// Estimate Builder polish keeps the established workflow while clarifying the
// visual hierarchy: Send and Preview stay visible, lower-frequency document
// actions use the shared accessible menu, and assistant state remains wired to
// the existing readiness helpers.
assert.match(estimateBuilderSource, /<ActionMenu/)
assert.match(estimateBuilderSource, /id: 'print'/)
assert.match(estimateBuilderSource, /id: 'save-as-pdf'/)
assert.match(estimateBuilderSource, /id: 'archive'/)
assert.match(estimateBuilderSource, /estimateSettingsSummary/)
assert.match(estimateBuilderSource, /isDraftDirty/)
assert.match(estimateBuilderSource, /isScopeAssistantSendBlocked/)
assert.match(estimateBuilderSource, /resendEstimate.*sendEstimate/)
assert.match(estimateBuilderSource, /materialsIncluded/)
assert.match(scopeAssistantPanelSource, /minHeight=\{152\}/)
assert.match(scopeAssistantPanelSource, /minHeight=\{120\}/)

for (const key of [
  'portalEstimateAwaitingResponse',
  'portalEstimateApproved',
  'portalEstimateDeclined',
  'publicEstimateApprovedTitle',
  'publicEstimateApprovedHelp',
  'publicEstimateDeclinedTitle',
  'publicEstimateDeclinedHelp',
]) {
  assert.equal(typeof en[key], 'string', `Missing English translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish translation: ${key}`)
  assert.notEqual(en[key], es[key], `Translation should be localized: ${key}`)
}

for (const key of ['estimateSettingsSummary', 'estimateSettingsSummaryDetailed', 'unsavedChanges', 'changesSaved', 'estimateNotSavedYet', 'estimateActions']) {
  assert.equal(typeof en[key], 'string', `Missing English translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish translation: ${key}`)
  assert.notEqual(en[key], es[key], `Translation should be localized: ${key}`)
}

assert.doesNotMatch(en.sendClientLinkHelp, /secure/i)
assert.doesNotMatch(es.sendClientLinkHelp, /segur/i)

console.log('Estimate experience polish validation passed.')

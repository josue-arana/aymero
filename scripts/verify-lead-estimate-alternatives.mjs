import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildDuplicatedEstimateDraft, buildNewEstimateOptionDraft, sumUnambiguousEstimateValues } from '../src/utils/estimateAlternatives.js'
import { dedupeEstimateRecordsById, getLeadEstimateRecords, getLeadEstimateValue, hasAmbiguousLeadEstimateValue, resolveLeadLifecycle, summarizeLeadEstimateStatus } from '../src/utils/leadLifecycle.js'
import { getEstimatesForProject } from '../src/utils/projectIdentity.js'
import { generateEstimateNumber } from '../src/utils/estimateNumber.js'

const lead = { id: 'lead-1', clientId: 'client-1', projectTitle: 'Deck' }
const draft = { id: 'estimate-a', leadId: 'lead-1', projectId: null, total: 8500, status: 'Draft', optionName: 'Wood' }
const sent = { id: 'estimate-b', leadId: 'lead-1', projectId: null, total: 12000, status: 'Sent', optionName: 'Trex' }
const approved = { id: 'estimate-c', leadId: 'lead-1', projectId: null, total: 15000, status: 'Approved' }

assert.equal(getLeadEstimateRecords({ lead, estimates: [] }).length, 0)
assert.equal(getLeadEstimateRecords({ lead, estimates: [draft] }).length, 1)
assert.equal(getLeadEstimateRecords({ lead, estimates: [draft, sent] }).length, 2)
assert.equal(dedupeEstimateRecordsById([draft, { ...draft }, sent]).length, 2)
assert.equal(dedupeEstimateRecordsById([{ ...draft, id: 'estimate-a', number: 'EST-SAME' }, { ...sent, id: 'estimate-b', number: 'EST-SAME' }]).length, 2)
assert.equal(getEstimatesForProject({ id: 'project-1' }, [
  { ...draft, id: 'estimate-a', projectId: 'project-1', number: 'EST-SAME' },
  { ...sent, id: 'estimate-b', projectId: 'project-1', number: 'EST-SAME' },
]).length, 2)
assert.equal(summarizeLeadEstimateStatus([draft, sent]), 'sent')
assert.equal(summarizeLeadEstimateStatus([{ ...draft, status: 'Rejected' }, sent]), 'sent')
assert.equal(summarizeLeadEstimateStatus([approved, draft]), 'approved')
assert.equal(getLeadEstimateValue({ lead, estimates: [draft, sent] }), null)
assert.equal(hasAmbiguousLeadEstimateValue({ lead, estimates: [draft, sent] }), true)
assert.equal(getLeadEstimateValue({ lead, estimates: [approved, draft] }), 15000)
assert.equal(hasAmbiguousLeadEstimateValue({ lead, estimates: [approved, draft] }), false)
assert.equal(resolveLeadLifecycle({ lead, estimates: [draft, sent] }).estimateStatusKind, 'sent')
assert.equal(resolveLeadLifecycle({ lead, estimates: [{ ...draft, status: 'Rejected' }, sent] }).estimateStatusKind, 'sent')
assert.equal(resolveLeadLifecycle({ lead, estimates: [approved, draft] }).estimateStatusKind, 'approved')
assert.equal(getLeadEstimateRecords({ lead, estimates: [draft, { ...sent, archivedAt: '2026-09-07T00:00:00Z' }] }).length, 1)
assert.equal(hasAmbiguousLeadEstimateValue({ lead, estimates: [draft, { ...sent, archivedAt: '2026-09-07T00:00:00Z' }] }), false)

const fresh = buildNewEstimateOptionDraft({ lead })
assert.equal(fresh.projectId, null)
assert.equal(fresh.leadId, 'lead-1')
assert.equal(fresh.status, 'Draft')
assert.equal(fresh.total, 0)
assert.ok(fresh.publicShareToken)
const projectFresh = buildNewEstimateOptionDraft({ lead, project: { id: 'project-1', leadId: 'lead-1', projectTitle: 'Deck' } })
assert.equal(projectFresh.projectId, 'project-1')
assert.equal(projectFresh.leadId, 'lead-1')
assert.equal(projectFresh.status, 'Draft')
assert.equal(projectFresh.total, 0)
const duplicate = buildDuplicatedEstimateDraft({ lead, estimate: { ...sent, scopeAssistantState: { approval: 'stale' }, publicShareToken: 'old', sentAt: '2026-09-07' } })
assert.equal(duplicate.projectId, null)
assert.equal(duplicate.id, undefined)
assert.equal(duplicate.number, undefined)
assert.equal(duplicate.status, 'Draft')
assert.equal(duplicate.optionName, 'Trex')
assert.deepEqual(duplicate.scopeAssistantState, {})
assert.notEqual(duplicate.publicShareToken, 'old')

const identitySamples = ['estimate-alpha-1', 'estimate-beta-2', 'estimate-gamma-3'].map((id) => ({
  id,
  number: generateEstimateNumber({ ...fresh, id }, new Date('2026-09-07T00:00:00Z')),
  publicShareToken: buildNewEstimateOptionDraft({ lead }).publicShareToken,
}))
assert.equal(new Set(identitySamples.map((sample) => sample.id)).size, 3)
assert.equal(new Set(identitySamples.map((sample) => sample.number)).size, 3)
assert.equal(new Set(identitySamples.map((sample) => sample.publicShareToken)).size, 3)

assert.equal(sumUnambiguousEstimateValues([{ ...draft }, { ...sent }]), 0)
assert.equal(sumUnambiguousEstimateValues([{ ...draft }, { ...sent }, { ...approved }]), 0)

const leadDetailSource = fs.readFileSync(new URL('../src/pages/LeadDetailPage.jsx', import.meta.url), 'utf8')
const leadsPageSource = fs.readFileSync(new URL('../src/pages/LeadsPage.jsx', import.meta.url), 'utf8')
const builderSource = fs.readFileSync(new URL('../src/pages/EstimateBuilderPage.jsx', import.meta.url), 'utf8')
const projectIdentitySource = fs.readFileSync(new URL('../src/utils/projectIdentity.js', import.meta.url), 'utf8')
const estimatesPageSource = fs.readFileSync(new URL('../src/pages/EstimatesPage.jsx', import.meta.url), 'utf8')
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
assert.match(leadDetailSource, /estimateRecords/)
assert.match(leadDetailSource, /t\('newEstimate'\)/)
assert.doesNotMatch(leadDetailSource, /duplicateEstimateOption/)
assert.match(leadDetailSource, /!hasAmbiguousLeadEstimateAction && \['sent', 'follow-up'\]/)
assert.match(leadDetailSource, /reviewEstimateReady/)
assert.match(leadDetailSource, /multipleEstimates/)
assert.doesNotMatch(leadDetailSource, /estimateValueNotFinalized/)
assert.match(leadsPageSource, /hasAmbiguousLeadEstimateValue/)
assert.match(leadsPageSource, /t\('multipleEstimates'\)/)
assert.match(leadDetailSource, /onClick=\{\(\) => onOpenEstimate\?\.\(estimateRow\)\}/)
assert.doesNotMatch(leadDetailSource, /viewEstimates/)
assert.doesNotMatch(leadDetailSource, /reviewEstimatesChoose/)
assert.match(leadDetailSource, /appRoutes\.estimateDetail\.replace\('\:estimateId', estimate\.id\)/)
assert.match(builderSource, /isProjectLinked \|\| Boolean\(lead\?\.id\)/)
assert.match(builderSource, /duplicateEstimate/)
assert.match(leadDetailSource, /dedupeEstimateRecordsById/)
assert.match(leadDetailSource, /key=\{estimateRow\.id\}/)
assert.doesNotMatch(leadDetailSource, /key=\{estimateRow\.id \|\| estimateRow\.number\}/)
assert.match(projectIdentitySource, /return dedupeById\(estimates\)/)
assert.match(estimatesPageSource, /dedupeById\(estimates\)/)
assert.match(appSource, /saveEstimate\(lead\.id, draft, \{ createNew: true, leadOnly: true, silent: true \}\)/)
assert.match(appSource, /navigate\(`\/estimates\/\$\{created\.id\}`/)
assert.match(appSource, /const nextEstimateId = createNew \? createLocalRecordId\('estimate'\)/)
assert.match(builderSource, /if \(isDirectEstimateRoute\)/)
assert.match(builderSource, /dataProvider\.estimates\.getById\(estimateId/)

console.log('lead estimate alternatives verification passed')

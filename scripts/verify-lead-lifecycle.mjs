import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { leadPipelineStages } from '../src/utils/leadPipeline.js'
import { resolveLeadLifecycle, selectPrimaryLeadEstimate } from '../src/utils/leadLifecycle.js'

const activeLead = {
  id: 'lead-a',
  status: 'New Lead',
  leadPipelineStage: leadPipelineStages.NEW_LEAD,
}
const draftEstimate = {
  id: 'estimate-draft',
  leadId: activeLead.id,
  status: 'Draft',
  createdAt: '2026-08-15T12:00:00.000Z',
}

function actionTypes(lifecycle) {
  return lifecycle.actions.map((action) => action.actionType)
}

// No Estimate: Inquiry and Create Estimate.
const inquiry = resolveLeadLifecycle({ lead: activeLead })
assert.equal(inquiry.stage, leadPipelineStages.NEW_LEAD)
assert.deepEqual(actionTypes(inquiry), ['createEstimate'])

// Persisted Estimate evidence outranks a stale NEW_LEAD stage.
const draft = resolveLeadLifecycle({ lead: activeLead, estimates: [draftEstimate] })
assert.equal(draft.stage, leadPipelineStages.ESTIMATE_CREATED)
assert.equal(draft.progressStep, 'estimate')
assert.equal(draft.relatedEstimate, draftEstimate)
assert.deepEqual(actionTypes(draft), ['editEstimate', 'sendEstimate'])

const sent = resolveLeadLifecycle({
  lead: activeLead,
  estimates: [{ ...draftEstimate, status: 'Sent', sentAt: '2026-08-16T12:00:00.000Z' }],
})
assert.equal(sent.stage, leadPipelineStages.ESTIMATE_SENT)
assert.deepEqual(actionTypes(sent), ['markFollowUpComplete'])

const followUp = resolveLeadLifecycle({
  lead: { ...activeLead, leadPipelineStage: leadPipelineStages.FOLLOW_UP },
  estimates: [{ ...draftEstimate, status: 'Sent', sentAt: '2026-08-16T12:00:00.000Z' }],
})
assert.equal(followUp.stage, leadPipelineStages.FOLLOW_UP)
assert.deepEqual(actionTypes(followUp), ['markEstimateApproved'])

const approved = resolveLeadLifecycle({
  lead: activeLead,
  estimates: [{ ...draftEstimate, status: 'Approved', approvedAt: '2026-08-16T13:00:00.000Z' }],
})
assert.equal(approved.stage, leadPipelineStages.ESTIMATE_APPROVED)
assert.deepEqual(actionTypes(approved), ['createContract'])

const rejected = resolveLeadLifecycle({
  lead: activeLead,
  estimates: [{ ...draftEstimate, status: 'Rejected', rejectedAt: '2026-08-16T13:30:00.000Z' }],
})
assert.equal(rejected.stage, leadPipelineStages.ESTIMATE_CREATED)
assert.deepEqual(actionTypes(rejected), ['editEstimate', 'resendEstimate'])

// An active Project is stronger than Estimate or stale Lead metadata.
const project = { id: 'project-a', leadId: activeLead.id, status: 'In Progress' }
const converted = resolveLeadLifecycle({
  lead: activeLead,
  estimates: [draftEstimate],
  project,
})
assert.equal(converted.stage, leadPipelineStages.CONVERTED_TO_JOB)
assert.equal(converted.relatedProject, project)
assert.deepEqual(actionTypes(converted), ['viewJob'])

const archivedProjectFallback = resolveLeadLifecycle({
  lead: activeLead,
  estimates: [draftEstimate],
  project: { ...project, archivedAt: '2026-08-16T14:30:00.000Z' },
})
assert.equal(archivedProjectFallback.stage, leadPipelineStages.ESTIMATE_CREATED)
assert.deepEqual(actionTypes(archivedProjectFallback), ['editEstimate', 'sendEstimate'])

// Sprint 3.40D inherited archive behavior remains authoritative.
const archivedLead = { ...activeLead, archivedAt: '2026-08-16T14:00:00.000Z' }
const inheritedArchive = resolveLeadLifecycle({ lead: archivedLead, estimates: [draftEstimate] })
assert.equal(inheritedArchive.stage, leadPipelineStages.ARCHIVED)
assert.equal(inheritedArchive.estimateArchiveState.source, 'lead')
assert.deepEqual(actionTypes(inheritedArchive), ['restoreLead'])

const restoredLead = resolveLeadLifecycle({ lead: activeLead, estimates: [draftEstimate] })
assert.equal(restoredLead.stage, leadPipelineStages.ESTIMATE_CREATED)

const independentlyArchivedEstimate = {
  ...draftEstimate,
  archivedAt: '2026-08-16T13:30:00.000Z',
}
const independentArchive = resolveLeadLifecycle({
  lead: activeLead,
  estimates: [independentlyArchivedEstimate],
})
assert.equal(independentArchive.stage, leadPipelineStages.NEW_LEAD)
assert.equal(independentArchive.relatedEstimate, independentlyArchivedEstimate)
assert.equal(independentArchive.estimateArchiveState.source, 'estimate')

// Primary Estimate selection is explicit-ID first, then newest active record.
const newerEstimate = {
  id: 'estimate-newer',
  leadId: activeLead.id,
  status: 'Sent',
  createdAt: '2026-08-16T15:00:00.000Z',
}
assert.equal(selectPrimaryLeadEstimate({
  lead: { ...activeLead, estimateId: draftEstimate.id },
  estimates: [newerEstimate, draftEstimate],
}), draftEstimate)
assert.equal(selectPrimaryLeadEstimate({
  lead: activeLead,
  estimates: [draftEstimate, newerEstimate],
}), newerEstimate)
assert.equal(selectPrimaryLeadEstimate({
  lead: activeLead,
  estimates: [draftEstimate, { ...newerEstimate, archivedAt: '2026-08-16T16:00:00.000Z' }],
}), draftEstimate)

// Resolution is read-only: archive and workflow status remain separate fields.
const immutableEstimate = { ...draftEstimate }
resolveLeadLifecycle({ lead: archivedLead, estimates: [immutableEstimate] })
assert.equal(immutableEstimate.status, 'Draft')
assert.equal(immutableEstimate.archivedAt, undefined)

const leadDetailSource = readFileSync(
  fileURLToPath(new URL('../src/pages/LeadDetailPage.jsx', import.meta.url)),
  'utf8',
)
const estimateBuilderSource = readFileSync(
  fileURLToPath(new URL('../src/pages/EstimateBuilderPage.jsx', import.meta.url)),
  'utf8',
)

assert.match(leadDetailSource, /resolveLeadLifecycle\(/)
assert.match(leadDetailSource, /openSendEstimate:\s*true/)
assert.match(estimateBuilderSource, /openSendOnLoad/)
assert.match(estimateBuilderSource, /<SendToCustomerModal/)
assert.match(estimateBuilderSource, /resolvePublicEstimateShareUrl/)

console.log('Lead lifecycle validation passed.')

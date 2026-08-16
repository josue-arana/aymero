import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isRecordArchived, resolveEstimateArchiveState } from '../src/utils/archiveLifecycle.js'
import { buttonRegistry } from '../src/config/buttonRegistry.js'

const archivedLead = { id: 'lead-a', archivedAt: '2026-08-16T12:00:00.000Z' }
const activeLead = { id: 'lead-a', archivedAt: null }
const draftEstimate = { id: 'estimate-a', leadId: 'lead-a', status: 'Draft', archivedAt: null }

// Scenario A: a Lead-only draft inherits its Lead's archive state.
assert.deepEqual(resolveEstimateArchiveState({ estimate: draftEstimate, lead: archivedLead }), {
  isArchived: true,
  source: 'lead',
  independentlyArchived: false,
  inheritsLeadArchive: true,
  leadArchived: true,
  converted: false,
})

// Scenario B: conversion or Project ownership makes the Estimate independent.
assert.equal(resolveEstimateArchiveState({
  estimate: { ...draftEstimate, status: 'Converted to Contract' },
  lead: archivedLead,
}).isArchived, false)
assert.equal(resolveEstimateArchiveState({
  estimate: { ...draftEstimate, projectId: 'project-a' },
  lead: archivedLead,
}).isArchived, false)
assert.equal(resolveEstimateArchiveState({
  estimate: draftEstimate,
  lead: { ...archivedLead, projectId: 'project-a' },
}).isArchived, false)
assert.equal(resolveEstimateArchiveState({
  estimate: draftEstimate,
  lead: archivedLead,
  contract: { id: 'contract-a', status: 'Draft' },
}).isArchived, false)

// Scenario C: an independently archived Estimate remains archived after Lead restore.
const independentlyArchivedEstimate = {
  ...draftEstimate,
  archivedAt: '2026-08-16T11:00:00.000Z',
}
assert.equal(resolveEstimateArchiveState({
  estimate: independentlyArchivedEstimate,
  lead: archivedLead,
}).source, 'estimate')
assert.equal(resolveEstimateArchiveState({
  estimate: independentlyArchivedEstimate,
  lead: activeLead,
}).isArchived, true)

// Scenario D: inherited state clears when its Lead is restored.
assert.equal(resolveEstimateArchiveState({ estimate: draftEstimate, lead: activeLead }).isArchived, false)

// Scenario E: archiving a Project does not mutate or derive Estimate archive state.
assert.equal(resolveEstimateArchiveState({
  estimate: { ...draftEstimate, projectId: 'project-a' },
  lead: activeLead,
}).isArchived, false)

// Archived IDs and persisted archive fields are both authoritative inputs.
assert.equal(isRecordArchived({ id: 'invoice-a' }, ['invoice-a']), true)
assert.equal(isRecordArchived({ id: 'invoice-b', archived_at: '2026-08-16T12:00:00.000Z' }), true)
assert.equal(isRecordArchived({ id: 'invoice-c' }, []), false)

const estimateServiceSource = readFileSync(
  fileURLToPath(new URL('../src/services/supabase/estimatesSupabaseService.js', import.meta.url)),
  'utf8',
)
const leadServiceSource = readFileSync(
  fileURLToPath(new URL('../src/services/supabase/leadsSupabaseService.js', import.meta.url)),
  'utf8',
)

assert.match(estimateServiceSource, /contractor_id:\s*`eq\.\$\{contractorId\}`/)
assert.match(leadServiceSource, /contractor_id:\s*`eq\.\$\{contractorId\}`/)

for (const actionId of [
  'leadsArchiveLead', 'leadsRestoreLead', 'leadsDeleteLead',
  'jobsArchiveJob', 'jobsRestoreJob', 'jobsDeleteJob',
  'projectArchive', 'projectRestore', 'projectDelete',
  'estimateArchive', 'estimateRestore', 'estimateDelete',
  'contractArchive', 'contractRestore', 'contractDelete',
  'clientsArchiveClient', 'clientsRestoreClient', 'clientsDeleteClient',
  'invoicesArchive', 'invoicesRestore', 'invoicesDelete',
]) {
  const action = buttonRegistry.find((entry) => entry.id === actionId)
  assert.ok(action, `Missing Developer Health archive action: ${actionId}`)
  assert.equal(action.implemented, true, `Developer Health archive action is not implemented: ${actionId}`)
}

console.log('Archive workflow validation passed.')

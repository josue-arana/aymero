import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getEstimatesForProject, getSelectedEstimateForProject, hasAmbiguousProjectEstimateSelection } from '../src/utils/projectIdentity.js'
import { clearSelectedEstimate, selectEstimateForProject, validateEstimateSelection } from '../src/services/estimateSelectionService.js'
import { sumUnambiguousEstimateValues } from '../src/utils/estimateAlternatives.js'

const estimateServiceSource = readFileSync(new URL('../src/services/supabase/estimatesSupabaseService.js', import.meta.url), 'utf8')
const projectServiceSource = readFileSync(new URL('../src/services/supabase/projectsSupabaseService.js', import.meta.url), 'utf8')

const project = { id: 'project-1', contractorId: 'contractor-1' }
const estimateA = { id: 'estimate-a', projectId: 'project-1', contractorId: 'contractor-1', total: 8500, createdAt: '2026-09-01T00:00:00Z', status: 'Saved' }
const estimateB = { id: 'estimate-b', projectId: 'project-1', contractorId: 'contractor-1', total: 12000, createdAt: '2026-09-02T00:00:00Z', status: 'Sent' }
const otherProjectEstimate = { id: 'estimate-other', projectId: 'project-2', contractorId: 'contractor-1', total: 3000 }

assert.deepEqual(getEstimatesForProject(project, [estimateA, estimateB, otherProjectEstimate]).map((estimate) => estimate.id), ['estimate-b', 'estimate-a'])
assert.equal(getSelectedEstimateForProject(project, [estimateA, estimateB]), null)
assert.equal(hasAmbiguousProjectEstimateSelection(project, [estimateA, estimateB]), true)
assert.equal(getSelectedEstimateForProject({ ...project, selectedEstimateId: 'estimate-a' }, [estimateA, estimateB])?.id, 'estimate-a')
assert.equal(getSelectedEstimateForProject({ ...project, selectedEstimateId: 'missing' }, [estimateA, estimateB]), null)
assert.equal(getSelectedEstimateForProject({ ...project, selectedEstimateId: 'estimate-a' }, [{ ...estimateA, archivedAt: '2026-09-03T00:00:00Z' }, estimateB]), null)
assert.equal(getSelectedEstimateForProject(project, [estimateA])?.id, 'estimate-a')
assert.equal(getSelectedEstimateForProject(project, [estimateA, { ...estimateB, archivedAt: '2026-09-03T00:00:00Z' }])?.id, 'estimate-a')

assert.match(estimateServiceSource, /optionName: normalizeOptionalOptionName\(row\?\.option_name\)/)
assert.match(estimateServiceSource, /payload\.option_name = normalizeOptionalOptionName\(optionNameInput\)/)
assert.match(estimateServiceSource, /const normalized = String\(value\)\.trim\(\)/)
assert.match(projectServiceSource, /selectedEstimateId: row\?\.selected_estimate_id \|\| null/)
assert.match(projectServiceSource, /payload\.selected_estimate_id = normalizeOptionalUuid\(selectedEstimateInput, 'selected_estimate_id'\)/)
assert.match(projectServiceSource, /if \(isCreate \|\| selectedEstimateInput !== undefined\)/)

assert.equal(validateEstimateSelection({ project, estimate: estimateA, contractorId: 'contractor-1' }).valid, true)
assert.equal(validateEstimateSelection({ project, estimate: otherProjectEstimate, contractorId: 'contractor-1' }).code, 'ESTIMATE_PROJECT_MISMATCH')
assert.equal(validateEstimateSelection({ project, estimate: { ...estimateA, contractorId: 'contractor-2' }, contractorId: 'contractor-1' }).code, 'CONTRACTOR_MISMATCH')
assert.equal(validateEstimateSelection({ project, estimate: { ...estimateA, archivedAt: '2026-09-03T00:00:00Z' }, contractorId: 'contractor-1' }).code, 'ESTIMATE_ARCHIVED')

let persistedUpdate = null
const selectedResponse = await selectEstimateForProject(project, estimateA, {
  contractorId: 'contractor-1',
  estimates: [estimateA, estimateB],
  updateProject: async (id, updates) => {
    persistedUpdate = { id, updates }
    return { data: { ...project, ...updates }, error: null }
  },
})
assert.equal(selectedResponse.error, null)
assert.deepEqual(persistedUpdate, { id: 'project-1', updates: { selectedEstimateId: 'estimate-a' } })
assert.equal(estimateA.status, 'Saved')

const clearedResponse = await clearSelectedEstimate({ ...project, selectedEstimateId: 'estimate-a' }, {
  updateProject: async (id, updates) => ({ data: { id, ...updates }, error: null }),
})
assert.equal(clearedResponse.data.selectedEstimateId, null)

assert.equal(sumUnambiguousEstimateValues([estimateA, estimateB]), 0)
assert.equal(sumUnambiguousEstimateValues([estimateA, estimateB], [{ ...project, selectedEstimateId: 'estimate-a' }]), 8500)
assert.equal(sumUnambiguousEstimateValues([estimateA]), 8500)

console.log('Estimate alternatives foundation validation passed.')

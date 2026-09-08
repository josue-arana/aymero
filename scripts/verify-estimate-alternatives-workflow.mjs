import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildDuplicatedEstimateDraft, buildNewEstimateOptionDraft, sumUnambiguousEstimateValues } from '../src/utils/estimateAlternatives.js'

const project = { id: 'project-1', leadId: 'lead-1', clientId: 'client-1', projectTitle: 'Kitchen' }
const original = {
  id: 'estimate-original',
  number: 'EST-001',
  projectId: 'project-1',
  optionName: 'Premium',
  publicShareToken: 'old-token',
  status: 'Sent',
  total: 1200,
  summary: 'Premium scope',
  lineItems: [{ name: 'Cabinets', amount: 1200 }],
  scopeAssistantState: { clientVersion: 'must-not-copy' },
}
const fresh = buildNewEstimateOptionDraft({ project })
assert.equal(fresh.status, 'Draft')
assert.equal(fresh.total, 0)
assert.deepEqual(fresh.lineItems, [])
assert.equal(fresh.optionName, null)
assert.ok(fresh.publicShareToken)

const duplicate = buildDuplicatedEstimateDraft({ project, estimate: original })
assert.equal(duplicate.id, undefined)
assert.equal(duplicate.number, undefined)
assert.equal(duplicate.status, 'Draft')
assert.equal(duplicate.optionName, original.optionName)
assert.notEqual(duplicate.publicShareToken, original.publicShareToken)
assert.deepEqual(duplicate.scopeAssistantState, {})
assert.deepEqual(duplicate.lineItems, original.lineItems)

assert.equal(sumUnambiguousEstimateValues([
  { id: 'a', projectId: 'project-1', total: 100 },
  { id: 'b', projectId: 'project-1', total: 200 },
  { id: 'c', projectId: 'project-2', total: 300 },
], [project, { id: 'project-2' }]), 300)
assert.equal(sumUnambiguousEstimateValues([
  { id: 'a', projectId: 'project-1', total: 100 },
  { id: 'b', projectId: 'project-1', total: 200 },
], [{ ...project, selectedEstimateId: 'b' }]), 200)

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const projectSource = fs.readFileSync(new URL('../src/pages/ProjectDetailPage.jsx', import.meta.url), 'utf8')
const builderSource = fs.readFileSync(new URL('../src/pages/EstimateBuilderPage.jsx', import.meta.url), 'utf8')
assert.match(appSource, /createEstimateOption/)
assert.match(appSource, /duplicateEstimateOption/)
assert.match(appSource, /createNew = false/)
assert.match(appSource, /selectEstimateForProject/)
assert.match(projectSource, /getEstimatesForProject/)
assert.match(projectSource, /navigate\(`\/estimates\/\$\{estimate\.id\}`/)
assert.match(builderSource, /estimateOptionName/)

console.log('estimate alternatives workflow verification passed')

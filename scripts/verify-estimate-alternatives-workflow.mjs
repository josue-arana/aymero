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
const leadSource = fs.readFileSync(new URL('../src/pages/LeadDetailPage.jsx', import.meta.url), 'utf8')
const namingModalSource = fs.readFileSync(new URL('../src/components/estimates/CreateAnotherEstimateModal.jsx', import.meta.url), 'utf8')
const migrationSource = fs.readFileSync(new URL('../supabase/migrations/20260907090000_add_estimate_options_selection_foundation.sql', import.meta.url), 'utf8')
const schemaSource = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
assert.match(appSource, /createEstimateOption/)
assert.match(appSource, /duplicateEstimateOption/)
assert.match(appSource, /createNew = false/)
assert.match(appSource, /selectEstimateForProject/)
assert.match(projectSource, /getEstimatesForProject/)
assert.match(projectSource, /navigate\(`\/estimates\/\$\{estimate\.id\}`/)
assert.doesNotMatch(builderSource, /id="estimate-option-name"/)
assert.doesNotMatch(builderSource, /t\('estimateOptionNameHelp'\)/)
assert.match(leadSource, /CreateAnotherEstimateModal/)
assert.match(leadSource, /leadEstimateRecords\.length === 0/)
assert.match(leadSource, /currentEstimateName/)
assert.match(leadSource, /newEstimateName/)
assert.match(namingModalSource, /existingEstimateCount === 1/)
assert.match(namingModalSource, /currentEstimateName/)
assert.match(namingModalSource, /newEstimateName/)
assert.match(appSource, /draft\.optionName = String\(options\.newEstimateName \|\| ''\)\.trim\(\) \|\| null/)
assert.match(appSource, /currentEstimate\?\.id && currentEstimateName !== previousCurrentEstimateName/)
assert.match(migrationSource, /add column if not exists option_name text/)
assert.match(schemaSource, /option_name text/)

console.log('estimate alternatives workflow verification passed')

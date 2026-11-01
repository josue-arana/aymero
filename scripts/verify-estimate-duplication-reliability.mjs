import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDuplicatedEstimateDraft } from '../src/utils/estimateAlternatives.js'

const localServiceSource = readFileSync(new URL('../src/services/local/estimatesLocalService.js', import.meta.url), 'utf8')
const supabaseServiceSource = readFileSync(new URL('../src/services/supabase/estimatesSupabaseService.js', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const builderSource = readFileSync(new URL('../src/pages/EstimateBuilderPage.jsx', import.meta.url), 'utf8')

const project = {
  id: 'project-duplicate-1',
  leadId: 'lead-duplicate-1',
  clientId: 'client-duplicate-1',
  projectTitle: 'Kitchen renovation',
}

const original = {
  id: 'estimate-original',
  number: 'EST-2026-001',
  contractorId: 'contractor-1',
  projectId: project.id,
  leadId: project.leadId,
  clientId: project.clientId,
  title: 'Kitchen renovation estimate',
  projectTitle: 'Kitchen renovation',
  summary: '**Remove cabinets**\n- Install new cabinets',
  scopeOfWork: '**Remove cabinets**\n- Install new cabinets',
  pricingMode: 'detailed',
  lineItems: [{
    id: 'item-1',
    title: '**Cabinets**',
    description: '- Remove old cabinets\n- Install new cabinets',
    amount: 12500,
    quantity: 1,
    materialsIncluded: true,
    materialsStatus: 'materials_included',
    displayOrder: 0,
    contentBlocks: [{ type: 'paragraph', text: 'preserve structure' }],
  }],
  subtotal: 12500,
  discountAmount: 250,
  taxAmount: 0,
  total: 12250,
  depositPercentage: 50,
  materialsIncluded: true,
  paymentTerms: 'Down payment of $6,125 with remaining balance due weekly.',
  estimateLanguage: 'es',
  optionName: 'Premium',
  publicShareToken: 'source-token',
  status: 'Sent',
  sentAt: '2026-10-01T00:00:00.000Z',
  approvedAt: '2026-10-02T00:00:00.000Z',
  customerResponseAt: '2026-10-03T00:00:00.000Z',
  scopeAssistantState: {
    approvalSourceFingerprint: 'must-not-copy',
    clientScope: 'old translated version',
  },
}

const duplicate = buildDuplicatedEstimateDraft({ project, estimate: original })

assert.equal(duplicate.id, undefined)
assert.equal(duplicate.number, undefined)
assert.equal(duplicate.contractorId, undefined)
assert.equal(duplicate.projectId, project.id)
assert.equal(duplicate.leadId, project.leadId)
assert.equal(duplicate.clientId, project.clientId)
assert.equal(duplicate.title, original.title)
assert.equal(duplicate.summary, original.summary)
assert.equal(duplicate.pricingMode, original.pricingMode)
assert.deepEqual(duplicate.lineItems, original.lineItems)
assert.notEqual(duplicate.lineItems, original.lineItems)
assert.notEqual(duplicate.lineItems[0], original.lineItems[0])
assert.notEqual(duplicate.lineItems[0].contentBlocks, original.lineItems[0].contentBlocks)
assert.equal(duplicate.total, original.total)
assert.equal(duplicate.subtotal, original.subtotal)
assert.equal(duplicate.discountAmount, original.discountAmount)
assert.equal(duplicate.depositPercentage, original.depositPercentage)
assert.equal(duplicate.paymentTerms, original.paymentTerms)
assert.equal(duplicate.estimateLanguage, original.estimateLanguage)
assert.equal(duplicate.optionName, original.optionName)
assert.notEqual(duplicate.publicShareToken, original.publicShareToken)
assert.equal(duplicate.status, 'Draft')
assert.deepEqual(duplicate.scopeAssistantState, {})
assert.equal(duplicate.customerResponseAt, undefined)
assert.equal(duplicate.sentAt, undefined)

duplicate.lineItems[0].contentBlocks[0].text = 'changed clone only'
assert.equal(original.lineItems[0].contentBlocks[0].text, 'preserve structure')

assert.match(localServiceSource, /const estimateWithoutLegacyLineItems = \{ \.\.\.estimate \}/)
assert.match(localServiceSource, /lineItems: normalizeEstimateLineItemsForStorage\(lineItemsInput/)
assert.match(supabaseServiceSource, /payload\.project_id = readField\(estimate, \['projectId', 'project_id'\]\) \|\| null/)
assert.match(supabaseServiceSource, /payload\.scope_of_work = normalizeEstimateFormattedTextForStorage\(scopeInput\) \|\| null/)
assert.match(supabaseServiceSource, /payload\.line_items = lineItems \|\| \[\]/)
assert.match(supabaseServiceSource, /payload\.total_amount = toNullableNumber\(totalInput\)/)
assert.match(supabaseServiceSource, /payload\.deposit_percentage = /)
assert.match(supabaseServiceSource, /payload\.payment_terms = readField\(estimate, \['paymentTerms', 'payment_terms'\]\) \|\| null/)
assert.match(supabaseServiceSource, /payload\.estimate_language = normalizeSupportedLanguageOrEmpty\(estimateLanguageInput\) \|\| null/)
assert.match(supabaseServiceSource, /payload\.option_name = normalizeOptionalOptionName\(optionNameInput\)/)
assert.match(supabaseServiceSource, /return \{[\s\S]*?lineItems,[\s\S]*?pricingMode: resolveEstimatePricingMode\(row\?\.pricing_mode, lineItems\)/)
assert.match(builderSource, /const sourceEstimate = isDraftDirty\s*\? await persistEstimate\(\{\}, \{ silent: true \}\)\s*:\s*savedEstimate/)
assert.match(builderSource, /return onDuplicateEstimate\?\.\(sourceEstimate, \{ navigationContext \}\)/)
assert.match(appSource, /buildDuplicatedEstimateDraft\(\{ project, lead, estimate: estimateRecord \}\)/)
assert.match(appSource, /saveEstimate\(project\.id, buildDuplicatedEstimateDraft\(\{ project, lead, estimate: estimateRecord \}\), \{ createNew: true, silent: true \}\)/)
assert.match(appSource, /navigate\(`\/estimates\/\$\{duplicated\.id\}`/)

const simpleDuplicate = buildDuplicatedEstimateDraft({
  project,
  estimate: {
    ...original,
    pricingMode: 'simple',
    total: 8750,
    subtotal: 8750,
    discountAmount: 0,
    taxAmount: 0,
  },
})
assert.equal(simpleDuplicate.pricingMode, 'simple')
assert.deepEqual(simpleDuplicate.lineItems, [])
assert.equal(simpleDuplicate.total, 8750)
assert.equal(simpleDuplicate.paymentTerms, original.paymentTerms)

console.log('Estimate duplication reliability verification passed.')

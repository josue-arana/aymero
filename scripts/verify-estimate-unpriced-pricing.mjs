import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ensureNormalizedEstimateDocument,
  isEstimateFullyPriced,
  isEstimatePriceEntered,
  normalizeEstimateDocument,
  normalizeEstimateLineItemsForStorage,
  readEstimateTotalValue,
  resolveEstimateLineItemAmount,
} from '../src/utils/estimateDocument.js'
import { buildDuplicatedEstimateDraft, buildNewEstimateOptionDraft } from '../src/utils/estimateAlternatives.js'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const builderSource = read('src/pages/EstimateBuilderPage.jsx')
const documentSource = read('src/components/estimates/EstimatePdfTemplate.jsx')
const publicEstimateSource = read('src/pages/PublicEstimatePage.jsx')
const supabaseServiceSource = read('src/services/supabase/estimatesSupabaseService.js')
const appSource = read('src/App.jsx')
const english = read('src/translations/en.js')
const spanish = read('src/translations/es.js')
const migration = read('supabase/migrations/20261031090000_allow_unpriced_estimates.sql')

assert.equal(isEstimatePriceEntered(null), false)
assert.equal(isEstimatePriceEntered(undefined), false)
assert.equal(isEstimatePriceEntered(''), false)
assert.equal(isEstimatePriceEntered('invalid'), false)
assert.equal(isEstimatePriceEntered(0), true)
assert.equal(isEstimatePriceEntered('0'), true)
assert.equal(isEstimatePriceEntered(1250), true)

const blankSimple = normalizeEstimateDocument({ pricingMode: 'simple', total: null, subtotal: null })
assert.equal(blankSimple.simpleTotal, null)
assert.equal(blankSimple.totals.subtotal, null)
assert.equal(blankSimple.totals.total, null)
assert.equal(normalizeEstimateDocument({ pricingMode: 'simple', total: 0 }).totals.total, 0)
assert.equal(normalizeEstimateDocument({ pricingMode: 'simple', total: 1250 }).totals.total, 1250)
assert.equal(readEstimateTotalValue({ total: null, totalAmount: 0 }), null)
assert.equal(buildNewEstimateOptionDraft({ project: { id: 'project-1' } }).total, null)

const mixedItems = normalizeEstimateLineItemsForStorage([
  { title: 'First item', description: 'Install item one', amount: 125 },
  { title: 'Second item', description: 'Install item two', amount: null },
])
assert.equal(mixedItems[0].amount, 125)
assert.equal(mixedItems[1].amount, null)
const mixedModel = normalizeEstimateDocument({ pricingMode: 'detailed', lineItems: mixedItems, total: null, subtotal: null })
assert.equal(mixedModel.totals.subtotal, null)
assert.equal(mixedModel.totals.total, null)
assert.equal(mixedModel.workItems[1].amount, null)
assert.equal(isEstimateFullyPriced({ pricingMode: 'detailed', lineItems: mixedItems }), false)

const completeItems = normalizeEstimateLineItemsForStorage([
  { title: 'Zero-dollar item', description: 'No charge', amount: 0 },
  { title: 'Measured item', description: 'Install measured work', quantity: 2, rate: 50 },
])
assert.equal(completeItems[0].amount, 0)
assert.equal(completeItems[1].amount, 100)
assert.equal(resolveEstimateLineItemAmount({ quantity: 2, rate: 50 }), 100)
assert.equal(resolveEstimateLineItemAmount({ amount: null, quantity: 2, rate: 50 }), null)
const completeModel = normalizeEstimateDocument({ pricingMode: 'detailed', lineItems: completeItems })
assert.equal(completeModel.totals.subtotal, 100)
assert.equal(completeModel.totals.total, 100)
assert.equal(isEstimateFullyPriced({ pricingMode: 'detailed', lineItems: completeItems }), true)
assert.equal(isEstimateFullyPriced({ pricingMode: 'simple', total: 0 }), true)
assert.equal(isEstimateFullyPriced({ pricingMode: 'simple', total: null }), false)
assert.equal(ensureNormalizedEstimateDocument(blankSimple).totals.total, null)

const duplicate = buildDuplicatedEstimateDraft({
  project: { id: 'project-2' },
  estimate: {
    pricingMode: 'detailed',
    total: null,
    lineItems: mixedItems,
  },
})
assert.equal(duplicate.total, null)
assert.deepEqual(duplicate.lineItems.map((item) => item.amount), [125, null])
assert.notEqual(duplicate.lineItems, mixedItems)
const zeroDuplicate = buildDuplicatedEstimateDraft({ project: {}, estimate: { pricingMode: 'simple', total: 0 } })
assert.equal(zeroDuplicate.total, 0)

assert.match(builderSource, /createEmptyEstimateLineItem\(\)/)
assert.match(builderSource, /sanitizedValue === '' \|\| sanitizedValue === '\.' \? null : Number\(sanitizedValue\)/)
assert.match(builderSource, /const estimateTotal = isDetailedPricing \? lineTotal : total/)
assert.match(builderSource, /formatEstimateCurrency\(estimateTotal\)/)
assert.match(documentSource, /item\?\.amount === null \|\| item\?\.amount === undefined/)
assert.match(documentSource, /documentTotal === null \|\| documentTotal === undefined/)
assert.match(publicEstimateSource, /total: readEstimateTotalValue\(estimate\)/)
assert.match(supabaseServiceSource, /function toNullableNumber\(value\)/)
assert.match(supabaseServiceSource, /total: toNullableNumber\(row\?\.total_amount\)/)
assert.match(supabaseServiceSource, /payload\.total_amount = toNullableNumber\(totalInput\)/)
assert.match(appSource, /isEstimateFullyPriced\(/)
assert.match(migration, /alter column total_amount drop not null/i)
assert.match(english, /"estimatePricingRequiredForContract": "Enter prices/)
assert.match(spanish, /"estimatePricingRequiredForContract": "Ingresa los precios/)

console.log('Unpriced Estimate pricing verification passed.')

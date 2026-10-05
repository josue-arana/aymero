import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ESTIMATE_PRICING_DETAILED,
  hasMeaningfulEstimateContent,
  hasMeaningfulEstimateLineItemContent,
  normalizeEstimateDocument,
  normalizeEstimateLineItemsForStorage,
  shouldBypassScopeAssistantForDetailedEstimate,
} from '../src/utils/estimateDocument.js'

const structuredItem = {
  id: 'item-1',
  title: 'Decorative Wall Below Staircase',
  description: '- Remove existing finish\n- Install new decorative wall finish',
  amount: 1350,
  quantity: 1,
  materialsIncluded: true,
}

const storedItems = normalizeEstimateLineItemsForStorage([structuredItem])
assert.equal(storedItems[0].title, structuredItem.title)
assert.equal(storedItems[0].description, structuredItem.description)
assert.equal(storedItems[0].name, `${structuredItem.title}\n${structuredItem.description}`)
assert.equal(storedItems[0].amount, structuredItem.amount)
assert.equal(storedItems[0].quantity, structuredItem.quantity)
assert.equal(storedItems[0].materialsIncluded, true)

const estimateDocument = normalizeEstimateDocument({
  pricingMode: ESTIMATE_PRICING_DETAILED,
  lineItems: storedItems,
})
assert.equal(estimateDocument.workItems[0].title, structuredItem.title)
assert.equal(estimateDocument.workItems[0].description, structuredItem.description)

const noTitleDocument = normalizeEstimateDocument({
  pricingMode: ESTIMATE_PRICING_DETAILED,
  lineItems: [{ description: 'Install the new finish', amount: 250, materialsIncluded: false }],
})
assert.equal(noTitleDocument.workItems[0].title, '')
assert.equal(noTitleDocument.workItems[0].description, 'Install the new finish')

const contractDocumentSource = readFileSync(
  fileURLToPath(new URL('../src/utils/contractDocument.js', import.meta.url)),
  'utf8',
)
assert.match(contractDocumentSource, /hasStructuredText/)
assert.match(contractDocumentSource, /\[item\?\.title, item\?\.description\]/)
assert.match(contractDocumentSource, /normalizeEstimateLineItemForDocument\(\{\n\s*\.\.\.item,/)
assert.doesNotMatch(contractDocumentSource, /name: rawText,/)

assert.equal(hasMeaningfulEstimateLineItemContent([{ title: 'Title only', description: '', amount: 100 }]), false)
assert.equal(hasMeaningfulEstimateLineItemContent([{ title: '', description: 'Work details', amount: 0 }]), true)
assert.equal(hasMeaningfulEstimateLineItemContent([{ name: 'Legacy one-line work item', amount: 100 }]), true)
assert.equal(hasMeaningfulEstimateContent({ scope: '', lineItems: [{ description: 'Work details' }] }), true)
assert.equal(hasMeaningfulEstimateContent({ scope: '', lineItems: [{ description: '' }] }), false)
assert.equal(shouldBypassScopeAssistantForDetailedEstimate({
  pricingMode: ESTIMATE_PRICING_DETAILED,
  scope: '',
  lineItems: [{ description: 'Work details' }],
}), true)
assert.equal(shouldBypassScopeAssistantForDetailedEstimate({
  pricingMode: ESTIMATE_PRICING_DETAILED,
  scope: '',
  lineItems: [{ title: 'Title only', description: '' }],
}), false)

console.log('Estimate detailed-title/detail-only validation passed.')

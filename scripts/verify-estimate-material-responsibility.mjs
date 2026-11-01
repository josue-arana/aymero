import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  ESTIMATE_LABOR_ONLY,
  ESTIMATE_MATERIALS_INCLUDED,
  ESTIMATE_MATERIALS_UNSPECIFIED,
  ESTIMATE_OWNER_SUPPLIED_MATERIALS,
  createEmptyEstimateLineItem,
  normalizeEstimateDocument,
  normalizeEstimateLineItemsForStorage,
} from '../src/utils/estimateDocument.js'
import { buildDuplicatedEstimateDraft } from '../src/utils/estimateAlternatives.js'

const freshItem = createEmptyEstimateLineItem()
assert.equal(freshItem.materialsStatus, ESTIMATE_MATERIALS_UNSPECIFIED)
assert.equal(freshItem.materialsIncluded, null)
assert.equal(freshItem.amount, null)

const specifiedCases = [
  {
    source: { materialsIncluded: true },
    status: ESTIMATE_MATERIALS_INCLUDED,
    included: true,
  },
  {
    source: { materialsIncluded: false },
    status: ESTIMATE_LABOR_ONLY,
    included: false,
  },
  {
    source: { materialsStatus: ESTIMATE_MATERIALS_UNSPECIFIED, materialsIncluded: null },
    status: ESTIMATE_MATERIALS_UNSPECIFIED,
    included: null,
  },
]

for (const { source, status, included } of specifiedCases) {
  const stored = normalizeEstimateLineItemsForStorage([{ title: 'Work', description: 'Install work', ...source }])[0]
  assert.equal(stored.materialsStatus, status)
  assert.equal(stored.materialsIncluded, included)
  const reloaded = normalizeEstimateLineItemsForStorage([stored])[0]
  assert.equal(reloaded.materialsStatus, status)
  assert.equal(reloaded.materialsIncluded, included)
}

const estimateItems = normalizeEstimateLineItemsForStorage([
  { id: 'included', title: 'Included work', description: 'Install fixtures', amount: 0, materialsIncluded: true },
  { id: 'labor', title: 'Labor work', description: 'Install trim', amount: 250, quantity: 2, materialsIncluded: false },
  { id: 'unknown', title: 'Unspecified work', description: 'Review materials onsite', amount: 100, materialsStatus: ESTIMATE_MATERIALS_UNSPECIFIED, materialsIncluded: null },
])
const duplicate = buildDuplicatedEstimateDraft({ project: { id: 'project-copy' }, estimate: { pricingMode: 'detailed', lineItems: estimateItems } })
assert.deepEqual(duplicate.lineItems.map(({ materialsStatus, materialsIncluded }) => ({ materialsStatus, materialsIncluded })), [
  { materialsStatus: ESTIMATE_MATERIALS_INCLUDED, materialsIncluded: true },
  { materialsStatus: ESTIMATE_LABOR_ONLY, materialsIncluded: false },
  { materialsStatus: ESTIMATE_MATERIALS_UNSPECIFIED, materialsIncluded: null },
])
assert.notEqual(duplicate.lineItems, estimateItems)
assert.deepEqual(estimateItems.map((item) => item.amount), [0, 250, 100])

const documentModel = normalizeEstimateDocument({
  pricingMode: 'detailed',
  lineItems: estimateItems,
  total: 350,
})

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })
try {
  const [
    { EstimatePdfTemplate },
    { normalizeContractWorkBreakdown, buildContractWorkBreakdownFromEstimate },
    { toSupabasePayload, toAppEstimate },
    localEstimateService,
  ] = await Promise.all([
    server.ssrLoadModule('/src/components/estimates/EstimatePdfTemplate.jsx'),
    server.ssrLoadModule('/src/utils/contractDocument.js'),
    server.ssrLoadModule('/src/services/supabase/estimatesSupabaseService.js'),
    server.ssrLoadModule('/src/services/local/estimatesLocalService.js'),
  ])
  const props = {
    company: { name: 'Test Company' },
    lead: { client: 'Test Client', projectTitle: 'Materials test' },
    estimateNumber: 'EST-TEST',
    estimateDate: '2026-10-31',
    documentModel,
    t: (key) => ({
      materialsIncludedTag: 'Materials Included',
      laborOnly: 'Labor Only',
      ownerSuppliedMaterials: 'Owner Supplied Materials',
    }[key] || key),
  }
  const englishHtml = renderToStaticMarkup(React.createElement(EstimatePdfTemplate, props))
  assert.match(englishHtml, /Materials Included/)
  assert.match(englishHtml, /Labor Only/)
  assert.match(englishHtml, /Unspecified work/)
  assert.equal((englishHtml.match(/ — /g) || []).length, 2)
  assert.match(englishHtml, /font-size:10\.25pt/)

  const spanishHtml = renderToStaticMarkup(React.createElement(EstimatePdfTemplate, {
    ...props,
    t: (key) => ({
      materialsIncludedTag: 'Materiales incluidos',
      laborOnly: 'Solo mano de obra',
      ownerSuppliedMaterials: 'Materiales suministrados por el propietario',
    }[key] || key),
  }))
  assert.match(spanishHtml, /Materiales incluidos/)
  assert.match(spanishHtml, /Solo mano de obra/)
  assert.doesNotMatch(spanishHtml, /No especificado/)

  const contractItems = buildContractWorkBreakdownFromEstimate({ lineItems: estimateItems })
  assert.deepEqual(contractItems.map((item) => ({ materialsStatus: item.materialsStatus, materialsIncluded: item.materialsIncluded })), [
    { materialsStatus: ESTIMATE_MATERIALS_INCLUDED, materialsIncluded: true },
    { materialsStatus: ESTIMATE_LABOR_ONLY, materialsIncluded: false },
    { materialsStatus: null, materialsIncluded: null },
  ])
  assert.equal(contractItems[1].amount, 250)
  assert.equal(contractItems[1].quantity, 2)
  assert.equal(contractItems[1].description, 'Install trim')
  assert.equal(estimateItems[1].materialsStatus, ESTIMATE_LABOR_ONLY)
  assert.equal(estimateItems[1].amount, 250)

  const savedLocal = await localEstimateService.create({ total: null, pricingMode: 'detailed', lineItems: estimateItems })
  assert.equal(savedLocal.data.total, null)
  assert.deepEqual(savedLocal.data.lineItems.map((item) => item.materialsStatus), [
    ESTIMATE_MATERIALS_INCLUDED,
    ESTIMATE_LABOR_ONLY,
    ESTIMATE_MATERIALS_UNSPECIFIED,
  ])

  const supabasePayload = toSupabasePayload('contractor-test', {
    total: null,
    pricingMode: 'detailed',
    lineItems: estimateItems,
  }, { isCreate: true })
  assert.equal(supabasePayload.total_amount, null)
  assert.deepEqual(supabasePayload.line_items.map((item) => item.materialsStatus), [
    ESTIMATE_MATERIALS_INCLUDED,
    ESTIMATE_LABOR_ONLY,
    ESTIMATE_MATERIALS_UNSPECIFIED,
  ])
  const reloadedEstimate = toAppEstimate({
    id: 'estimate-reloaded',
    total_amount: null,
    line_items: supabasePayload.line_items,
    pricing_mode: 'detailed',
    status: 'draft',
  })
  assert.equal(reloadedEstimate.total, null)
  assert.deepEqual(reloadedEstimate.lineItems.map((item) => item.materialsStatus), [
    ESTIMATE_MATERIALS_INCLUDED,
    ESTIMATE_LABOR_ONLY,
    ESTIMATE_MATERIALS_UNSPECIFIED,
  ])

  const legacyContractItem = normalizeContractWorkBreakdown([{
    title: 'Owner-supplied work',
    description: 'Install customer materials',
    amount: 0,
    materialsStatus: ESTIMATE_OWNER_SUPPLIED_MATERIALS,
    materialsIncluded: false,
  }])[0]
  assert.equal(legacyContractItem.materialsStatus, ESTIMATE_OWNER_SUPPLIED_MATERIALS)
  assert.equal(legacyContractItem.materialsIncluded, false)
} finally {
  await server.close()
}

console.log('Estimate material responsibility verification passed.')

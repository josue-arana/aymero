import assert from 'node:assert/strict'
import { createServer } from 'vite'
import {
  calculatePricedEstimateItemsSubtotal,
  isEstimateFullyPriced,
  normalizeEstimateDocument,
  normalizeEstimateLineItemsForStorage,
  resolveEstimatePricing,
  resolveEstimateLineItemAmount,
} from '../src/utils/estimateDocument.js'
import { buildDuplicatedEstimateDraft } from '../src/utils/estimateAlternatives.js'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })

try {
  const { toSupabasePayload, toAppEstimate } = await server.ssrLoadModule('/src/services/supabase/estimatesSupabaseService.js')
  const localEstimateService = await server.ssrLoadModule('/src/services/local/estimatesLocalService.js')
  const { normalizeContractWorkBreakdown } = await server.ssrLoadModule('/src/utils/contractDocument.js')
  const { buildContractEditorState } = await server.ssrLoadModule('/src/utils/contractEditorState.js')

  const enteredItems = normalizeEstimateLineItemsForStorage([
    { title: 'Fixed-price work', description: 'Install fixtures', amount: 120.25, quantity: 2 },
    { title: 'Legacy amount', description: 'Finish trim', amount: null, total: 79.75 },
  ])
  assert.deepEqual(enteredItems.map((item) => item.amount), [120.25, 79.75])
  assert.equal(resolveEstimateLineItemAmount({ amount: 0, total: 100, quantity: 3, rate: 50 }), 0)
  assert.equal(resolveEstimateLineItemAmount({ amount: null, quantity: 2, rate: 50 }), 100)
  assert.equal(resolveEstimateLineItemAmount({ amount: null }), null)
  assert.equal(calculatePricedEstimateItemsSubtotal([]), null)
  assert.equal(calculatePricedEstimateItemsSubtotal([
    { title: 'Unpriced work', amount: null },
    { title: 'Also unpriced', amount: '' },
  ]), null)

  const mixedPricedItems = normalizeEstimateLineItemsForStorage([
    { title: 'Door Seals', description: 'Install door seals', amount: 50 },
    { title: 'Drywall', description: 'Repair drywall', amount: 200 },
    { title: 'Other', description: 'Additional work', amount: 100 },
    { title: 'Unpriced work', description: 'Finish painting', amount: null },
  ])
  assert.equal(calculatePricedEstimateItemsSubtotal(mixedPricedItems), 350)
  assert.equal(isEstimateFullyPriced({ pricingMode: 'detailed', lineItems: mixedPricedItems }), false)
  assert.equal(normalizeEstimateDocument({ pricingMode: 'detailed', lineItems: mixedPricedItems }).totals.total, null)
  assert.equal(calculatePricedEstimateItemsSubtotal([
    { title: 'No-charge work', amount: 0 },
    { title: 'Priced work', amount: 25 },
  ]), 25)
  assert.equal(calculatePricedEstimateItemsSubtotal([{ title: 'No-charge work', amount: 0 }]), 0)
  assert.equal(calculatePricedEstimateItemsSubtotal([
    { title: 'Legacy total', amount: null, total: 25 },
    { title: 'Quantity rate', amount: null, quantity: 2, rate: 10 },
  ]), 45)
  assert.equal(calculatePricedEstimateItemsSubtotal([
    { title: 'Cleared work', amount: null },
  ]), null)
  const normalizedLegacyItem = normalizeEstimateLineItemsForStorage([
    { title: 'Legacy work', description: 'Older stored price', total: 25 },
  ])[0]
  assert.equal(normalizedLegacyItem.amount, 25)
  assert.equal(Object.hasOwn(normalizedLegacyItem, 'total'), false)
  assert.equal(calculatePricedEstimateItemsSubtotal([
    { ...normalizedLegacyItem, amount: null },
  ]), null)

  const builderSource = await (await import('node:fs/promises')).readFile(new URL('../src/pages/EstimateBuilderPage.jsx', import.meta.url), 'utf8')
  const appSource = await (await import('node:fs/promises')).readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const contractServiceSource = await (await import('node:fs/promises')).readFile(new URL('../src/services/supabase/contractsSupabaseService.js', import.meta.url), 'utf8')
  const contractTemplateSource = await (await import('node:fs/promises')).readFile(new URL('../src/components/contracts/ContractPdfTemplate.jsx', import.meta.url), 'utf8')
  const portalSummarySource = await (await import('node:fs/promises')).readFile(new URL('../src/components/portal/PortalSummary.jsx', import.meta.url), 'utf8')
  assert.match(builderSource, /resolveEstimatePricing\(/)
  assert.match(builderSource, /t\('pricedItemsSubtotal'\)/)
  assert.match(builderSource, /t\('someItemsUnpriced'\)/)
  assert.match(builderSource, /t\('finalEstimateTotal'\)/)
  assert.match(builderSource, /const estimateTotal = isDetailedPricing \? pricingResult\.authoritativeTotal : total/)

  const calculatedModel = normalizeEstimateDocument({ pricingMode: 'detailed', lineItems: enteredItems })
  assert.equal(calculatedModel.totals.subtotal, 200)
  assert.equal(calculatedModel.totals.total, 200)
  assert.equal(isEstimateFullyPriced({ pricingMode: 'detailed', lineItems: enteredItems }), true)

  const partialPricing = resolveEstimatePricing({
    pricingMode: 'detailed',
    lineItems: mixedPricedItems,
    additionalScopeChargeAmount: 50,
    additionalScopeChargeDescription: 'Disposal and haul-away',
    discountAmount: 10,
    taxAmount: 5,
  })
  assert.equal(partialPricing.pricedItemsSubtotal, 350)
  assert.equal(partialPricing.automaticFinalTotal, null)
  assert.equal(partialPricing.authoritativeTotal, null)
  assert.equal(partialPricing.isFinalizable, false)

  const completePricing = resolveEstimatePricing({
    pricingMode: 'detailed', lineItems: enteredItems,
    additionalScopeChargeAmount: 25,
    additionalScopeChargeDescription: 'Permit and disposal',
    discountAmount: 10, taxAmount: 5,
  })
  assert.equal(completePricing.authoritativeTotal, 220)
  assert.equal(completePricing.isFinalizable, true)
  const overridePricing = resolveEstimatePricing({
    pricingMode: 'detailed', lineItems: mixedPricedItems,
    manualTotalOverrideEnabled: true, manualTotalOverrideAmount: 500,
    additionalScopeChargeAmount: 50, additionalScopeChargeDescription: 'Haul-away',
  })
  assert.equal(overridePricing.authoritativeTotal, 500)
  assert.equal(overridePricing.isManualFixedTotal, true)
  assert.equal(overridePricing.pricedItemsSubtotal, 350)
  assert.equal(resolveEstimatePricing({
    pricingMode: 'detailed', lineItems: mixedPricedItems,
    manualTotalOverrideEnabled: true, manualTotalOverrideAmount: null,
  }).authoritativeTotal, null)
  assert.equal(resolveEstimatePricing({
    pricingMode: 'detailed', lineItems: mixedPricedItems,
    manualTotalOverrideEnabled: true, manualTotalOverrideAmount: 0,
  }).isFinalizable, true)
  assert.equal(resolveEstimatePricing({
    pricingMode: 'detailed', lineItems: enteredItems,
    manualTotalOverrideEnabled: true, manualTotalOverrideAmount: 500,
    additionalScopeChargeAmount: 75, additionalScopeChargeDescription: 'Haul-away',
  }).authoritativeTotal, 500)
  assert.equal(resolveEstimatePricing({
    pricingMode: 'detailed', lineItems: enteredItems,
    additionalScopeChargeAmount: 75,
  }).requiresAdditionalChargeDescription, true)
  assert.equal(resolveEstimatePricing({
    pricingMode: 'detailed', lineItems: enteredItems,
    additionalScopeChargeAmount: 75,
  }).isFinalizable, false)

  const payload = toSupabasePayload('contractor-test', {
    pricingMode: 'detailed',
    lineItems: enteredItems,
    subtotal: calculatedModel.totals.subtotal,
    total: calculatedModel.totals.total,
  }, { isCreate: true })
  assert.equal(payload.subtotal, 200)
  assert.equal(payload.total_amount, 200)
  assert.equal(payload.additional_scope_charge_amount, null)
  assert.equal(payload.manual_total_override_enabled, false)
  const reloaded = toAppEstimate({
    id: 'estimate-calculation-test',
    status: 'draft',
    pricing_mode: 'detailed',
    line_items: payload.line_items,
    subtotal: payload.subtotal,
    total_amount: payload.total_amount,
  })
  assert.equal(reloaded.total, 200)
  assert.deepEqual(reloaded.lineItems.map((item) => item.amount), [120.25, 79.75])

  const duplicated = buildDuplicatedEstimateDraft({ estimate: reloaded })
  assert.equal(duplicated.total, 200)
  assert.deepEqual(duplicated.lineItems.map((item) => item.amount), [120.25, 79.75])

  const pricedOverridePayload = toSupabasePayload('contractor-test', {
    pricingMode: 'detailed', lineItems: mixedPricedItems, total: 500,
    additionalScopeChargeAmount: 50, additionalScopeChargeDescription: 'Haul-away',
    manualTotalOverrideEnabled: true, manualTotalOverrideAmount: 500,
  }, { isCreate: true })
  assert.equal(pricedOverridePayload.total_amount, 500)
  assert.equal(pricedOverridePayload.additional_scope_charge_amount, 50)
  assert.equal(pricedOverridePayload.manual_total_override_amount, 500)
  const pricedOverrideReload = toAppEstimate({
    line_items: pricedOverridePayload.line_items,
    total_amount: pricedOverridePayload.total_amount,
    additional_scope_charge_amount: pricedOverridePayload.additional_scope_charge_amount,
    additional_scope_charge_description: pricedOverridePayload.additional_scope_charge_description,
    manual_total_override_enabled: pricedOverridePayload.manual_total_override_enabled,
    manual_total_override_amount: pricedOverridePayload.manual_total_override_amount,
  })
  assert.equal(pricedOverrideReload.total, 500)
  assert.equal(pricedOverrideReload.manualTotalOverrideEnabled, true)
  assert.equal(pricedOverrideReload.additionalScopeChargeAmount, 50)
  const overrideDuplicate = buildDuplicatedEstimateDraft({ estimate: pricedOverrideReload })
  assert.equal(overrideDuplicate.manualTotalOverrideEnabled, true)
  assert.equal(overrideDuplicate.manualTotalOverrideAmount, 500)
  assert.equal(overrideDuplicate.additionalScopeChargeAmount, 50)
  const localSavedEstimate = (await localEstimateService.create({
    pricingMode: 'detailed', lineItems: mixedPricedItems, total: 500,
    additionalScopeChargeAmount: 50, additionalScopeChargeDescription: 'Haul-away',
    manualTotalOverrideEnabled: true, manualTotalOverrideAmount: 500,
  })).data
  assert.equal(localSavedEstimate.manualTotalOverrideEnabled, true)
  assert.equal(localSavedEstimate.manualTotalOverrideAmount, 500)
  assert.equal(localSavedEstimate.additionalScopeChargeDescription, 'Haul-away')

  const zeroItems = normalizeEstimateLineItemsForStorage([
    { title: 'No-charge item', description: 'No charge', amount: 0 },
  ])
  assert.equal(normalizeEstimateDocument({ pricingMode: 'detailed', lineItems: zeroItems }).totals.total, 0)

  const partialItems = normalizeEstimateLineItemsForStorage([
    { title: 'Priced work', description: 'Install hardware', amount: 100 },
    { title: 'Unpriced work', description: 'Paint finish', amount: null },
  ])
  const partialModel = normalizeEstimateDocument({ pricingMode: 'detailed', lineItems: partialItems })
  assert.equal(partialModel.totals.subtotal, 100)
  assert.equal(partialModel.totals.total, null)
  assert.equal(isEstimateFullyPriced({ pricingMode: 'detailed', lineItems: partialItems }), false)
  const partialPayload = toSupabasePayload('contractor-test', {
    pricingMode: 'detailed', lineItems: partialItems, subtotal: null, total: null,
  }, { isCreate: true })
  assert.equal(partialPayload.total_amount, null)
  assert.equal(toAppEstimate({ total_amount: partialPayload.total_amount, line_items: partialPayload.line_items }).total, null)

  const simplePayload = toSupabasePayload('contractor-test', { pricingMode: 'simple', total: 345.67 }, { isCreate: true })
  assert.equal(simplePayload.total_amount, 345.67)
  const blankSimplePayload = toSupabasePayload('contractor-test', { pricingMode: 'simple', total: null }, { isCreate: true })
  assert.equal(blankSimplePayload.total_amount, null)

  const schemaSource = await (await import('node:fs/promises')).readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  const estimateTable = schemaSource.match(/create table estimates \(([\s\S]*?)\n\);/i)?.[1] || ''
  assert.match(estimateTable, /subtotal numeric\(12,2\)/i)
  assert.match(estimateTable, /discount_amount numeric\(12,2\)/i)
  assert.match(estimateTable, /tax_amount numeric\(12,2\)/i)
  assert.match(estimateTable, /total_amount numeric\(12,2\)/i)
  assert.match(estimateTable, /additional_scope_charge_amount numeric\(12,2\)/i)
  assert.match(estimateTable, /manual_total_override_enabled boolean not null default false/i)
  assert.match(estimateTable, /manual_total_override_amount numeric\(12,2\)/i)

  const migration = await (await import('node:fs/promises')).readFile(new URL('../supabase/migrations/20261102090000_add_estimate_pricing_override_and_scope_charge.sql', import.meta.url), 'utf8')
  for (const field of ['additional_scope_charge_amount', 'additional_scope_charge_description', 'manual_total_override_enabled', 'manual_total_override_amount']) {
    assert.match(migration, new RegExp(`add column ${field}`, 'i'))
  }

  const fixedDocument = normalizeEstimateDocument({
    pricingMode: 'detailed', lineItems: mixedPricedItems,
    manualTotalOverrideEnabled: true, manualTotalOverrideAmount: 500,
    additionalScopeChargeAmount: 50, additionalScopeChargeDescription: 'Haul-away',
  })
  assert.equal(fixedDocument.totals.total, 500)
  assert.equal(fixedDocument.totals.subtotal, null)
  assert.equal(fixedDocument.workItems[3].amount, null)
  assert.equal(fixedDocument.pricing.isManualFixedTotal, true)
  const fixedReloadDocument = toAppEstimate({
    pricing_mode: 'detailed', line_items: pricedOverridePayload.line_items,
    total_amount: 500, additional_scope_charge_amount: 50,
    additional_scope_charge_description: 'Haul-away', manual_total_override_enabled: true,
    manual_total_override_amount: 500,
  })
  const contractEditorState = buildContractEditorState({
    savedContract: {}, estimate: fixedReloadDocument, contractTotal: 500,
  })
  assert.equal(contractEditorState.isFixedTotalQuote, true)
  assert.equal(contractEditorState.additionalScopeChargeAmount, 50)
  const legacySavedContractState = buildContractEditorState({
    savedContract: { id: 'legacy-contract' }, estimate: fixedReloadDocument, contractTotal: 450,
  })
  assert.equal(legacySavedContractState.isFixedTotalQuote, false)
  assert.equal(legacySavedContractState.additionalScopeChargeAmount, null)
  const nullZeroBreakdown = normalizeContractWorkBreakdown([
    { title: 'Unpriced', description: 'Still not allocated', amount: null },
    { title: 'No charge', description: 'Explicit free item', amount: 0 },
  ])
  assert.equal(nullZeroBreakdown[0].amount, null)
  assert.equal(nullZeroBreakdown[1].amount, 0)

  const publicEndpoint = await (await import('node:fs/promises')).readFile(new URL('../supabase/functions/super-endpoint/index.ts', import.meta.url), 'utf8')
  assert.match(publicEndpoint, /total: row\.total_amount === null \|\| row\.total_amount === undefined \? null : Number\(row\.total_amount\)/)
  assert.match(publicEndpoint, /manualTotalOverrideEnabled: Boolean\(row\.manual_total_override_enabled\)/)
  const publicPage = await (await import('node:fs/promises')).readFile(new URL('../src/pages/PublicEstimatePage.jsx', import.meta.url), 'utf8')
  assert.match(publicPage, /manualTotalOverrideEnabled: Boolean\(estimate\.manualTotalOverrideEnabled\)/)
  assert.match(portalSummarySource, /total: readEstimateTotalValue\(estimate\)/)
  assert.match(portalSummarySource, /documentModel: normalizeEstimateDocument\(/)
  assert.match(portalSummarySource, /manualTotalOverrideEnabled: Boolean\(estimate\?\.manualTotalOverrideEnabled/)
  assert.match(appSource, /submittedTotal !== undefined[\s\S]{0,180}toSafeNumber\(submittedTotal\)/)
  assert.match(appSource, /if \(!pricing\.isFinalizable\)[\s\S]{0,400}pricing_incomplete/)
  assert.match(appSource, /hasEstimateData\(baseEstimate\) && !hasEstimateData\(persistedEstimate\)/)
  assert.match(contractServiceSource, /pricingContext:[\s\S]*isFixedTotalQuote:[\s\S]*additionalScopeChargeAmount:[\s\S]*additionalScopeChargeDescription:/)
  assert.match(contractServiceSource, /additionalScopeChargeAmount: toNullableNumber\(parsed\.pricingContext\?\.additionalScopeChargeAmount\)/)
  assert.match(contractTemplateSource, /item\?\.amount === null \|\| item\?\.amount === undefined \|\| item\?\.amount === '' \? '' : currency\.format\(Number\(item\.amount\)\)/)
  assert.match(contractTemplateSource, /fixedTotalIncludesAdditionalScope/)

  console.log('Estimate pricing calculation, persistence, and nullable-total validation passed.')
} finally {
  await server.close()
}

const bulletLinePattern = /^\s*([-*•])\s*(.*)$/
export const ESTIMATE_MATERIALS_INCLUDED = 'materials_included'
export const ESTIMATE_LABOR_ONLY = 'labor_only'
export const ESTIMATE_OWNER_SUPPLIED_MATERIALS = 'owner_supplied_materials'
export const ESTIMATE_PRICING_SIMPLE = 'simple'
export const ESTIMATE_PRICING_DETAILED = 'detailed'
export const ESTIMATE_ITEM_PRICING_AMOUNT_ONLY = 'amountOnly'
export const ESTIMATE_ITEM_PRICING_QUANTITY_RATE = 'quantityRate'

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeText(value) {
  return typeof value === 'string' ? value : String(value || '')
}

function hasFiniteStoredNumber(value) {
  return value !== ''
    && value !== null
    && value !== undefined
    && Number.isFinite(Number(value))
}

function nearlyEqual(left, right) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false

  return Math.abs(leftNumber - rightNumber) <= Math.max(0.005, Math.abs(rightNumber) * 0.000001)
}

function normalizeItemPricingDisplayMode(value) {
  const normalizedValue = normalizeText(value).trim().toLowerCase().replace(/[\s_-]+/g, '')

  if (normalizedValue === 'amountonly') return ESTIMATE_ITEM_PRICING_AMOUNT_ONLY
  if (normalizedValue === 'quantityrate') return ESTIMATE_ITEM_PRICING_QUANTITY_RATE
  return ''
}

/**
 * The current builder stores one amount and does not collect quantity/rate.
 * Quantity/rate columns are therefore reserved for records with both explicit
 * values and a meaningful multiplication. The ambiguous legacy shape
 * quantity=1, rate=total remains amount-only unless an explicit display marker
 * says those values were intentional.
 */
export function resolveEstimateItemPricingDisplayMode(item = {}, normalizedValues = {}) {
  const configuredMode = normalizeItemPricingDisplayMode(
    item?.pricingDisplayMode
      ?? item?.pricing_display_mode
      ?? item?.priceDisplayMode
      ?? item?.price_display_mode
  )

  if (configuredMode === ESTIMATE_ITEM_PRICING_AMOUNT_ONLY) {
    return ESTIMATE_ITEM_PRICING_AMOUNT_ONLY
  }

  const hasStoredQuantity = hasFiniteStoredNumber(item?.quantity)
  const hasStoredRate = hasFiniteStoredNumber(item?.rate)
  if (!hasStoredQuantity || !hasStoredRate) {
    return ESTIMATE_ITEM_PRICING_AMOUNT_ONLY
  }

  const quantity = toFiniteNumber(normalizedValues.quantity ?? item.quantity)
  const rate = toFiniteNumber(normalizedValues.rate ?? item.rate)
  const total = toFiniteNumber(
    normalizedValues.total
      ?? item?.total
      ?? item?.amount,
    quantity * rate
  )
  const hasMeaningfulCalculation = quantity > 0 && nearlyEqual(quantity * rate, total)

  if (!hasMeaningfulCalculation) {
    return ESTIMATE_ITEM_PRICING_AMOUNT_ONLY
  }

  if (configuredMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE) {
    return ESTIMATE_ITEM_PRICING_QUANTITY_RATE
  }

  const isAmbiguousSyntheticDefault = nearlyEqual(quantity, 1) && nearlyEqual(rate, total)

  return isAmbiguousSyntheticDefault
    ? ESTIMATE_ITEM_PRICING_AMOUNT_ONLY
    : ESTIMATE_ITEM_PRICING_QUANTITY_RATE
}

export function getEstimateWorkBreakdownPricingDisplayMode(workItems = []) {
  return workItems.some((item) => item?.pricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE)
    ? ESTIMATE_ITEM_PRICING_QUANTITY_RATE
    : ESTIMATE_ITEM_PRICING_AMOUNT_ONLY
}

export function isValidExplicitEstimateItem(item = {}) {
  const itemText = [
    item?.name,
    item?.title,
    item?.description,
  ].map(normalizeText).join('').trim()
  const hasStoredAmount = [item?.amount, item?.total, item?.rate].some((value) => (
    value !== ''
    && value !== null
    && value !== undefined
    && Number.isFinite(Number(value))
    && Number(value) !== 0
  ))

  return Boolean(itemText || hasStoredAmount)
}

function isLegacySyntheticScopeItem(item = {}) {
  const itemId = normalizeText(item?.id)
  const itemSource = normalizeText(
    item?.source
      ?? item?.sourceType
      ?? item?.source_type
      ?? item?.itemType
      ?? item?.item_type
  ).trim().toLowerCase()

  return itemId.startsWith('estimate-scope-')
    || ['synthetic_scope', 'scope_total', 'simple_total'].includes(itemSource)
}

export function getValidExplicitEstimateItems(lineItems = []) {
  return Array.isArray(lineItems)
    ? lineItems.filter((item) => !isLegacySyntheticScopeItem(item) && isValidExplicitEstimateItem(item))
    : []
}

export function resolveEstimatePricingMode(pricingMode, lineItems = []) {
  const normalizedMode = normalizeText(pricingMode).trim().toLowerCase()

  if (normalizedMode === ESTIMATE_PRICING_SIMPLE || normalizedMode === ESTIMATE_PRICING_DETAILED) {
    return normalizedMode
  }

  const explicitItems = getValidExplicitEstimateItems(lineItems)

  return explicitItems.length > 0 ? ESTIMATE_PRICING_DETAILED : ESTIMATE_PRICING_SIMPLE
}

export function normalizeEstimateRichText(value) {
  const rawText = normalizeText(value)
  if (!rawText) {
    return {
      rawText,
      blocks: [],
    }
  }

  const lines = rawText.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let paragraphLines = []
  let bulletItems = []

  function flushParagraph() {
    if (!paragraphLines.length) return

    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join('\n'),
      lines: paragraphLines,
    })
    paragraphLines = []
  }

  function flushBullets() {
    if (!bulletItems.length) return

    blocks.push({
      type: 'bulletList',
      items: bulletItems,
    })
    bulletItems = []
  }

  lines.forEach((line) => {
    const bulletMatch = line.match(bulletLinePattern)

    if (bulletMatch) {
      flushParagraph()
      bulletItems.push({
        text: bulletMatch[2],
        marker: bulletMatch[1],
      })
      return
    }

    flushBullets()

    if (!line.trim()) {
      flushParagraph()
      blocks.push({ type: 'lineBreak' })
      return
    }

    paragraphLines.push(line)
  })

  flushParagraph()
  flushBullets()

  return {
    rawText,
    blocks,
  }
}

function splitLegacyEstimateItemText(value) {
  const sourceText = normalizeText(value).trim()

  if (!sourceText) {
    return {
      title: '',
      description: '',
      detailLines: [],
    }
  }

  const [firstLine, ...remainingLines] = sourceText.split('\n')

  return {
    title: firstLine.trim(),
    description: remainingLines.join('\n'),
    // The current document presents every non-empty line after the title as a
    // bullet. Keeping this derived view preserves today's output while the
    // richer contentBlocks remain available to the next document design.
    detailLines: remainingLines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*•]\s*/, '').trim() || line),
  }
}

function normalizeEstimateMaterialsStatus(item = {}, fallbackMaterialsIncluded = false) {
  const configuredStatus = String(
    item?.materialsStatus
      ?? item?.materials_status
      ?? item?.materialStatus
      ?? item?.material_status
      ?? item?.materialsResponsibility
      ?? item?.materials_responsibility
      ?? ''
  ).trim().toLowerCase().replace(/[\s-]+/g, '_')

  if ([
    'owner_supplied',
    'owner_supplied_material',
    'owner_supplied_materials',
    'customer_supplied',
    'customer_supplied_materials',
  ].includes(configuredStatus)) {
    return ESTIMATE_OWNER_SUPPLIED_MATERIALS
  }

  if ([
    'labor',
    'labor_only',
    'materials_not_included',
    'not_included',
  ].includes(configuredStatus)) {
    return ESTIMATE_LABOR_ONLY
  }

  if ([
    'included',
    'materials_included',
    'contractor_supplied',
  ].includes(configuredStatus)) {
    return ESTIMATE_MATERIALS_INCLUDED
  }

  const included = typeof item?.materialsIncluded === 'boolean'
    ? item.materialsIncluded
    : typeof item?.materials_included === 'boolean'
      ? item.materials_included
      : Boolean(fallbackMaterialsIncluded)

  return included ? ESTIMATE_MATERIALS_INCLUDED : ESTIMATE_LABOR_ONLY
}

function normalizeEstimateWorkItem(item = {}, {
  displayOrder,
  fallbackMaterialsIncluded,
  fallbackTotal = 0,
  idPrefix = 'estimate-item',
} = {}) {
  const sourceText = normalizeText(item?.name).trim()
    || [normalizeText(item?.title).trim(), normalizeText(item?.description).trim()]
      .filter(Boolean)
      .join('\n')
  const textParts = splitLegacyEstimateItemText(sourceText)
  const quantity = toFiniteNumber(item?.quantity, 1)
  const storedTotal = item?.total ?? item?.amount
  const storedRate = item?.rate
  const total = toFiniteNumber(
    storedTotal,
    storedRate === undefined ? fallbackTotal : quantity * toFiniteNumber(storedRate)
  )
  const rate = toFiniteNumber(
    storedRate,
    quantity ? total / quantity : total
  )
  const pricingDisplayMode = resolveEstimateItemPricingDisplayMode(item, {
    quantity,
    rate,
    total,
  })
  const materialsStatus = normalizeEstimateMaterialsStatus(item, fallbackMaterialsIncluded)

  return {
    id: item?.id || `${idPrefix}-${displayOrder + 1}`,
    title: textParts.title,
    description: textParts.description,
    contentBlocks: normalizeEstimateRichText(sourceText).blocks,
    descriptionBlocks: normalizeEstimateRichText(textParts.description).blocks,
    detailLines: textParts.detailLines,
    pricingDisplayMode,
    quantity: pricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE ? quantity : null,
    rate: pricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE ? rate : null,
    total,
    materialsIncluded: materialsStatus === ESTIMATE_MATERIALS_INCLUDED,
    materialsStatus,
    displayOrder,
  }
}

export function normalizeEstimateDocument({
  pricingMode,
  scope = '',
  lineItems = [],
  total = 0,
  subtotal,
  discountAmount = 0,
  taxAmount = 0,
  materialsIncluded = false,
  messageFromContractor = '',
  validUntil = '',
} = {}) {
  const scopeText = normalizeText(scope)
  const contractorMessageText = normalizeText(messageFromContractor)
  const sourceItems = Array.isArray(lineItems) ? lineItems : []
  const normalizedPricingMode = resolveEstimatePricingMode(pricingMode, sourceItems)
  const explicitItems = getValidExplicitEstimateItems(sourceItems)
  const hasDetailedItems = normalizedPricingMode === ESTIMATE_PRICING_DETAILED && explicitItems.length > 0
  const normalizedTotal = toFiniteNumber(total)
  const workItems = hasDetailedItems
    ? explicitItems.map((item, index) => normalizeEstimateWorkItem(item, {
        displayOrder: index,
        fallbackMaterialsIncluded: materialsIncluded,
      }))
    : []
  const calculatedSubtotal = hasDetailedItems
    ? workItems.reduce((sum, item) => sum + item.total, 0)
    : normalizedTotal
  const workBreakdownPricingDisplayMode = getEstimateWorkBreakdownPricingDisplayMode(workItems)
  const scopeOfWork = {
    text: scopeText,
    contentBlocks: normalizeEstimateRichText(scopeText).blocks,
  }

  return {
    version: 1,
    pricingMode: normalizedPricingMode,
    scope: scopeOfWork,
    scopeOfWork,
    simpleTotal: normalizedPricingMode === ESTIMATE_PRICING_SIMPLE ? normalizedTotal : null,
    messageFromContractor: {
      text: contractorMessageText,
      contentBlocks: normalizeEstimateRichText(contractorMessageText).blocks,
    },
    validUntil: normalizeText(validUntil),
    workItems,
    totals: {
      subtotal: subtotal === undefined ? calculatedSubtotal : toFiniteNumber(subtotal),
      discountAmount: toFiniteNumber(discountAmount),
      taxAmount: toFiniteNumber(taxAmount),
      total: normalizedTotal,
    },
    defaults: {
      materialsIncluded: Boolean(materialsIncluded),
    },
    sections: {
      scope: {
        visible: Boolean(scopeText.trim()),
      },
      workBreakdown: {
        visible: normalizedPricingMode === ESTIMATE_PRICING_DETAILED && workItems.length > 0,
        pricingDisplayMode: workBreakdownPricingDisplayMode,
        showQuantityRateColumns: workBreakdownPricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE,
      },
      messageFromContractor: {
        visible: Boolean(contractorMessageText.trim()),
      },
    },
  }
}

export function ensureNormalizedEstimateDocument(documentModel, legacyInput = {}) {
  if (
    documentModel?.version === 1
    && Array.isArray(documentModel?.workItems)
    && documentModel?.scope
    && documentModel?.totals
  ) {
    const legacyWorkItems = getValidExplicitEstimateItems(documentModel.workItems)
    const normalizedPricingMode = resolveEstimatePricingMode(documentModel.pricingMode, legacyWorkItems)
    const normalizedWorkItems = normalizedPricingMode === ESTIMATE_PRICING_DETAILED
      ? legacyWorkItems
      : []
    const legacyMessageText = typeof documentModel.messageFromContractor === 'string'
      ? documentModel.messageFromContractor
      : normalizeText(documentModel?.messageFromContractor?.text)
    const legacySubtotal = documentModel.totals.subtotal === undefined
      ? normalizedPricingMode === ESTIMATE_PRICING_DETAILED
        ? normalizedWorkItems.reduce((sum, item) => sum + toFiniteNumber(item?.total), 0)
        : toFiniteNumber(documentModel?.simpleTotal ?? documentModel?.totals?.total)
      : toFiniteNumber(documentModel.totals.subtotal)
    const scopeOfWork = documentModel.scopeOfWork || documentModel.scope
    const normalizedDocumentWorkItems = normalizedWorkItems.map((item, index) => {
      const materialsStatus = normalizeEstimateMaterialsStatus(
        item,
        documentModel?.defaults?.materialsIncluded
      )
      const quantity = toFiniteNumber(item?.quantity, 1)
      const total = toFiniteNumber(item?.total)
      const rate = toFiniteNumber(item?.rate, quantity ? total / quantity : total)
      const pricingDisplayMode = resolveEstimateItemPricingDisplayMode(item, {
        quantity,
        rate,
        total,
      })

      return {
        ...item,
        contentBlocks: Array.isArray(item?.contentBlocks)
          ? item.contentBlocks
          : normalizeEstimateRichText([item?.title, item?.description].filter(Boolean).join('\n')).blocks,
        descriptionBlocks: Array.isArray(item?.descriptionBlocks)
          ? item.descriptionBlocks
          : normalizeEstimateRichText(item?.description).blocks,
        detailLines: Array.isArray(item?.detailLines) ? item.detailLines : [],
        pricingDisplayMode,
        quantity: pricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE ? quantity : null,
        rate: pricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE ? rate : null,
        materialsIncluded: materialsStatus === ESTIMATE_MATERIALS_INCLUDED,
        materialsStatus,
        displayOrder: Number.isFinite(Number(item?.displayOrder))
          ? Number(item.displayOrder)
          : index,
      }
    })
    const workBreakdownPricingDisplayMode = getEstimateWorkBreakdownPricingDisplayMode(normalizedDocumentWorkItems)

    return {
      ...documentModel,
      pricingMode: normalizedPricingMode,
      scope: scopeOfWork,
      scopeOfWork,
      simpleTotal: normalizedPricingMode === ESTIMATE_PRICING_SIMPLE
        ? toFiniteNumber(documentModel?.simpleTotal ?? documentModel?.totals?.total)
        : null,
      messageFromContractor: {
        text: legacyMessageText,
        contentBlocks: Array.isArray(documentModel?.messageFromContractor?.contentBlocks)
          ? documentModel.messageFromContractor.contentBlocks
          : normalizeEstimateRichText(legacyMessageText).blocks,
      },
      validUntil: normalizeText(documentModel.validUntil),
      totals: {
        subtotal: legacySubtotal,
        discountAmount: toFiniteNumber(documentModel?.totals?.discountAmount),
        taxAmount: toFiniteNumber(documentModel?.totals?.taxAmount),
        total: toFiniteNumber(documentModel?.totals?.total),
      },
      workItems: normalizedDocumentWorkItems,
      sections: {
        ...documentModel.sections,
        workBreakdown: {
          ...documentModel?.sections?.workBreakdown,
          visible: normalizedPricingMode === ESTIMATE_PRICING_DETAILED && normalizedWorkItems.length > 0,
          pricingDisplayMode: workBreakdownPricingDisplayMode,
          showQuantityRateColumns: workBreakdownPricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE,
        },
        messageFromContractor: {
          ...documentModel?.sections?.messageFromContractor,
          visible: Boolean(legacyMessageText.trim()),
        },
      },
    }
  }

  return normalizeEstimateDocument(legacyInput)
}

export default normalizeEstimateDocument

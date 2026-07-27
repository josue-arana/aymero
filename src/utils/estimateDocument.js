const bulletLinePattern = /^\s*((?:[-•])|(?:\*(?!\*)))[ \t]*(.*)$/
const unsupportedHtmlBlockPattern = /<(script|style|iframe|object|embed|svg|math|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const htmlTagPattern = /<\/?[a-z][^>]*>/gi
const unsafeUrlPattern = /\b(?:javascript|vbscript|data\s*:\s*text\/html)\s*:[^\s<>"']*/gi
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

/**
 * Estimate rich text intentionally uses a constrained, text-only format:
 * **bold**, ++underline++, "- " bullets, paragraphs, and line breaks.
 * HTML is never part of the storage contract.
 */
export function sanitizeEstimateFormattedText(value) {
  return normalizeText(value)
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(unsupportedHtmlBlockPattern, '')
    .replace(htmlTagPattern, '')
    .replace(unsafeUrlPattern, '')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function appendInlineSegment(segments, text, bold, underline) {
  if (!text) return

  const previous = segments[segments.length - 1]
  if (previous && previous.bold === bold && previous.underline === underline) {
    previous.text += text
    return
  }

  segments.push({ text, bold, underline })
}

export function parseEstimateInlineFormatting(value) {
  const text = sanitizeEstimateFormattedText(value)
  const segments = []
  let bold = false
  let underline = false
  let index = 0

  while (index < text.length) {
    const marker = text.slice(index, index + 2)
    const isBoldMarker = marker === '**'
    const isUnderlineMarker = marker === '++'

    const closesActiveFormatting = (isBoldMarker && bold) || (isUnderlineMarker && underline)
    const opensPairedFormatting = (isBoldMarker || isUnderlineMarker) && text.indexOf(marker, index + 2) !== -1

    if (closesActiveFormatting || opensPairedFormatting) {
      if (isBoldMarker) bold = !bold
      if (isUnderlineMarker) underline = !underline
      index += 2
      continue
    }

    appendInlineSegment(segments, text[index], bold, underline)
    index += 1
  }

  return segments
}

export function getEstimateFormattedPlainText(value) {
  return parseEstimateInlineFormatting(value).map((segment) => segment.text).join('')
}

export function hasMeaningfulEstimateFormattedText(value) {
  const plainText = getEstimateFormattedPlainText(value)
    .replace(/^\s*[-*•]\s*/gm, '')
    .replace(/\s/g, '')

  return Boolean(plainText)
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
  ].map(sanitizeEstimateFormattedText).join('\n')
  const hasStoredAmount = [item?.amount, item?.total, item?.rate].some((value) => (
    value !== ''
    && value !== null
    && value !== undefined
    && Number.isFinite(Number(value))
    && Number(value) !== 0
  ))

  return Boolean(hasMeaningfulEstimateFormattedText(itemText) || hasStoredAmount)
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
  const rawText = sanitizeEstimateFormattedText(value)
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
      segments: parseEstimateInlineFormatting(paragraphLines.join('\n')),
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
        segments: parseEstimateInlineFormatting(bulletMatch[2]),
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
  const sourceText = sanitizeEstimateFormattedText(value).trim()

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
  const sourceText = sanitizeEstimateFormattedText(item?.name).trim()
    || [sanitizeEstimateFormattedText(item?.title).trim(), sanitizeEstimateFormattedText(item?.description).trim()]
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
    titleSegments: parseEstimateInlineFormatting(textParts.title),
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
  const scopeText = sanitizeEstimateFormattedText(scope)
  const contractorMessageText = sanitizeEstimateFormattedText(messageFromContractor)
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
        visible: hasMeaningfulEstimateFormattedText(scopeText),
      },
      workBreakdown: {
        visible: normalizedPricingMode === ESTIMATE_PRICING_DETAILED && workItems.length > 0,
        pricingDisplayMode: workBreakdownPricingDisplayMode,
        showQuantityRateColumns: workBreakdownPricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE,
      },
      messageFromContractor: {
        visible: hasMeaningfulEstimateFormattedText(contractorMessageText),
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
    const legacyMessageText = sanitizeEstimateFormattedText(
      typeof documentModel.messageFromContractor === 'string'
        ? documentModel.messageFromContractor
        : documentModel?.messageFromContractor?.text
    )
    const legacySubtotal = documentModel.totals.subtotal === undefined
      ? normalizedPricingMode === ESTIMATE_PRICING_DETAILED
        ? normalizedWorkItems.reduce((sum, item) => sum + toFiniteNumber(item?.total), 0)
        : toFiniteNumber(documentModel?.simpleTotal ?? documentModel?.totals?.total)
      : toFiniteNumber(documentModel.totals.subtotal)
    const legacyScopeText = sanitizeEstimateFormattedText(
      typeof documentModel.scopeOfWork === 'string'
        ? documentModel.scopeOfWork
        : typeof documentModel.scope === 'string'
          ? documentModel.scope
          : documentModel?.scopeOfWork?.text
            ?? documentModel?.scope?.text
    )
    const scopeOfWork = {
      text: legacyScopeText,
      contentBlocks: normalizeEstimateRichText(legacyScopeText).blocks,
    }
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
        title: sanitizeEstimateFormattedText(item?.title),
        description: sanitizeEstimateFormattedText(item?.description),
        titleSegments: parseEstimateInlineFormatting(item?.title),
        contentBlocks: normalizeEstimateRichText([item?.title, item?.description].filter(Boolean).join('\n')).blocks,
        descriptionBlocks: normalizeEstimateRichText(item?.description).blocks,
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
          visible: hasMeaningfulEstimateFormattedText(legacyMessageText),
        },
        scope: {
          ...documentModel?.sections?.scope,
          visible: hasMeaningfulEstimateFormattedText(legacyScopeText),
        },
      },
    }
  }

  return normalizeEstimateDocument(legacyInput)
}

export default normalizeEstimateDocument

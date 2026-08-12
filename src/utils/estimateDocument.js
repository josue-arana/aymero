const bulletLinePattern = /^\s*((?:[-•])|(?:\*(?!\*)))[ \t]*(.*)$/
const pastedBulletLinePattern = /^\s*(?:[-*•·●▪◦])[ \t]+(.*)$/
const unsupportedHtmlBlockPattern = /<(script|style|iframe|object|embed|svg|math|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const htmlTagPattern = /<\/?[a-z][^>]*>/gi
const unsafeUrlPattern = /\b(?:javascript|vbscript|data\s*:\s*text\/html)\s*:[^\s<>"']*/gi
const estimateTextSizeMarkerPattern = /^\[\[aymero-size:(small|large)\]\]/
const anyEstimateTextSizeMarkerPattern = /\[\[aymero-size:[^\]\r\n]*\]\]/gi
export const ESTIMATE_MATERIALS_INCLUDED = 'materials_included'
export const ESTIMATE_LABOR_ONLY = 'labor_only'
export const ESTIMATE_OWNER_SUPPLIED_MATERIALS = 'owner_supplied_materials'
export const ESTIMATE_PRICING_SIMPLE = 'simple'
export const ESTIMATE_PRICING_DETAILED = 'detailed'
export const ESTIMATE_TEXT_SIZE_SMALL = 'small'
export const ESTIMATE_TEXT_SIZE_STANDARD = 'standard'
export const ESTIMATE_TEXT_SIZE_LARGE = 'large'
export const ESTIMATE_TEXT_SIZE_STEPS = [
  ESTIMATE_TEXT_SIZE_SMALL,
  ESTIMATE_TEXT_SIZE_STANDARD,
  ESTIMATE_TEXT_SIZE_LARGE,
]

const estimateTextSizePoints = {
  [ESTIMATE_TEXT_SIZE_SMALL]: 9.25,
  [ESTIMATE_TEXT_SIZE_STANDARD]: 10.25,
  [ESTIMATE_TEXT_SIZE_LARGE]: 11.75,
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeText(value) {
  return typeof value === 'string' ? value : String(value || '')
}

export function normalizeEstimateTextSize(value) {
  return ESTIMATE_TEXT_SIZE_STEPS.includes(value)
    ? value
    : ESTIMATE_TEXT_SIZE_STANDARD
}

export function getEstimateTextSizePoints(value) {
  return estimateTextSizePoints[normalizeEstimateTextSize(value)]
}

export function getEstimateTextSizeCss(value) {
  return `${getEstimateTextSizePoints(value)}pt`
}

function sanitizeEstimateTextSizeMarkers(value) {
  return normalizeText(value)
    .split('\n')
    .map((line) => {
      const allowedMarker = line.match(estimateTextSizeMarkerPattern)?.[0] || ''
      const text = line.replace(anyEstimateTextSizeMarkerPattern, '')

      return allowedMarker ? `${allowedMarker}${text}` : text
    })
    .join('\n')
}

/**
 * Estimate rich text intentionally uses a constrained, text-only format:
 * **bold**, ++underline++, "- " bullets, paragraphs, line breaks, and the
 * bounded block sizes Small / Standard / Large. Small and Large use an
 * internal line prefix; Standard is canonical and stores no redundant marker.
 * HTML is never part of the storage contract.
 */
export function sanitizeEstimateFormattedText(value) {
  const sanitizedText = normalizeText(value)
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(unsupportedHtmlBlockPattern, '')
    .replace(htmlTagPattern, '')
    .replace(unsafeUrlPattern, '')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

  return sanitizeEstimateTextSizeMarkers(sanitizedText)
}

export function parseEstimateSizedText(value) {
  const text = sanitizeEstimateFormattedText(value)
  const lines = text.split('\n').map((line) => {
    const markerMatch = line.match(estimateTextSizeMarkerPattern)
    const size = normalizeEstimateTextSize(markerMatch?.[1])

    return {
      text: markerMatch ? line.slice(markerMatch[0].length) : line,
      size,
    }
  })

  return {
    text: lines.map((line) => line.text).join('\n'),
    lines,
  }
}

export function serializeEstimateSizedText(value, sizes = []) {
  return normalizeText(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, index) => {
      const text = line.replace(anyEstimateTextSizeMarkerPattern, '')
      const size = normalizeEstimateTextSize(sizes[index])

      if (size === ESTIMATE_TEXT_SIZE_STANDARD) return text
      return `[[aymero-size:${size}]]${text}`
    })
    .join('\n')
}

function isMeaningfulInlineText(value) {
  return Boolean(
    getEstimateFormattedPlainText(value)
      .replace(/\s/g, '')
  )
}

/**
 * Canonical persisted rich text removes editor-only empty markup while keeping
 * intentional paragraph breaks and the three supported block-size markers.
 * The live editor deliberately does not call this while the user is typing so
 * an empty bullet can still be used to exit a list naturally.
 */
export function normalizeEstimateFormattedTextForStorage(value) {
  const lines = parseEstimateSizedText(value).lines.map((line) => {
    const bulletMatch = line.text.match(bulletLinePattern)

    if (bulletMatch) {
      const content = bulletMatch[2].trimEnd()
      const hasContent = isMeaningfulInlineText(content)
      return {
        text: hasContent ? `- ${content}` : '',
        size: line.size,
        remove: !hasContent,
      }
    }

    return {
      text: isMeaningfulInlineText(line.text) ? line.text.trimEnd() : '',
      size: line.size,
    }
  }).filter((line) => !line.remove)

  while (lines.length && !lines[0].text) lines.shift()
  while (lines.length && !lines[lines.length - 1].text) lines.pop()

  if (!lines.length) return ''

  return serializeEstimateSizedText(
    lines.map((line) => line.text).join('\n'),
    lines.map((line) => line.size)
  )
}

function normalizePastedPlainText(value) {
  return sanitizeEstimateFormattedText(value)
    .split('\n')
    .map((line) => {
      const bulletMatch = line.match(pastedBulletLinePattern)
      return bulletMatch ? `- ${bulletMatch[1].trimEnd()}` : line.trimEnd()
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

function isHiddenPastedElement(element) {
  if (!element?.getAttribute) return false

  const style = String(element.getAttribute('style') || '').replace(/\s/g, '').toLowerCase()
  return element.hasAttribute('hidden')
    || element.getAttribute('aria-hidden') === 'true'
    || style.includes('display:none')
    || style.includes('visibility:hidden')
}

function convertPastedHtmlNode(node) {
  if (!node) return ''
  if (node.nodeType === 3) return node.nodeValue || ''
  if (node.nodeType !== 1 || isHiddenPastedElement(node)) return ''

  const tagName = node.tagName.toLowerCase()
  if ([
    'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed',
    'svg', 'math', 'video', 'audio', 'img', 'table',
  ].includes(tagName)) {
    return ''
  }
  if (tagName === 'br') return '\n'

  if (tagName === 'ul') {
    return Array.from(node.children)
      .filter((child) => child.tagName?.toLowerCase() === 'li')
      .map((child) => {
        const content = Array.from(child.childNodes)
          .filter((item) => !['ul', 'ol'].includes(item.tagName?.toLowerCase()))
          .map(convertPastedHtmlNode)
          .join('')
          .trim()
        const nestedLists = Array.from(child.children)
          .filter((item) => item.tagName?.toLowerCase() === 'ul')
          .map(convertPastedHtmlNode)
          .join('\n')

        return [
          content ? `- ${content}` : '',
          nestedLists,
        ].filter(Boolean).join('\n')
      })
      .filter(Boolean)
      .join('\n')
  }

  if (tagName === 'ol') {
    return Array.from(node.children)
      .filter((child) => child.tagName?.toLowerCase() === 'li')
      .map((child) => Array.from(child.childNodes)
        .filter((item) => !['ul', 'ol'].includes(item.tagName?.toLowerCase()))
        .map(convertPastedHtmlNode)
        .join('')
        .trim())
      .filter(Boolean)
      .join('\n')
  }

  const content = Array.from(node.childNodes).map(convertPastedHtmlNode).join('')
  if (!content) return ''

  if (tagName === 'strong' || tagName === 'b') return `**${content}**`
  if (tagName === 'u') return `++${content}++`

  if ([
    'p', 'div', 'section', 'article', 'header', 'footer', 'aside',
    'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  ].includes(tagName)) {
    return `\n${content.trim()}\n`
  }

  return content
}

/**
 * Converts rich clipboard HTML into Aymero's intentionally small text format.
 * Unsupported structure and styles never enter storage. When DOMParser is not
 * available (SSR/tests), the clipboard's plain-text representation is used.
 */
export function sanitizeEstimatePastedContent({ html = '', text = '' } = {}) {
  if (html && typeof globalThis.DOMParser === 'function') {
    const parsedDocument = new globalThis.DOMParser().parseFromString(html, 'text/html')
    const convertedHtml = Array.from(parsedDocument.body.childNodes)
      .map(convertPastedHtmlNode)
      .join('')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (convertedHtml) return normalizePastedPlainText(convertedHtml)
  }

  return normalizePastedPlainText(text)
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
  const text = parseEstimateSizedText(value).text
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

/**
 * Amount is the only active estimate-item price. `total` remains an accepted
 * legacy amount alias because normalized document models previously used it.
 * The quantity/rate calculation is deliberately read-only and narrow: it
 * protects older JSON records that have no explicit amount without carrying
 * either legacy field into the active model or future persistence payloads.
 */
export function resolveEstimateLineItemAmount(item = {}, fallback = 0) {
  for (const explicitAmount of [item?.amount, item?.total]) {
    if (hasFiniteStoredNumber(explicitAmount)) {
      return Number(explicitAmount)
    }
  }

  if (hasFiniteStoredNumber(item?.quantity) && hasFiniteStoredNumber(item?.rate)) {
    return Number(item.quantity) * Number(item.rate)
  }

  return toFiniteNumber(fallback)
}

export function isValidExplicitEstimateItem(item = {}) {
  const itemText = [
    item?.name,
    item?.title,
    item?.description,
  ].map(sanitizeEstimateFormattedText).join('\n')
  const hasStoredAmount = resolveEstimateLineItemAmount(item) !== 0

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
  const rawText = normalizeEstimateFormattedTextForStorage(value)
  if (!rawText) {
    return {
      rawText,
      blocks: [],
    }
  }

  const lines = parseEstimateSizedText(rawText).lines
  const blocks = []
  let paragraphLines = []
  let paragraphSize = ESTIMATE_TEXT_SIZE_STANDARD
  let bulletItems = []

  function flushParagraph() {
    if (!paragraphLines.length) return

    blocks.push({
      type: 'paragraph',
      size: paragraphSize,
      text: paragraphLines.map((line) => line.text).join('\n'),
      lines: paragraphLines.map((line) => line.text),
      segments: parseEstimateInlineFormatting(paragraphLines.map((line) => line.text).join('\n')),
    })
    paragraphLines = []
    paragraphSize = ESTIMATE_TEXT_SIZE_STANDARD
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
    const bulletMatch = line.text.match(bulletLinePattern)

    if (bulletMatch) {
      flushParagraph()
      bulletItems.push({
        size: line.size,
        text: bulletMatch[2],
        marker: bulletMatch[1],
        segments: parseEstimateInlineFormatting(bulletMatch[2]),
      })
      return
    }

    flushBullets()

    if (!line.text.trim()) {
      flushParagraph()
      blocks.push({ type: 'lineBreak' })
      return
    }

    if (paragraphLines.length && paragraphSize !== line.size) {
      flushParagraph()
    }
    if (!paragraphLines.length) paragraphSize = line.size
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
  const parsedTitle = parseEstimateSizedText(firstLine).lines[0]

  return {
    title: parsedTitle.text.trim(),
    titleSize: parsedTitle.size,
    description: remainingLines.join('\n'),
    // The current document presents every non-empty line after the title as a
    // bullet. Keeping this derived view preserves today's output while the
    // richer contentBlocks remain available to the next document design.
    detailLines: remainingLines
      .map((line) => parseEstimateSizedText(line).text.trim())
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

export function normalizeEstimateLineItemsForStorage(lineItems = [], {
  fallbackMaterialsIncluded = false,
} = {}) {
  if (!Array.isArray(lineItems)) return []

  return lineItems.map((item, index) => {
    const source = item && typeof item === 'object' ? item : {}
    const name = normalizeEstimateFormattedTextForStorage(
      typeof source.name === 'string' && source.name.trim()
        ? source.name
        : [source.title, source.description].filter(Boolean).join('\n')
    )
    const materialsStatus = normalizeEstimateMaterialsStatus(source, fallbackMaterialsIncluded)
    const displayOrder = Number.isFinite(Number(source.displayOrder ?? source.display_order))
      ? Number(source.displayOrder ?? source.display_order)
      : index

    return {
      ...(source.id ? { id: source.id } : {}),
      name,
      amount: resolveEstimateLineItemAmount(source),
      materialsIncluded: materialsStatus === ESTIMATE_MATERIALS_INCLUDED,
      materialsStatus,
      displayOrder,
    }
  })
}

function normalizeEstimateWorkItem(item = {}, {
  displayOrder,
  fallbackMaterialsIncluded,
  idPrefix = 'estimate-item',
} = {}) {
  const sourceText = normalizeEstimateFormattedTextForStorage(item?.name).trim()
    || [normalizeEstimateFormattedTextForStorage(item?.title).trim(), normalizeEstimateFormattedTextForStorage(item?.description).trim()]
      .filter(Boolean)
      .join('\n')
  const textParts = splitLegacyEstimateItemText(sourceText)
  const amount = resolveEstimateLineItemAmount(item)
  const materialsStatus = normalizeEstimateMaterialsStatus(item, fallbackMaterialsIncluded)

  return {
    id: item?.id || `${idPrefix}-${displayOrder + 1}`,
    title: textParts.title,
    titleSize: textParts.titleSize,
    titleSegments: parseEstimateInlineFormatting(textParts.title),
    description: textParts.description,
    contentBlocks: normalizeEstimateRichText(sourceText).blocks,
    descriptionBlocks: normalizeEstimateRichText(textParts.description).blocks,
    detailLines: textParts.detailLines,
    amount,
    materialsIncluded: materialsStatus === ESTIMATE_MATERIALS_INCLUDED,
    materialsStatus,
    displayOrder,
  }
}

export function normalizeEstimateLineItemForDocument(item = {}, {
  displayOrder = 0,
  fallbackMaterialsIncluded = false,
} = {}) {
  return normalizeEstimateWorkItem(item, {
    displayOrder,
    fallbackMaterialsIncluded,
    idPrefix: 'estimate-item',
  })
}

export function normalizeEstimateDocument({
  pricingMode,
  scope = '',
  lineItems = [],
  total,
  subtotal,
  discountAmount = 0,
  taxAmount = 0,
  materialsIncluded = false,
  messageFromContractor = '',
  validUntil = '',
} = {}) {
  const scopeText = normalizeEstimateFormattedTextForStorage(scope)
  const contractorMessageText = normalizeEstimateFormattedTextForStorage(messageFromContractor)
  const sourceItems = Array.isArray(lineItems) ? lineItems : []
  const normalizedPricingMode = resolveEstimatePricingMode(pricingMode, sourceItems)
  const explicitItems = getValidExplicitEstimateItems(sourceItems)
  const hasDetailedItems = normalizedPricingMode === ESTIMATE_PRICING_DETAILED && explicitItems.length > 0
  const workItems = hasDetailedItems
    ? explicitItems.map((item, index) => normalizeEstimateWorkItem(item, {
        displayOrder: index,
        fallbackMaterialsIncluded: materialsIncluded,
      }))
    : []
  const calculatedSubtotal = hasDetailedItems
    ? workItems.reduce((sum, item) => sum + item.amount, 0)
    : toFiniteNumber(total)
  const normalizedSubtotal = subtotal === undefined ? calculatedSubtotal : toFiniteNumber(subtotal)
  const normalizedDiscountAmount = toFiniteNumber(discountAmount)
  const normalizedTaxAmount = toFiniteNumber(taxAmount)
  const normalizedTotal = hasFiniteStoredNumber(total)
    ? Number(total)
    : normalizedSubtotal - normalizedDiscountAmount + normalizedTaxAmount
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
      subtotal: normalizedSubtotal,
      discountAmount: normalizedDiscountAmount,
      taxAmount: normalizedTaxAmount,
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
    const legacyMessageText = normalizeEstimateFormattedTextForStorage(
      typeof documentModel.messageFromContractor === 'string'
        ? documentModel.messageFromContractor
        : documentModel?.messageFromContractor?.text
    )
    const legacySubtotal = documentModel.totals.subtotal === undefined
      ? normalizedPricingMode === ESTIMATE_PRICING_DETAILED
        ? normalizedWorkItems.reduce((sum, item) => sum + resolveEstimateLineItemAmount(item), 0)
        : toFiniteNumber(documentModel?.simpleTotal ?? documentModel?.totals?.total)
      : toFiniteNumber(documentModel.totals.subtotal)
    const legacyScopeText = normalizeEstimateFormattedTextForStorage(
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
      const parsedTitle = parseEstimateSizedText(item?.title).lines[0]
      const titleSize = item?.titleSize
        ? normalizeEstimateTextSize(item.titleSize)
        : parsedTitle.size
      const materialsStatus = normalizeEstimateMaterialsStatus(
        item,
        documentModel?.defaults?.materialsIncluded
      )

      return {
        id: item?.id || `estimate-item-${index + 1}`,
        title: parsedTitle.text,
        titleSize,
        description: normalizeEstimateFormattedTextForStorage(item?.description),
        titleSegments: parseEstimateInlineFormatting(parsedTitle.text),
        contentBlocks: normalizeEstimateRichText([
          serializeEstimateSizedText(parsedTitle.text, [titleSize]),
          item?.description,
        ].filter(Boolean).join('\n')).blocks,
        descriptionBlocks: normalizeEstimateRichText(item?.description).blocks,
        detailLines: Array.isArray(item?.detailLines) ? item.detailLines : [],
        amount: resolveEstimateLineItemAmount(item),
        materialsIncluded: materialsStatus === ESTIMATE_MATERIALS_INCLUDED,
        materialsStatus,
        displayOrder: Number.isFinite(Number(item?.displayOrder))
          ? Number(item.displayOrder)
          : index,
      }
    })

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
          visible: normalizedPricingMode === ESTIMATE_PRICING_DETAILED && normalizedWorkItems.length > 0,
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

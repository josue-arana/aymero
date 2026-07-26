const bulletLinePattern = /^\s*([-*•])\s*(.*)$/
export const ESTIMATE_MATERIALS_INCLUDED = 'materials_included'
export const ESTIMATE_LABOR_ONLY = 'labor_only'
export const ESTIMATE_OWNER_SUPPLIED_MATERIALS = 'owner_supplied_materials'

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeText(value) {
  return typeof value === 'string' ? value : String(value || '')
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
  const sourceText = normalizeText(item?.name)
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
  const materialsStatus = normalizeEstimateMaterialsStatus(item, fallbackMaterialsIncluded)

  return {
    id: item?.id || `${idPrefix}-${displayOrder + 1}`,
    title: textParts.title,
    description: textParts.description,
    contentBlocks: normalizeEstimateRichText(sourceText).blocks,
    descriptionBlocks: normalizeEstimateRichText(textParts.description).blocks,
    detailLines: textParts.detailLines,
    quantity,
    rate,
    total,
    materialsIncluded: materialsStatus === ESTIMATE_MATERIALS_INCLUDED,
    materialsStatus,
    displayOrder,
  }
}

export function normalizeEstimateDocument({
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
  const hasDetailedItems = sourceItems.length > 0
  const normalizedTotal = toFiniteNumber(total)
  const workItems = hasDetailedItems
    ? sourceItems.map((item, index) => normalizeEstimateWorkItem(item, {
        displayOrder: index,
        fallbackMaterialsIncluded: materialsIncluded,
      }))
    : [
        normalizeEstimateWorkItem(
          { name: scopeText, amount: normalizedTotal, materialsIncluded },
          {
            displayOrder: 0,
            fallbackMaterialsIncluded: materialsIncluded,
            fallbackTotal: normalizedTotal,
            idPrefix: 'estimate-scope',
          }
        ),
      ]
  const calculatedSubtotal = hasDetailedItems
    ? workItems.reduce((sum, item) => sum + item.total, 0)
    : normalizedTotal

  return {
    version: 1,
    scope: {
      text: scopeText,
      contentBlocks: normalizeEstimateRichText(scopeText).blocks,
    },
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
        visible: workItems.length > 0,
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
    const legacyMessageText = typeof documentModel.messageFromContractor === 'string'
      ? documentModel.messageFromContractor
      : normalizeText(documentModel?.messageFromContractor?.text)
    const legacySubtotal = documentModel.totals.subtotal === undefined
      ? documentModel.workItems.reduce((sum, item) => sum + toFiniteNumber(item?.total), 0)
      : toFiniteNumber(documentModel.totals.subtotal)

    return {
      ...documentModel,
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
      workItems: documentModel.workItems.map((item, index) => {
        const materialsStatus = normalizeEstimateMaterialsStatus(
          item,
          documentModel?.defaults?.materialsIncluded
        )

        return {
          ...item,
          contentBlocks: Array.isArray(item?.contentBlocks)
            ? item.contentBlocks
            : normalizeEstimateRichText([item?.title, item?.description].filter(Boolean).join('\n')).blocks,
          descriptionBlocks: Array.isArray(item?.descriptionBlocks)
            ? item.descriptionBlocks
            : normalizeEstimateRichText(item?.description).blocks,
          detailLines: Array.isArray(item?.detailLines) ? item.detailLines : [],
          materialsIncluded: materialsStatus === ESTIMATE_MATERIALS_INCLUDED,
          materialsStatus,
          displayOrder: Number.isFinite(Number(item?.displayOrder))
            ? Number(item.displayOrder)
            : index,
        }
      }),
      sections: {
        ...documentModel.sections,
        workBreakdown: {
          ...documentModel?.sections?.workBreakdown,
          visible: documentModel.workItems.length > 0,
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

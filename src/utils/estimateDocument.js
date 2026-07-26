const bulletLinePattern = /^\s*([-*•])\s*(.*)$/

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
  const materialsIncluded = typeof item?.materialsIncluded === 'boolean'
    ? item.materialsIncluded
    : typeof item?.materials_included === 'boolean'
      ? item.materials_included
      : Boolean(fallbackMaterialsIncluded)

  return {
    id: item?.id || `${idPrefix}-${displayOrder + 1}`,
    title: textParts.title,
    description: textParts.description,
    contentBlocks: normalizeEstimateRichText(sourceText).blocks,
    detailLines: textParts.detailLines,
    quantity,
    rate,
    total,
    materialsIncluded,
    displayOrder,
  }
}

export function normalizeEstimateDocument({
  scope = '',
  lineItems = [],
  total = 0,
  materialsIncluded = false,
} = {}) {
  const scopeText = normalizeText(scope)
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

  return {
    version: 1,
    scope: {
      text: scopeText,
      contentBlocks: normalizeEstimateRichText(scopeText).blocks,
    },
    workItems,
    totals: {
      subtotal: hasDetailedItems
        ? workItems.reduce((sum, item) => sum + item.total, 0)
        : normalizedTotal,
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
        // This presentation flag preserves the existing simple-scope document
        // while still giving both authoring modes the same workItems model.
        visible: hasDetailedItems,
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
    return documentModel
  }

  return normalizeEstimateDocument(legacyInput)
}

export default normalizeEstimateDocument

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { currency } from './formatters'
import {
  ensureNormalizedEstimateDocument,
  ESTIMATE_ITEM_PRICING_QUANTITY_RATE,
  ESTIMATE_LABOR_ONLY,
  ESTIMATE_OWNER_SUPPLIED_MATERIALS,
  getEstimateTextSizePoints,
  normalizeEstimateRichText,
} from './estimateDocument'
import { getAcceptedPaymentMethodLabels } from './acceptedPaymentMethods'
import {
  ESTIMATE_PAPER_MARGIN,
  ESTIMATE_PAPER_WIDTH,
  ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING,
  getEstimatePaginationModel,
  waitForEstimateDocumentAssets,
} from './estimatePagination'
import { getPaymentTermLabel } from './paymentTerms'

export { calculateEstimatePageBreakOffsets } from './estimatePagination'

const safeColors = {
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate700: '#334155',
  slate900: '#0f172a',
  blue50: '#eff6ff',
  blue500: '#3b82f6',
  blue700: '#1d4ed8',
}

const pdfPage = {
  width: 612,
  height: 792,
  margin: 22,
}

function createEstimateCanvasSlice(sourceCanvas, startY, height) {
  const sliceCanvas = document.createElement('canvas')
  sliceCanvas.width = sourceCanvas.width
  sliceCanvas.height = Math.max(Math.ceil(height), 1)

  const context = sliceCanvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
  context.drawImage(
    sourceCanvas,
    0,
    Math.floor(startY),
    sourceCanvas.width,
    Math.ceil(height),
    0,
    0,
    sourceCanvas.width,
    Math.ceil(height)
  )

  return sliceCanvas
}

function formatDisplayDate(value) {
  if (!value) {
    return new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function resolveValidUntil(value, estimateDate) {
  if (value) return value

  const parsedDate = new Date(estimateDate)
  if (Number.isNaN(parsedDate.getTime())) return ''

  parsedDate.setDate(parsedDate.getDate() + 30)
  return parsedDate.toISOString()
}

function toAsciiText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
}

function sanitizeFileSegment(value) {
  const normalized = toAsciiText(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || ''
}

function buildCompanyInitials(companyName = '') {
  return toAsciiText(companyName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function getEstimateMaterialsLabel(item = {}, t = (key) => key) {
  if (item?.materialsStatus === ESTIMATE_OWNER_SUPPLIED_MATERIALS) {
    return t('ownerSuppliedMaterials')
  }

  if (item?.materialsStatus === ESTIMATE_LABOR_ONLY) {
    return t('laborOnly')
  }

  return t('materialsIncludedTag')
}

function sanitizeCloneTree(root, clonedDoc) {
  if (!root) return

  const win = clonedDoc.defaultView
  const elements = [root, ...root.querySelectorAll('*')]
  const colorProps = [
    'color',
    'backgroundColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'textDecorationColor',
    'caretColor',
    'fill',
    'stroke',
  ]

  elements.forEach((element) => {
    const computed = win?.getComputedStyle?.(element)
    if (!computed) return

    colorProps.forEach((prop) => {
      const computedValue = computed[prop]

      if (typeof computedValue === 'string' && computedValue.includes('oklch')) {
        if (prop === 'backgroundColor') {
          element.style.backgroundColor = safeColors.white
        } else if (prop.startsWith('border')) {
          element.style[prop] = safeColors.slate200
        } else {
          element.style[prop] = safeColors.slate900
        }
      }
    })

    const boxShadow = computed.boxShadow
    if (typeof boxShadow === 'string' && boxShadow.includes('oklch')) {
      element.style.boxShadow = 'none'
    }
  })
}

function buildFallbackPdf({
  estimateNumber = '',
  estimateDate = '',
  clientName = '',
  companyName = '',
  company = {},
  lead = {},
  documentModel,
  pricingMode: legacyPricingMode,
  scope: legacyScope = '',
  lineItems: legacyLineItems = [],
  materialsIncluded: legacyMaterialsIncluded,
  paymentTerms = '',
  total: legacyTotal = 0,
  subtotal: legacySubtotal,
  discountAmount: legacyDiscountAmount,
  taxAmount: legacyTaxAmount,
  messageFromContractor: legacyMessageFromContractor = '',
  validUntil: legacyValidUntil = '',
  t = (key) => key,
}) {
  const normalizedDocument = ensureNormalizedEstimateDocument(documentModel, {
    pricingMode: legacyPricingMode,
    scope: legacyScope,
    lineItems: legacyLineItems,
    materialsIncluded: legacyMaterialsIncluded,
    total: legacyTotal,
    subtotal: legacySubtotal,
    discountAmount: legacyDiscountAmount,
    taxAmount: legacyTaxAmount,
    messageFromContractor: legacyMessageFromContractor,
    validUntil: legacyValidUntil,
  })
  const scope = normalizedDocument.scope.text
  const lineItems = normalizedDocument.sections.workBreakdown.visible
    ? normalizedDocument.workItems
    : []
  const showQuantityRateColumns = Boolean(normalizedDocument.sections.workBreakdown.showQuantityRateColumns)
  const materialsIncluded = normalizedDocument.defaults.materialsIncluded
  const total = normalizedDocument.totals.total
  const subtotal = normalizedDocument.totals.subtotal
  const discountAmount = normalizedDocument.totals.discountAmount
  const taxAmount = normalizedDocument.totals.taxAmount
  const contractorMessage = normalizedDocument.messageFromContractor.text
  const acceptedPaymentMethods = getAcceptedPaymentMethodLabels(company?.acceptedPaymentMethods, t)
  const validUntil = resolveValidUntil(normalizedDocument.validUntil, estimateDate)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
    compress: true,
  })
  const cardX = pdfPage.margin
  const cardY = pdfPage.margin
  const cardWidth = pdfPage.width - (pdfPage.margin * 2)
  const cardHeight = pdfPage.height - (pdfPage.margin * 2)
  const innerX = cardX + 20
  let cursorY = cardY + 24

  function ensureSpace(heightNeeded) {
    if (cursorY + heightNeeded <= cardY + cardHeight - 20) return

    pdf.addPage()
    pdf.setFillColor(safeColors.white)
    pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 20, 20, 'F')
    pdf.setDrawColor(safeColors.slate200)
    pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 20, 20, 'S')
    cursorY = cardY + 24
  }

  function drawText(text, x, y, options = {}) {
    pdf.setFont(options.bold ? 'helvetica' : 'helvetica', options.bold ? 'bold' : 'normal')
    pdf.setFontSize(options.size || 12)
    pdf.setTextColor(options.color || safeColors.slate900)
    pdf.text(text, x, y, options.align ? { align: options.align } : undefined)
  }

  function setFormattedRunFont(run, size = 11) {
    pdf.setFont('helvetica', run?.bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
  }

  function wrapFormattedSegments(segments = [], maxWidth, options = {}) {
    const size = options.size || 11
    const lines = []
    let currentLine = []
    let currentWidth = 0

    function flushLine(force = false) {
      if (currentLine.length || force) lines.push(currentLine)
      currentLine = []
      currentWidth = 0
    }

    segments.forEach((segment) => {
      const tokens = toAsciiText(segment?.text).split(/(\n|[ \t]+)/)

      tokens.forEach((token) => {
        if (!token) return
        if (token === '\n') {
          flushLine(true)
          return
        }

        const isWhitespace = /^[ \t]+$/.test(token)
        if (isWhitespace && currentLine.length === 0) return

        setFormattedRunFont(segment, size)
        const tokenWidth = pdf.getTextWidth(token)

        if (!isWhitespace && tokenWidth > maxWidth) {
          const chunks = pdf.splitTextToSize(token, maxWidth)
          chunks.forEach((chunk, chunkIndex) => {
            if (currentLine.length) flushLine()
            setFormattedRunFont(segment, size)
            currentLine.push({ ...segment, text: chunk })
            currentWidth = pdf.getTextWidth(chunk)
            if (chunkIndex < chunks.length - 1) flushLine()
          })
          return
        }

        if (currentLine.length && currentWidth + tokenWidth > maxWidth) {
          flushLine()
          if (isWhitespace) return
        }

        currentLine.push({ ...segment, text: token })
        currentWidth += tokenWidth
      })
    })

    flushLine()
    return lines.length ? lines : [[]]
  }

  function buildFormattedLines(blocks = [], maxWidth, options = {}) {
    const lines = []

    blocks.forEach((block) => {
      if (block?.type === 'lineBreak') {
        lines.push([])
        return
      }

      if (block?.type === 'bulletList') {
        ;(block.items || []).forEach((item) => {
          const size = getEstimateTextSizePoints(item?.size)
          const bulletIndent = 9
          const itemLines = wrapFormattedSegments(
            item?.segments || [],
            Math.max(maxWidth - bulletIndent, 1),
            { ...options, size }
          )

          itemLines.forEach((line, lineIndex) => {
            const contentRuns = line.map((run) => ({
              ...run,
              fontSize: size,
              lineIndent: lineIndex === 0 ? 0 : bulletIndent,
            }))

            lines.push(lineIndex === 0
              ? [
                  { text: '• ', bold: false, underline: false, fontSize: size, lineIndent: 0 },
                  ...contentRuns,
                ]
              : contentRuns)
          })
        })
        return
      }

      if (block?.type === 'paragraph') {
        const size = getEstimateTextSizePoints(block?.size)
        lines.push(...wrapFormattedSegments(block?.segments || [], maxWidth, { ...options, size })
          .map((line) => line.map((run) => ({ ...run, fontSize: size }))))
      }
    })

    return lines.length ? lines : [[]]
  }

  function drawFormattedLine(runs, x, y, options = {}) {
    const size = options.size || runs?.[0]?.fontSize || getEstimateTextSizePoints()
    let cursorX = x + Number(runs?.[0]?.lineIndent || 0)

    ;(runs || []).forEach((run) => {
      setFormattedRunFont(run, run?.fontSize || size)
      pdf.setTextColor(options.color || safeColors.slate700)
      pdf.text(run.text, cursorX, y)
      const runWidth = pdf.getTextWidth(run.text)

      if (run.underline && run.text.trim()) {
        pdf.setDrawColor(options.color || safeColors.slate700)
        pdf.setLineWidth(0.55)
        pdf.line(cursorX, y + 1.5, cursorX + runWidth, y + 1.5)
      }

      cursorX += runWidth
    })
  }

  function drawSectionBlock(title, content, options = {}) {
    const topOffset = options.topOffset || 34
    const bottomPadding = options.bottomPadding || 12
    const minHeight = options.minHeight || 84
    const blockWidth = cardWidth - 48
    const contentWidth = blockWidth - (ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING * 2)
    const blocks = options.contentBlocks || normalizeEstimateRichText(content).blocks
    const lines = buildFormattedLines(blocks, contentWidth)
    const lineHeights = lines.map((line) => (
      line.length
        ? Math.max(options.lineHeight || 0, (line[0]?.fontSize || getEstimateTextSizePoints()) * 1.48)
        : 7
    ))
    const blockHeight = Math.max(
      minHeight,
      topOffset + lineHeights.reduce((sum, height) => sum + height, 0) + bottomPadding
    )

    ensureSpace(blockHeight + 12)
    pdf.setFillColor(safeColors.slate50)
    pdf.roundedRect(innerX, cursorY, blockWidth, blockHeight, 18, 18, 'F')
    drawText(title.toUpperCase(), innerX + ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING, cursorY + 18, { bold: true, size: 10, color: safeColors.slate400 })

    const contentStartY = cursorY + topOffset
    let contentCursorY = contentStartY
    lines.forEach((line, index) => {
      drawFormattedLine(line, innerX + ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING, contentCursorY, {
        color: safeColors.slate700,
      })
      contentCursorY += lineHeights[index]
    })

    cursorY += blockHeight
  }

  pdf.setFillColor(safeColors.white)
  pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 20, 20, 'F')
  pdf.setDrawColor(safeColors.slate200)
  pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 20, 20, 'S')

  pdf.setFillColor(safeColors.slate900)
  pdf.roundedRect(innerX, cursorY - 8, 42, 42, 14, 14, 'F')
  drawText(buildCompanyInitials(company?.name || companyName || t('brandName')) || t('brandInitials'), innerX + 21, cursorY + 17, {
    bold: true,
    size: 12,
    color: safeColors.white,
    align: 'center',
  })

  drawText(company?.name || companyName || t('brandName'), innerX + 54, cursorY + 2, { bold: true, size: 16 })
  drawText(company?.phone || '', innerX + 54, cursorY + 20, { size: 11, color: safeColors.slate500 })
  drawText(company?.email || '', innerX + 54, cursorY + 36, { size: 11, color: safeColors.slate500 })

  drawText(t('estimate').toUpperCase(), cardX + cardWidth - 24, cursorY + 2, { bold: true, size: 11, color: safeColors.blue500, align: 'right' })
  drawText(estimateNumber, cardX + cardWidth - 24, cursorY + 22, { bold: true, size: 13, align: 'right' })

  cursorY += 52
  const infoRowHeight = 76
  const showGlobalMaterialsIncluded = lineItems.length === 0
  ensureSpace(infoRowHeight + 8)
  pdf.setDrawColor(safeColors.slate200)
  pdf.roundedRect(innerX, cursorY, cardWidth - 40, infoRowHeight, 14, 14, 'S')
  const columnCount = showGlobalMaterialsIncluded ? 3 : 2
  const columnWidth = (cardWidth - 40) / columnCount
  pdf.line(innerX + columnWidth, cursorY, innerX + columnWidth, cursorY + infoRowHeight)
  if (showGlobalMaterialsIncluded) {
    pdf.line(innerX + (columnWidth * 2), cursorY, innerX + (columnWidth * 2), cursorY + infoRowHeight)
  }
  drawText(t('client').toUpperCase(), innerX + 14, cursorY + 16, { bold: true, size: 9.5, color: safeColors.slate400 })
  drawText(t('date').toUpperCase(), innerX + columnWidth + 14, cursorY + 16, { bold: true, size: 9.5, color: safeColors.slate400 })
  drawText(lead?.client || clientName, innerX + 14, cursorY + 33, { bold: true, size: 10.5, color: safeColors.slate900 })
  drawText(lead?.address || lead?.location || '', innerX + 14, cursorY + 47, { size: 9.5, color: safeColors.slate700 })
  drawText(formatDisplayDate(estimateDate), innerX + columnWidth + 14, cursorY + 33, { size: 10.5, color: safeColors.slate700 })
  if (showGlobalMaterialsIncluded) {
    drawText(t('materialsIncluded').toUpperCase(), innerX + (columnWidth * 2) + 14, cursorY + 16, { bold: true, size: 9.5, color: safeColors.slate400 })
    pdf.setFillColor(materialsIncluded ? safeColors.blue50 : safeColors.slate100)
    pdf.roundedRect(innerX + (columnWidth * 2) + 14, cursorY + 26, 52, 20, 10, 10, 'F')
    drawText(materialsIncluded ? t('yes') : t('no'), innerX + (columnWidth * 2) + 40, cursorY + 39, { bold: true, size: 9.5, color: materialsIncluded ? safeColors.blue700 : safeColors.slate700, align: 'center' })
  }
  cursorY += infoRowHeight + 10

  ensureSpace(64)
  pdf.setDrawColor(safeColors.slate200)
  pdf.roundedRect(innerX, cursorY, cardWidth - 40, 52, 14, 14, 'S')
  pdf.setFillColor(safeColors.slate50)
  pdf.rect(innerX, cursorY, cardWidth - 40, 26, 'F')
  pdf.line(innerX + 314, cursorY, innerX + 314, cursorY + 26)
  drawText(t('description').toUpperCase(), innerX + 14, cursorY + 17, { bold: true, size: 9.5, color: safeColors.slate400 })
  drawText(`${t('estimate').toUpperCase()} ${t('totalAmount').toUpperCase()}`, innerX + (cardWidth - 54), cursorY + 17, { bold: true, size: 9.5, color: safeColors.blue700, align: 'right' })
  drawText(lead?.projectTitle || lead?.projectType || t('projectTitle'), innerX + 14, cursorY + 40, { bold: true, size: 12 })
  drawText(currency.format(Number(total || 0)), innerX + (cardWidth - 54), cursorY + 40, { bold: true, size: 16, align: 'right' })
  cursorY += 62

  if (normalizedDocument.sections.scope.visible) {
    drawSectionBlock(t('scopeOfWork'), scope, {
      contentBlocks: normalizedDocument.scope.contentBlocks,
      lineHeight: 14,
      topOffset: 30,
      bottomPadding: 10,
      minHeight: 84,
    })
  }

  if (lineItems.length > 0) {
    const itemDescriptionWidth = showQuantityRateColumns ? cardWidth - 282 : cardWidth - 134
    const totalColumnX = cardX + cardWidth - 36
    const rateColumnX = totalColumnX - 88
    const quantityColumnX = rateColumnX - 66
    const formattedLineItems = lineItems.map((item) => {
      const titleSegments = (item?.titleSegments || []).map((segment) => ({ ...segment, bold: true }))
      const titleLines = wrapFormattedSegments(
        titleSegments.length ? titleSegments : [{ text: t('item'), bold: true, underline: false }],
        itemDescriptionWidth,
        { size: getEstimateTextSizePoints(item?.titleSize) }
      ).map((line) => line.map((run) => ({
        ...run,
        fontSize: getEstimateTextSizePoints(item?.titleSize),
      })))
      const descriptionLines = buildFormattedLines(
        item?.descriptionBlocks || [],
        itemDescriptionWidth
      )
      const formattedLines = [
        ...titleLines,
        ...(item?.descriptionBlocks?.length ? descriptionLines : []),
      ]
      const contentHeight = formattedLines.reduce((height, line) => (
        height + Math.max(14, (line?.[0]?.fontSize || getEstimateTextSizePoints()) * 1.48)
      ), 0)

      return {
        titleLines,
        descriptionLines: item?.descriptionBlocks?.length ? descriptionLines : [],
        height: contentHeight + 50,
      }
    })
    const estimatedItemsHeight = formattedLineItems.reduce((sum, item) => sum + item.height, 0)
    ensureSpace(estimatedItemsHeight + 60)
    pdf.setDrawColor(safeColors.slate200)
    pdf.roundedRect(innerX, cursorY, cardWidth - 40, estimatedItemsHeight + 34, 18, 18, 'S')
    pdf.setFillColor(safeColors.slate50)
    pdf.roundedRect(innerX, cursorY, cardWidth - 40, 26, 18, 18, 'F')
    drawText(t('item').toUpperCase(), innerX + 16, cursorY + 17, { bold: true, size: 10, color: safeColors.slate500 })
    if (showQuantityRateColumns) {
      drawText(t('qty').toUpperCase(), quantityColumnX, cursorY + 17, { bold: true, size: 9, color: safeColors.slate500, align: 'right' })
      drawText(t('rate').toUpperCase(), rateColumnX, cursorY + 17, { bold: true, size: 9, color: safeColors.slate500, align: 'right' })
      drawText(t('total').toUpperCase(), totalColumnX, cursorY + 17, { bold: true, size: 9, color: safeColors.slate500, align: 'right' })
    } else {
      drawText(t('amount').toUpperCase(), totalColumnX, cursorY + 17, { bold: true, size: 10, color: safeColors.slate500, align: 'right' })
    }
    cursorY += 42

    lineItems.forEach((item, index) => {
      const itemMaterialsIncluded = Boolean(item?.materialsIncluded)
      const hasQuantityRate = item?.pricingDisplayMode === ESTIMATE_ITEM_PRICING_QUANTITY_RATE

      if (index > 0) {
        pdf.setDrawColor(safeColors.slate100)
        pdf.line(innerX + 14, cursorY - 10, cardX + cardWidth - 34, cursorY - 10)
      }

      const formattedItem = formattedLineItems[index]
      const startingY = cursorY
      ;[...formattedItem.titleLines, ...formattedItem.descriptionLines].forEach((line) => {
        const lineHeight = Math.max(
          14,
          (line?.[0]?.fontSize || getEstimateTextSizePoints()) * 1.48
        )
        ensureSpace(lineHeight + 12)
        drawFormattedLine(line, innerX + 16, cursorY, { color: safeColors.slate700 })
        cursorY += lineHeight
      })
      if (showQuantityRateColumns && hasQuantityRate) {
        drawText(Number(item?.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }), quantityColumnX, startingY, { size: 10, align: 'right' })
        drawText(currency.format(Number(item?.rate || 0)), rateColumnX, startingY, { size: 10, align: 'right' })
      }
      drawText(currency.format(Number(item?.total || 0)), totalColumnX, startingY, { bold: true, size: 11, align: 'right' })
      pdf.setFillColor(itemMaterialsIncluded ? safeColors.blue50 : safeColors.slate100)
      pdf.roundedRect(innerX + 16, cursorY + 2, 122, 18, 9, 9, 'F')
      drawText(getEstimateMaterialsLabel(item, t), innerX + 77, cursorY + 14, { bold: true, size: 8.5, color: itemMaterialsIncluded ? safeColors.blue700 : safeColors.slate700, align: 'center' })
      cursorY += 28
    })
  }

  drawSectionBlock(t('paymentTerms'), getPaymentTermLabel(paymentTerms, t))
  if (normalizedDocument.sections.messageFromContractor.visible) {
    drawSectionBlock(t('messageFromContractor'), contractorMessage, {
      contentBlocks: normalizedDocument.messageFromContractor.contentBlocks,
    })
  }
  if (acceptedPaymentMethods.length) {
    drawSectionBlock(t('acceptedPaymentMethods'), acceptedPaymentMethods.map((method) => `• ${method}`).join('\n'))
  }

  const totalsLines = [
    `${t('subtotal')}: ${currency.format(subtotal)}`,
    ...(discountAmount > 0 ? [`${t('discount')}: -${currency.format(discountAmount)}`] : []),
    ...(taxAmount > 0 ? [`${t('salesTax')}: ${currency.format(taxAmount)}`] : []),
    `${t('totalEstimate')}: ${currency.format(total)}`,
  ]
  drawSectionBlock(t('totalEstimate'), totalsLines.join('\n'), { minHeight: 76 })
  drawSectionBlock(t('validUntil'), formatDisplayDate(validUntil), { minHeight: 62 })

  ensureSpace(50)
  pdf.setDrawColor(safeColors.slate200)
  pdf.line(innerX, cursorY, cardX + cardWidth - 20, cursorY)
  cursorY += 18
  drawText(t('thankYouForEstimateOpportunity'), cardX + (cardWidth / 2), cursorY, {
    bold: true,
    size: 11,
    color: safeColors.blue700,
    align: 'center',
  })
  cursorY += 16
  drawText(company?.name || companyName || t('brandName'), cardX + (cardWidth / 2), cursorY, {
    bold: true,
    size: 9.5,
    color: safeColors.slate900,
    align: 'center',
  })

  const fileName = buildEstimatePdfFileName({
    estimateNumber,
    clientName: lead?.client || clientName,
    companyName: company?.name || companyName,
  })
  pdf.save(fileName)
  return fileName
}

export function buildEstimatePdfFileName({ estimateNumber = '', clientName = '', companyName = '' } = {}) {
  const parts = [
    'Estimate',
    sanitizeFileSegment(estimateNumber),
    sanitizeFileSegment(clientName),
    sanitizeFileSegment(buildCompanyInitials(companyName)),
  ].filter(Boolean)

  return `${parts.join('-')}.pdf`
}

export async function downloadEstimatePdf({
  element,
  estimateNumber = '',
  estimateDate = '',
  clientName = '',
  companyName = '',
  company = {},
  lead = {},
  documentModel,
  pricingMode,
  scope = '',
  lineItems = [],
  materialsIncluded,
  paymentTerms = '',
  total = 0,
  subtotal,
  discountAmount,
  taxAmount,
  messageFromContractor = '',
  validUntil = '',
  t = (key) => key,
} = {}) {
  if (!element) {
    throw new Error('Estimate PDF template is not ready.')
  }

  try {
    await waitForEstimateDocumentAssets(element)

    const pageWidth = ESTIMATE_PAPER_WIDTH
    const margin = ESTIMATE_PAPER_MARGIN
    const renderWidth = pageWidth - (margin * 2)
    const pagination = getEstimatePaginationModel(element)
    if (!pagination?.pageCount) {
      throw new Error('Estimate PDF pagination could not be calculated.')
    }
    const { elementWidth, pages } = pagination
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      ignoreElements: (candidate) => candidate.tagName === 'BUTTON',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      onclone: (clonedDoc) => {
        clonedDoc.documentElement.style.backgroundColor = '#ffffff'
        clonedDoc.documentElement.style.color = safeColors.slate900
        clonedDoc.body.style.backgroundColor = '#ffffff'
        clonedDoc.body.style.color = safeColors.slate900
        clonedDoc.body.style.margin = '0'

        const clonedRoot = clonedDoc.querySelector('[data-estimate-pdf-root="true"]')

        if (clonedRoot) {
          clonedDoc.body.replaceChildren(clonedRoot)
          sanitizeCloneTree(clonedRoot, clonedDoc)
        }
      },
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
      compress: true,
    })
    const canvasScale = canvas.width / elementWidth

    pages.forEach((page, index) => {
      const canvasStart = page.start * canvasScale
      const canvasHeight = Math.min(
        page.height * canvasScale,
        canvas.height - canvasStart
      )

      if (index > 0) {
        pdf.addPage()
      }

      const pageCanvas = createEstimateCanvasSlice(canvas, canvasStart, canvasHeight)
      const renderedHeight = (pageCanvas.height * renderWidth) / pageCanvas.width
      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        margin,
        margin,
        renderWidth,
        renderedHeight,
        undefined,
        'FAST'
      )
    })

    const fileName = buildEstimatePdfFileName({
      estimateNumber,
      clientName,
      companyName,
    })

    pdf.save(fileName)
    return fileName
  } catch (error) {
    return buildFallbackPdf({
      estimateNumber,
      estimateDate,
      clientName,
      companyName,
      company,
      lead,
      documentModel,
      pricingMode,
      scope,
      lineItems,
      materialsIncluded,
      paymentTerms,
      total,
      subtotal,
      discountAmount,
      taxAmount,
      messageFromContractor,
      validUntil,
      t,
      error,
    })
  }
}

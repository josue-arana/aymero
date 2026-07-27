import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { currency } from './formatters'
import {
  ensureNormalizedEstimateDocument,
  ESTIMATE_LABOR_ONLY,
  ESTIMATE_OWNER_SUPPLIED_MATERIALS,
} from './estimateDocument'
import { getAcceptedPaymentMethodLabels } from './acceptedPaymentMethods'
import { calculateDocumentPageBreakOffsets } from './documentPagination'
import { getPaymentTermLabel } from './paymentTerms'

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

export function calculateEstimatePageBreakOffsets({
  contentHeight,
  sourcePageHeight,
  protectedRanges = [],
}) {
  return calculateDocumentPageBreakOffsets({
    contentHeight,
    sourcePageHeight,
    protectedRanges,
  })
}

function getEstimatePageBreakOffsets(element, sourcePageHeight) {
  const rootRect = element.getBoundingClientRect()
  const renderedScale = rootRect.width > 0 && element.offsetWidth > 0
    ? rootRect.width / element.offsetWidth
    : 1

  function toSourceRange(rect, inset = 0) {
    if (!rect || rect.height <= 0) return null

    return {
      start: Math.max((rect.top - rootRect.top - inset) / renderedScale, 0),
      end: Math.max((rect.bottom - rootRect.top + inset) / renderedScale, 0),
    }
  }

  function getElementRange(node) {
    return node ? toSourceRange(node.getBoundingClientRect()) : null
  }

  function combineElementRanges(firstNode, lastNode) {
    const firstRange = getElementRange(firstNode)
    const lastRange = getElementRange(lastNode)
    if (!firstRange || !lastRange) return null

    return {
      start: Math.min(firstRange.start, lastRange.start),
      end: Math.max(firstRange.end, lastRange.end),
    }
  }

  function getTextLineRanges(flowNode) {
    const ownerDocument = element.ownerDocument
    const ownerWindow = ownerDocument?.defaultView
    const showText = ownerWindow?.NodeFilter?.SHOW_TEXT ?? 4
    const ranges = []

    const walker = ownerDocument.createTreeWalker(flowNode, showText)
    let textNode = walker.nextNode()

    while (textNode) {
      if (String(textNode.textContent || '').trim()) {
        const textRange = ownerDocument.createRange()
        textRange.selectNodeContents(textNode)

        Array.from(textRange.getClientRects()).forEach((rect) => {
          const sourceRange = toSourceRange(rect, 1)
          if (sourceRange) ranges.push(sourceRange)
        })

        textRange.detach?.()
      }

      textNode = walker.nextNode()
    }

    return ranges
  }

  const protectedRanges = []
  const closingSection = element.querySelector('[data-estimate-footer-section="true"]')
  const documentFooter = element.querySelector('[data-estimate-footer="true"]')
  const closingGroupRange = combineElementRanges(closingSection, documentFooter)

  if (closingGroupRange && closingGroupRange.end - closingGroupRange.start <= sourcePageHeight * 0.92) {
    protectedRanges.push(closingGroupRange)
  }

  const workHeading = element.querySelector('[data-estimate-work-heading="true"]')
  const firstWorkItem = element.querySelector('[data-line-item-card="true"]')
  const firstWorkGroupRange = combineElementRanges(workHeading, firstWorkItem)

  if (firstWorkGroupRange && firstWorkGroupRange.end - firstWorkGroupRange.start <= sourcePageHeight * 0.45) {
    protectedRanges.push(firstWorkGroupRange)
  }

  element.querySelectorAll(
    '[data-estimate-keep-together="true"], [data-estimate-work-heading="true"], [data-estimate-footer="true"]'
  ).forEach((node) => {
    const range = getElementRange(node)
    if (range) protectedRanges.push(range)
  })

  element.querySelectorAll('[data-estimate-section-heading="true"]').forEach((heading) => {
    const section = heading.closest('[data-estimate-section="true"]')
    const firstFlowNode = section?.querySelector('[data-estimate-flow-text="true"]')
    const headingRange = getElementRange(heading)
    const firstLineRange = firstFlowNode ? getTextLineRanges(firstFlowNode)[0] : null
    const headingGroupRange = headingRange && firstLineRange
      ? {
          start: Math.min(headingRange.start, firstLineRange.start),
          end: Math.max(headingRange.end, firstLineRange.end),
        }
      : null

    if (headingGroupRange && headingGroupRange.end - headingGroupRange.start <= sourcePageHeight * 0.35) {
      protectedRanges.push(headingGroupRange)
    }
  })

  element.querySelectorAll('[data-estimate-flow-text="true"]').forEach((flowNode) => {
    protectedRanges.push(...getTextLineRanges(flowNode))
  })

  return calculateEstimatePageBreakOffsets({
    contentHeight: Math.max(element.scrollHeight, element.offsetHeight),
    sourcePageHeight,
    protectedRanges,
  })
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

function wrapLine(text, maxChars) {
  const words = toAsciiText(text).split(/\s+/).filter(Boolean)

  if (words.length === 0) return ['']

  const lines = []
  let current = ''

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word

    if (candidate.length <= maxChars) {
      current = candidate
      return
    }

    if (current) lines.push(current)

    if (word.length <= maxChars) {
      current = word
      return
    }

    const chunks = word.match(new RegExp(`.{1,${maxChars}}`, 'g')) || [word]
    lines.push(...chunks.slice(0, -1))
    current = chunks[chunks.length - 1]
  })

  if (current) lines.push(current)
  return lines
}

function wrapMultilineText(text, maxChars) {
  return String(text || '')
    .split('\n')
    .flatMap((line) => (line.trim() ? wrapLine(line, maxChars) : ['']))
}

function estimateLineItemHeight(item) {
  const nameLines = wrapMultilineText(getNormalizedItemDisplayText(item), 52)
  const detailHeight = Math.max(nameLines.length, 1) * 14
  const detailsHeight = 22
  return detailHeight + detailsHeight + 14
}

function getNormalizedItemDisplayText(item = {}) {
  return [item?.title, item?.description].filter(Boolean).join('\n')
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

  function drawWrappedLines(lines, x, width, options = {}) {
    const lineHeight = options.lineHeight || 18
    ensureSpace((lines.length * lineHeight) + 12)
    pdf.setFont(options.bold ? 'helvetica' : 'helvetica', options.bold ? 'bold' : 'normal')
    pdf.setFontSize(options.size || 12)
    pdf.setTextColor(options.color || safeColors.slate700)

    lines.forEach((line) => {
      pdf.text(line, x, cursorY, { maxWidth: width })
      cursorY += lineHeight
    })
  }

  function drawSectionBlock(title, content, options = {}) {
    const maxCharsPerLine = options.maxCharsPerLine || 74
    const lines = wrapMultilineText(content, maxCharsPerLine)
    const lineHeight = options.lineHeight || 16
    const topOffset = options.topOffset || 34
    const bottomPadding = options.bottomPadding || 12
    const minHeight = options.minHeight || 84
    const blockHeight = Math.max(minHeight, topOffset + (lines.length * lineHeight) + bottomPadding)

    ensureSpace(blockHeight + 12)
    pdf.setFillColor(safeColors.slate50)
    pdf.roundedRect(innerX, cursorY, cardWidth - 48, blockHeight, 18, 18, 'F')
    drawText(title.toUpperCase(), innerX + 18, cursorY + 18, { bold: true, size: 10, color: safeColors.slate400 })

    const contentStartY = cursorY + topOffset
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(safeColors.slate700)
    lines.forEach((line, index) => {
      pdf.text(line || ' ', innerX + 18, contentStartY + (index * lineHeight), { maxWidth: cardWidth - 84 })
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

  if (String(scope || '').trim()) {
    drawSectionBlock(t('scopeOfWork'), scope, {
      lineHeight: 14,
      topOffset: 30,
      bottomPadding: 10,
      minHeight: 84,
    })
  }

  if (lineItems.length > 0) {
    const estimatedItemsHeight = lineItems.reduce((sum, item) => sum + estimateLineItemHeight(item), 0)
    ensureSpace(estimatedItemsHeight + 60)
    pdf.setDrawColor(safeColors.slate200)
    pdf.roundedRect(innerX, cursorY, cardWidth - 40, estimatedItemsHeight + 34, 18, 18, 'S')
    pdf.setFillColor(safeColors.slate50)
    pdf.roundedRect(innerX, cursorY, cardWidth - 40, 26, 18, 18, 'F')
    drawText(t('item').toUpperCase(), innerX + 16, cursorY + 17, { bold: true, size: 10, color: safeColors.slate500 })
    drawText(t('amount').toUpperCase(), cardX + cardWidth - 36, cursorY + 17, { bold: true, size: 10, color: safeColors.slate500, align: 'right' })
    cursorY += 42

    lineItems.forEach((item, index) => {
      const itemMaterialsIncluded = Boolean(item?.materialsIncluded)

      if (index > 0) {
        pdf.setDrawColor(safeColors.slate100)
        pdf.line(innerX + 14, cursorY - 10, cardX + cardWidth - 34, cursorY - 10)
      }

      const itemLines = wrapMultilineText(getNormalizedItemDisplayText(item) || t('item'), 52)
      const startingY = cursorY
      drawWrappedLines(itemLines.length ? itemLines : [t('item')], innerX + 16, cardWidth - 180, { size: 11, color: safeColors.slate700, lineHeight: 14 })
      drawText(currency.format(Number(item?.total || 0)), cardX + cardWidth - 36, startingY, { bold: true, size: 11, align: 'right' })
      pdf.setFillColor(itemMaterialsIncluded ? safeColors.blue50 : safeColors.slate100)
      pdf.roundedRect(innerX + 16, cursorY + 2, 122, 18, 9, 9, 'F')
      drawText(getEstimateMaterialsLabel(item, t), innerX + 77, cursorY + 14, { bold: true, size: 8.5, color: itemMaterialsIncluded ? safeColors.blue700 : safeColors.slate700, align: 'center' })
      cursorY += 28
    })
  }

  drawSectionBlock(t('paymentTerms'), getPaymentTermLabel(paymentTerms, t))
  if (contractorMessage.trim()) {
    drawSectionBlock(t('messageFromContractor'), contractorMessage)
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
    const pageWidth = 612
    const pageHeight = 792
    const margin = 36
    const renderWidth = pageWidth - (margin * 2)
    const printableHeight = pageHeight - (margin * 2)
    const elementWidth = Math.max(element.scrollWidth, element.offsetWidth)
    const sourcePageHeight = printableHeight / (renderWidth / elementWidth)
    const pageBreakOffsets = getEstimatePageBreakOffsets(element, sourcePageHeight)
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

    pageBreakOffsets.slice(0, -1).forEach((pageStart, index) => {
      const pageEnd = pageBreakOffsets[index + 1]
      const canvasStart = pageStart * canvasScale
      const canvasHeight = Math.min(
        (pageEnd - pageStart) * canvasScale,
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

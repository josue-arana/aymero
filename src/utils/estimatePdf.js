import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { currency } from './formatters'
import { ensureNormalizedEstimateDocument } from './estimateDocument'
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
  scope: legacyScope = '',
  lineItems: legacyLineItems = [],
  materialsIncluded: legacyMaterialsIncluded,
  paymentTerms = '',
  total: legacyTotal = 0,
  t = (key) => key,
}) {
  const normalizedDocument = ensureNormalizedEstimateDocument(documentModel, {
    scope: legacyScope,
    lineItems: legacyLineItems,
    materialsIncluded: legacyMaterialsIncluded,
    total: legacyTotal,
  })
  const scope = normalizedDocument.scope.text
  const lineItems = normalizedDocument.sections.workBreakdown.visible
    ? normalizedDocument.workItems
    : []
  const materialsIncluded = normalizedDocument.defaults.materialsIncluded
  const total = normalizedDocument.totals.total
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
      drawText(`${t('materialsIncluded')}: ${itemMaterialsIncluded ? t('yes') : t('no')}`, innerX + 77, cursorY + 14, { bold: true, size: 8.5, color: itemMaterialsIncluded ? safeColors.blue700 : safeColors.slate700, align: 'center' })
      cursorY += 28
    })
  }

  drawSectionBlock(t('paymentTerms'), getPaymentTermLabel(paymentTerms, t))

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
  scope = '',
  lineItems = [],
  materialsIncluded,
  paymentTerms = '',
  total = 0,
  t = (key) => key,
} = {}) {
  if (!element) {
    throw new Error('Estimate PDF template is not ready.')
  }

  try {
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

    const imageData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
      compress: true,
    })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 36
    const renderWidth = pageWidth - (margin * 2)
    const renderHeight = (canvas.height * renderWidth) / canvas.width
    const printableHeight = pageHeight - (margin * 2)

    let heightLeft = renderHeight
    let positionY = margin

    pdf.addImage(imageData, 'PNG', margin, positionY, renderWidth, renderHeight, undefined, 'FAST')
    heightLeft -= printableHeight

    while (heightLeft > 0) {
      pdf.addPage()
      positionY = margin - (renderHeight - heightLeft)
      pdf.addImage(imageData, 'PNG', margin, positionY, renderWidth, renderHeight, undefined, 'FAST')
      heightLeft -= printableHeight
    }

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
      scope,
      lineItems,
      materialsIncluded,
      paymentTerms,
      total,
      t,
      error,
    })
  }
}

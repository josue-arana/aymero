import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { buildContractNotesAndTermsItems, normalizeContractWorkBreakdown, shouldRenderContractScopeText } from './contractDocument'
import { currency } from './formatters'
import { normalizeEstimateRichText } from './estimateDocument'
import { getReadableBrandTextColor, normalizeBrandColor } from '../data/brandColors'
import {
  ESTIMATE_PAPER_MARGIN,
  ESTIMATE_PAPER_WIDTH,
  getEstimatePaginationModel,
  waitForEstimateDocumentAssets,
} from './estimatePagination'

const safeColors = {
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate700: '#334155',
  slate900: '#0f172a',
}

const pdfPage = {
  width: 612,
  height: 792,
  margin: 22,
}

function createContractCanvasSlice(sourceCanvas, startY, height) {
  const sliceCanvas = document.createElement('canvas')
  sliceCanvas.width = sourceCanvas.width
  sliceCanvas.height = Math.max(Math.ceil(height), 1)
  const context = sliceCanvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
  context.drawImage(sourceCanvas, 0, Math.floor(startY), sourceCanvas.width, Math.ceil(height), 0, 0, sourceCanvas.width, Math.ceil(height))
  return sliceCanvas
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

function getRichTextPlainLines(value) {
  return normalizeEstimateRichText(value).blocks.flatMap((block) => {
    if (block?.type === 'lineBreak') return ['']
    if (block?.type === 'bulletList') {
      return (block.items || []).map((item) => `• ${(item.segments || []).map((segment) => segment.text).join('')}`)
    }
    if (block?.type === 'paragraph') {
      return [String((block.segments || []).map((segment) => segment.text).join(''))]
    }
    return []
  })
}

function buildBillToLines(lead = {}, t = (key) => key) {
  const lines = [
    lead?.client,
    lead?.phone,
    lead?.email,
    lead?.billingAddress || lead?.billing_address || lead?.clientAddress || lead?.client_address || '',
  ].filter(Boolean)

  return lines.length > 0 ? lines : [t('notAdded')]
}

function buildWorkLines(lead = {}, t = (key) => key) {
  const lines = [
    lead?.address || lead?.location || '',
    lead?.projectTitle || lead?.projectType || '',
  ].filter(Boolean)

  return lines.length > 0 ? lines : [t('unknownAddress')]
}

function buildLicenseLines(company = {}, t = (key) => key) {
  const lines = []

  if (company?.licenseNumber) {
    lines.push(company.licenseNumber)
  }

  return lines.length > 0 ? lines : [t('notAdded')]
}

function getContractMaterialsLabel(item = {}, t = (key) => key) {
  if (item?.materialsStatus === 'owner_supplied_materials') return t('ownerSuppliedMaterials')
  if (item?.materialsStatus === 'labor_only' || item?.materialsIncluded === false) return t('laborOnly')
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
  contractNumber = '',
  contractDate = '',
  notesAndTermsItems = [],
  clientName = '',
  companyName = '',
  company = {},
  lead = {},
  scope = '',
  workBreakdown = [],
  acceptanceLegalText = '',
  depositAmount = null,
  paymentTerms = '',
  materials = '',
  timeline = '',
  changeOrders = '',
  clientResponsibilities = '',
  warrantyDisclaimer = '',
  total = 0,
  t = (key) => key,
} = {}) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
    compress: true,
  })
  const cardX = pdfPage.margin
  const cardY = pdfPage.margin
  const cardWidth = pdfPage.width - (pdfPage.margin * 2)
  const innerX = cardX + 20
  const contentBottomY = cardY + pdfPage.height - (pdfPage.margin * 2) - 20
  let cursorY = cardY + 24
  const billToLines = buildBillToLines(lead, t)
  const workLines = buildWorkLines(lead, t)
  const licenseLines = buildLicenseLines(company, t)
  const normalizedWorkBreakdown = normalizeContractWorkBreakdown(workBreakdown)
  const accentColor = normalizeBrandColor(company?.primaryColor || company?.primary_color)
  const accentTextColor = getReadableBrandTextColor(accentColor)

  function drawPageFrame() {
    pdf.setFillColor(safeColors.white)
    pdf.roundedRect(cardX, cardY, cardWidth, pdfPage.height - (pdfPage.margin * 2), 20, 20, 'F')
    pdf.setDrawColor(safeColors.slate200)
    pdf.roundedRect(cardX, cardY, cardWidth, pdfPage.height - (pdfPage.margin * 2), 20, 20, 'S')
  }

  function ensureSpace(heightNeeded) {
    if (cursorY + heightNeeded <= contentBottomY) return
    pdf.addPage()
    drawPageFrame()
    cursorY = cardY + 24
  }

  function drawText(text, x, y, options = {}) {
    pdf.setFont('helvetica', options.bold ? 'bold' : 'normal')
    pdf.setFontSize(options.size || 12)
    pdf.setTextColor(options.color || safeColors.slate900)
    pdf.text(text, x, y, options.align ? { align: options.align } : undefined)
  }

  function drawContactIcon(type, x, y) {
    pdf.setDrawColor(accentColor)
    pdf.setLineWidth(1)
    if (type === 'email') {
      pdf.rect(x, y - 6, 9, 7, 'S')
      pdf.line(x, y - 6, x + 4.5, y - 2)
      pdf.line(x + 9, y - 6, x + 4.5, y - 2)
      return
    }
    if (type === 'website') {
      pdf.circle(x + 4.5, y - 2.5, 4.5, 'S')
      pdf.line(x, y - 2.5, x + 9, y - 2.5)
      pdf.line(x + 4.5, y - 7, x + 4.5, y + 2)
      return
    }
    pdf.circle(x + 4.5, y - 2.5, 4.5, 'S')
    pdf.line(x + 2.5, y - 4.5, x + 6.5, y - 0.5)
  }

  function drawNotesSection(items) {
    const resolvedItems = items.length > 0 ? items : buildContractNotesAndTermsItems({
      paymentTerms,
      total,
      depositAmount,
      acceptanceLegalText,
      legacyAcceptanceText: warrantyDisclaimer,
      t,
    })
    const lineHeight = 12
    const sectionWidth = cardWidth - 40
    const headingHeight = 22
    const leftX = innerX
    const rightX = innerX + sectionWidth
    const textStartX = innerX + 12
    const dividerEndX = rightX - 12
    let sectionStarted = false

    function drawSectionShell() {
      pdf.setDrawColor(safeColors.slate200)
      pdf.line(leftX, cursorY, rightX, cursorY)
      pdf.line(leftX, cursorY, leftX, contentBottomY)
      pdf.line(rightX, cursorY, rightX, contentBottomY)
      pdf.setFillColor(safeColors.slate50)
      pdf.rect(leftX, cursorY, sectionWidth, headingHeight, 'F')
      drawText(t('notesAndTerms').toUpperCase(), textStartX, cursorY + 14, { bold: true, size: 9, color: safeColors.slate900 })
      cursorY += headingHeight + 10
      sectionStarted = true
    }

    function startContinuationPage() {
      pdf.addPage()
      drawPageFrame()
      cursorY = cardY + 24
      drawSectionShell()
    }

    function ensureNotesSpace(heightNeeded) {
      if (!sectionStarted) {
        ensureSpace(headingHeight + heightNeeded + 10)
        drawSectionShell()
        return
      }

      if (cursorY + heightNeeded <= contentBottomY) return

      pdf.setDrawColor(safeColors.slate200)
      pdf.line(leftX, cursorY + 2, rightX, cursorY + 2)
      pdf.line(leftX, contentBottomY, rightX, contentBottomY)
      startContinuationPage()
    }

    resolvedItems.forEach((item, index) => {
      const contentLines = getRichTextPlainLines(item?.content || '')
        .flatMap((line) => wrapMultilineText(line, 92))
      ensureNotesSpace(24)
      if (index > 0) {
        pdf.setDrawColor(safeColors.slate100)
        pdf.line(textStartX, cursorY - 2, dividerEndX, cursorY - 2)
        cursorY += 6
      }

      drawText(item?.title || '', textStartX, cursorY, { bold: true, size: 10, color: safeColors.slate900 })
      cursorY += 10
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(safeColors.slate700)

      contentLines.forEach((line) => {
        ensureNotesSpace(lineHeight)
        pdf.text(line || ' ', textStartX, cursorY, { maxWidth: sectionWidth - 24 })
        cursorY += lineHeight
      })

      cursorY += 6
    })

    if (sectionStarted) {
      pdf.setDrawColor(safeColors.slate200)
      pdf.line(leftX, contentBottomY, rightX, contentBottomY)
      cursorY += 8
    }
  }

  drawPageFrame()

  pdf.setFillColor(safeColors.slate900)
  pdf.roundedRect(innerX, cursorY - 8, 42, 42, 14, 14, 'F')
  drawText(buildCompanyInitials(company?.name || companyName || t('brandName')) || t('brandInitials'), innerX + 21, cursorY + 17, {
    bold: true,
    size: 12,
    color: safeColors.white,
    align: 'center',
  })

  drawText(company?.name || companyName || t('brandName'), innerX + 54, cursorY + 2, { bold: true, size: 15 })
  if (company?.phone) {
    drawContactIcon('phone', innerX + 54, cursorY + 18)
    drawText(company.phone, innerX + 68, cursorY + 18, { size: 10, color: safeColors.slate900 })
  }
  if (company?.email) {
    drawContactIcon('email', innerX + 54, cursorY + 32)
    drawText(company.email, innerX + 68, cursorY + 32, { size: 10, color: safeColors.slate900 })
  }
  if (company?.website) {
    drawContactIcon('website', innerX + 54, cursorY + 46)
    drawText(company.website, innerX + 68, cursorY + 46, { size: 10, color: safeColors.slate900 })
  }

  drawText(t('contract').toUpperCase(), cardX + cardWidth - 24, cursorY + 2, { bold: true, size: 11, color: safeColors.slate900, align: 'right' })
  drawText(contractNumber, cardX + cardWidth - 24, cursorY + 18, { bold: true, size: 12, color: accentTextColor, align: 'right' })
  if (contractDate) {
    drawText(contractDate, cardX + cardWidth - 24, cursorY + 34, { size: 9, color: safeColors.slate500, align: 'right' })
  }
  cursorY += 52
  const infoRowHeight = 76
  ensureSpace(infoRowHeight + 8)
  pdf.setDrawColor(safeColors.slate200)
  pdf.roundedRect(innerX, cursorY, cardWidth - 40, infoRowHeight, 14, 14, 'S')
  const columnWidth = (cardWidth - 40) / 3
  pdf.line(innerX + columnWidth, cursorY, innerX + columnWidth, cursorY + infoRowHeight)
  pdf.line(innerX + (columnWidth * 2), cursorY, innerX + (columnWidth * 2), cursorY + infoRowHeight)
  drawText(t('billTo').toUpperCase(), innerX + 14, cursorY + 16, { bold: true, size: 9, color: safeColors.slate900 })
  drawText(t('jobLocation').toUpperCase(), innerX + columnWidth + 14, cursorY + 16, { bold: true, size: 9, color: safeColors.slate900 })
  drawText(t('licenseInfo').toUpperCase(), innerX + (columnWidth * 2) + 14, cursorY + 16, { bold: true, size: 9, color: safeColors.slate900 })
  billToLines.forEach((line, index) => drawText(line, innerX + 14, cursorY + 32 + (index * 13), { size: index === 0 ? 10 : 9, color: safeColors.slate700, bold: index === 0 }))
  workLines.forEach((line, index) => drawText(line, innerX + columnWidth + 14, cursorY + 32 + (index * 13), { size: index === 0 ? 10 : 9, color: safeColors.slate700, bold: index === 1 }))
  licenseLines.forEach((line, index) => drawText(line, innerX + (columnWidth * 2) + 14, cursorY + 32 + (index * 13), { size: 9, color: safeColors.slate700 }))
  cursorY += infoRowHeight + 10

  const scopeLines = getRichTextPlainLines(scope).flatMap((line) => wrapMultilineText(line, 72))
  const descriptionSectionWidth = cardWidth - 40
  const totalDividerX = innerX + 314
  const descriptionHeaderHeight = 26

  ensureSpace(64)
  pdf.setDrawColor(safeColors.slate200)
  pdf.roundedRect(innerX, cursorY, descriptionSectionWidth, 52, 14, 14, 'S')
  pdf.setFillColor(safeColors.slate50)
  pdf.rect(innerX, cursorY, descriptionSectionWidth, descriptionHeaderHeight, 'F')
  pdf.line(totalDividerX, cursorY, totalDividerX, cursorY + descriptionHeaderHeight)
  drawText(t('project').toUpperCase(), innerX + 14, cursorY + 17, { bold: true, size: 9, color: safeColors.slate900 })
  drawText(t('projectTotal').toUpperCase(), innerX + descriptionSectionWidth - 14, cursorY + 17, { bold: true, size: 9, color: safeColors.slate900, align: 'right' })
  drawText(lead?.projectTitle || lead?.projectType || t('projectScope'), innerX + 14, cursorY + 40, { bold: true, size: 11 })
  drawText(currency.format(Number(total || 0)), innerX + descriptionSectionWidth - 14, cursorY + 40, { bold: true, size: 15, align: 'right' })
  cursorY += 56

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(safeColors.slate700)

  if (shouldRenderContractScopeText(scope, normalizedWorkBreakdown)) {
    ensureSpace(28)
    drawText(t('projectScope').toUpperCase(), innerX + 14, cursorY, { bold: true, size: 9, color: safeColors.slate900 })
    cursorY += 18
    pdf.setTextColor(safeColors.slate700)
    scopeLines.forEach((line) => {
      ensureSpace(12)
      pdf.text(line || ' ', innerX + 14, cursorY, { maxWidth: descriptionSectionWidth - 28 })
      cursorY += 12
    })
    cursorY += 8
  }

  if (normalizedWorkBreakdown.length > 0) {
    ensureSpace(28)
    drawText(t('workBreakdown').toUpperCase(), innerX + 14, cursorY, { bold: true, size: 9, color: safeColors.slate900 })
    drawText(t('amount').toUpperCase(), innerX + descriptionSectionWidth - 14, cursorY, { bold: true, size: 9, color: safeColors.slate500, align: 'right' })
    cursorY += 20
    normalizedWorkBreakdown.forEach((item, index) => {
      const titleText = (item.titleSegments || []).map((segment) => segment.text).join('') || item.title || t('item')
      const detailLines = (item.descriptionBlocks || []).flatMap((block) => {
        if (block?.type === 'lineBreak') return ['']
        if (block?.type === 'bulletList') return (block.items || []).map((bullet) => `• ${(bullet.segments || []).map((segment) => segment.text).join('')}`)
        if (block?.type === 'paragraph') return [(block.segments || []).map((segment) => segment.text).join('')]
        return []
      }).flatMap((line) => wrapMultilineText(line, 62))
      ensureSpace(28 + (detailLines.length * 12))
      if (index > 0) {
        pdf.setDrawColor(safeColors.slate200)
        pdf.line(innerX + 14, cursorY - 4, innerX + descriptionSectionWidth - 14, cursorY - 4)
      }
      pdf.setDrawColor(accentColor)
      pdf.circle(innerX + 23, cursorY - 3, 9, 'S')
      drawText(String(index + 1), innerX + 23, cursorY, { bold: true, size: 8.5, color: accentTextColor, align: 'center' })
      drawText(titleText, innerX + 40, cursorY, { bold: true, size: 10, color: safeColors.slate900 })
      drawText(currency.format(Number(item.amount || 0)), innerX + descriptionSectionWidth - 14, cursorY, { bold: true, size: 10, color: safeColors.slate900, align: 'right' })
      cursorY += 13
      if (item.materialsStatus || typeof item.materialsIncluded === 'boolean') {
        const tagLabel = getContractMaterialsLabel(item, t)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8.5)
        const tagWidth = Math.min(pdf.getTextWidth(tagLabel) + 14, 150)
        pdf.setDrawColor(accentColor)
        pdf.roundedRect(innerX + 40, cursorY - 9, tagWidth, 15, 7, 7, 'S')
        drawText(tagLabel, innerX + 47, cursorY + 1, { bold: true, size: 8.5, color: accentTextColor })
        cursorY += 12
      }
      detailLines.forEach((line) => {
        ensureSpace(12)
        pdf.setTextColor(safeColors.slate700)
        pdf.text(`• ${line || ''}`, innerX + 40, cursorY, { maxWidth: descriptionSectionWidth - 54 })
        cursorY += 12
      })
      cursorY += 6
    })
  }

  cursorY += 8

  drawNotesSection(notesAndTermsItems)

  ensureSpace(54)
  const signatureColumns = [
    { label: t('contractorDate'), value: '', x: innerX, width: 86 },
    { label: company?.ownerName || company?.name || t('brandName'), value: '', x: innerX + 98, width: 150 },
    { label: t('clientDate'), value: '', x: innerX + 260, width: 86 },
    { label: lead?.client || clientName || t('client'), value: '', x: innerX + 358, width: 150 },
  ]
  signatureColumns.forEach(({ label, value, x, width }) => {
    pdf.setDrawColor(safeColors.slate300)
    pdf.line(x, cursorY + 18, x + width, cursorY + 18)
    if (value) {
      drawText(value, x, cursorY + 14, { size: 9, color: safeColors.slate700 })
    }
    drawText(label, x, cursorY + 32, { bold: true, size: 8, color: safeColors.slate500 })
  })

  const fileName = buildContractPdfFileName({
    contractNumber,
    clientName: lead?.client || clientName,
    companyName: company?.name || companyName,
  })
  pdf.save(fileName)
  return fileName
}

export function buildContractPdfFileName({ contractNumber = '', clientName = '', companyName = '' } = {}) {
  const parts = [
    'Contract',
    sanitizeFileSegment(contractNumber),
    sanitizeFileSegment(clientName),
    sanitizeFileSegment(buildCompanyInitials(companyName)),
  ].filter(Boolean)

  return `${parts.join('-')}.pdf`
}

export async function downloadContractPdf({
  element,
  contractNumber = '',
  contractDate = '',
  notesAndTermsItems = [],
  clientName = '',
  companyName = '',
  company = {},
  lead = {},
  scope = '',
  workBreakdown = [],
  acceptanceLegalText = '',
  depositAmount = null,
  paymentTerms = '',
  materials = '',
  timeline = '',
  changeOrders = '',
  clientResponsibilities = '',
  warrantyDisclaimer = '',
  total = 0,
  t = (key) => key,
} = {}) {
  if (!element) {
    throw new Error('Contract PDF template is not ready.')
  }

  try {
    await waitForEstimateDocumentAssets(element)
    const pageWidth = ESTIMATE_PAPER_WIDTH
    const margin = ESTIMATE_PAPER_MARGIN
    const renderWidth = pageWidth - (margin * 2)
    const pagination = getEstimatePaginationModel(element)
    if (!pagination?.pageCount) {
      throw new Error('Contract PDF pagination could not be calculated.')
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

        const clonedRoot = clonedDoc.querySelector('[data-contract-pdf-root="true"]')
        sanitizeCloneTree(clonedRoot, clonedDoc)
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
      const canvasHeight = Math.min(page.height * canvasScale, canvas.height - canvasStart)
      if (index > 0) pdf.addPage()
      const pageCanvas = createContractCanvasSlice(canvas, canvasStart, canvasHeight)
      const renderedHeight = (pageCanvas.height * renderWidth) / pageCanvas.width
      pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, renderWidth, renderedHeight, undefined, 'FAST')
    })

    const fileName = buildContractPdfFileName({
      contractNumber,
      clientName: lead?.client || clientName,
      companyName: company?.name || companyName,
    })
    pdf.save(fileName)
    return fileName
  } catch (error) {
    return buildFallbackPdf({
      contractNumber,
      contractDate,
      notesAndTermsItems,
      clientName,
      companyName,
      company,
      lead,
      scope,
      workBreakdown,
      acceptanceLegalText,
      depositAmount,
      paymentTerms,
      materials,
      timeline,
      changeOrders,
      clientResponsibilities,
      warrantyDisclaimer,
      total,
      t,
    })
  }
}

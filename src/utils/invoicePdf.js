import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const letterPage = {
  width: 612,
  height: 792,
  margin: 36,
}

const invalidFileNameCharacters = /[<>:"/\\|?*\u0000-\u001f]/g
const protectedPageBreakSelectors = [
  '.invoice-document-header',
  '.invoice-document-information',
  '.invoice-document-table tr',
  '.invoice-document-summary',
  '.invoice-document-balance',
  '.invoice-document-final-content',
  '.invoice-document-footer',
]

function sanitizeFileNameSegment(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(invalidFileNameCharacters, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;_-]+|[\s.,;_-]+$/g, '')
    .trim()
}

export function buildInvoicePdfFileName({ invoiceNumber = '', clientName = '' } = {}) {
  const safeInvoiceNumber = sanitizeFileNameSegment(invoiceNumber)
  const safeClientName = sanitizeFileNameSegment(clientName)

  const parts = [
    safeInvoiceNumber,
    safeClientName,
    'Invoice.pdf',
  ].filter(Boolean)

  return parts.join(' - ')
}

async function waitForImage(image) {
  if (image.complete) {
    if (typeof image.decode === 'function') {
      try {
        await image.decode()
      } catch {
        // A failed optional logo must not prevent an otherwise valid invoice.
      }
    }
    return
  }

  await new Promise((resolve) => {
    const finish = () => resolve()
    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
    window.setTimeout(finish, 3000)
  })
}

export async function waitForInvoiceDocumentAssets(element) {
  if (!element) {
    throw new Error('Invoice PDF template is not ready.')
  }

  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  await Promise.all(Array.from(element.querySelectorAll('img')).map(waitForImage))
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
}

function getProtectedPageBreakRanges(element) {
  const rootRect = element.getBoundingClientRect()
  const renderedScale = rootRect.width > 0 && element.offsetWidth > 0
    ? rootRect.width / element.offsetWidth
    : 1

  return Array.from(element.querySelectorAll(protectedPageBreakSelectors.join(',')))
    .map((node) => {
      const nodeRect = node.getBoundingClientRect()
      return {
        start: Math.max((nodeRect.top - rootRect.top) / renderedScale, 0),
        end: Math.max((nodeRect.bottom - rootRect.top) / renderedScale, 0),
      }
    })
    .filter(({ start, end }) => end > start)
    .sort((left, right) => left.start - right.start)
}

export function calculateInvoicePageBreakOffsets({
  contentHeight,
  sourcePageHeight,
  protectedRanges = [],
}) {
  const breaks = [0]
  let pageStart = 0

  while (contentHeight - pageStart > sourcePageHeight) {
    const target = pageStart + sourcePageHeight
    const containingRange = protectedRanges.find(({ start, end }) => start < target && end > target)
    let nextBreak = target

    if (containingRange) {
      const beforeRange = containingRange.start
      const afterRange = containingRange.end
      const minimumUsefulPageHeight = sourcePageHeight * 0.35

      nextBreak = beforeRange - pageStart >= minimumUsefulPageHeight
        || afterRange - pageStart > sourcePageHeight
        ? beforeRange
        : afterRange
    }

    if (nextBreak <= pageStart || nextBreak >= contentHeight) {
      nextBreak = Math.min(pageStart + sourcePageHeight, contentHeight)
    }

    breaks.push(nextBreak)
    pageStart = nextBreak
  }

  breaks.push(contentHeight)
  return breaks
}

function getPageBreakOffsets(element, sourcePageHeight) {
  return calculateInvoicePageBreakOffsets({
    contentHeight: Math.max(element.scrollHeight, element.offsetHeight),
    sourcePageHeight,
    protectedRanges: getProtectedPageBreakRanges(element),
  })
}

function createCanvasSlice(sourceCanvas, startY, height) {
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

export async function downloadInvoicePdf({
  element,
  invoiceNumber = '',
  clientName = '',
} = {}) {
  await waitForInvoiceDocumentAssets(element)

  const elementWidth = Math.max(element.scrollWidth, element.getBoundingClientRect().width)
  const renderWidth = letterPage.width - (letterPage.margin * 2)
  const printableHeight = letterPage.height - (letterPage.margin * 2)
  const sourcePageHeight = printableHeight / (renderWidth / elementWidth)
  const pageBreakOffsets = getPageBreakOffsets(element, sourcePageHeight)

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    onclone: (clonedDocument) => {
      const clonedRoot = clonedDocument.querySelector('[data-invoice-pdf-template="true"]')

      if (!clonedRoot) return

      clonedDocument.documentElement.style.backgroundColor = '#ffffff'
      clonedDocument.body.style.margin = '0'
      clonedDocument.body.style.backgroundColor = '#ffffff'
      clonedDocument.body.replaceChildren(clonedRoot)
      clonedRoot.style.width = `${elementWidth}px`
      clonedRoot.style.maxWidth = 'none'
      clonedRoot.style.margin = '0'
      clonedRoot.style.boxShadow = 'none'
      clonedRoot.style.transform = 'none'
    },
  })

  if (!canvas.width || !canvas.height) {
    throw new Error('Invoice PDF rendering returned an empty document.')
  }

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

    const pageCanvas = createCanvasSlice(canvas, canvasStart, canvasHeight)
    const renderedHeight = (pageCanvas.height * renderWidth) / pageCanvas.width
    pdf.addImage(
      pageCanvas.toDataURL('image/png'),
      'PNG',
      letterPage.margin,
      letterPage.margin,
      renderWidth,
      renderedHeight,
      undefined,
      'FAST'
    )
  })

  const fileName = buildInvoicePdfFileName({ invoiceNumber, clientName })
  pdf.save(fileName)
  return fileName
}

export default downloadInvoicePdf

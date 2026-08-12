import { calculateDocumentPageBreakOffsets } from './documentPagination.js'

export const ESTIMATE_PAPER_WIDTH = 612
export const ESTIMATE_PAPER_HEIGHT = 792
export const ESTIMATE_PAPER_MARGIN = 36
export const ESTIMATE_DOCUMENT_SOURCE_WIDTH = 780
export const ESTIMATE_DOCUMENT_SOURCE_PADDING = 0
export const ESTIMATE_DOCUMENT_BORDER_WIDTH = 1
export const ESTIMATE_DOCUMENT_HORIZONTAL_PADDING = 20
export const ESTIMATE_RICH_CONTENT_BORDER_WIDTH = 1
export const ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING = 12

export function getEstimatePrintableWidthModel(sourceWidth = ESTIMATE_DOCUMENT_SOURCE_WIDTH) {
  const printablePaperWidth = ESTIMATE_PAPER_WIDTH - (ESTIMATE_PAPER_MARGIN * 2)
  const sourceToPaperScale = printablePaperWidth / sourceWidth
  const documentOuterWidth = sourceWidth - (ESTIMATE_DOCUMENT_SOURCE_PADDING * 2)
  const documentInnerWidth = documentOuterWidth
    - (ESTIMATE_DOCUMENT_BORDER_WIDTH * 2)
    - (ESTIMATE_DOCUMENT_HORIZONTAL_PADDING * 2)
  const richContentWidth = documentInnerWidth
    - (ESTIMATE_RICH_CONTENT_BORDER_WIDTH * 2)
    - (ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING * 2)

  return {
    printablePaperWidth,
    sourceToPaperScale,
    documentOuterWidth,
    documentInnerWidth,
    richContentWidth,
    richContentPaperWidth: richContentWidth * sourceToPaperScale,
  }
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

function getElementSourceRange(element, rootRect, renderedScale, inset = 0) {
  if (!element) return null

  const rect = element.getBoundingClientRect()
  if (!rect || rect.height <= 0) return null

  return {
    start: Math.max((rect.top - rootRect.top - inset) / renderedScale, 0),
    end: Math.max((rect.bottom - rootRect.top + inset) / renderedScale, 0),
  }
}

function getTextLineRanges(flowNode, rootElement, rootRect, renderedScale) {
  const ownerDocument = rootElement.ownerDocument
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
        if (!rect || rect.height <= 0) return

        ranges.push({
          start: Math.max((rect.top - rootRect.top - 1) / renderedScale, 0),
          end: Math.max((rect.bottom - rootRect.top + 1) / renderedScale, 0),
        })
      })

      textRange.detach?.()
    }

    textNode = walker.nextNode()
  }

  return ranges
}

function collectDocumentProtectedRanges(element, sourcePageHeight) {
  const rootRect = element.getBoundingClientRect()
  const renderedScale = rootRect.width > 0 && element.offsetWidth > 0
    ? rootRect.width / element.offsetWidth
    : 1
  const protectedRanges = []
  const getRange = (node) => getElementSourceRange(node, rootRect, renderedScale)
  const combineRanges = (firstNode, lastNode) => {
    const firstRange = getRange(firstNode)
    const lastRange = getRange(lastNode)
    if (!firstRange || !lastRange) return null

    return {
      start: Math.min(firstRange.start, lastRange.start),
      end: Math.max(firstRange.end, lastRange.end),
    }
  }

  const closingSection = element.querySelector('[data-estimate-footer-section="true"]')
  const documentFooter = element.querySelector('[data-estimate-footer="true"]')
  const closingGroupRange = combineRanges(closingSection, documentFooter)

  if (closingGroupRange && closingGroupRange.end - closingGroupRange.start <= sourcePageHeight * 0.92) {
    protectedRanges.push(closingGroupRange)
  }

  const workHeading = element.querySelector('[data-estimate-work-heading="true"], [data-contract-work-heading="true"]')
  const firstWorkItem = element.querySelector('[data-line-item-card="true"]')
  const firstWorkGroupRange = combineRanges(workHeading, firstWorkItem)

  if (firstWorkGroupRange && firstWorkGroupRange.end - firstWorkGroupRange.start <= sourcePageHeight * 0.45) {
    protectedRanges.push(firstWorkGroupRange)
  }

  element.querySelectorAll(
    '[data-estimate-keep-together="true"], [data-estimate-work-heading="true"], [data-estimate-footer="true"], [data-contract-keep-together="true"], [data-contract-work-heading="true"], [data-contract-signatures="true"]'
  ).forEach((node) => {
    const range = getRange(node)
    if (range) protectedRanges.push(range)
  })

  element.querySelectorAll('[data-estimate-section-heading="true"], [data-contract-section-heading="true"]').forEach((heading) => {
    const section = heading.closest('[data-estimate-section="true"], [data-contract-section="true"]')
    const firstFlowNode = section?.querySelector('[data-estimate-flow-text="true"], [data-contract-flow-text="true"]')
    const headingRange = getRange(heading)
    const firstLineRange = firstFlowNode
      ? getTextLineRanges(firstFlowNode, element, rootRect, renderedScale)[0]
      : null
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

  element.querySelectorAll('[data-estimate-flow-text="true"], [data-contract-flow-text="true"]').forEach((flowNode) => {
    protectedRanges.push(...getTextLineRanges(flowNode, element, rootRect, renderedScale))
  })

  return protectedRanges
}

export function getEstimatePaginationModel(element) {
  if (!element) return null

  const elementWidth = Math.max(
    element.scrollWidth,
    element.offsetWidth,
    element.getBoundingClientRect?.().width || 0
  )
  const contentHeight = Math.max(element.scrollHeight, element.offsetHeight)
  if (!elementWidth || !contentHeight) return null

  const printableWidth = ESTIMATE_PAPER_WIDTH - (ESTIMATE_PAPER_MARGIN * 2)
  const printableHeight = ESTIMATE_PAPER_HEIGHT - (ESTIMATE_PAPER_MARGIN * 2)
  const sourceScale = elementWidth / printableWidth
  const sourcePageHeight = printableHeight * sourceScale
  const protectedRanges = collectDocumentProtectedRanges(element, sourcePageHeight)
  const pageBreakOffsets = calculateEstimatePageBreakOffsets({
    contentHeight,
    sourcePageHeight,
    protectedRanges,
  })
  const pages = pageBreakOffsets.slice(0, -1).map((start, index) => ({
    index,
    number: index + 1,
    start,
    end: pageBreakOffsets[index + 1],
    height: pageBreakOffsets[index + 1] - start,
  }))

  return {
    elementWidth,
    contentHeight,
    sourcePageHeight,
    sourceScale,
    paperWidth: ESTIMATE_PAPER_WIDTH * sourceScale,
    paperHeight: ESTIMATE_PAPER_HEIGHT * sourceScale,
    paperMargin: ESTIMATE_PAPER_MARGIN * sourceScale,
    pageBreakOffsets,
    pages,
    pageCount: pages.length,
    widthModel: getEstimatePrintableWidthModel(elementWidth),
  }
}

function waitForImage(image) {
  if (image.complete) {
    return image.decode?.().catch(() => undefined) || Promise.resolve()
  }

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId)
      image.removeEventListener('load', finish)
      image.removeEventListener('error', finish)
      resolve()
    }
    const timeoutId = setTimeout(finish, 2500)

    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
  })
}

function waitForPaint(ownerWindow) {
  return new Promise((resolve) => {
    const requestFrame = ownerWindow?.requestAnimationFrame?.bind(ownerWindow)
    if (!requestFrame) {
      setTimeout(resolve, 0)
      return
    }

    requestFrame(() => requestFrame(resolve))
  })
}

export async function waitForEstimateDocumentAssets(element) {
  if (!element) return

  const ownerDocument = element.ownerDocument
  if (ownerDocument?.fonts?.ready) {
    await ownerDocument.fonts.ready.catch(() => undefined)
  }

  await Promise.all(Array.from(element.querySelectorAll('img')).map(waitForImage))
  await waitForPaint(ownerDocument?.defaultView)
}

export default getEstimatePaginationModel

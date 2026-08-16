import { DOCUMENT_PAPER_WIDTH_INCHES, getDocumentPaperGeometry, getPaginatedPrintPageLayout } from './documentPaper'
import { getEstimatePaginationModel, waitForEstimateDocumentAssets } from './estimatePagination'

const defaultPrintPageMarginInches = 0.45
const printPageWidthInches = DOCUMENT_PAPER_WIDTH_INCHES
const defaultPrintSafeInsetInches = 0.2
const printReadinessTimeoutMs = 3200
const printLifecycleTimeoutMs = 1800

export const PRINT_WINDOW_BLOCKED_ERROR_CODE = 'PRINT_WINDOW_BLOCKED'

function createPrintError(message, code = '') {
  const error = new Error(message)
  error.code = code
  return error
}

export function isPrintWindowBlockedError(error) {
  return error?.code === PRINT_WINDOW_BLOCKED_ERROR_CODE
}

function waitForBoundedReadiness(promise, timeoutMs = printReadinessTimeoutMs) {
  return new Promise((resolve) => {
    let hasSettled = false
    const finish = () => {
      if (hasSettled) return
      hasSettled = true
      clearTimeout(timeoutId)
      resolve()
    }
    const timeoutId = setTimeout(finish, timeoutMs)

    Promise.resolve(promise).then(finish, finish)
  })
}

async function copyDocumentStyles(targetDocument) {
  const sourceNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))

  const pendingLoads = sourceNodes.map((sourceNode) => {
    const clonedNode = sourceNode.cloneNode(true)

    if (clonedNode.tagName === 'LINK' && sourceNode.href) {
      clonedNode.href = sourceNode.href
    }

    targetDocument.head.appendChild(clonedNode)

    if (clonedNode.tagName !== 'LINK') {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      clonedNode.addEventListener('load', resolve, { once: true })
      clonedNode.addEventListener('error', resolve, { once: true })
      setTimeout(resolve, 1200)
    })
  })

  await Promise.all(pendingLoads)

  if (targetDocument.fonts?.ready) {
    await waitForBoundedReadiness(targetDocument.fonts.ready)
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function preparePrintContentNode(contentNode) {
  if (!contentNode?.style) return

  contentNode.querySelectorAll?.('[data-aymero-loader]').forEach((loaderNode) => loaderNode.remove())

  contentNode.style.width = '100%'
  contentNode.style.maxWidth = '100%'
  contentNode.style.padding = '0'
  contentNode.style.margin = '0 auto'
  contentNode.style.boxSizing = 'border-box'
  contentNode.style.overflow = 'visible'

  const documentSheet = contentNode.querySelector('.document-sheet')

  if (documentSheet?.style) {
    documentSheet.style.width = '100%'
    documentSheet.style.maxWidth = '100%'
    documentSheet.style.boxSizing = 'border-box'
    documentSheet.style.boxShadow = 'none'
  }
}

function isSharedPaginatedDocument(element) {
  return Boolean(element?.querySelector?.('[data-estimate-document="true"], [data-contract-document="true"]'))
}

function createPaginatedPrintContent(element, targetDocument, pagination) {
  const pageLayout = getPaginatedPrintPageLayout(pagination)
  const container = targetDocument.createElement('div')
  container.dataset.documentPaginatedPrint = 'true'
  container.style.display = 'block'
  container.style.width = `${pageLayout.outputWidth}px`
  container.style.height = 'auto'
  container.style.margin = '0'
  container.style.padding = '0'
  container.style.overflow = 'visible'

  pagination.pages.forEach((page, index) => {
    const pageNode = targetDocument.createElement('section')
    pageNode.dataset.documentPrintPage = 'true'
    pageNode.style.position = 'relative'
    pageNode.style.display = 'block'
    pageNode.style.width = `${pageLayout.outputWidth}px`
    pageNode.style.height = `${pageLayout.outputHeight}px`
    pageNode.style.overflow = 'hidden'
    pageNode.style.boxSizing = 'border-box'
    pageNode.style.breakInside = 'avoid'
    pageNode.style.pageBreakInside = 'avoid'

    if (index < pagination.pages.length - 1) {
      pageNode.style.breakAfter = 'page'
      pageNode.style.pageBreakAfter = 'always'
    }

    const viewportNode = targetDocument.createElement('div')
    viewportNode.style.position = 'absolute'
    viewportNode.style.left = '0'
    viewportNode.style.top = '0'
    viewportNode.style.width = `${pageLayout.sourceWidth}px`
    viewportNode.style.height = `${page.height}px`
    viewportNode.style.overflow = 'hidden'
    viewportNode.style.transform = `scale(${pageLayout.scale})`
    viewportNode.style.transformOrigin = 'top left'

    const sliceNode = targetDocument.createElement('div')
    sliceNode.style.position = 'absolute'
    sliceNode.style.left = '0'
    sliceNode.style.top = '0'
    sliceNode.style.width = `${pagination.elementWidth}px`
    sliceNode.style.transform = `translateY(-${page.start}px)`
    sliceNode.style.transformOrigin = 'top left'

    const clonedSource = element.cloneNode(true)
    clonedSource.querySelectorAll?.('[data-aymero-loader]').forEach((loaderNode) => loaderNode.remove())
    clonedSource.style.width = `${pagination.elementWidth}px`
    clonedSource.style.maxWidth = 'none'
    clonedSource.style.margin = '0'
    clonedSource.style.boxSizing = 'border-box'
    clonedSource.style.overflow = 'visible'
    sliceNode.appendChild(clonedSource)
    viewportNode.appendChild(sliceNode)
    pageNode.appendChild(viewportNode)
    container.appendChild(pageNode)
  })

  return container
}

function makePrintContextReady(printWindow, printLabel = '') {
  const loadingNode = printWindow.document.querySelector('[data-print-loading="true"]')
  const actionButton = printWindow.document.querySelector('[data-print-action="true"]')

  if (loadingNode) {
    loadingNode.remove()
  }
  if (!actionButton || !printLabel) return

  actionButton.textContent = printLabel
  actionButton.hidden = false
  actionButton.addEventListener('click', () => {
    if (printWindow.closed) return
    printWindow.focus()
    printWindow.print()
  })
}

function waitForPrintImage(image) {
  if (image.complete) {
    if (!image.decode) return Promise.resolve()

    try {
      return waitForBoundedReadiness(image.decode(), 1200)
    } catch {
      return Promise.resolve()
    }
  }

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId)
      image.removeEventListener('load', finish)
      image.removeEventListener('error', finish)
      resolve()
    }
    const timeoutId = setTimeout(finish, printReadinessTimeoutMs)

    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
  })
}

function invokePrintAndObserveLifecycle(printWindow) {
  return new Promise((resolve, reject) => {
    let hasSettled = false
    const finish = (afterPrintObserved) => {
      if (hasSettled) return
      hasSettled = true
      clearTimeout(timeoutId)
      printWindow.removeEventListener('afterprint', handleAfterPrint)
      resolve(afterPrintObserved)
    }
    const handleAfterPrint = () => finish(true)
    const timeoutId = setTimeout(() => finish(false), printLifecycleTimeoutMs)

    printWindow.addEventListener('afterprint', handleAfterPrint, { once: true })

    try {
      printWindow.focus()
      printWindow.print()
    } catch (error) {
      clearTimeout(timeoutId)
      printWindow.removeEventListener('afterprint', handleAfterPrint)
      reject(error)
    }
  })
}

export async function printDocumentElement(element, {
  documentTitle = 'Document',
  pageMarginInches = defaultPrintPageMarginInches,
  safeInsetInches = defaultPrintSafeInsetInches,
  printLabel = '',
} = {}) {
  if (!element) {
    throw new Error('Document preview is not ready.')
  }

  let printWindow = null

  try {
    printWindow = window.open('', '_blank', 'width=900,height=1200')
  } catch {
    throw createPrintError('Unable to open the print preview window.', PRINT_WINDOW_BLOCKED_ERROR_CODE)
  }

  if (!printWindow) {
    throw createPrintError('Unable to open the print preview window.', PRINT_WINDOW_BLOCKED_ERROR_CODE)
  }

  try {
    const usesSharedPagination = isSharedPaginatedDocument(element)
    const authoritativePaperGeometry = getDocumentPaperGeometry()
    const normalizedPageMargin = usesSharedPagination
      ? authoritativePaperGeometry.pageMarginInches
      : Number.isFinite(Number(pageMarginInches))
      ? Math.max(Number(pageMarginInches), 0)
      : defaultPrintPageMarginInches
    const normalizedSafeInset = usesSharedPagination
      ? 0
      : Number.isFinite(Number(safeInsetInches))
      ? Math.max(Number(safeInsetInches), 0)
      : defaultPrintSafeInsetInches
    const printableWidthInches = printPageWidthInches - (normalizedPageMargin * 2)
    const printContentMaxWidthInches = Math.max(printableWidthInches - normalizedSafeInset, 0)
    let pagination = null
    let contentNode = null

    // The shell is written before the first async boundary so iOS keeps the
    // synchronously opened context attached to the originating user gesture.
    printWindow.document.open()
    printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <base href="${escapeHtml(document.baseURI)}" />
        <title>${escapeHtml(documentTitle)}</title>
        <style>
          @page { size: letter; margin: ${normalizedPageMargin}in; }
          html, body { margin: 0; padding: 0; width: 100%; height: auto; min-height: 0; background: #ffffff; color: #0f172a; }
          body { overflow: visible; font-family: ui-sans-serif, system-ui, sans-serif; }
          img { max-width: 100%; }
          [data-print-root="true"] {
            width: calc(100% - ${normalizedSafeInset}in);
            max-width: ${printContentMaxWidthInches}in;
            min-width: 0;
            height: auto;
            min-height: 0;
            margin: 0 auto;
            box-sizing: border-box;
            display: block;
            overflow: visible;
          }
          [data-print-loading="true"] {
            position: fixed;
            inset: 0;
            display: grid;
            place-items: center;
            background: #ffffff;
          }
          .aymero-print-loader__visual {
            position: relative;
            display: grid;
            width: 3.5rem;
            height: 3.5rem;
            place-items: center;
          }
          .aymero-print-loader__mark {
            width: 2.25rem;
            height: 2.25rem;
            object-fit: contain;
          }
          .aymero-print-loader__ring {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            fill: none;
            stroke-linecap: round;
            stroke-width: 2.4;
          }
          .aymero-print-loader__track { stroke: rgba(15, 139, 141, 0.18); }
          .aymero-print-loader__accent { stroke: #0f8b8d; }
          .aymero-print-loader__orbit {
            position: absolute;
            inset: 0;
            animation: aymero-print-orbit 1.6s linear infinite;
          }
          .aymero-print-loader__dot {
            position: absolute;
            top: 0.125rem;
            left: 50%;
            width: 0.4rem;
            height: 0.4rem;
            border-radius: 9999px;
            background: #0f8b8d;
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
            transform: translateX(-50%);
          }
          [data-print-action="true"] {
            position: fixed;
            right: 1rem;
            bottom: max(1rem, env(safe-area-inset-bottom));
            z-index: 1000;
            border: 0;
            border-radius: 9999px;
            padding: 0.8rem 1.15rem;
            background: #0f172a;
            color: #ffffff;
            font: 700 0.875rem/1 ui-sans-serif, system-ui, sans-serif;
            box-shadow: 0 12px 30px rgba(15, 23, 42, 0.24);
          }
          @keyframes aymero-print-orbit { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) {
            .aymero-print-loader__orbit { animation: none; transform: rotate(40deg); }
          }
          [data-print-root="true"], [data-print-root="true"] * {
            box-sizing: border-box;
          }
          [data-print-root="true"] > * {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
          }
          [data-print-root="true"] .document-sheet {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
          }
          [data-print-root="true"] [data-document-paginated-print="true"] {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
          }
          [data-print-root="true"] [data-document-print-page="true"] {
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          [data-print-root="true"] article,
          [data-print-root="true"] section,
          [data-print-root="true"] div {
            break-inside: auto;
          }
          [data-print-root="true"] [data-line-item-card="true"] {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          [data-print-root="true"] [data-estimate-section-heading="true"],
          [data-print-root="true"] [data-estimate-work-heading="true"],
          [data-print-root="true"] [data-estimate-keep-together="true"],
          [data-print-root="true"] [data-estimate-totals="true"],
          [data-print-root="true"] [data-estimate-validity="true"],
          [data-print-root="true"] [data-estimate-footer="true"] {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          [data-print-root="true"] [data-estimate-flow-text="true"] {
            orphans: 3;
            widows: 3;
          }
          [data-print-root="true"] .invoice-document-information,
          [data-print-root="true"] .invoice-document-summary,
          [data-print-root="true"] .invoice-document-balance,
          [data-print-root="true"] .invoice-document-final-content,
          [data-print-root="true"] .invoice-document-payment-methods,
          [data-print-root="true"] .invoice-document-footer {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          @media print {
            html, body { height: auto !important; min-height: 0 !important; background: #ffffff; overflow: visible !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            [data-print-loading="true"], [data-print-action="true"] { display: none !important; }
            [data-print-root="true"] {
              width: calc(100% - ${normalizedSafeInset}in);
              max-width: ${printContentMaxWidthInches}in;
            }
          }
        </style>
      </head>
      <body>
        <div data-print-loading="true" data-aymero-loader="document" role="status" aria-live="polite" aria-label="${escapeHtml(documentTitle)}">
          <span class="aymero-print-loader__visual" aria-hidden="true">
            <svg class="aymero-print-loader__ring" viewBox="0 0 64 64" focusable="false">
              <circle class="aymero-print-loader__track" cx="32" cy="32" r="27"></circle>
              <path class="aymero-print-loader__accent" d="M 10.2 48 A 27 27 0 0 1 45.5 8.6"></path>
            </svg>
            <span class="aymero-print-loader__orbit"><span class="aymero-print-loader__dot"></span></span>
            <img class="aymero-print-loader__mark" src="/AppLogoDark.png" alt="" />
          </span>
        </div>
        <button type="button" data-print-action="true" hidden></button>
        <div data-print-root="true"></div>
      </body>
    </html>
  `)
    printWindow.document.close()

    const styleReadiness = copyDocumentStyles(printWindow.document)

    if (usesSharedPagination) {
      await waitForBoundedReadiness(waitForEstimateDocumentAssets(element))
      pagination = getEstimatePaginationModel(element)
      if (!pagination?.pageCount) throw new Error('Document print pagination could not be calculated.')
    } else {
      contentNode = element.cloneNode(true)
      preparePrintContentNode(contentNode)
    }

    await styleReadiness

    const layoutOverride = printWindow.document.createElement('style')
    layoutOverride.textContent = `
      @page { size: letter; margin: ${normalizedPageMargin}in; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
      }
      [data-print-root="true"] {
        width: calc(100% - ${normalizedSafeInset}in);
        max-width: ${printContentMaxWidthInches}in;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 auto !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      @media print {
        html, body, [data-print-root="true"] {
          height: auto !important;
          min-height: 0 !important;
        }
        [data-print-loading="true"], [data-print-action="true"] {
          display: none !important;
        }
      }
    `
    printWindow.document.head.appendChild(layoutOverride)

    const mountPoint = printWindow.document.querySelector('[data-print-root="true"]')

    if (!mountPoint) {
      throw new Error('Print preview could not be prepared.')
    }

    if (usesSharedPagination) {
      mountPoint.replaceChildren(createPaginatedPrintContent(element, printWindow.document, pagination))
    } else {
      mountPoint.replaceChildren(contentNode)
    }

    await waitForBoundedReadiness(
      new Promise((resolve) => printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(resolve))),
      500,
    )

    const imageElements = Array.from(printWindow.document.images || [])
    await Promise.all(imageElements.map(waitForPrintImage))
    makePrintContextReady(printWindow, printLabel)

    const afterPrintObserved = await invokePrintAndObserveLifecycle(printWindow)

    // Desktop browsers reliably emit afterprint. Mobile Safari and embedded
    // browsers may not; in that case keep the rendered preview and its Print
    // button available instead of force-closing into a dead blank context.
    if (afterPrintObserved && !printWindow.closed) {
      printWindow.close()
    }
  } catch (error) {
    if (!printWindow.closed) {
      printWindow.close()
    }
    throw error
  }
}

export default printDocumentElement

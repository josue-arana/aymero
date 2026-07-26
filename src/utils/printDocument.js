const printPageMarginInches = 0.45
const printPageWidthInches = 8.5
const printableWidthInches = printPageWidthInches - (printPageMarginInches * 2)
const printSafeInsetInches = 0.2
const printContentMaxWidthInches = printableWidthInches - printSafeInsetInches

async function copyDocumentStyles(targetDocument) {
  const sourceNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))

  const pendingLoads = sourceNodes.map((sourceNode) => {
    const clonedNode = sourceNode.cloneNode(true)
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
    await targetDocument.fonts.ready
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

export async function printDocumentElement(element, { documentTitle = 'Document' } = {}) {
  if (!element) {
    throw new Error('Document preview is not ready.')
  }

  const printWindow = window.open('', '_blank', 'width=900,height=1200')

  if (!printWindow) {
    throw new Error('Unable to open the print preview window.')
  }

  try {
    const contentNode = element.cloneNode(true)
    preparePrintContentNode(contentNode)

    printWindow.document.open()
    printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(documentTitle)}</title>
        <style>
          @page { size: letter; margin: ${printPageMarginInches}in; }
          html, body { margin: 0; padding: 0; width: 100%; background: #ffffff; color: #0f172a; }
          body { font-family: ui-sans-serif, system-ui, sans-serif; }
          img { max-width: 100%; }
          [data-print-root="true"] {
            width: calc(100% - ${printSafeInsetInches}in);
            max-width: ${printContentMaxWidthInches}in;
            min-width: 0;
            margin: 0 auto;
            box-sizing: border-box;
            display: block;
            overflow: visible;
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
          [data-print-root="true"] article,
          [data-print-root="true"] section,
          [data-print-root="true"] div {
            break-inside: auto;
          }
          [data-print-root="true"] [data-line-item-card="true"] {
            break-inside: avoid;
            page-break-inside: avoid;
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
            html, body { background: #ffffff; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            [data-print-root="true"] {
              width: calc(100% - ${printSafeInsetInches}in);
              max-width: ${printContentMaxWidthInches}in;
            }
          }
        </style>
      </head>
      <body>
        <div data-print-root="true"></div>
      </body>
    </html>
  `)
    printWindow.document.close()
    await copyDocumentStyles(printWindow.document)

    const mountPoint = printWindow.document.querySelector('[data-print-root="true"]')

    if (!mountPoint) {
      throw new Error('Print preview could not be prepared.')
    }

    mountPoint.replaceChildren(contentNode)

    await new Promise((resolve) => printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(resolve)))

    const imageElements = Array.from(printWindow.document.images || [])
    await Promise.all(imageElements.map((image) => {
      if (image.complete) return Promise.resolve()

      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
        setTimeout(resolve, 3000)
      })
    }))

    printWindow.focus()

    await new Promise((resolve) => {
      const finalize = () => {
        printWindow.removeEventListener('afterprint', finalize)
        resolve()
      }

      printWindow.addEventListener('afterprint', finalize, { once: true })
      setTimeout(finalize, 1500)
      printWindow.print()
    })

    printWindow.close()
  } catch (error) {
    if (!printWindow.closed) {
      printWindow.close()
    }
    throw error
  }
}

export default printDocumentElement

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  getDocumentPaperGeometry,
  getPaginatedPrintPageLayout,
} from '../src/utils/documentPaper.js'
import { calculateDocumentPageBreakOffsets as calculateSourcePageBreakOffsets } from '../src/utils/documentPagination.js'

const expectedPrintableWidthCssPixels = 7.5 * 96
const expectedPrintableHeightCssPixels = 10 * 96

const canonicalGeometry = getDocumentPaperGeometry()
const onePageBreaks = calculateSourcePageBreakOffsets({
  contentHeight: canonicalGeometry.sourcePageHeight - 1,
  sourcePageHeight: canonicalGeometry.sourcePageHeight,
})
assert.equal(onePageBreaks.length, 2)
assert.equal(onePageBreaks[0], 0)
assert.ok(onePageBreaks[1] < canonicalGeometry.sourcePageHeight)

const overflowingBreaks = calculateSourcePageBreakOffsets({
  contentHeight: canonicalGeometry.sourcePageHeight + 120,
  sourcePageHeight: canonicalGeometry.sourcePageHeight,
})
assert.equal(overflowingBreaks.length, 3)
assert.equal(overflowingBreaks[0], 0)
assert.equal(overflowingBreaks[1], canonicalGeometry.sourcePageHeight)
assert.equal(overflowingBreaks[2], canonicalGeometry.sourcePageHeight + 120)

for (const sourceWidth of [612, 780, 820]) {
  const geometry = getDocumentPaperGeometry(sourceWidth)
  const layout = getPaginatedPrintPageLayout({
    elementWidth: sourceWidth,
    sourcePageHeight: geometry.sourcePageHeight,
  })

  assert.ok(Math.abs(layout.outputWidth - expectedPrintableWidthCssPixels) < 0.001)
  assert.ok(Math.abs(layout.outputHeight - expectedPrintableHeightCssPixels) < 0.001)
  assert.ok(Math.abs(layout.outputWidthInches - 7.5) < 0.001)
  assert.ok(Math.abs(layout.outputHeightInches - 10) < 0.001)
}

const printSource = readFileSync(
  fileURLToPath(new URL('../src/utils/printDocument.js', import.meta.url)),
  'utf8',
)
const previewSource = readFileSync(
  fileURLToPath(new URL('../src/components/estimates/PaginatedEstimatePreview.jsx', import.meta.url)),
  'utf8',
)
const modalSource = readFileSync(
  fileURLToPath(new URL('../src/components/common/ModalShell.jsx', import.meta.url)),
  'utf8',
)
const estimateBuilderSource = readFileSync(
  fileURLToPath(new URL('../src/pages/EstimateBuilderPage.jsx', import.meta.url)),
  'utf8',
)
const estimateTemplateSource = readFileSync(
  fileURLToPath(new URL('../src/components/estimates/EstimatePdfTemplate.jsx', import.meta.url)),
  'utf8',
)
const estimatePrintStyles = readFileSync(
  fileURLToPath(new URL('../src/components/estimates/estimateDocument.css', import.meta.url)),
  'utf8',
)
const contractPrintStyles = readFileSync(
  fileURLToPath(new URL('../src/components/contracts/contractDocument.css', import.meta.url)),
  'utf8',
)
const estimatePageSource = readFileSync(
  fileURLToPath(new URL('../src/pages/EstimateBuilderPage.jsx', import.meta.url)),
  'utf8',
)
const contractPageSource = readFileSync(
  fileURLToPath(new URL('../src/pages/ContractsPage.jsx', import.meta.url)),
  'utf8',
)
const documentOutputSource = readFileSync(
  fileURLToPath(new URL('../src/utils/documentOutput.js', import.meta.url)),
  'utf8',
)
const estimatePdfSource = readFileSync(
  fileURLToPath(new URL('../src/utils/estimatePdf.js', import.meta.url)),
  'utf8',
)
const contractPdfSource = readFileSync(
  fileURLToPath(new URL('../src/utils/contractPdf.js', import.meta.url)),
  'utf8',
)

assert.doesNotMatch(printSource, /pageNode\.style\.zoom/)
assert.match(printSource, /loadingNode\.remove\(\)/)
assert.match(printSource, /min-height: 0 !important/)
assert.match(printSource, /outputWidthInches/)
assert.match(printSource, /outputHeightInches/)
assert.match(printSource, /data-document-print-page/)
assert.match(printSource, /pageBreakAfter = 'always'/)
assert.match(printSource, /pageBreakInside = 'avoid'/)
assert.match(estimatePrintStyles, /@page[\s\S]*size: letter portrait[\s\S]*margin: 0\.5in/)
assert.match(contractPrintStyles, /@page[\s\S]*size: letter portrait[\s\S]*margin: 0\.5in/)
assert.match(estimatePageSource, /downloadEstimatePdf/)
assert.match(contractPageSource, /downloadContractPdf/)
assert.match(documentOutputSource, /isAppleTouchDevice/)
for (const generatedPdfSource of [estimatePdfSource, contractPdfSource]) {
  assert.match(generatedPdfSource, /getEstimatePaginationModel\(element\)/)
  assert.match(generatedPdfSource, /pages\.forEach/)
  assert.match(generatedPdfSource, /pdf\.addPage\(\)/)
}
assert.doesNotMatch(previewSource, /getPageCountLabel|pageCountSingle|pageCountMultiple/)
assert.match(previewSource, /translationKeys\.pageOf/)
assert.match(modalSource, /resetScrollOnOpen = false/)
assert.match(modalSource, /focusTarget\.focus\(\{ preventScroll: resetScrollOnOpen \}\)/)
assert.match(modalSource, /panelNode\.scrollTop = 0/)
assert.match(estimateBuilderSource, /<ModalShell isOpen=\{showPreviewModal\}[\s\S]*?resetScrollOnOpen/)
assert.match(estimateTemplateSource, /density = 'normal'/)
assert.match(estimateTemplateSource, /density="compact"/)
assert.match(estimateTemplateSource, /padding: '7px 0'/)
assert.match(estimateTemplateSource, /data-estimate-footer="true"/)
assert.match(estimateTemplateSource, /pageBreakInside: 'avoid'/)

// These cases validate canonical pagination arithmetic only. Browser print
// engines still require the manual device checks documented in the sprint
// report because jsdom/Node cannot reproduce WebKit's physical pagination.
const exactTwoPageBreaks = calculateSourcePageBreakOffsets({
  contentHeight: (canonicalGeometry.sourcePageHeight * 2) - 1,
  sourcePageHeight: canonicalGeometry.sourcePageHeight,
})
assert.equal(exactTwoPageBreaks.length, 3)
assert.equal(exactTwoPageBreaks[1], canonicalGeometry.sourcePageHeight)

const nearBoundaryBreaks = calculateSourcePageBreakOffsets({
  contentHeight: canonicalGeometry.sourcePageHeight - 1,
  sourcePageHeight: canonicalGeometry.sourcePageHeight,
  protectedRanges: [{
    start: canonicalGeometry.sourcePageHeight - 18,
    end: canonicalGeometry.sourcePageHeight - 2,
  }],
})
assert.equal(nearBoundaryBreaks.length, 2)
assert.equal(nearBoundaryBreaks[1], canonicalGeometry.sourcePageHeight - 1)

const shortFinalPageBreaks = calculateSourcePageBreakOffsets({
  contentHeight: canonicalGeometry.sourcePageHeight + 24,
  sourcePageHeight: canonicalGeometry.sourcePageHeight,
})
assert.equal(shortFinalPageBreaks.length, 3)
assert.equal(shortFinalPageBreaks.at(-1), canonicalGeometry.sourcePageHeight + 24)

console.log('Document print-layout validation passed.')

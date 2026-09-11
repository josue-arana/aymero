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

assert.doesNotMatch(printSource, /pageNode\.style\.zoom/)
assert.match(printSource, /loadingNode\.remove\(\)/)
assert.match(printSource, /min-height: 0 !important/)
assert.match(printSource, /outputWidthInches/)
assert.match(printSource, /outputHeightInches/)
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

console.log('Document print-layout validation passed.')

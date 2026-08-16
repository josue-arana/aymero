import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  getDocumentPaperGeometry,
  getPaginatedPrintPageLayout,
} from '../src/utils/documentPaper.js'

const expectedPrintableWidthCssPixels = 7.5 * 96
const expectedPrintableHeightCssPixels = 10 * 96

for (const sourceWidth of [612, 780, 820]) {
  const geometry = getDocumentPaperGeometry(sourceWidth)
  const layout = getPaginatedPrintPageLayout({
    elementWidth: sourceWidth,
    sourcePageHeight: geometry.sourcePageHeight,
  })

  assert.ok(Math.abs(layout.outputWidth - expectedPrintableWidthCssPixels) < 0.001)
  assert.ok(Math.abs(layout.outputHeight - expectedPrintableHeightCssPixels) < 0.001)
}

const printSource = readFileSync(
  fileURLToPath(new URL('../src/utils/printDocument.js', import.meta.url)),
  'utf8',
)
const previewSource = readFileSync(
  fileURLToPath(new URL('../src/components/estimates/PaginatedEstimatePreview.jsx', import.meta.url)),
  'utf8',
)

assert.doesNotMatch(printSource, /pageNode\.style\.zoom/)
assert.match(printSource, /loadingNode\.remove\(\)/)
assert.match(printSource, /min-height: 0 !important/)
assert.doesNotMatch(previewSource, /getPageCountLabel|pageCountSingle|pageCountMultiple/)
assert.match(previewSource, /translationKeys\.pageOf/)

console.log('Document print-layout validation passed.')

export const DOCUMENT_PAPER_WIDTH_POINTS = 612
export const DOCUMENT_PAPER_HEIGHT_POINTS = 792
export const DOCUMENT_PAPER_MARGIN_POINTS = 36
export const DOCUMENT_SOURCE_WIDTH_PIXELS = 780
export const DOCUMENT_SOURCE_PADDING_PIXELS = 0
export const CSS_PIXELS_PER_INCH = 96
export const POINTS_PER_INCH = 72
export const DOCUMENT_PAPER_WIDTH_INCHES = DOCUMENT_PAPER_WIDTH_POINTS / POINTS_PER_INCH
export const DOCUMENT_PAPER_HEIGHT_INCHES = DOCUMENT_PAPER_HEIGHT_POINTS / POINTS_PER_INCH

export function getDocumentPaperGeometry(sourceWidth = DOCUMENT_SOURCE_WIDTH_PIXELS) {
  const printableWidthPoints = DOCUMENT_PAPER_WIDTH_POINTS - (DOCUMENT_PAPER_MARGIN_POINTS * 2)
  const printableHeightPoints = DOCUMENT_PAPER_HEIGHT_POINTS - (DOCUMENT_PAPER_MARGIN_POINTS * 2)
  const sourceToPaperScale = printableWidthPoints / sourceWidth
  const sourcePageHeight = printableHeightPoints / sourceToPaperScale
  const pageMarginInches = DOCUMENT_PAPER_MARGIN_POINTS / POINTS_PER_INCH
  const printableWidthCssPixels = (
    DOCUMENT_PAPER_WIDTH_INCHES - (pageMarginInches * 2)
  ) * CSS_PIXELS_PER_INCH
  const printableHeightCssPixels = (
    DOCUMENT_PAPER_HEIGHT_INCHES - (pageMarginInches * 2)
  ) * CSS_PIXELS_PER_INCH
  const printScale = printableWidthCssPixels / sourceWidth

  return {
    paperWidthPoints: DOCUMENT_PAPER_WIDTH_POINTS,
    paperHeightPoints: DOCUMENT_PAPER_HEIGHT_POINTS,
    paperMarginPoints: DOCUMENT_PAPER_MARGIN_POINTS,
    pageMarginInches,
    printableWidthPoints,
    printableHeightPoints,
    printableWidthCssPixels,
    printableHeightCssPixels,
    sourceWidth,
    sourceToPaperScale,
    sourcePageHeight,
    printScale,
  }
}

export function getPaginatedPrintPageLayout(pagination = {}) {
  const paperGeometry = getDocumentPaperGeometry(pagination.elementWidth)
  const scale = paperGeometry.printScale

  return {
    sourceWidth: Number(pagination.elementWidth || 0),
    sourcePageHeight: Number(pagination.sourcePageHeight || 0),
    outputWidth: paperGeometry.printableWidthCssPixels,
    outputHeight: paperGeometry.printableHeightCssPixels,
    scale,
  }
}

export default getDocumentPaperGeometry

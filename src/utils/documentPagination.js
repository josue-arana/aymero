export function calculateDocumentPageBreakOffsets({
  contentHeight,
  sourcePageHeight,
  protectedRanges = [],
}) {
  const breaks = [0]
  let pageStart = 0

  while (contentHeight - pageStart > sourcePageHeight) {
    const target = pageStart + sourcePageHeight
    const minimumUsefulPageHeight = sourcePageHeight * 0.35
    const containingRanges = protectedRanges.filter(({ start, end }) => start < target && end > target)
    const containingRange = containingRanges.find(({ start }) => (
      start - pageStart >= minimumUsefulPageHeight
    ))
    let nextBreak = containingRange?.start ?? target

    if (nextBreak <= pageStart || nextBreak >= contentHeight) {
      nextBreak = Math.min(pageStart + sourcePageHeight, contentHeight)
    }

    breaks.push(nextBreak)
    pageStart = nextBreak
  }

  if (breaks[breaks.length - 1] !== contentHeight) {
    breaks.push(contentHeight)
  }

  return breaks
}

export default calculateDocumentPageBreakOffsets

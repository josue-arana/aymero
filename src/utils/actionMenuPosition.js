export const ACTION_MENU_EDGE_PADDING = 16
export const ACTION_MENU_GAP = 8

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

export function getActionMenuViewport() {
  if (typeof window === 'undefined') {
    return { top: 0, left: 0, width: 0, height: 0 }
  }

  const viewport = window.visualViewport
  return {
    top: viewport?.offsetTop || 0,
    left: viewport?.offsetLeft || 0,
    width: viewport?.width || window.innerWidth,
    height: viewport?.height || window.innerHeight,
  }
}

export function calculateActionMenuPosition({
  triggerRect,
  menuRect,
  viewport,
  align = 'right',
  edgePadding = ACTION_MENU_EDGE_PADDING,
  gap = ACTION_MENU_GAP,
}) {
  const viewportLeft = viewport.left + edgePadding
  const viewportTop = viewport.top + edgePadding
  const viewportRight = viewport.left + viewport.width - edgePadding
  const viewportBottom = viewport.top + viewport.height - edgePadding
  const availableWidth = Math.max(0, viewportRight - viewportLeft)
  const menuWidth = Math.min(menuRect.width, availableWidth)
  const startAlignedLeft = triggerRect.left
  const endAlignedLeft = triggerRect.right - menuWidth
  let left = align === 'left' ? startAlignedLeft : endAlignedLeft
  let horizontalPlacement = align === 'left' ? 'start' : 'end'

  if (align === 'right' && left < viewportLeft && startAlignedLeft + menuWidth <= viewportRight) {
    left = startAlignedLeft
    horizontalPlacement = 'start'
  } else if (align === 'left' && left + menuWidth > viewportRight && endAlignedLeft >= viewportLeft) {
    left = endAlignedLeft
    horizontalPlacement = 'end'
  }

  left = clamp(left, viewportLeft, viewportRight - menuWidth)

  const spaceBelow = Math.max(0, viewportBottom - triggerRect.bottom - gap)
  const spaceAbove = Math.max(0, triggerRect.top - gap - viewportTop)
  const opensUpward = menuRect.height > spaceBelow && spaceAbove > spaceBelow
  const maxHeight = Math.max(0, opensUpward ? spaceAbove : spaceBelow)
  const renderedHeight = Math.min(menuRect.height, maxHeight)
  const desiredTop = opensUpward
    ? triggerRect.top - gap - renderedHeight
    : triggerRect.bottom + gap
  const top = clamp(desiredTop, viewportTop, viewportBottom - renderedHeight)

  return {
    left,
    top,
    maxHeight,
    maxWidth: availableWidth,
    placement: `${opensUpward ? 'top' : 'bottom'}-${horizontalPlacement}`,
  }
}

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ACTION_MENU_EDGE_PADDING,
  calculateActionMenuPosition,
} from '../src/utils/actionMenuPosition.js'

const widths = [320, 375, 390, 430, 768, 1024, 1440]

function verifyInsideViewport({ width, height = 720, triggerRect, menuRect, align = 'right' }) {
  const viewport = { left: 0, top: 0, width, height }
  const position = calculateActionMenuPosition({ triggerRect, menuRect, viewport, align })
  const renderedWidth = Math.min(menuRect.width, width - (ACTION_MENU_EDGE_PADDING * 2))
  const renderedHeight = Math.min(menuRect.height, position.maxHeight)

  assert.ok(position.left >= ACTION_MENU_EDGE_PADDING)
  assert.ok(position.left + renderedWidth <= width - ACTION_MENU_EDGE_PADDING)
  assert.ok(position.top >= ACTION_MENU_EDGE_PADDING)
  assert.ok(position.top + renderedHeight <= height - ACTION_MENU_EDGE_PADDING)
  assert.ok(position.maxWidth <= width - (ACTION_MENU_EDGE_PADDING * 2))
  return position
}

for (const width of widths) {
  const menuRect = { width: 224, height: 220 }
  const triggers = [
    { left: 0, right: 44, top: 24, bottom: 68 },
    { left: width - 44, right: width, top: 24, bottom: 68 },
    { left: 0, right: 44, top: 640, bottom: 684 },
    { left: width - 44, right: width, top: 640, bottom: 684 },
    { left: width / 2 - 22, right: width / 2 + 22, top: 320, bottom: 364 },
  ]

  for (const triggerRect of triggers) {
    verifyInsideViewport({ width, triggerRect, menuRect })
    verifyInsideViewport({ width, triggerRect, menuRect, align: 'left' })
  }
}

const upwardMenu = verifyInsideViewport({
  width: 390,
  triggerRect: { left: 330, right: 374, top: 650, bottom: 694 },
  menuRect: { width: 240, height: 280 },
})
assert.match(upwardMenu.placement, /^top-/)

const leftEdgeFlip = verifyInsideViewport({
  width: 390,
  triggerRect: { left: 16, right: 60, top: 120, bottom: 164 },
  menuRect: { width: 224, height: 180 },
  align: 'right',
})
assert.equal(leftEdgeFlip.placement, 'bottom-start')

const rightEdgeFlip = verifyInsideViewport({
  width: 390,
  triggerRect: { left: 330, right: 374, top: 120, bottom: 164 },
  menuRect: { width: 224, height: 180 },
  align: 'left',
})
assert.equal(rightEdgeFlip.placement, 'bottom-end')

const narrowMenu = verifyInsideViewport({
  width: 320,
  triggerRect: { left: 276, right: 320, top: 100, bottom: 144 },
  menuRect: { width: 420, height: 180 },
})
assert.equal(narrowMenu.maxWidth, 288)

const offsetViewportPosition = calculateActionMenuPosition({
  triggerRect: { left: 210, right: 254, top: 500, bottom: 544 },
  menuRect: { width: 224, height: 240 },
  viewport: { left: 24, top: 40, width: 320, height: 600 },
})
assert.ok(offsetViewportPosition.left >= 40)
assert.ok(offsetViewportPosition.top >= 56)

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const actionMenuSource = read('../src/components/common/ActionMenu.jsx')
const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const projectScheduleSource = read('../src/components/projects/ProjectScheduleCard.jsx')
const clientSource = read('../src/pages/ClientProfilePage.jsx')
const sharedConsumers = [
  '../src/pages/LeadsPage.jsx',
  '../src/pages/ClientsPage.jsx',
  '../src/pages/EstimatesPage.jsx',
  '../src/pages/JobsPage.jsx',
  '../src/pages/InvoicesPage.jsx',
  '../src/pages/ContractsPage.jsx',
  '../src/pages/ClientProfilePage.jsx',
  '../src/pages/LeadDetailPage.jsx',
  '../src/pages/ProjectDetailPage.jsx',
  '../src/components/projects/ProjectScheduleCard.jsx',
  '../src/pages/InvoiceDetailPage.jsx',
  '../src/components/layout/Topbar.jsx',
]

assert.match(actionMenuSource, /createPortal\(/)
assert.match(actionMenuSource, /document\.body/)
assert.match(actionMenuSource, /data-action-menu-overlay="true"/)
assert.match(actionMenuSource, /role="menu"/)
assert.match(actionMenuSource, /role="menuitem"/)
assert.match(actionMenuSource, /aria-haspopup="menu"/)
assert.match(actionMenuSource, /aria-expanded=\{isOpen\}/)
assert.match(actionMenuSource, /aria-controls=\{menuId\}/)
assert.match(actionMenuSource, /event\.key === 'ArrowDown'/)
assert.match(actionMenuSource, /event\.key === 'ArrowUp'/)
assert.match(actionMenuSource, /event\.key !== 'Escape'/)
assert.match(actionMenuSource, /pointerdown/)
assert.match(actionMenuSource, /focusTrigger\(\)/)
assert.match(actionMenuSource, /window\.visualViewport/)
assert.match(actionMenuSource, /overflow-x-hidden/)
assert.doesNotMatch(projectSource, /openPaymentMenuId|openScheduleMenuId/)
assert.equal((`${projectSource}\n${projectScheduleSource}`.match(/<ActionMenu/g) || []).length >= 4, true)
assert.match(clientSource, /mobileHeroActionGridClasses/)

for (const consumer of sharedConsumers) {
  assert.match(read(consumer), /ActionMenu/)
}

console.log('Action menu validation passed.')

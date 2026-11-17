import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createServer } from 'vite'
import { canEditDraftInvoiceLineItems, hydrateInvoiceRecord, normalizeInvoiceStatus, removeInvoiceLineItem, resolveInvoiceFinancials, sanitizeInvoiceLineItemsForStorage } from '../src/utils/invoiceRecords.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })

function renderExistingInvoiceRoute(InvoiceDetailRoute, AuthProvider, ToastProvider, existingInvoice, payments = []) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/invoices/${existingInvoice.id}`] },
    createElement(ToastProvider, null,
      createElement(AuthProvider, null,
        createElement(Routes, null,
          createElement(Route, { path: '/invoices/:invoiceId', element: createElement(InvoiceDetailRoute, {
            invoices: [existingInvoice], invoicesLoaded: true, leads: [], clients: [], projects: [], estimates: [], contracts: [], payments,
            t: (key) => en[key] || key,
          }) }),
        ),
      ),
    ),
  ))
}

try {
  const savedDraft = { status: 'draft', amount: 250, amountPaid: 0, lineItems: [
    { description: 'Door seals', amount: 50 },
    { description: 'Drywall', amount: 200 },
  ] }
  assert.equal(canEditDraftInvoiceLineItems(savedDraft, { displayStatus: 'Draft' }), true)
  assert.equal(canEditDraftInvoiceLineItems({ ...savedDraft, status: '' }, { displayStatus: 'Draft' }), true)
  for (const status of ['Sent', 'Partially Paid', 'Paid', 'Overdue', 'Canceled']) {
    assert.equal(canEditDraftInvoiceLineItems({ ...savedDraft, status }, { displayStatus: status }), false)
  }
  assert.equal(canEditDraftInvoiceLineItems(savedDraft, { displayStatus: 'Draft', archived: true }), false)
  const paidFromPayments = normalizeInvoiceStatus('draft', { amount: 250, amountPaid: 250, hasLinkedPayments: true })
  assert.equal(paidFromPayments, 'Paid')
  assert.equal(canEditDraftInvoiceLineItems(savedDraft, { displayStatus: paidFromPayments }), false)

  const { InvoiceDetailRoute } = await server.ssrLoadModule('/src/pages/InvoiceDetailPage.jsx')
  const { AuthProvider } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx')
  const { ToastProvider } = await server.ssrLoadModule('/src/components/common/ToastProvider.jsx')
  const existingInvoice = { ...savedDraft, id: 'existing-draft-invoice', number: 'INV-TEST', title: 'Fixture', client: 'Fixture Client' }
  const routeMarkup = renderExistingInvoiceRoute(InvoiceDetailRoute, AuthProvider, ToastProvider, existingInvoice)
  assert.match(routeMarkup, /Edit Invoice/)
  assert.match(routeMarkup, /INV-TEST/)
  assert.doesNotMatch(routeMarkup, /aria-label="Remove item \d+"/, 'line-item removal is only mounted after Edit Invoice')

  const { InvoiceLineItemRow, InvoiceLineItemsEditor } = await server.ssrLoadModule('/src/components/invoices/InvoiceLineItemRow.jsx')
  const existingItems = [
    { id: 'first', description: '<p><strong>Door seals</strong></p>', amount: 50 },
    { id: 'second', description: '<p>Drywall</p>', amount: 200 },
  ]
  const addedItem = { description: '', amount: 0 }
  const t = (key) => en[key] || key
  const render = (lineItems, overrides = {}) => renderToStaticMarkup(createElement(InvoiceLineItemsEditor, {
    isEditing: true,
    canEditDraftLineItems: true,
    lineItems,
    onChange: () => {},
    onRemove: () => {},
    onAdd: () => {},
    t,
    ...overrides,
  }))

  const twoItemMarkup = render(existingItems)
  assert.equal((twoItemMarkup.match(/aria-label="Remove item \d+"/g) || []).length, 2)
  assert.match(twoItemMarkup, /Remove item/)
  assert.doesNotMatch(twoItemMarkup, /<button[^>]*disabled=""[^>]*aria-label="Remove item/)

  const threeItems = [...existingItems, addedItem]
  const threeItemMarkup = render(threeItems)
  assert.equal((threeItemMarkup.match(/aria-label="Remove item \d+"/g) || []).length, 3)
  assert.match(threeItemMarkup, /aria-label="Remove item 3"/)
  assert.match(threeItemMarkup, /Add Line Item/)
  assert.equal((renderToStaticMarkup(createElement(InvoiceLineItemsEditor, {
    isEditing: true,
    canEditDraftLineItems: false,
    lineItems: threeItems,
    onChange: () => {}, onRemove: () => {}, onAdd: () => {}, t,
  })).match(/aria-label="Remove item \d+"/g) || []).length, 0)
  assert.doesNotMatch(render(threeItems, { isEditing: false }), /Remove item/)
  assert.doesNotMatch(render(threeItems, { canEditDraftLineItems: false }), /Add Line Item/)
  assert.match(render(existingItems.slice(0, 1)), /<button[^>]*disabled=""[^>]*aria-label="Remove item 1"/)

  let remaining = threeItems
  const row = InvoiceLineItemRow({
    item: threeItems[1], index: 1, itemCount: 3, canRemove: true,
    onChange: () => {},
    onRemove: (index) => { remaining = removeInvoiceLineItem(remaining, index) },
    t,
  })
  const descriptionColumn = row.props.children[0]
  const removeButton = descriptionColumn.props.children[1]
  assert.equal(removeButton.type, 'button')
  assert.equal(removeButton.props.disabled, false)
  removeButton.props.onClick()
  assert.deepEqual(remaining, [existingItems[0], addedItem])
  assert.equal(resolveInvoiceFinancials({ status: 'Draft', lineItems: remaining }, { recalculateDraft: true }).total, 50)

  const newlyAddedRow = InvoiceLineItemRow({
    item: threeItems[2], index: 2, itemCount: 3, canRemove: true,
    onChange: () => {},
    onRemove: (index) => { remaining = removeInvoiceLineItem(threeItems, index) },
    t,
  })
  newlyAddedRow.props.children[0].props.children[1].props.onClick()
  assert.deepEqual(remaining, existingItems)
  assert.equal(resolveInvoiceFinancials({ status: 'Draft', lineItems: remaining }, { recalculateDraft: true }).total, 250)

  const spanishMarkup = render(threeItems, { t: (key) => es[key] || key })
  assert.equal((spanishMarkup.match(/aria-label="Eliminar partida \d+"/g) || []).length, 3)

  console.log('Invoice line-item rendered removal checks passed.')
} finally {
  await server.close()
}

// Render the real Invoice Detail route's post-Edit branch with a test-only state
// seed. This exercises the page's status/line-item wiring without changing the
// production component or claiming to simulate a browser click.
const editServer = await createServer({
  server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent',
  plugins: [{
    name: 'invoice-detail-edit-fixture',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/pages/InvoiceDetailPage.jsx')) return null
      const before = 'const [isEditingInvoice, setIsEditingInvoice] = useState(false)'
      assert.ok(source.includes(before), 'the real Invoice Detail edit state must remain identifiable')
      return source.replace(before, 'const [isEditingInvoice, setIsEditingInvoice] = useState(true)')
    },
  }],
})

try {
  const { InvoiceDetailRoute } = await editServer.ssrLoadModule('/src/pages/InvoiceDetailPage.jsx')
  const { AuthProvider } = await editServer.ssrLoadModule('/src/contexts/AuthContext.jsx')
  const { ToastProvider } = await editServer.ssrLoadModule('/src/components/common/ToastProvider.jsx')
  const invoice = {
    id: 'existing-draft-invoice', number: 'INV-TEST', title: 'Fixture', client: 'Fixture Client',
    status: 'draft', amount: 250, amountPaid: 0,
    lineItems: [{ id: 'first', description: '**Door seals**', amount: 50 }, { id: 'second', description: 'Drywall', amount: 200 }],
  }
  const draftMarkup = renderExistingInvoiceRoute(InvoiceDetailRoute, AuthProvider, ToastProvider, invoice)
  assert.equal((draftMarkup.match(/aria-label="Remove item \d+"/g) || []).length, 2)
  assert.match(draftMarkup, /\$250/)

  const afterRemoval = { ...invoice, lineItems: removeInvoiceLineItem(invoice.lineItems, 1), amount: 50 }
  const updatedMarkup = renderExistingInvoiceRoute(InvoiceDetailRoute, AuthProvider, ToastProvider, afterRemoval)
  assert.equal((updatedMarkup.match(/aria-label="Remove item \d+"/g) || []).length, 1)
  assert.match(updatedMarkup, /\$50/)
  assert.match(updatedMarkup, /<button[^>]*disabled=""[^>]*aria-label="Remove item 1"/)
  const storedItems = sanitizeInvoiceLineItemsForStorage(afterRemoval.lineItems)
  const reloaded = hydrateInvoiceRecord({ ...afterRemoval, lineItems: storedItems })
  assert.deepEqual(reloaded.lineItems, storedItems)
  assert.equal(reloaded.lineItems.length, 1)
  assert.equal(reloaded.amount, 50)

  const paidMarkup = renderExistingInvoiceRoute(InvoiceDetailRoute, AuthProvider, ToastProvider, { ...invoice, status: 'Paid' })
  assert.doesNotMatch(paidMarkup, /aria-label="Remove item \d+"/)
  const paidByHistoryMarkup = renderExistingInvoiceRoute(InvoiceDetailRoute, AuthProvider, ToastProvider, invoice,
    [{ id: 'paid-receipt', invoiceId: invoice.id, amount: 250, status: 'Recorded' }])
  assert.doesNotMatch(paidByHistoryMarkup, /aria-label="Remove item \d+"/)
  console.log('Existing Invoice Detail edit-branch rendering checks passed.')
} finally {
  await editServer.close()
}

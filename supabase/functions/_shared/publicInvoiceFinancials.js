const effectivePaymentStatuses = new Set(['recorded', 'complete', 'completed', 'paid', 'settled', 'success', 'succeeded'])

export const PUBLIC_PORTAL_INVOICE_STATUSES = ['sent', 'partial', 'paid', 'overdue']

export function isPublicPortalInvoiceEligible(invoice = {}, { contractorId = '', projectId = '', clientId = '' } = {}) {
  const status = String(invoice.status || '').trim().toLowerCase()
  return !invoice.archived_at
    && String(invoice.contractor_id || '') === String(contractorId)
    && String(invoice.project_id || '') === String(projectId)
    && PUBLIC_PORTAL_INVOICE_STATUSES.includes(status)
    && (!invoice.client_id || !clientId || String(invoice.client_id) === String(clientId))
}

function isEffectivePayment(payment = {}) {
  const status = String(payment.status || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const amount = Number(payment.amount)
  return effectivePaymentStatuses.has(status) && Number.isFinite(amount) && amount >= 0
}

export function resolvePublicInvoiceFinancials({
  totalAmount = 0,
  storedAmountPaid = 0,
  dueDate = '',
  payments = [],
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const total = Number(totalAmount ?? 0)
  const storedPaid = Number(storedAmountPaid ?? 0)
  const linkedPayments = (Array.isArray(payments) ? payments : []).filter((payment) => !payment?.archived_at)
  const effectivePayments = linkedPayments.filter(isEffectivePayment)
  const amountPaid = linkedPayments.length > 0
    ? Math.round((effectivePayments.reduce((sum, payment) => sum + Number(payment.amount), 0) + Number.EPSILON) * 100) / 100
    : storedPaid
  const remainingBalance = Math.max(Math.round((total - amountPaid + Number.EPSILON) * 100) / 100, 0)
  const normalizedDueDate = String(dueDate || '').slice(0, 10)
  const status = total > 0 && remainingBalance === 0
    ? 'Paid'
    : amountPaid > 0
      ? 'Partially Paid'
      : normalizedDueDate && normalizedDueDate < today && remainingBalance > 0
        ? 'Overdue'
        : 'Sent'

  return {
    amountPaid,
    remainingBalance,
    status,
    hasLinkedPayments: linkedPayments.length > 0,
    paymentHistory: effectivePayments.map((payment) => ({
      amount: Number(payment.amount),
      date: String(payment.payment_date || payment.created_at || '').slice(0, 10),
      method: payment.payment_method || payment.method || '',
      type: payment.payment_type || '',
    })),
  }
}

export function buildPublicInvoice(row = {}, payments = [], customer = {}) {
  let descriptionMetadata = {}
  if (row.description && typeof row.description === 'object') {
    descriptionMetadata = row.description
  } else {
    try {
      const parsed = JSON.parse(String(row.description || ''))
      if (parsed && typeof parsed === 'object') descriptionMetadata = parsed
    } catch {
      // Legacy plain-text descriptions contain no structured public metadata.
    }
  }

  const totalAmount = Number(row.total_amount ?? 0)
  const financials = resolvePublicInvoiceFinancials({
    totalAmount,
    storedAmountPaid: row.amount_paid,
    dueDate: row.due_date,
    payments,
  })
  const legacyPaymentHistory = Array.isArray(descriptionMetadata.paymentHistory)
    ? descriptionMetadata.paymentHistory.map((payment = {}) => ({
        amount: Number(payment.amount || 0),
        date: String(payment.date || payment.paymentDate || '').slice(0, 10),
        method: String(payment.method || payment.paymentMethod || ''),
        type: String(payment.type || payment.paymentType || ''),
      }))
    : []

  return {
    number: row.invoice_number || '',
    invoiceNumber: row.invoice_number || '',
    title: row.title || '',
    projectTitle: row.title || '',
    customerName: descriptionMetadata.clientName || customer.display_name || '',
    description: typeof descriptionMetadata.summary === 'string' ? descriptionMetadata.summary : '',
    customerNotes: row.customer_notes || '',
    lineItems: Array.isArray(row.line_items) ? row.line_items.map((item = {}) => ({
      title: String(item.title || item.name || ''),
      name: String(item.name || item.title || ''),
      description: String(item.description || item.name || ''),
      amount: item.amount === null || item.amount === undefined ? null : Number(item.amount),
      quantity: item.quantity === null || item.quantity === undefined ? null : Number(item.quantity),
      unitPrice: item.unitPrice === null || item.unitPrice === undefined
        ? item.unit_price === null || item.unit_price === undefined ? null : Number(item.unit_price)
        : Number(item.unitPrice),
    })) : [],
    subtotal: Number(row.subtotal ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    totalAmount,
    amount: totalAmount,
    amountPaid: financials.amountPaid,
    remainingBalance: financials.remainingBalance,
    status: financials.status,
    issueDate: row.issue_date || '',
    dueDate: row.due_date || '',
    paidAt: String(row.paid_at || '').slice(0, 10),
    invoiceLanguage: descriptionMetadata.invoiceLanguage || customer.preferred_language || 'en',
    paymentHistory: financials.paymentHistory.length
      ? financials.paymentHistory
      : financials.hasLinkedPayments ? [] : legacyPaymentHistory,
  }
}

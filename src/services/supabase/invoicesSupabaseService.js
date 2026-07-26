import { USE_SUPABASE, USE_SUPABASE_INVOICES } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'
import { generateInvoiceNumber, getInvoiceDisplayNumber } from '../../utils/invoiceNumber'

const TABLE_NAME = 'invoices'
const INVOICE_TABLE_COLUMNS = new Set([
  'contractor_id',
  'client_id',
  'project_id',
  'contract_id',
  'invoice_number',
  'title',
  'description',
  'customer_notes',
  'line_items',
  'subtotal',
  'tax_amount',
  'total_amount',
  'amount_paid',
  'status',
  'issue_date',
  'due_date',
  'sent_at',
  'paid_at',
  'sample_data_key',
  'created_at',
  'updated_at',
  'archived_at',
])

const uiToDbStatusMap = {
  Draft: 'draft',
  Sent: 'sent',
  'Partially Paid': 'partial',
  Paid: 'paid',
  Overdue: 'overdue',
  Cancelled: 'cancelled',
  Canceled: 'cancelled',
}

const dbToUiStatusMap = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Canceled',
}

function isDev() {
  return Boolean(import.meta.env.DEV)
}

function warnDev(message, meta) {
  if (!isDev()) return

  if (meta === undefined) {
    // eslint-disable-next-line no-console
    console.warn(message)
    return
  }

  // eslint-disable-next-line no-console
  console.warn(message, meta)
}

function createSkippedResponse(message, data = null) {
  return {
    data,
    error: null,
    skipped: true,
    message,
  }
}

function createErrorResult(message, details = null) {
  return {
    data: null,
    error: {
      message,
      details,
    },
    skipped: false,
  }
}

function normalizeError(error, fallbackMessage) {
  return {
    message: error?.message || fallbackMessage,
    details: error?.details || null,
    code: error?.code || null,
  }
}

function createMissingRowError(operationName, details = null) {
  return createErrorResult(
    `Supabase invoices.${operationName} did not return the persisted invoice row. Check RLS, schema compatibility, and required invoice identity metadata before treating this save as successful.`,
    details
  )
}

function readSingleRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key)
}

function readField(source = {}, keys = []) {
  for (const key of keys) {
    if (hasOwn(source, key)) {
      return source[key]
    }
  }

  return undefined
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mapStatusToDb(status) {
  if (!status) return 'draft'
  return uiToDbStatusMap[status] || String(status).toLowerCase().replace(/\s+/g, '_')
}

function mapStatusToUi(status) {
  if (!status) return 'Draft'
  return dbToUiStatusMap[status] || status
}

function normalizeLineItems(lineItems) {
  if (!Array.isArray(lineItems)) return []

  return lineItems.map((item) => ({
    ...(item && typeof item === 'object' ? item : {}),
    description: typeof item?.description === 'string'
      ? item.description
      : typeof item?.name === 'string'
        ? item.name
        : '',
    amount: toNumber(item?.amount),
  }))
}

function sumLineItems(lineItems) {
  return normalizeLineItems(lineItems).reduce((sum, item) => sum + toNumber(item.amount), 0)
}

function normalizePaymentHistory(paymentHistory) {
  if (!Array.isArray(paymentHistory)) return []

  return paymentHistory.map((entry, index) => ({
    ...(entry && typeof entry === 'object' ? entry : {}),
    id: entry?.id || `payment-history-${index}`,
    amount: toNumber(entry?.amount),
    date: entry?.date || '',
    method: entry?.method || '',
    type: entry?.type || '',
    notes: entry?.notes || '',
  }))
}

function parseDateToIso(value) {
  if (!value) return null
  if (typeof value !== 'string') return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return parsedDate.toISOString().slice(0, 10)
}

function formatDisplayDate(value) {
  if (!value) return ''

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function serializeDescription(invoice = {}) {
  // The current invoices table intentionally stores several UI-only identity and
  // hydration fields inside description because there are no first-class columns
  // for them yet. Keep this payload backward compatible so refresh/login
  // hydration preserves lead/estimate links, customer labels, display dates,
  // legacy notes, payment terms, and payment history.
  const descriptionText = readField(invoice, ['description'])
  const notes = readField(invoice, ['notes'])
  const paymentTerms = readField(invoice, ['paymentTerms', 'payment_terms'])
  const paymentHistory = readField(invoice, ['paymentHistory', 'payment_history'])
  const displayDueDate = readField(invoice, ['dueDate', 'displayDueDate', 'display_due_date'])
  const displayIssueDate = readField(invoice, ['issueDate', 'displayIssueDate', 'display_issue_date'])
  const leadId = readField(invoice, ['leadId', 'lead_id'])
  const estimateId = readField(invoice, ['estimateId', 'estimate_id'])
  const clientName = readField(invoice, ['client', 'clientName', 'customerName'])
  const invoiceLanguage = readField(invoice, ['invoiceLanguage'])

  const hasStructuredFields = [
    notes,
    paymentTerms,
    paymentHistory,
    displayDueDate,
    displayIssueDate,
    leadId,
    estimateId,
    clientName,
    invoiceLanguage,
  ].some((value) => value !== undefined)

  if (!hasStructuredFields) {
    return descriptionText === undefined ? undefined : descriptionText || null
  }

  return JSON.stringify({
    version: 1,
    summary: descriptionText || '',
    notes: notes || '',
    paymentTerms: paymentTerms || '',
    paymentHistory: normalizePaymentHistory(paymentHistory),
    displayDueDate: displayDueDate || '',
    displayIssueDate: displayIssueDate || '',
    leadId: leadId || null,
    estimateId: estimateId || null,
    clientName: clientName || '',
    invoiceLanguage: invoiceLanguage || '',
  })
}

function parseDescription(description) {
  const fallback = {
    summary: description || '',
    notes: '',
    paymentTerms: '',
    paymentHistory: [],
    displayDueDate: '',
    displayIssueDate: '',
    leadId: null,
    estimateId: null,
    clientName: '',
    invoiceLanguage: '',
  }

  if (!description) return fallback

  try {
    const parsed = JSON.parse(description)

    if (!parsed || typeof parsed !== 'object') {
      return fallback
    }

    return {
      summary: parsed.summary || '',
      notes: parsed.notes || '',
      paymentTerms: parsed.paymentTerms || '',
      paymentHistory: normalizePaymentHistory(parsed.paymentHistory),
      displayDueDate: parsed.displayDueDate || '',
      displayIssueDate: parsed.displayIssueDate || '',
      leadId: parsed.leadId || null,
      estimateId: parsed.estimateId || null,
      clientName: parsed.clientName || '',
      invoiceLanguage: parsed.invoiceLanguage || '',
    }
  } catch {
    return fallback
  }
}

function validateDescriptionIdentityPayload(invoice = {}, payload = {}) {
  const structuredIdentityEntries = [
    ['leadId', readField(invoice, ['leadId', 'lead_id'])],
    ['estimateId', readField(invoice, ['estimateId', 'estimate_id'])],
    ['clientName', readField(invoice, ['client', 'clientName', 'customerName'])],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')

  if (structuredIdentityEntries.length === 0) {
    return null
  }

  if (typeof payload.description !== 'string' || !payload.description.trim()) {
    return createErrorResult(
      'Supabase invoices payload is missing the structured description required to preserve invoice identity metadata.',
      {
        structuredIdentityEntries,
        payload,
      }
    )
  }

  return null
}

function validateInvoicePayload(operationName, invoice = {}, payload = {}) {
  const unsupportedColumns = Object.keys(payload).filter((key) => !INVOICE_TABLE_COLUMNS.has(key))

  if (unsupportedColumns.length > 0) {
    return createErrorResult(
      `Supabase invoices.${operationName} attempted to write unsupported invoices columns: ${unsupportedColumns.join(', ')}.`,
      { payload }
    )
  }

  if (operationName === 'create' && !payload.invoice_number) {
    return createErrorResult('Supabase invoices.create requires invoice_number before saving.', {
      invoice,
      payload,
    })
  }

  return validateDescriptionIdentityPayload(invoice, payload)
}

function applyStatusDates(payload, invoice = {}) {
  const explicitSentAt = readField(invoice, ['sentAt', 'sent_at'])
  const explicitPaidAt = readField(invoice, ['paidAt', 'paid_at'])
  const now = new Date().toISOString()

  assignIfDefined(payload, 'sent_at', explicitSentAt)
  assignIfDefined(payload, 'paid_at', explicitPaidAt)

  if (payload.status === 'sent' && payload.sent_at === undefined) {
    payload.sent_at = now
  }

  if (payload.status === 'paid' && payload.paid_at === undefined) {
    payload.paid_at = now
  }

  return payload
}

function toAppInvoice(row) {
  const lineItems = normalizeLineItems(row?.line_items)
  const parsedDescription = parseDescription(row?.description)
  const totalAmount = toNumber(row?.total_amount)
  const amountPaid = toNumber(row?.amount_paid)
  const remainingBalance = row?.amount_due === null || row?.amount_due === undefined
    ? Math.max(totalAmount - amountPaid, 0)
    : Math.max(toNumber(row?.amount_due), 0)

  return {
    id: row?.id || undefined,
    contractorId: row?.contractor_id || undefined,
    clientId: row?.client_id || null,
    projectId: row?.project_id || null,
    contractId: row?.contract_id || null,
    leadId: parsedDescription.leadId || null,
    estimateId: parsedDescription.estimateId || null,
    number: row?.invoice_number || '',
    invoiceNumber: row?.invoice_number || '',
    title: row?.title || 'Invoice',
    projectTitle: row?.title || 'Invoice',
    description: parsedDescription.summary,
    customerNotes: row?.customer_notes ?? null,
    notes: parsedDescription.notes,
    paymentTerms: parsedDescription.paymentTerms,
    invoiceLanguage: parsedDescription.invoiceLanguage || '',
    lineItems,
    subtotal: toNumber(row?.subtotal),
    taxAmount: toNumber(row?.tax_amount),
    amount: totalAmount,
    total: totalAmount,
    totalAmount,
    amountPaid,
    remainingBalance,
    amountDue: remainingBalance,
    status: mapStatusToUi(row?.status),
    issueDate: parsedDescription.displayIssueDate || (row?.issue_date ? formatDisplayDate(row.issue_date) : ''),
    dueDate: parsedDescription.displayDueDate || (row?.due_date ? formatDisplayDate(row.due_date) : ''),
    sentAt: row?.sent_at || null,
    paidAt: row?.paid_at || null,
    paymentHistory: parsedDescription.paymentHistory,
    sampleDataKey: row?.sample_data_key || '',
    archivedAt: row?.archived_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    client: parsedDescription.clientName || '',
    clientName: parsedDescription.clientName || '',
    customerName: parsedDescription.clientName || '',
  }
}

async function invoiceNumberExists(contractorId, invoiceNumber, excludeId = '') {
  const existingRecords = await supabaseClient.request(TABLE_NAME, {
    method: 'GET',
    query: buildContractorQuery(contractorId, {
      select: 'id,invoice_number',
      invoice_number: `eq.${invoiceNumber}`,
      limit: '1',
    }),
  })

  const row = readSingleRow(existingRecords)

  if (!row) return false
  if (excludeId && row.id === excludeId) return false
  return true
}

async function ensureUniqueInvoiceNumber(contractorId, invoice = {}, { excludeId = '' } = {}) {
  const existingNumber = readField(invoice, ['number', 'invoiceNumber', 'invoice_number'])

  if (existingNumber) {
    return getInvoiceDisplayNumber(invoice, invoice, readField(invoice, ['createdAt', 'created_at', 'issueDate', 'issue_date']) || new Date())
  }

  let attempt = 0
  let nextNumber = generateInvoiceNumber({
    ...invoice,
    id: invoice?.id || `invoice-${Date.now()}-0`,
  }, new Date())

  while (await invoiceNumberExists(contractorId, nextNumber, excludeId)) {
    nextNumber = generateInvoiceNumber({
      ...invoice,
      id: invoice?.id || `invoice-${Date.now()}-${attempt}`,
    }, new Date())
    attempt += 1
  }

  return nextNumber
}

function toSupabasePayload(contractorId, invoice = {}, { isCreate = false } = {}) {
  const payload = {}
  const lineItemsInput = readField(invoice, ['lineItems', 'line_items'])
  const lineItems = lineItemsInput !== undefined ? normalizeLineItems(lineItemsInput) : undefined
  const subtotalInput = readField(invoice, ['subtotal'])
  const taxAmountInput = readField(invoice, ['taxAmount', 'tax_amount'])
  const totalInput = readField(invoice, ['amount', 'total', 'totalAmount', 'total_amount'])
  const amountPaidInput = readField(invoice, ['amountPaid', 'amount_paid'])
  const titleInput = readField(invoice, ['title', 'projectTitle', 'invoiceTitle'])
  const statusInput = readField(invoice, ['status'])
  const issueDateInput = readField(invoice, ['issueDate', 'issue_date'])
  const dueDateInput = readField(invoice, ['dueDate', 'due_date'])
  const customerNotesInput = readField(invoice, ['customerNotes', 'customer_notes'])
  const descriptionInput = serializeDescription(invoice)

  if (contractorId) {
    payload.contractor_id = contractorId
  }

  if (isCreate || readField(invoice, ['clientId', 'client_id']) !== undefined) {
    payload.client_id = readField(invoice, ['clientId', 'client_id']) || null
  }

  if (isCreate || readField(invoice, ['projectId', 'project_id']) !== undefined) {
    payload.project_id = readField(invoice, ['projectId', 'project_id']) || null
  }

  if (isCreate || readField(invoice, ['contractId', 'contract_id']) !== undefined) {
    payload.contract_id = readField(invoice, ['contractId', 'contract_id']) || null
  }

  if (titleInput !== undefined) {
    payload.title = titleInput || 'Invoice'
  } else if (isCreate) {
    payload.title = 'Invoice'
  }

  if (isCreate || readField(invoice, ['number', 'invoiceNumber', 'invoice_number']) !== undefined) {
    payload.invoice_number = readField(invoice, ['number', 'invoiceNumber', 'invoice_number']) || null
  }

  if (descriptionInput !== undefined) {
    payload.description = descriptionInput
  } else if (isCreate) {
    payload.description = null
  }

  if (customerNotesInput !== undefined) {
    payload.customer_notes = customerNotesInput === null ? null : String(customerNotesInput)
  } else if (isCreate) {
    payload.customer_notes = null
  }

  if (lineItems !== undefined || isCreate) {
    payload.line_items = lineItems || []
  }

  if (subtotalInput !== undefined) {
    payload.subtotal = toNumber(subtotalInput)
  } else if (lineItems !== undefined) {
    payload.subtotal = sumLineItems(lineItems)
  } else if (isCreate) {
    payload.subtotal = 0
  }

  if (taxAmountInput !== undefined) {
    payload.tax_amount = toNumber(taxAmountInput)
  } else if (isCreate) {
    payload.tax_amount = 0
  }

  if (totalInput !== undefined) {
    payload.total_amount = toNumber(totalInput)
  } else if (lineItems !== undefined || subtotalInput !== undefined || taxAmountInput !== undefined || isCreate) {
    payload.total_amount = (payload.subtotal ?? 0) + (payload.tax_amount ?? 0)
  }

  if (amountPaidInput !== undefined) {
    payload.amount_paid = toNumber(amountPaidInput)
  } else if (isCreate) {
    payload.amount_paid = 0
  }

  if (statusInput !== undefined) {
    payload.status = mapStatusToDb(statusInput)
  } else if (isCreate) {
    payload.status = 'draft'
  }

  if (issueDateInput !== undefined || isCreate) {
    payload.issue_date = parseDateToIso(issueDateInput)
  }

  if (dueDateInput !== undefined || isCreate) {
    payload.due_date = parseDateToIso(dueDateInput)
  }

  if (isCreate || readField(invoice, ['sampleDataKey', 'sample_data_key']) !== undefined) {
    payload.sample_data_key = readField(invoice, ['sampleDataKey', 'sample_data_key']) || null
  }

  return applyStatusDates(payload, invoice)
}

function buildContractorQuery(contractorId, extraQuery = {}) {
  return {
    ...extraQuery,
    contractor_id: `eq.${contractorId}`,
  }
}

function handleMissingContractorId(methodName) {
  warnDev(`[dev] invoicesSupabaseService.${methodName} called without contractorId`)

  return createErrorResult('contractorId is required for invoice operations.')
}

export async function list({ contractorId, includeArchived = false, status, clientId, projectId, contractId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_INVOICES) {
    return createSkippedResponse('Supabase invoices service skipped because USE_SUPABASE=false', [])
  }

  if (!contractorId) {
    return handleMissingContractorId('list')
  }

  try {
    const query = buildContractorQuery(contractorId, {
      select: '*',
      order: 'created_at.desc',
    })

    if (!includeArchived) {
      query.archived_at = 'is.null'
    }

    if (status) {
      query.status = `eq.${mapStatusToDb(status)}`
    }

    if (clientId) {
      query.client_id = `eq.${clientId}`
    }

    if (projectId) {
      query.project_id = `eq.${projectId}`
    }

    if (contractId) {
      query.contract_id = `eq.${contractId}`
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query,
    })

    return {
      data: Array.isArray(data) ? data.map(toAppInvoice) : [],
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: [],
      error: normalizeError(error, 'Unable to load invoices from Supabase.'),
      skipped: false,
    }
  }
}

export async function getById(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_INVOICES) {
    return createSkippedResponse('Supabase invoices service skipped because USE_SUPABASE=false')
  }

  if (!contractorId) {
    return handleMissingContractorId('getById')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'GET',
      query: buildContractorQuery(contractorId, {
        select: '*',
        id: `eq.${id}`,
        limit: '1',
      }),
    })

    const row = readSingleRow(data)

    return {
      data: row ? toAppInvoice(row) : null,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to load the invoice from Supabase.'),
      skipped: false,
    }
  }
}

export async function create(invoiceData, { contractorId, authenticatedUserId = '', companyId = '' } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_INVOICES) {
    return createSkippedResponse('Supabase invoices service skipped because USE_SUPABASE=false', invoiceData ?? null)
  }

  if (!contractorId) {
    return handleMissingContractorId('create')
  }

  let submittedPayload = null

  try {
    const invoiceNumber = await ensureUniqueInvoiceNumber(contractorId, invoiceData)
    const payload = toSupabasePayload(contractorId, {
      ...invoiceData,
      number: invoiceNumber,
      invoiceNumber,
    }, { isCreate: true })
    submittedPayload = payload
    const payloadValidation = validateInvoicePayload('create', invoiceData, payload)

    if (payloadValidation) {
      return payloadValidation
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'POST',
      body: payload,
    })

    const row = readSingleRow(data)

    if (!row?.id) {
      return createMissingRowError('create', {
        invoiceData,
        contractorId,
        payload,
      })
    }

    return {
      data: toAppInvoice(row),
      error: null,
      skipped: false,
    }
  } catch (error) {
    if (error?.code === '42501') {
      warnDev('[dev] Authenticated invoice insert was rejected by RLS.', {
        stage: 'invoice',
        code: error.code,
        message: error.message || null,
        authenticatedUserId: authenticatedUserId || null,
        contractorId,
        companyId: companyId || null,
        invoiceOwnership: {
          contractorId: submittedPayload?.contractor_id || null,
          projectId: submittedPayload?.project_id || null,
          clientId: submittedPayload?.client_id || null,
          contractId: submittedPayload?.contract_id || null,
          estimateId: readField(invoiceData, ['estimateId', 'estimate_id']) || null,
          leadId: readField(invoiceData, ['leadId', 'lead_id']) || null,
        },
        submittedPayload,
        insertPolicyPredicate: 'public.is_active_contractor_member(contractor_id)',
        membershipPredicate: 'contractor_members.contractor_id = contractor_id AND contractor_members.user_id = auth.uid() AND status = active AND archived_at IS NULL',
      })
    }

    return {
      data: null,
      error: normalizeError(error, 'Unable to create the invoice in Supabase.'),
      skipped: false,
    }
  }
}

export async function update(id, updates, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_INVOICES) {
    return createSkippedResponse('Supabase invoices service skipped because USE_SUPABASE=false', { id, ...(updates || {}) })
  }

  if (!contractorId) {
    return handleMissingContractorId('update')
  }

  try {
    const payload = {
      ...toSupabasePayload(contractorId, updates),
      updated_at: new Date().toISOString(),
    }

    delete payload.contractor_id

    const payloadValidation = validateInvoicePayload('update', updates, payload)

    if (payloadValidation) {
      return payloadValidation
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: payload,
    })

    const row = readSingleRow(data)

    if (!row?.id) {
      return createMissingRowError('update', {
        id,
        contractorId,
        payload,
      })
    }

    return {
      data: toAppInvoice(row),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to update the invoice in Supabase.'),
      skipped: false,
    }
  }
}

export async function archive(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_INVOICES) {
    return createSkippedResponse('Supabase invoices service skipped because USE_SUPABASE=false', { id, archived: true })
  }

  if (!contractorId) {
    return handleMissingContractorId('archive')
  }

  try {
    const archivedAt = new Date().toISOString()
    const payload = {
      archived_at: archivedAt,
      updated_at: archivedAt,
    }
    const payloadValidation = validateInvoicePayload('archive', { id }, payload)

    if (payloadValidation) {
      return payloadValidation
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: payload,
    })

    const row = readSingleRow(data)

    if (!row?.id) {
      return createMissingRowError('archive', {
        id,
        contractorId,
        payload,
      })
    }

    return {
      data: toAppInvoice(row),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to archive the invoice in Supabase.'),
      skipped: false,
    }
  }
}

export async function restore(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_INVOICES) {
    return createSkippedResponse('Supabase invoices service skipped because USE_SUPABASE=false', { id, archived: false })
  }

  if (!contractorId) {
    return handleMissingContractorId('restore')
  }

  try {
    const restoredAt = new Date().toISOString()
    const payload = {
      archived_at: null,
      updated_at: restoredAt,
    }
    const payloadValidation = validateInvoicePayload('restore', { id }, payload)

    if (payloadValidation) {
      return payloadValidation
    }

    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'PATCH',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
      body: payload,
    })

    const row = readSingleRow(data)

    if (!row?.id) {
      return createMissingRowError('restore', {
        id,
        contractorId,
        payload,
      })
    }

    return {
      data: toAppInvoice(row),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to restore the invoice in Supabase.'),
      skipped: false,
    }
  }
}

export async function deletePermanently(id, { contractorId } = {}) {
  if (!USE_SUPABASE && !USE_SUPABASE_INVOICES) {
    return createSkippedResponse('Supabase invoices service skipped because USE_SUPABASE=false', { id, deleted: true })
  }

  if (!contractorId) {
    return handleMissingContractorId('deletePermanently')
  }

  try {
    const data = await supabaseClient.request(TABLE_NAME, {
      method: 'DELETE',
      query: buildContractorQuery(contractorId, {
        id: `eq.${id}`,
      }),
    })

    const row = readSingleRow(data)

    if (!row?.id) {
      return createMissingRowError('deletePermanently', {
        id,
        contractorId,
      })
    }

    return {
      data: toAppInvoice(row),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to permanently delete the invoice in Supabase.'),
      skipped: false,
    }
  }
}

export default {
  list,
  getById,
  create,
  update,
  archive,
  restore,
  deletePermanently,
}

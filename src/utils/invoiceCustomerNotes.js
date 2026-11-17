const knownLegacyMetadataLinePatterns = [
  /^\s*aymero[_\s-]*sample[_\s-]*data\b/i,
  /^\s*(?:sampleDataKey|sample_data_key)\s*:/i,
]

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key)
}

export function sanitizeCustomerFacingInvoiceNote(value) {
  return String(value || '')
    .split(/\r?\n/)
    .filter((line) => !knownLegacyMetadataLinePatterns.some((pattern) => pattern.test(line)))
    .join('\n')
}

export function getInvoiceCustomerNoteForEditing(invoice = {}) {
  const hasCanonicalCustomerNote = hasOwn(invoice, 'customerNotes')
    || hasOwn(invoice, 'customer_notes')
  const canonicalCustomerNote = hasOwn(invoice, 'customerNotes')
    ? invoice.customerNotes
    : invoice.customer_notes

  if (hasCanonicalCustomerNote && canonicalCustomerNote !== null && canonicalCustomerNote !== undefined) {
    return String(canonicalCustomerNote)
  }

  // Legacy notes can contain internal metadata lines. Clean those only while
  // initializing the editor; canonical notes then flow through unchanged as
  // the contractor types, including trailing spaces and newlines.
  return sanitizeCustomerFacingInvoiceNote(invoice?.notes)
}

export function resolveInvoiceCustomerNote(invoice = {}) {
  const hasCanonicalCustomerNote = hasOwn(invoice, 'customerNotes')
    || hasOwn(invoice, 'customer_notes')
  const canonicalCustomerNote = hasOwn(invoice, 'customerNotes')
    ? invoice.customerNotes
    : invoice.customer_notes

  if (hasCanonicalCustomerNote && canonicalCustomerNote !== null && canonicalCustomerNote !== undefined) {
    return sanitizeCustomerFacingInvoiceNote(canonicalCustomerNote)
  }

  // Before invoices.customer_notes existed, the invoice editor treated the
  // serialized `notes` value as customer-facing. Read it only for historical
  // invoices that do not yet have a canonical customer note.
  return sanitizeCustomerFacingInvoiceNote(invoice?.notes)
}

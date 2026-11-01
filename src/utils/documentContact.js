function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function readValue(record = {}, keys = []) {
  for (const key of keys) {
    const value = String(record?.[key] ?? '').trim()
    if (value) return value
  }

  return ''
}

function readDocumentValue(document = {}, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(document, key)) {
      return String(document?.[key] ?? '').trim()
    }
  }

  return null
}

function hasSignedContract(document = {}) {
  return Boolean(
    document?.signed
      || document?.signedAt
      || document?.signed_at
      || document?.signedDate
      || document?.signed_date
      || normalizeStatus(document?.status) === 'signed'
  )
}

export function shouldUseHistoricalDocumentContact(document = {}, documentType = 'estimate') {
  const status = normalizeStatus(document?.status)

  if (documentType === 'contract') {
    return ['sent', 'signed'].includes(status) || hasSignedContract(document)
  }

  return ['sent', 'approved', 'rejected', 'converted'].includes(status)
}

export function resolveDocumentContact({ clientRecord = null, snapshot = {}, document = {}, documentType = 'estimate' } = {}) {
  const historical = shouldUseHistoricalDocumentContact(document, documentType)
  const liveContact = clientRecord || {}
  const preferredContact = historical ? snapshot : liveContact
  const fallbackContact = historical || clientRecord ? {} : snapshot

  const documentName = readDocumentValue(document, ['clientName', 'client_name', 'client'])
  const documentPhone = readDocumentValue(document, ['clientPhone', 'client_phone'])
  const documentEmail = readDocumentValue(document, ['clientEmail', 'client_email'])
  const documentAddress = readDocumentValue(document, ['clientAddress', 'client_address'])

  return {
    name: (documentName !== null ? documentName : readValue(preferredContact, ['displayName', 'name', 'clientName', 'client']))
      || readValue(fallbackContact, ['displayName', 'name', 'clientName', 'client']),
    phone: (documentPhone !== null ? documentPhone : readValue(preferredContact, ['phone']))
      || readValue(fallbackContact, ['phone']),
    email: (documentEmail !== null ? documentEmail : readValue(preferredContact, ['email']))
      || readValue(fallbackContact, ['email']),
    address: (documentAddress !== null ? documentAddress : readValue(preferredContact, ['address', 'clientAddress', 'client_address']))
      || readValue(fallbackContact, ['address', 'clientAddress', 'client_address']),
  }
}

export function mergeDocumentContactIntoLead({ lead = {}, clientRecord = null, document = {}, documentType = 'estimate' } = {}) {
  const contact = resolveDocumentContact({ clientRecord, snapshot: lead, document, documentType })
  const historical = shouldUseHistoricalDocumentContact(document, documentType)
  const hasDocumentName = ['clientName', 'client_name', 'client'].some((key) => Object.prototype.hasOwnProperty.call(document, key))
  const hasDocumentPhone = ['clientPhone', 'client_phone'].some((key) => Object.prototype.hasOwnProperty.call(document, key))
  const hasDocumentEmail = ['clientEmail', 'client_email'].some((key) => Object.prototype.hasOwnProperty.call(document, key))
  const useCurrentContact = Boolean(clientRecord && !historical)

  return {
    ...lead,
    ...((useCurrentContact || hasDocumentName || contact.name) ? { client: contact.name, clientName: contact.name, customerName: contact.name } : {}),
    ...((useCurrentContact || hasDocumentPhone || contact.phone) ? { phone: contact.phone } : {}),
    ...((useCurrentContact || hasDocumentEmail || contact.email) ? { email: contact.email } : {}),
  }
}

export function requiresClientDocumentLink(documentType = '') {
  return documentType === 'estimate' || documentType === 'contract'
}

export function getCustomerDeliveryAvailability({
  documentType = 'invoice',
  documentLink = '',
  phone = '',
  email = '',
} = {}) {
  const requiresClientLink = requiresClientDocumentLink(documentType)
  const hasRequiredClientLink = !requiresClientLink || Boolean(String(documentLink || '').trim())

  return {
    requiresClientLink,
    hasRequiredClientLink,
    text: Boolean(phone) && hasRequiredClientLink,
    email: Boolean(email) && hasRequiredClientLink,
  }
}

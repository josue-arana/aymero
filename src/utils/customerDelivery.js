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

export function buildCustomerDeliveryContent({
  documentType = 'invoice',
  customerName = '',
  projectTitle = '',
  amountValue = '',
  dueDate = '',
  portalUrl = '',
  documentLink = '',
  companyName = '',
  contentT,
} = {}) {
  if (typeof contentT !== 'function') {
    throw new TypeError('A recipient-content translator is required.')
  }

  const firstName = String(customerName || '').trim().split(/\s+/)[0] || contentT('customer')
  const requiresClientLink = requiresClientDocumentLink(documentType)
  const resolvedDocumentStatus = documentLink
    ? contentT('documentLinkIncluded', { link: documentLink })
    : contentT('documentLinkUnavailable')
  const subject = documentType === 'estimate'
    ? contentT('sendEstimateSubject', { project: projectTitle })
    : documentType === 'contract'
      ? contentT('sendContractSubject', { project: projectTitle })
      : documentType === 'portalLink'
        ? contentT('sendPortalSubject', { project: projectTitle })
        : contentT('sendInvoiceSubject', { project: projectTitle })

  if (requiresClientLink && !documentLink) {
    return { subject, smsBody: '', emailBody: '', resolvedDocumentStatus }
  }

  const smsBody = documentType === 'estimate'
    ? contentT('estimateSmsMessage', { name: firstName, project: projectTitle, total: amountValue, link: documentLink })
    : documentType === 'contract'
      ? contentT('contractSmsMessage', { name: firstName, project: projectTitle, link: documentLink })
      : documentType === 'portalLink'
        ? contentT('portalSmsMessage', { name: firstName, project: projectTitle, link: portalUrl })
        : contentT('invoiceSmsMessage', { name: firstName, project: projectTitle, amount: amountValue, dueDate, documentStatus: resolvedDocumentStatus })

  const estimateEmailKey = companyName ? 'estimateEmailBodyWithCompany' : 'estimateEmailBody'
  const emailBody = documentType === 'estimate'
    ? contentT(estimateEmailKey, { name: firstName, project: projectTitle, total: amountValue, link: documentLink, companyName })
    : documentType === 'contract'
      ? contentT('contractEmailBody', { name: firstName, project: projectTitle, total: amountValue, link: documentLink })
      : documentType === 'portalLink'
        ? contentT('portalEmailBody', { name: firstName, project: projectTitle, link: portalUrl })
        : contentT('invoiceEmailBody', { name: firstName, project: projectTitle, amount: amountValue, dueDate, documentStatus: resolvedDocumentStatus })

  return { subject, smsBody, emailBody, resolvedDocumentStatus }
}

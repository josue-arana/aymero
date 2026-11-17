import { buildPublicUrl, getPublicEnvironmentConfig } from '../services/system/environmentService.js'
import { normalizeInvoicePublicShareToken } from './invoiceShareToken.js'

export { createInvoicePublicShareToken, normalizeInvoicePublicShareToken } from './invoiceShareToken.js'

export function buildInvoicePublicShareUrl(token = '') {
  const normalizedToken = normalizeInvoicePublicShareToken(token)
  if (!normalizedToken) return ''

  const { portalUrl, hasExplicitPortalUrl } = getPublicEnvironmentConfig()
  if (!hasExplicitPortalUrl || !portalUrl) return ''

  try {
    const parsedUrl = new URL(portalUrl)
    if (parsedUrl.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)) return ''
  } catch {
    return ''
  }

  return buildPublicUrl(`/invoice/${normalizedToken}`, 'portal')
}

export function resolveInvoicePublicShareUrl(invoice = {}) {
  return buildInvoicePublicShareUrl(invoice.publicShareToken || invoice.public_share_token || '')
}

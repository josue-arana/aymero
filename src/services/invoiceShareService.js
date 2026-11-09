import dataProvider from './dataProvider'
import { buildInvoicePublicShareUrl } from '../utils/invoiceShare'
import { createInvoicePublicShareToken, normalizeInvoicePublicShareToken } from '../utils/invoiceShareToken'

export async function ensureInvoicePublicShare(invoice, { contractorId = '' } = {}) {
  if (!invoice?.id) {
    return { invoice: null, url: '', error: new Error('Invoice must be saved before creating a customer link.') }
  }

  let token = normalizeInvoicePublicShareToken(invoice.publicShareToken || invoice.public_share_token)
  let persistedInvoice = invoice
  if (!token) {
    try {
      token = createInvoicePublicShareToken()
    } catch (error) {
      return { invoice, url: '', error }
    }

    const response = await dataProvider.invoices.update(invoice.id, { publicShareToken: token }, { contractorId })
    if (response?.error || !response?.data?.id) {
      return {
        invoice,
        url: '',
        error: new Error(response?.error?.message || response?.message || 'The secure Invoice link could not be saved.'),
      }
    }
    persistedInvoice = response.data
  }

  return { invoice: persistedInvoice, url: buildInvoicePublicShareUrl(token), error: null }
}

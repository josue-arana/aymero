import { useEffect, useState } from 'react'
import { currency } from '../../utils/formatters'
import { getLanguageLocale } from '../../utils/language'
import { calculateInvoiceTotal, getInvoiceRemainingBalance, normalizeInvoiceStatus } from '../../utils/invoiceRecords'
import { getPaymentTermLabel } from '../../utils/paymentTerms'
import { tStatus } from '../../translations'

function formatInvoiceDocumentDate(value, language = 'en') {
  if (!value) return ''

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(getLanguageLocale(language), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function getCompanyInitials(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function getInvoiceDocumentStatusClasses(status) {
  if (status === 'Paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'Partially Paid') return 'border-cyan-200 bg-cyan-50 text-cyan-700'
  if (status === 'Overdue') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (status === 'Sent') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function CompanyBrand({ company = {}, t }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const companyName = company?.name || t('brandName')
  const initials = getCompanyInitials(companyName) || t('brandInitials')

  useEffect(() => {
    setLogoFailed(false)
  }, [company?.logo])

  return (
    <div className="flex min-w-0 items-center gap-4">
      {company?.logo && !logoFailed ? (
        <img
          src={company.logo}
          alt=""
          onError={() => setLogoFailed(true)}
          className="h-[72px] w-[72px] shrink-0 rounded-2xl object-contain"
        />
      ) : (
        <div
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white"
          style={{ backgroundColor: company?.primaryColor || '#2563eb' }}
        >
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <p className="break-words text-xl font-bold text-slate-950 [overflow-wrap:anywhere]">{companyName}</p>
        <div className="mt-2 space-y-1 text-sm leading-5 text-slate-600">
          {company?.phone ? <p>{company.phone}</p> : null}
          {company?.email ? <p className="break-words [overflow-wrap:anywhere]">{company.email}</p> : null}
          {company?.address ? <p className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{company.address}</p> : null}
        </div>
      </div>
    </div>
  )
}

function DocumentLabel({ children }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{children}</p>
}

function ContactBlock({ label, name, phone, email, address }) {
  const details = [phone, email, address].filter((value) => String(value || '').trim())

  return (
    <div className="min-w-0">
      <DocumentLabel>{label}</DocumentLabel>
      {name ? <p className="mt-2 break-words text-base font-bold text-slate-950 [overflow-wrap:anywhere]">{name}</p> : null}
      {details.length ? (
        <div className="mt-1.5 space-y-1 text-sm leading-5 text-slate-600">
          {phone ? <p>{phone}</p> : null}
          {email ? <p className="break-words [overflow-wrap:anywhere]">{email}</p> : null}
          {address ? <p className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{address}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function TotalRow({ label, value, strong = false, success = false }) {
  return (
    <div className={`flex items-center justify-between gap-5 ${strong ? 'border-t border-slate-200 pt-3' : ''}`}>
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className={`${strong ? 'text-lg' : 'text-sm'} font-bold ${success ? 'text-emerald-700' : 'text-slate-950'}`}>{value}</span>
    </div>
  )
}

export function InvoicePdfTemplate({
  invoice = {},
  company = {},
  client = {},
  t = (key) => key,
  language = 'en',
}) {
  const lineItems = Array.isArray(invoice?.lineItems) ? invoice.lineItems : []
  const subtotal = calculateInvoiceTotal(lineItems, Number(invoice?.amount || 0))
  const amountPaid = Number(invoice?.amountPaid || 0)
  const balance = getInvoiceRemainingBalance({ ...invoice, amount: subtotal, amountPaid })
  const status = normalizeInvoiceStatus(invoice?.status, {
    amount: subtotal,
    amountPaid,
    hasLinkedPayments: Array.isArray(invoice?.paymentHistory) && invoice.paymentHistory.length > 0,
  })
  const issueDate = formatInvoiceDocumentDate(invoice?.issueDate, language)
  const dueDate = formatInvoiceDocumentDate(invoice?.dueDate, language)
  const invoiceNumber = invoice?.number || invoice?.invoiceNumber || ''
  const invoiceTitle = invoice?.title || invoice?.projectTitle || invoice?.description || ''
  const paymentTerms = getPaymentTermLabel(invoice?.paymentTerms, t)
  const showPaymentTerms = Boolean(String(invoice?.paymentTerms || '').trim())
  const showNotes = Boolean(String(invoice?.notes || '').trim())

  return (
    <article
      data-invoice-pdf-template="true"
      className="document-sheet min-h-[1008px] bg-white p-12 text-slate-900"
    >
      <header className="flex items-start justify-between gap-8 border-b border-slate-200 pb-8">
        <CompanyBrand company={company} t={t} />
        <div className="min-w-0 text-right">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-600">{t('invoice')}</p>
          <h1 className="mt-2 break-words text-3xl font-bold tracking-tight text-slate-950 [overflow-wrap:anywhere]">{invoiceNumber}</h1>
          <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getInvoiceDocumentStatusClasses(status)}`}>
            {tStatus(t, status)}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-[1.2fr_0.8fr] gap-8 border-b border-slate-200 py-8">
        <ContactBlock
          label={t('billTo')}
          name={client?.name || invoice?.client || invoice?.clientName}
          phone={client?.phone}
          email={client?.email}
          address={client?.address}
        />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
          <div>
            <dt><DocumentLabel>{t('issueDate')}</DocumentLabel></dt>
            <dd className="mt-2 text-sm font-bold text-slate-950">{issueDate || t('notAvailable')}</dd>
          </div>
          <div>
            <dt><DocumentLabel>{t('dueDate')}</DocumentLabel></dt>
            <dd className="mt-2 text-sm font-bold text-slate-950">{dueDate || t('notAvailable')}</dd>
          </div>
          {invoiceTitle ? (
            <div className="col-span-2">
              <dt><DocumentLabel>{t('projectTitle')}</DocumentLabel></dt>
              <dd className="mt-2 break-words text-sm font-bold text-slate-950 [overflow-wrap:anywhere]">{invoiceTitle}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="py-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[minmax(0,1fr)_120px] bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <span>{t('description')}</span>
            <span className="text-right">{t('amount')}</span>
          </div>
          <div className="divide-y divide-slate-200">
            {lineItems.map((item, index) => (
              <div key={item?.id || `invoice-preview-line-${index}`} data-line-item-card="true" className="grid grid-cols-[minmax(0,1fr)_120px] gap-4 px-5 py-4 text-sm">
                <span className="break-words leading-5 text-slate-700 [overflow-wrap:anywhere]">{item?.description}</span>
                <span className="text-right font-bold text-slate-950">{currency.format(Number(item?.amount || 0))}</span>
              </div>
            ))}
            {!lineItems.length && invoiceTitle ? (
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-4 px-5 py-4 text-sm">
                <span className="break-words leading-5 text-slate-700 [overflow-wrap:anywhere]">{invoiceTitle}</span>
                <span className="text-right font-bold text-slate-950">{currency.format(subtotal)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ml-auto mt-6 w-[310px] space-y-3 rounded-2xl bg-slate-50 p-5">
          <TotalRow label={t('subtotal')} value={currency.format(subtotal)} />
          <TotalRow label={t('paymentsReceived')} value={currency.format(amountPaid)} />
          <TotalRow label={t('remainingBalance')} value={currency.format(balance)} strong success={balance === 0} />
          {balance === 0 ? <p className="text-right text-xs font-bold text-emerald-700">{t('paidInFull')}</p> : null}
        </div>
      </section>

      {showPaymentTerms || showNotes ? (
        <section className="grid grid-cols-2 gap-8 border-t border-slate-200 pt-7">
          {showPaymentTerms ? (
            <div>
              <DocumentLabel>{t('paymentTerms')}</DocumentLabel>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{paymentTerms}</p>
            </div>
          ) : null}
          {showNotes ? (
            <div>
              <DocumentLabel>{t('notes')}</DocumentLabel>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{invoice.notes}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </article>
  )
}

export default InvoicePdfTemplate

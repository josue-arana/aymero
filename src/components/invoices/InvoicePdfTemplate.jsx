import { useEffect, useState } from 'react'
import { currency } from '../../utils/formatters'
import { getLanguageLocale } from '../../utils/language'
import { calculateInvoiceTotal, getInvoiceRemainingBalance } from '../../utils/invoiceRecords'
import { getPaymentTermLabel } from '../../utils/paymentTerms'

function formatInvoiceDocumentDate(value, language = 'en') {
  if (!value) return ''

  const normalizedValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? `${value.trim()}T12:00:00`
    : value
  const parsedDate = new Date(normalizedValue)
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(getLanguageLocale(language), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function getFirstAvailableValue(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

function formatAddressLines(value) {
  const address = String(value || '').trim()
  if (!address) return []

  const explicitLines = address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (explicitLines.length > 1) {
    return explicitLines
  }

  const commaIndex = address.indexOf(',')
  if (commaIndex === -1) {
    return [address]
  }

  return [
    address.slice(0, commaIndex).trim(),
    address.slice(commaIndex + 1).trim(),
  ].filter(Boolean)
}

function resolveInvoiceJobLocation({ invoice = {}, project = {}, client = {} }) {
  return getFirstAvailableValue(
    project?.address,
    project?.location,
    project?.jobAddress,
    project?.job_address,
    project?.jobLocation,
    project?.job_location,
    invoice?.jobLocation,
    invoice?.job_location,
    invoice?.jobAddress,
    invoice?.job_address,
    invoice?.projectAddress,
    invoice?.project_address,
    client?.address
  )
}

function getCompanyInitials(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function HeaderPhoneIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" className="block shrink-0">
      <path
        fill="#0f8b8d"
        d="M6.62 10.79a15.54 15.54 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.07 21 3 13.93 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.24 1.02z"
      />
    </svg>
  )
}

function HeaderMailIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" className="block shrink-0">
      <path
        fill="#0f8b8d"
        d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25zm1.9.1 6.47 4.53a1.1 1.1 0 0 0 1.26 0l6.47-4.53a.25.25 0 0 0-.14-.45H5.04a.25.25 0 0 0-.14.45"
      />
    </svg>
  )
}

function HeaderWebsiteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" className="block shrink-0">
      <path
        fill="#0f8b8d"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m6.93 6h-3.17a15.7 15.7 0 0 0-1.35-3.16A8.05 8.05 0 0 1 18.93 8M12 4c.83 1.2 1.45 2.54 1.82 4h-3.64A13.5 13.5 0 0 1 12 4M4.26 14a7.8 7.8 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4zm.81 2h3.17c.3 1.12.76 2.18 1.35 3.16A8.05 8.05 0 0 1 5.07 16M8.24 8H5.07a8.05 8.05 0 0 1 4.52-3.16A15.7 15.7 0 0 0 8.24 8M12 20a13.5 13.5 0 0 1-1.82-4h3.64A13.5 13.5 0 0 1 12 20m2.21-6H9.79a14.4 14.4 0 0 1 0-4h4.42a14.4 14.4 0 0 1 0 4m.2 5.16A15.7 15.7 0 0 0 15.76 16h3.17a8.05 8.05 0 0 1-4.52 3.16M16.34 14a16.5 16.5 0 0 0 0-4h3.4a7.8 7.8 0 0 1 0 4z"
      />
    </svg>
  )
}

function CompanyContactRow({ icon: Icon, children }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12px] leading-[1.35] text-slate-700">
      <Icon />
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</span>
    </div>
  )
}

function CompanyBrand({ company = {}, t }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const companyName = company?.name || t('brandName')
  const initials = getCompanyInitials(companyName) || t('brandInitials')
  const companySubtitle = getFirstAvailableValue(
    company?.contractorType,
    company?.businessType,
    company?.subtitle,
    company?.trade
  ) || t('contractor')

  useEffect(() => {
    setLogoFailed(false)
  }, [company?.logo])

  return (
    <div className="flex min-w-0 items-start gap-4">
      {company?.logo && !logoFailed ? (
        <img
          src={company.logo}
          alt=""
          onError={() => setLogoFailed(true)}
          className="h-[68px] w-[68px] shrink-0 object-contain"
        />
      ) : (
        <div
          className="flex h-[68px] w-[68px] shrink-0 items-center justify-center text-xl font-bold text-white"
          style={{ backgroundColor: company?.primaryColor || '#0f8b8d' }}
        >
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <p className="break-words text-[19px] font-bold leading-tight text-slate-950 [overflow-wrap:anywhere]">{companyName}</p>
        <p className="mt-1 text-[12px] font-semibold leading-4 text-slate-500">{companySubtitle}</p>
        <div className="mt-3 grid gap-1.5">
          {company?.phone ? <CompanyContactRow icon={HeaderPhoneIcon}>{company.phone}</CompanyContactRow> : null}
          {company?.email ? <CompanyContactRow icon={HeaderMailIcon}>{company.email}</CompanyContactRow> : null}
          {company?.website ? <CompanyContactRow icon={HeaderWebsiteIcon}>{company.website}</CompanyContactRow> : null}
        </div>
      </div>
    </div>
  )
}

function DocumentLabel({ children }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f8b8d]">{children}</p>
}

function BillToBlock({ client = {}, invoice = {}, t }) {
  const name = client?.name || invoice?.client || invoice?.clientName || ''
  const details = [
    client?.phone,
    client?.email,
  ].filter((value) => String(value || '').trim())

  return (
    <div className="min-w-0">
      <DocumentLabel>{t('billTo')}</DocumentLabel>
      {name ? <p className="mt-3 break-words text-[13px] font-bold leading-5 text-slate-950 [overflow-wrap:anywhere]">{name}</p> : null}
      {details.length ? (
        <div className="mt-1 space-y-0.5 text-[12px] leading-[1.45] text-slate-600">
          {client?.phone ? <p>{client.phone}</p> : null}
          {client?.email ? <p className="break-words [overflow-wrap:anywhere]">{client.email}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function JobLocationBlock({ address, t }) {
  const addressLines = formatAddressLines(address)

  return (
    <div className="min-w-0">
      <DocumentLabel>{t('jobLocation')}</DocumentLabel>
      {addressLines.length ? (
        <div className="mt-3 space-y-0.5 text-[12px] font-semibold leading-[1.45] text-slate-800">
          {addressLines.map((line, index) => (
            <p key={`${line}-${index}`} className="break-words [overflow-wrap:anywhere]">{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function InvoiceDetailRow({ label, value }) {
  if (!String(value || '').trim()) return null

  return (
    <div className="grid min-w-0 grid-cols-[84px_minmax(0,1fr)] gap-3 text-[11.5px] leading-[1.45]">
      <dt className="font-bold text-slate-950">{label}</dt>
      <dd className="min-w-0 break-words text-slate-700 [overflow-wrap:anywhere]">{value}</dd>
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
  project = {},
  t = (key) => key,
  language = 'en',
}) {
  const lineItems = Array.isArray(invoice?.lineItems) ? invoice.lineItems : []
  const subtotal = calculateInvoiceTotal(lineItems, Number(invoice?.amount || 0))
  const amountPaid = Number(invoice?.amountPaid || 0)
  const balance = getInvoiceRemainingBalance({ ...invoice, amount: subtotal, amountPaid })
  const issueDate = formatInvoiceDocumentDate(invoice?.issueDate, language)
  const dueDate = formatInvoiceDocumentDate(invoice?.dueDate, language)
  const invoiceNumber = invoice?.number || invoice?.invoiceNumber || ''
  const invoiceTitle = invoice?.title || invoice?.projectTitle || invoice?.description || ''
  const paymentTerms = getPaymentTermLabel(invoice?.paymentTerms, t)
  const showPaymentTerms = Boolean(String(invoice?.paymentTerms || '').trim())
  const showNotes = Boolean(String(invoice?.notes || '').trim())
  const jobLocation = resolveInvoiceJobLocation({ invoice, project, client })

  return (
    <article
      data-invoice-pdf-template="true"
      className="document-sheet min-h-[1008px] border border-slate-200 bg-white p-10 font-sans text-slate-900"
    >
      <header className="grid grid-cols-[minmax(0,1fr)_210px] items-start gap-8 pb-6">
        <CompanyBrand company={company} t={t} />
        <div className="min-w-0 text-right">
          <h1 className="m-0 text-[34px] font-bold uppercase leading-none tracking-[0.12em] text-slate-950">{t('invoice')}</h1>
          {invoiceNumber ? (
            <p className="mt-3 break-words text-[15px] font-bold leading-5 text-[#0f8b8d] [overflow-wrap:anywhere]">{invoiceNumber}</p>
          ) : null}
        </div>
      </header>

      <div className="h-px w-full bg-slate-300" aria-hidden="true" />

      <section className="grid grid-cols-[28fr_34fr_38fr] py-6">
        <div className="min-w-0 pr-5">
          <BillToBlock client={client} invoice={invoice} t={t} />
        </div>
        <div className="min-w-0 border-l border-slate-300 px-5">
          <JobLocationBlock address={jobLocation} t={t} />
        </div>
        <div className="min-w-0 border-l border-slate-300 pl-5">
          <DocumentLabel>{t('invoiceDetails')}</DocumentLabel>
          <dl className="mt-3 grid gap-1.5">
            <InvoiceDetailRow label={t('invoiceNumber')} value={invoiceNumber} />
            <InvoiceDetailRow label={t('invoiceDate')} value={issueDate} />
            <InvoiceDetailRow label={t('dueDate')} value={dueDate} />
            <InvoiceDetailRow label={t('paymentTerms')} value={paymentTerms} />
          </dl>
        </div>
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

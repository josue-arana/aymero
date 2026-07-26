import { useEffect, useState } from 'react'
import { currencyWithCents } from '../../utils/formatters'
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

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key)
}

function readNumericField(source = {}, keys = [], fallback = 0) {
  for (const key of keys) {
    if (!hasOwn(source, key)) continue

    const value = Number(source[key])
    if (Number.isFinite(value)) return value
  }

  return Number(fallback) || 0
}

function hasAnyField(source = {}, keys = []) {
  return keys.some((key) => hasOwn(source, key))
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

function splitInvoiceItemContent(item = {}, fallbackTitle = '') {
  const explicitTitle = getFirstAvailableValue(item?.title, item?.name)
  const description = String(item?.description || '').trim()
  const descriptionLines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const title = explicitTitle || descriptionLines[0] || fallbackTitle
  const supportingLines = explicitTitle
    ? descriptionLines.filter((line) => line !== explicitTitle)
    : descriptionLines.slice(1)

  return { title, supportingLines }
}

function getDisplayInvoiceItems(lineItems = [], invoiceTitle = '', subtotal = 0) {
  if (lineItems.length) return lineItems
  if (!String(invoiceTitle || '').trim()) return []

  return [{ description: invoiceTitle, amount: subtotal }]
}

function getPaymentDate(payment = {}) {
  return payment?.date
    || payment?.paymentDate
    || payment?.payment_date
    || payment?.createdAt
    || payment?.created_at
    || ''
}

function dedupeDocumentPayments(payments = []) {
  const seenIds = new Set()

  return payments.filter((payment) => {
    const paymentId = String(payment?.id || '').trim()
    if (!paymentId) return true
    if (seenIds.has(paymentId)) return false

    seenIds.add(paymentId)
    return true
  })
}

function getPaymentDescription(payment = {}, t) {
  const note = getFirstAvailableValue(payment?.notes, payment?.description)
  const method = getFirstAvailableValue(payment?.method, payment?.paymentMethod, payment?.payment_method)
  const type = getFirstAvailableValue(payment?.type, payment?.paymentType, payment?.payment_type)
  const translatedDetails = [method, type]
    .filter(Boolean)
    .map((value) => t(value))
  const title = note || translatedDetails.join(' · ') || t('paymentReceived')
  const supportingText = note ? translatedDetails.join(' · ') : ''

  return { title, supportingText }
}

const customerNoteFieldNames = [
  'customerFacingNotes',
  'customer_facing_notes',
  'customerNotes',
  'customer_notes',
  'publicNotes',
  'public_notes',
  'invoiceNotes',
  'invoice_notes',
]

const sampleMetadataPatterns = [
  /aymero[_\s-]*sample[_\s-]*data/i,
  /sample[_\s-]*data[_\s-]*key/i,
  /["']?(?:sampleDataKey|sample_data_key)["']?\s*:/i,
]

function sanitizeCustomerFacingNotes(value) {
  return String(value || '')
    .split(/\r?\n/)
    .filter((line) => !sampleMetadataPatterns.some((pattern) => pattern.test(line)))
    .join('\n')
    .trim()
}

function resolveCustomerFacingNotes(invoice = {}) {
  const explicitCustomerNotes = customerNoteFieldNames
    .map((fieldName) => invoice?.[fieldName])
    .find((value) => String(value || '').trim())

  if (explicitCustomerNotes) {
    return sanitizeCustomerFacingNotes(explicitCustomerNotes)
  }

  const notesVisibility = String(
    invoice?.notesVisibility
      || invoice?.notes_visibility
      || invoice?.noteVisibility
      || invoice?.note_visibility
      || ''
  ).trim().toLowerCase()
  const notesAreInternal = invoice?.notesAreInternal === true
    || invoice?.notes_are_internal === true
    || notesVisibility === 'internal'
    || notesVisibility === 'private'

  if (notesAreInternal) return ''

  return sanitizeCustomerFacingNotes(invoice?.notes)
}

function normalizeConfiguredPaymentMethods(value) {
  const rawMethods = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : value && typeof value === 'object'
        ? Object.entries(value)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([method]) => method)
        : []
  const seenMethods = new Set()

  return rawMethods
    .map((method) => (
      method && typeof method === 'object'
        ? getFirstAvailableValue(method.label, method.name, method.value)
        : String(method || '').trim()
    ))
    .filter(Boolean)
    .filter((method) => {
      const normalizedMethod = method.toLowerCase()
      if (seenMethods.has(normalizedMethod)) return false

      seenMethods.add(normalizedMethod)
      return true
    })
}

function resolveAcceptedPaymentMethods(invoice = {}, company = {}) {
  const configuredMethods = getFirstAvailableValue(
    company?.acceptedPaymentMethods,
    company?.accepted_payment_methods,
    company?.paymentMethods,
    company?.payment_methods,
    invoice?.acceptedPaymentMethods,
    invoice?.accepted_payment_methods,
    invoice?.paymentMethods,
    invoice?.payment_methods
  )

  return normalizeConfiguredPaymentMethods(configuredMethods)
}

function getReliablePaidDate(invoice = {}, payments = [], { invoiceTotal, amountPaid, isPaidInFull }) {
  const storedPaidDate = invoice?.paidAt || invoice?.paid_at || ''

  if (storedPaidDate && !Number.isNaN(new Date(storedPaidDate).getTime())) {
    return storedPaidDate
  }

  if (!isPaidInFull || invoiceTotal <= 0 || amountPaid < invoiceTotal) {
    return ''
  }

  return payments.reduce((latest, payment) => {
    const dateValue = getPaymentDate(payment)
    const timestamp = dateValue ? new Date(dateValue).getTime() : Number.NaN

    if (!Number.isFinite(timestamp)) return latest
    if (!latest || timestamp > latest.timestamp) {
      return { value: dateValue, timestamp }
    }

    return latest
  }, null)?.value || ''
}

function CalendarIcon({ color = '#0f8b8d' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" className="block shrink-0">
      <path
        fill={color}
        d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1m12 8H5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1z"
      />
    </svg>
  )
}

function InvoiceTotalRow({ label, value, strong = false, deducted = false }) {
  return (
    <div className={`flex items-start justify-between gap-5 ${strong ? 'mt-2 border-t border-slate-300 pt-3' : ''}`}>
      <span className={`${strong ? 'font-bold text-slate-950' : 'font-semibold text-slate-600'} text-[12px] leading-5`}>{label}</span>
      <span className={`${strong ? 'text-[14px]' : 'text-[12px]'} shrink-0 font-bold leading-5 text-slate-950`}>
        {deducted && Number(value) > 0 ? '− ' : ''}
        {currencyWithCents.format(Number(value) || 0)}
      </span>
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
  const calculatedLineItemSubtotal = calculateInvoiceTotal(lineItems, Number(invoice?.amount || 0))
  const storedSubtotal = readNumericField(invoice, ['subtotal'], calculatedLineItemSubtotal)
  const subtotal = storedSubtotal === 0 && calculatedLineItemSubtotal > 0
    ? calculatedLineItemSubtotal
    : storedSubtotal
  const taxFieldNames = ['taxAmount', 'tax_amount', 'salesTax', 'sales_tax']
  const hasTaxSupport = hasAnyField(invoice, taxFieldNames)
  const taxAmount = readNumericField(invoice, taxFieldNames, 0)
  const storedInvoiceTotal = readNumericField(invoice, ['totalAmount', 'total_amount', 'total', 'amount'], subtotal)
  const invoiceTotal = storedInvoiceTotal === 0 && subtotal > 0 ? subtotal : storedInvoiceTotal
  const amountPaid = readNumericField(invoice, ['amountPaid', 'amount_paid'], 0)
  const balance = getInvoiceRemainingBalance({ amount: invoiceTotal, amountPaid })
  const issueDate = formatInvoiceDocumentDate(invoice?.issueDate, language)
  const dueDate = formatInvoiceDocumentDate(invoice?.dueDate, language)
  const invoiceNumber = invoice?.number || invoice?.invoiceNumber || ''
  const invoiceTitle = invoice?.title || invoice?.projectTitle || invoice?.description || ''
  const displayLineItems = getDisplayInvoiceItems(lineItems, invoiceTitle, subtotal)
  const payments = dedupeDocumentPayments(Array.isArray(invoice?.paymentHistory) ? invoice.paymentHistory : [])
  const normalizedStatus = String(invoice?.status || '').trim().toLowerCase().replaceAll('_', ' ')
  const isPaidInFull = balance === 0 && (
    (invoiceTotal > 0 && amountPaid >= invoiceTotal)
    || normalizedStatus === 'paid'
    || normalizedStatus === 'paid in full'
  )
  const paidDateValue = getReliablePaidDate(invoice, payments, {
    invoiceTotal,
    amountPaid,
    isPaidInFull,
  })
  const paidDate = formatInvoiceDocumentDate(paidDateValue, language)
  const paymentTerms = getPaymentTermLabel(invoice?.paymentTerms, t)
  const customerFacingNotes = resolveCustomerFacingNotes(invoice)
  const acceptedPaymentMethods = resolveAcceptedPaymentMethods(invoice, company)
  const showLowerContent = Boolean(customerFacingNotes || acceptedPaymentMethods.length)
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

      <section className="pt-2">
        <div className="border-y border-slate-300">
          <div className="grid grid-cols-[minmax(0,1fr)_132px] border-b border-slate-300 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-950">
            <span className="px-1 py-3">{t('description')}</span>
            <span className="border-l border-slate-300 px-3 py-3 text-right">{t('amount')}</span>
          </div>
          <div>
            {displayLineItems.map((item, index) => {
              const { title, supportingLines } = splitInvoiceItemContent(item, `${t('item')} ${index + 1}`)

              return (
                <div
                  key={item?.id || `invoice-preview-line-${index}`}
                  data-line-item-card="true"
                  className={`grid grid-cols-[minmax(0,1fr)_132px] text-[12px] ${index < displayLineItems.length - 1 ? 'border-b border-slate-200' : ''}`}
                >
                  <div className="min-w-0 px-1 py-3.5 pr-5">
                    <p className="break-words font-bold leading-5 text-slate-950 [overflow-wrap:anywhere]">
                      <span className="mr-1.5 text-[#0f8b8d]">{index + 1}.</span>
                      {title}
                    </p>
                    {supportingLines.length ? (
                      <div className="mt-1.5 space-y-1 pl-5 text-[11px] leading-[1.45] text-slate-600">
                        {supportingLines.map((line, lineIndex) => (
                          <p key={`${line}-${lineIndex}`} className="break-words [overflow-wrap:anywhere]">{line}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="border-l border-slate-300 px-3 py-3.5 text-right font-bold leading-5 text-slate-950">
                    {currencyWithCents.format(Number(item?.amount || 0))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-[minmax(0,1.2fr)_minmax(250px,0.8fr)]">
          <section className="min-w-0 pr-6">
            <DocumentLabel>{t('paymentHistory')}</DocumentLabel>
            <div className="mt-3 border-y border-slate-300">
              <div className="grid grid-cols-[92px_minmax(0,1fr)_92px] border-b border-slate-300 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-950">
                <span className="py-2.5 pr-3">{t('date')}</span>
                <span className="border-l border-slate-200 px-3 py-2.5">{t('description')}</span>
                <span className="border-l border-slate-200 py-2.5 pl-3 text-right">{t('amount')}</span>
              </div>
              {payments.length ? (
                payments.map((payment, index) => {
                  const description = getPaymentDescription(payment, t)

                  return (
                    <div
                      key={payment?.id || `invoice-payment-${index}`}
                      className={`grid grid-cols-[92px_minmax(0,1fr)_92px] text-[10.5px] leading-[1.45] ${index < payments.length - 1 ? 'border-b border-slate-200' : ''}`}
                    >
                      <span className="py-3 pr-3 text-slate-600">{formatInvoiceDocumentDate(getPaymentDate(payment), language)}</span>
                      <span className="min-w-0 border-l border-slate-200 px-3 py-3">
                        <span className="block break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{description.title}</span>
                        {description.supportingText ? <span className="mt-0.5 block break-words text-[9.5px] text-slate-500 [overflow-wrap:anywhere]">{description.supportingText}</span> : null}
                      </span>
                      <span className="border-l border-slate-200 py-3 pl-3 text-right font-bold text-slate-950">
                        {currencyWithCents.format(Number(payment?.amount || 0))}
                      </span>
                    </div>
                  )
                })
              ) : (
                <p className="py-5 text-[11px] text-slate-500">{t('noPayments')}</p>
              )}
            </div>
          </section>

          <section className="min-w-0 border-l border-slate-300 pl-6">
            <div className="grid gap-2">
              <InvoiceTotalRow label={t('subtotal')} value={subtotal} />
              {hasTaxSupport ? <InvoiceTotalRow label={t('salesTax')} value={taxAmount} /> : null}
              <InvoiceTotalRow label={t('totalInvoice')} value={invoiceTotal} strong />
              <InvoiceTotalRow label={t('previousPayments')} value={amountPaid} deducted />
            </div>

            <div className={`mt-5 border p-4 ${isPaidInFull ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-300 bg-white'}`}>
              <div className="flex items-start justify-between gap-4">
                <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${isPaidInFull ? 'text-emerald-700' : 'text-[#0f8b8d]'}`}>
                  {isPaidInFull ? t('paidInFull') : t('balanceDue')}
                </p>
                <p className="shrink-0 text-[20px] font-bold leading-none text-slate-950">
                  {currencyWithCents.format(isPaidInFull ? 0 : balance)}
                </p>
              </div>
              {isPaidInFull && paidDate ? (
                <div className="mt-3 flex items-center gap-2 text-[10.5px] font-semibold text-emerald-700">
                  <CalendarIcon color="#047857" />
                  <span>{t('paid')} {paidDate}</span>
                </div>
              ) : !isPaidInFull && dueDate ? (
                <div className="mt-3 flex items-center gap-2 text-[10.5px] font-semibold text-slate-600">
                  <CalendarIcon />
                  <span>{t('invoiceDueDateLabel')} {dueDate}</span>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      {showLowerContent ? (
        <section className={`mt-7 border-t border-slate-300 pt-6 ${customerFacingNotes && acceptedPaymentMethods.length ? 'grid grid-cols-2' : ''}`}>
          {customerFacingNotes ? (
            <div className={acceptedPaymentMethods.length ? 'min-w-0 pr-7' : 'min-w-0'}>
              <DocumentLabel>{t('notes')}</DocumentLabel>
              <p className="mt-3 whitespace-pre-line break-words text-[11.5px] leading-[1.55] text-slate-700 [overflow-wrap:anywhere]">{customerFacingNotes}</p>
            </div>
          ) : null}
          {acceptedPaymentMethods.length ? (
            <div className={`min-w-0 ${customerFacingNotes ? 'border-l border-slate-300 pl-7' : ''}`}>
              <DocumentLabel>{t('acceptedPaymentMethods')}</DocumentLabel>
              <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 pl-4 text-[11.5px] leading-[1.45] text-slate-700">
                {acceptedPaymentMethods.map((method) => (
                  <li key={method} className="break-words pl-0.5 [overflow-wrap:anywhere]">{t(method)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="mt-7 border-t border-slate-300 pt-5 text-center">
        <p className="text-[13px] font-bold leading-5 text-[#0f8b8d]">{t('thankYouForYourBusiness')}</p>
        {company?.name ? <p className="mt-1 text-[11.5px] font-bold leading-5 text-slate-950">{company.name}</p> : null}
      </footer>
    </article>
  )
}

export default InvoicePdfTemplate

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { SelectField } from '../ui/SelectField'
import { currency } from '../../utils/formatters'
import { buildInvoiceCreationPayload, buildInvoiceProjectOptions } from '../../utils/invoiceCreation'

function isoDate(value = new Date()) {
  const parsedDate = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? new Date().toISOString().slice(0, 10) : parsedDate.toISOString().slice(0, 10)
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + Math.max(Number(days) || 0, 0))
  return isoDate(date)
}

function TextField({ label, value, onChange, type = 'text', required = false, min = undefined, inputMode = undefined }) {
  return (
    <label className="block min-w-0 text-sm font-bold text-slate-700">
      <span className="mb-2 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        min={min}
        inputMode={inputMode}
        className="min-h-12 w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  )
}

export function InvoiceCreationModal({
  isOpen,
  projects = [],
  leads = [],
  clients = [],
  contracts = [],
  initialProjectId = '',
  lockProject = false,
  defaultPaymentTerms = '',
  invoiceDueDays = 7,
  onClose,
  onSave,
  t,
}) {
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [lineItems, setLineItems] = useState([{ description: '', amount: '' }])
  const [paymentTerms, setPaymentTerms] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [invoiceLanguage, setInvoiceLanguage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitGuardRef = useRef(false)
  const availableClients = useMemo(() => (Array.isArray(clients) ? clients.filter(Boolean) : []), [clients])
  const projectOptions = useMemo(() => buildInvoiceProjectOptions({ projects, leads, clients: availableClients, contracts }), [availableClients, contracts, leads, projects])
  const selectedProject = projectOptions.find((project) => project.id === selectedProjectId) || null
  const selectedClient = availableClients.find((client) => String(client?.id || '').trim() === selectedClientId) || null
  const visibleProjectOptions = selectedClientId
    ? projectOptions.filter((project) => project.clientId === selectedClientId || project.id === selectedProjectId)
    : projectOptions
  const total = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  useEffect(() => {
    if (!isOpen) return

    const today = isoDate()
    const initialProject = projectOptions.find((project) => project.id === initialProjectId) || null
    setSelectedProjectId(initialProject?.id || '')
    setSelectedClientId(initialProject?.clientId || '')
    setTitle(initialProject?.title || '')
    setIssueDate(today)
    setDueDate(addDays(today, invoiceDueDays))
    setLineItems([{ description: initialProject?.title || '', amount: '' }])
    setPaymentTerms(defaultPaymentTerms || '')
    setCustomerNotes('')
    setInvoiceLanguage('')
    setIsSubmitting(false)
    submitGuardRef.current = false
  }, [defaultPaymentTerms, initialProjectId, invoiceDueDays, isOpen, projectOptions])

  function chooseClient(clientId) {
    setSelectedClientId(clientId)
    if (selectedProject && selectedProject.clientId !== clientId) {
      setSelectedProjectId('')
      setTitle('')
      setLineItems([{ description: '', amount: '' }])
    }
  }

  function chooseProject(projectId) {
    const project = projectOptions.find((option) => option.id === projectId) || null
    setSelectedProjectId(projectId)
    if (!project) return

    setSelectedClientId(project.clientId || '')
    setTitle(project.title || '')
    setLineItems((current) => {
      const hasContractorInput = current.some((item) => item.description.trim() || Number(item.amount) > 0)
      return hasContractorInput ? current : [{ description: project.title || '', amount: '' }]
    })
  }

  function updateLineItem(index, field, value) {
    setLineItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )))
  }

  function useRemainingBalance() {
    if (!selectedProject) return
    setLineItems([{
      description: title.trim() || selectedProject.title || t('invoice'),
      amount: selectedProject.remainingBalance ? String(selectedProject.remainingBalance) : '',
    }])
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitGuardRef.current || !selectedProject || !selectedClient || total <= 0) return

    submitGuardRef.current = true
    setIsSubmitting(true)

    try {
      await onSave?.(buildInvoiceCreationPayload({
        project: selectedProject,
        client: selectedClient,
        title,
        issueDate,
        dueDate,
        lineItems,
        paymentTerms,
        customerNotes,
        invoiceLanguage,
      }))
    } finally {
      submitGuardRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onBackdropClick={isSubmitting ? undefined : onClose}
      panelClassName="sm:max-w-3xl"
      ariaLabelledBy="create-invoice-title"
      ariaDescribedBy="create-invoice-help"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">{t('invoice')}</p>
          <h2 id="create-invoice-title" className="mt-1 text-2xl font-bold text-slate-950">{t('newInvoice')}</h2>
          <p id="create-invoice-help" className="mt-2 text-sm leading-6 text-slate-500">{t('createInvoiceHelp')}</p>
        </div>
        <button type="button" disabled={isSubmitting} onClick={onClose} aria-label={t('close')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-60">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <section className="grid min-w-0 gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <label className="block min-w-0 text-sm font-bold text-slate-700">
            <span className="mb-2 block">{t('client')}</span>
            <SelectField value={selectedClientId} onChange={(event) => chooseClient(event.target.value)} disabled={lockProject} required className="bg-white">
              <option value="">{t('selectClient')}</option>
              {availableClients.map((client) => <option key={client.id} value={client.id}>{client.displayName || client.name}</option>)}
            </SelectField>
          </label>
          <label className="block min-w-0 text-sm font-bold text-slate-700">
            <span className="mb-2 block">{t('project')}</span>
            <SelectField value={selectedProjectId} onChange={(event) => chooseProject(event.target.value)} disabled={lockProject} required className="bg-white">
              <option value="">{t('selectProject')}</option>
              {visibleProjectOptions.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.clientName}</option>)}
            </SelectField>
          </label>
        </section>

        <section className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label={t('invoiceTitle')} value={title} onChange={setTitle} required /></div>
          <TextField label={t('issueDate')} type="date" value={issueDate} onChange={(value) => { setIssueDate(value); if (dueDate && dueDate < value) setDueDate(value) }} required />
          <TextField label={t('dueDate')} type="date" value={dueDate} onChange={setDueDate} min={issueDate} required />
        </section>

        <section className="rounded-3xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-950">{t('lineItems')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('invoiceLineItemsHelp')}</p>
            </div>
            {selectedProject?.remainingBalance > 0 ? (
              <button type="button" onClick={useRemainingBalance} className="min-h-11 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
                {t('useProjectRemainingBalance')} · {currency.format(selectedProject.remainingBalance)}
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="grid min-w-0 gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                <TextField label={t('description')} value={item.description} onChange={(value) => updateLineItem(index, 'description', value)} required />
                <TextField label={t('amount')} type="number" inputMode="decimal" min="0.01" value={item.amount} onChange={(value) => updateLineItem(index, 'amount', value)} required />
                <button type="button" disabled={lineItems.length === 1} onClick={() => setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={t('removeItem')} className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-12">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setLineItems((current) => [...current, { description: '', amount: '' }])} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" aria-hidden="true" /> {t('addItem')}
            </button>
            <p className="text-right text-lg font-bold text-slate-950">{t('total')}: {currency.format(total)}</p>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="block min-w-0 text-sm font-bold text-slate-700">
            <span className="mb-2 block">{t('invoiceLanguage')}</span>
            <SelectField value={invoiceLanguage} onChange={(event) => setInvoiceLanguage(event.target.value)}>
              <option value="">{t('useClientLanguage')}</option>
              <option value="en">{t('english')}</option>
              <option value="es">{t('spanish')}</option>
            </SelectField>
          </label>
          <label className="block min-w-0 text-sm font-bold text-slate-700 sm:col-span-2">
            <span className="mb-2 block">{t('paymentTerms')}</span>
            <textarea value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} rows={3} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          </label>
          <label className="block min-w-0 text-sm font-bold text-slate-700 sm:col-span-2">
            <span className="mb-2 block">{t('customerNote')}</span>
            <textarea value={customerNotes} onChange={(event) => setCustomerNotes(event.target.value)} rows={3} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          </label>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <button type="button" disabled={isSubmitting} onClick={onClose} className="min-h-12 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{t('cancel')}</button>
          <button type="submit" disabled={isSubmitting || !selectedProject || !selectedClient || total <= 0} className="min-h-12 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? t('saving') : t('createInvoice')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

export default InvoiceCreationModal

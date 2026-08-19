import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, Building2, CalendarDays, CheckCircle2, ChevronRight, CreditCard, DollarSign, Download, Eye, FileText, Pencil, Printer, RotateCcw, Save, Send, Trash2, UserRound, Wallet } from 'lucide-react'
import { StatusBadge } from '../components/ui/StatusBadge'
import { InvoiceDocumentPreview } from '../components/invoices/InvoiceDocumentPreview'
import { contractorCompany } from '../data/mockInvoices'
import { currency } from '../utils/formatters'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { SendToCustomerModal } from '../components/common/SendToCustomerModal'
import { ModalShell } from '../components/common/ModalShell'
import { useToast } from '../components/common/ToastProvider'
import ActionMenu from '../components/common/ActionMenu'
import { RecordBackButton } from '../components/common/RecordBackButton'
import { AymeroLoader } from '../components/common/AymeroLoader'
import dataProvider from '../services/dataProvider'
import { useAuth } from '../contexts/AuthContext'
import { getInvoicesContractorId } from '../services/system/invoicesRuntimeService'
import { getPaymentsContractorId } from '../services/system/paymentsRuntimeService'
import { findRelatedLeadForInvoice, getInvoiceRemainingBalance, normalizeInvoiceStatus } from '../utils/invoiceRecords'
import { createTranslator } from '../translations'
import { findRelatedClient } from '../utils/clients'
import { getLanguageLocale, resolveClientFacingLanguage } from '../utils/language'
import { getPaymentTermOptions, isKnownPaymentTermValue } from '../utils/paymentTerms'
import { resolveInvoiceCustomerNote } from '../utils/invoiceCustomerNotes'
import { printDocumentElement } from '../utils/printDocument'
import { appRoutes } from '../config/appRoutes'
import { isRecordArchived } from '../utils/archiveLifecycle'

const paymentMethods = ['Cash', 'Check', 'Zelle', 'Credit Card', 'Bank Transfer', 'Other']
const paymentTypes = ['Deposit', 'Progress Payment', 'Final Payment', 'Other']
const unavailableContactValues = new Set(['(410) 555-0100', 'Address not added', 'Unknown Client'])

function getAvailableContactValue(...values) {
  for (const value of values) {
    const normalizedValue = String(value ?? '').trim()

    if (normalizedValue && !unavailableContactValues.has(normalizedValue)) {
      return value
    }
  }

  return ''
}

function calculateInvoiceTotal(lineItems = []) {
  return lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
}

function formatLocalizedInvoiceDate(value, language = 'en') {
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

function getInvoiceTimelineTimestamp(value) {
  if (!value) return null

  const normalizedValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value
  const timestamp = new Date(normalizedValue).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function formatInvoiceTimelineDate(value, language = 'en') {
  if (!value) return ''

  const normalizedValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value

  return getInvoiceTimelineTimestamp(normalizedValue)
    ? formatLocalizedInvoiceDate(normalizedValue, language)
    : ''
}

function dedupeInvoiceTimelinePayments(payments = []) {
  const seenIds = new Set()

  return payments.filter((payment) => {
    const paymentId = String(payment?.id || '').trim()
    if (!paymentId) return true
    if (seenIds.has(paymentId)) return false

    seenIds.add(paymentId)
    return true
  })
}

function getInvoicePaymentDate(payment = {}) {
  return payment.date
    || payment.paymentDate
    || payment.payment_date
    || payment.createdAt
    || payment.created_at
    || ''
}

function buildInvoiceTimelineEvents({ invoice, payments, total, balance, language, t }) {
  const events = []
  const createdAt = invoice?.createdAt || invoice?.created_at || ''
  const sentAt = invoice?.sentAt || invoice?.sent_at || ''
  const storedPaidAt = invoice?.paidAt || invoice?.paid_at || ''
  const createdTimestamp = getInvoiceTimelineTimestamp(createdAt)
  const sentTimestamp = getInvoiceTimelineTimestamp(sentAt)
  const paidTimestamp = getInvoiceTimelineTimestamp(storedPaidAt)

  if (createdTimestamp) {
    events.push({
      id: 'invoice-created',
      type: 'created',
      label: t('invoiceCreated'),
      date: formatInvoiceTimelineDate(createdAt, language),
      timestamp: createdTimestamp,
      rank: 1,
    })
  }

  if (sentTimestamp) {
    events.push({
      id: 'invoice-sent',
      type: 'sent',
      label: t('invoiceSent'),
      date: formatInvoiceTimelineDate(sentAt, language),
      timestamp: sentTimestamp,
      rank: 2,
    })
  }

  payments.forEach((payment, index) => {
    const dateValue = getInvoicePaymentDate(payment)
    const timestamp = getInvoiceTimelineTimestamp(dateValue)
    const method = payment?.method || payment?.paymentMethod || payment?.payment_method || ''
    const paymentType = payment?.type || payment?.paymentType || payment?.payment_type || ''

    events.push({
      id: `payment-${payment?.id || index}`,
      type: 'payment',
      label: t('paymentReceived'),
      date: formatInvoiceTimelineDate(dateValue, language) || t('notAvailable'),
      timestamp: timestamp ?? Number.MIN_SAFE_INTEGER + index,
      rank: 3,
      amount: currency.format(Number(payment?.amount || 0)),
      metadata: [method, paymentType].filter(Boolean).map((value) => t(value)),
      note: payment?.notes || payment?.description || '',
    })
  })

  const latestDatedPayment = payments.reduce((latest, payment) => {
    const dateValue = getInvoicePaymentDate(payment)
    const timestamp = getInvoiceTimelineTimestamp(dateValue)

    return timestamp && (!latest || timestamp > latest.timestamp)
      ? { dateValue, timestamp }
      : latest
  }, null)
  const storedAmountPaid = Number(invoice?.amountPaid || invoice?.amount_paid || 0)
  const derivedPaidDate = balance === 0 && total > 0 && storedAmountPaid >= total
    ? latestDatedPayment
    : null
  const completionDate = paidTimestamp
    ? { dateValue: storedPaidAt, timestamp: paidTimestamp }
    : derivedPaidDate

  if (balance === 0 && completionDate) {
    events.push({
      id: 'invoice-paid-in-full',
      type: 'paid',
      label: t('paidInFull'),
      date: formatInvoiceTimelineDate(completionDate.dateValue, language),
      timestamp: completionDate.timestamp,
      rank: 4,
    })
  }

  return {
    completionDate: completionDate ? formatInvoiceTimelineDate(completionDate.dateValue, language) : '',
    events: events.sort((left, right) => (
      right.timestamp - left.timestamp || right.rank - left.rank
    )),
  }
}

function translateInvoiceStatus(status, t) {
  const normalizedStatus = String(status || '').trim().toLowerCase().replaceAll('_', ' ')

  if (normalizedStatus === 'paid in full') return t('paidInFull')
  if (normalizedStatus === 'paid') return t('paid')
  if (normalizedStatus === 'partially paid') return t('partiallyPaid')
  if (normalizedStatus === 'sent') return t('sent')
  if (normalizedStatus === 'overdue') return t('overdue')
  if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') return t('canceled')
  if (normalizedStatus === 'archived') return t('archived')
  return t('draft')
}

function getInvoiceStatusClasses(status) {
  const normalizedStatus = String(status || '').trim().toLowerCase().replaceAll('_', ' ')

  if (normalizedStatus === 'paid' || normalizedStatus === 'paid in full') {
    return 'border-emerald-300/30 bg-emerald-400/15 text-emerald-100'
  }
  if (normalizedStatus === 'partially paid') {
    return 'border-cyan-300/30 bg-cyan-400/15 text-cyan-100'
  }
  if (normalizedStatus === 'overdue') {
    return 'border-rose-300/30 bg-rose-400/15 text-rose-100'
  }
  if (normalizedStatus === 'sent') {
    return 'border-blue-300/30 bg-blue-400/15 text-blue-100'
  }
  if (normalizedStatus === 'archived') {
    return 'border-amber-300/30 bg-amber-400/15 text-amber-100'
  }
  return 'border-slate-300/25 bg-white/10 text-slate-100'
}

function getInvoiceActionHierarchy(status, isArchived) {
  if (isArchived) {
    return {
      primary: 'restore',
      secondary: ['preview'],
      overflow: ['save', 'send', 'recordPayment', 'markPaid', 'delete'],
    }
  }

  const normalizedStatus = String(status || '').trim().toLowerCase().replaceAll('_', ' ')

  if (normalizedStatus === 'paid' || normalizedStatus === 'paid in full') {
    return {
      primary: 'preview',
      secondary: ['send', 'save'],
      overflow: ['recordPayment', 'markPaid', 'archive'],
    }
  }

  if (normalizedStatus === 'partially paid') {
    return {
      primary: 'recordPayment',
      secondary: ['preview', 'send'],
      overflow: ['save', 'markPaid', 'archive'],
    }
  }

  if (normalizedStatus === 'sent' || normalizedStatus === 'overdue') {
    return {
      primary: 'recordPayment',
      secondary: ['send', 'preview'],
      overflow: ['save', 'markPaid', 'archive'],
    }
  }

  return {
    primary: 'save',
    secondary: ['send', 'preview'],
    overflow: ['recordPayment', 'markPaid', 'archive'],
  }
}

export function InvoiceDetailRoute({ companySettings, leads, clients = [], invoices = [], invoicesLoaded = false, archivedIds = [], deletedIds = [], onUpdateInvoice, onRecordInvoicePayment, onMarkInvoicePaid, onInvoiceSent, onArchiveInvoice, onRestoreInvoice, onDeleteInvoice, t, appLanguage = 'en' }) {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { contractor, company, session, user } = useAuth()
  const contractorId = getPaymentsContractorId({ contractor, company, session })
  const invoicesContractorId = getInvoicesContractorId({ contractor, company, session })
  const [confirmAction, setConfirmAction] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [isSavingInvoice, setIsSavingInvoice] = useState(false)
  const [isEditingInvoice, setIsEditingInvoice] = useState(false)
  const invoiceSaveGuardRef = useRef(false)
  const editInvoiceButtonRef = useRef(null)
  const firstInvoiceEditFieldRef = useRef(null)
  const invoiceDocumentRef = useRef(null)
  const invoicePdfGuardRef = useRef(false)
  const invoicePrintGuardRef = useRef(false)
  const [isGeneratingInvoicePdf, setIsGeneratingInvoicePdf] = useState(false)
  const [isPreparingInvoicePrint, setIsPreparingInvoicePrint] = useState(false)
  const [isRunningInvoiceAction, setIsRunningInvoiceAction] = useState(false)
  const [activeInvoiceAction, setActiveInvoiceAction] = useState('')
  const invoiceActionGuardRef = useRef(false)
  const [routeInvoice, setRouteInvoice] = useState(null)
  const [routeInvoiceState, setRouteInvoiceState] = useState({ loading: false, error: '' })
  const invoice = invoices.find((item) => item.id === invoiceId && !deletedIds.includes(item.id))
  const resolvedInvoice = invoice || routeInvoice
  const lead = resolvedInvoice ? findRelatedLeadForInvoice(leads, resolvedInvoice) : null
  const clientRecord = useMemo(
    () => findRelatedClient(clients, lead || resolvedInvoice || {}),
    [clients, lead, resolvedInvoice]
  )
  const [draftInvoice, setDraftInvoice] = useState(resolvedInvoice || null)

  const syncedInvoice = useMemo(() => (
    resolvedInvoice ? { ...resolvedInvoice, ...draftInvoice, id: resolvedInvoice.id } : null
  ), [resolvedInvoice, draftInvoice])
  const invoiceOutputLanguage = useMemo(() => resolveClientFacingLanguage({
    documentLanguage: syncedInvoice?.invoiceLanguage,
    client: clientRecord,
    lead,
    appLanguage,
  }), [appLanguage, clientRecord, lead, syncedInvoice?.invoiceLanguage])
  const invoiceT = useMemo(() => createTranslator(invoiceOutputLanguage), [invoiceOutputLanguage])
  const localizedDueDate = useMemo(
    () => formatLocalizedInvoiceDate(syncedInvoice?.dueDate, invoiceOutputLanguage),
    [invoiceOutputLanguage, syncedInvoice?.dueDate]
  )

  useEffect(() => {
    setDraftInvoice(resolvedInvoice || null)
  }, [resolvedInvoice])

  useEffect(() => {
    setIsEditingInvoice(false)
  }, [invoiceId])

  useEffect(() => {
    if (!isEditingInvoice) return undefined

    const focusFrame = window.requestAnimationFrame(() => {
      firstInvoiceEditFieldRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(focusFrame)
  }, [isEditingInvoice])

  useEffect(() => {
    if (invoice) {
      setRouteInvoice(null)
      setRouteInvoiceState({ loading: false, error: '' })
      return undefined
    }

    if (!invoiceId || !invoicesLoaded || !invoicesContractorId) {
      return undefined
    }

    let isCancelled = false

    async function loadInvoiceById() {
      setRouteInvoiceState({ loading: true, error: '' })

      try {
        const response = await dataProvider.invoices.getById(invoiceId, { contractorId: invoicesContractorId })

        if (isCancelled) return

        if (response?.error) {
          setRouteInvoice(null)
          setRouteInvoiceState({ loading: false, error: response.error.message || t('invoiceLoadFailed') })
          return
        }

        setRouteInvoice(response?.data || null)
        setRouteInvoiceState({ loading: false, error: '' })
      } catch (error) {
        if (isCancelled) return

        setRouteInvoice(null)
        setRouteInvoiceState({ loading: false, error: error?.message || t('invoiceLoadFailed') })
      }
    }

    loadInvoiceById()

    return () => {
      isCancelled = true
    }
  }, [invoice, invoiceId, invoicesContractorId, invoicesLoaded, t])

  if (!resolvedInvoice && (!invoicesLoaded || routeInvoiceState.loading)) {
    return (
      <AymeroLoader
        variant="section"
        title={t('loading')}
        message={t('invoiceDetailHelp')}
        accessibleLabel={t('loading')}
        className="rounded-3xl border border-slate-200 bg-white shadow-sm"
      />
    )
  }

  if (!resolvedInvoice || !syncedInvoice) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">{routeInvoiceState.error ? t('invoiceDetail') : t('invoiceNotFound')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{routeInvoiceState.error || t('invoiceNotFoundHelp')}</p>
        <button onClick={() => navigate('/invoices')} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
          {t('backToInvoices')}
        </button>
      </section>
    )
  }

  const isArchived = isRecordArchived(syncedInvoice, archivedIds)
  const lineItems = syncedInvoice.lineItems || []
  const invoiceTotal = calculateInvoiceTotal(lineItems) || Number(syncedInvoice.amount || 0)
  const currentInvoice = { ...syncedInvoice, amount: invoiceTotal, remainingBalance: getInvoiceRemainingBalance({ ...syncedInvoice, amount: invoiceTotal }) }
  const balance = currentInvoice.remainingBalance
  const clientAddress = getAvailableContactValue(lead?.billingAddress, lead?.address, lead?.location, currentInvoice.clientAddress, clientRecord?.address)
  const clientEmail = getAvailableContactValue(lead?.email, currentInvoice.clientEmail, clientRecord?.email)
  const clientPhone = getAvailableContactValue(lead?.phone, currentInvoice.clientPhone, clientRecord?.phone)
  const paymentHistory = currentInvoice.paymentHistory || []
  const displayCompany = companySettings?.company || contractorCompany
  const isInvoiceActionPending = isSavingInvoice || isRunningInvoiceAction
  const presentationStatus = isArchived
    ? 'Archived'
    : normalizeInvoiceStatus(currentInvoice.status, {
        amount: invoiceTotal,
        amountPaid: Number(currentInvoice.amountPaid || 0),
        hasLinkedPayments: paymentHistory.length > 0,
      })
  const invoiceNumber = currentInvoice.number || currentInvoice.invoiceNumber || t('invoiceDetail')
  const invoiceTitle = currentInvoice.title || currentInvoice.projectTitle || ''
  const invoiceClient = getAvailableContactValue(currentInvoice.client, currentInvoice.clientName, lead?.client, clientRecord?.name, clientRecord?.displayName)
  const localizedIssueDate = formatLocalizedInvoiceDate(currentInvoice.issueDate, appLanguage)
  const localizedSummaryDueDate = formatLocalizedInvoiceDate(currentInvoice.dueDate, appLanguage) || t('notAvailable')
  const hasOutstandingBalance = balance > 0
  const isInvoiceOverdue = hasOutstandingBalance && String(presentationStatus || '').trim().toLowerCase() === 'overdue'
  const contractorContactFields = [
    { label: t('name'), value: displayCompany?.name },
    { label: t('phone'), value: displayCompany?.phone },
    { label: t('email'), value: displayCompany?.email },
    { label: t('address'), value: displayCompany?.address },
  ]
  const clientContactFields = [
    { label: t('name'), value: invoiceClient },
    { label: t('phone'), value: clientPhone },
    { label: t('email'), value: clientEmail },
    { label: t('address'), value: clientAddress },
  ]
  const invoicePreviewClient = {
    name: invoiceClient,
    phone: clientPhone,
    email: clientEmail,
    address: getAvailableContactValue(clientRecord?.address, currentInvoice.clientAddress, lead?.billingAddress, lead?.address, lead?.location),
  }
  const invoiceProjectId = String(currentInvoice.projectId || currentInvoice.project_id || '').trim()
  const invoicePreviewProject = invoiceProjectId
    ? leads.find((record) => [
        record?.id,
        record?.projectId,
        record?.project_id,
      ].some((value) => String(value || '').trim() === invoiceProjectId)) || {}
    : {}
  const timelinePayments = dedupeInvoiceTimelinePayments(paymentHistory)
  const { events: invoiceTimelineEvents, completionDate: paidCompletionDate } = buildInvoiceTimelineEvents({
    invoice: currentInvoice,
    payments: timelinePayments,
    total: invoiceTotal,
    balance,
    language: appLanguage,
    t,
  })
  const isPaidInFull = balance === 0
  const isPartiallyPaid = balance > 0 && (
    presentationStatus === 'Partially Paid'
    || Number(currentInvoice.amountPaid || 0) > 0
  )
  const canRecordInvoicePayment = balance > 0
    && !isArchived
    && presentationStatus !== 'Canceled'

  async function runSingleFlightInvoiceAction(actionKey, task) {
    if (invoiceActionGuardRef.current) {
      return false
    }

    invoiceActionGuardRef.current = true
    setIsRunningInvoiceAction(true)
    setActiveInvoiceAction(actionKey)

    try {
      const result = await task()
      return result ?? true
    } finally {
      invoiceActionGuardRef.current = false
      setIsRunningInvoiceAction(false)
      setActiveInvoiceAction('')
    }
  }

  function updateDraft(field, value) {
    setDraftInvoice((current) => ({ ...current, [field]: value }))
  }

  function updateLineItem(index, field, value) {
    setDraftInvoice((current) => ({
      ...current,
      lineItems: (current.lineItems || []).map((item, itemIndex) => itemIndex === index ? { ...item, [field]: field === 'amount' ? Number(value || 0) : value } : item),
    }))
  }

  function addLineItem() {
    setDraftInvoice((current) => ({ ...current, lineItems: [...(current.lineItems || []), { description: '', amount: 0 }] }))
  }

  function beginInvoiceEdit() {
    setDraftInvoice(resolvedInvoice || null)
    setIsEditingInvoice(true)
  }

  function cancelInvoiceEdit() {
    setDraftInvoice(resolvedInvoice || null)
    setIsEditingInvoice(false)
    window.requestAnimationFrame(() => editInvoiceButtonRef.current?.focus())
  }

  async function saveInvoice() {
    if (invoiceSaveGuardRef.current) {
      return false
    }

    const shouldRestoreEditFocus = isEditingInvoice
    invoiceSaveGuardRef.current = true
    setIsSavingInvoice(true)

    try {
      const payload = {
        ...currentInvoice,
        customerNotes: resolveInvoiceCustomerNote(currentInvoice),
      }

      if (!currentInvoice?.id) {
        delete payload.notes
      }
      let response = null

      if (currentInvoice && currentInvoice.id) {
        response = await dataProvider.invoices.update(currentInvoice.id, payload, { contractorId: invoicesContractorId })
      } else {
        response = await dataProvider.invoices.create({ ...payload, leadId: lead?.id }, {
          contractorId: invoicesContractorId,
          authenticatedUserId: user?.id || session?.user?.id || '',
          companyId: company?.id || company?.contractorId || '',
        })
      }

      if (response?.error) {
        throw new Error(response.error.message || t('invoiceSaveFailed'))
      }

      const persistedInvoice = response?.data || currentInvoice

      if (!persistedInvoice?.id) {
        throw new Error(t('invoiceSaveFailed'))
      }

      onUpdateInvoice?.(persistedInvoice.id || currentInvoice.id, persistedInvoice)

      if (!currentInvoice?.id && persistedInvoice?.id) {
        navigate(`/invoices/${persistedInvoice.id}`, { replace: true })
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Invoice save failed.', err)
      }
      showToast(err?.message || t('invoiceSaveFailed'), 'error')
      return false
    } finally {
      invoiceSaveGuardRef.current = false
      setIsSavingInvoice(false)
    }
    setSuccessMessage(t('invoiceSaved'))
    window.setTimeout(() => setSuccessMessage(''), 2500)
    setIsEditingInvoice(false)
    if (shouldRestoreEditFocus) {
      window.requestAnimationFrame(() => editInvoiceButtonRef.current?.focus())
    }
    return true
  }

  async function savePayment(payment) {
    const paymentEntry = { id: `payment-${Date.now()}`, ...payment }

    try {
      const paymentResponse = await dataProvider.payments.create({ ...paymentEntry, clientId: lead?.clientId || null, invoiceId: currentInvoice.id, leadId: lead?.id, projectId: currentInvoice.projectId }, { contractorId })
      if (paymentResponse?.error) {
        throw new Error(paymentResponse.error.message || t('paymentSaveFailed'))
      }

      const nextPaymentHistory = [paymentEntry, ...(currentInvoice.paymentHistory || [])]
      const nextAmountPaid = Math.min(Number(currentInvoice.amount || 0), Number(currentInvoice.amountPaid || 0) + Number(payment.amount || 0))
      const invoiceResponse = await dataProvider.invoices.update(currentInvoice.id, { amountPaid: nextAmountPaid, paymentHistory: nextPaymentHistory }, { contractorId: invoicesContractorId })

      if (invoiceResponse?.error) {
        throw new Error(invoiceResponse.error.message || t('invoiceSaveFailed'))
      }

      if (invoiceResponse?.data?.id) {
        onUpdateInvoice?.(invoiceResponse.data.id, invoiceResponse.data)
      }

      onRecordInvoicePayment?.(currentInvoice.id, paymentResponse?.data || paymentEntry)
    } catch (err) {
      console.warn('Record payment failed', err)
      showToast(err?.message || t('paymentSaveFailed'), 'error')
      return
    }
    setShowPaymentModal(false)
    setSuccessMessage(t('paymentRecorded'))
    window.setTimeout(() => setSuccessMessage(''), 2500)
  }

  async function confirmMarkPaid() {
    if (balance > 0) {
      setConfirmAction({ mode: 'markPaid' })
      return
    }
    await runSingleFlightInvoiceAction('markPaid', async () => {
      const paymentEntry = {
        id: `payment-${Date.now()}`,
        amount: Number(currentInvoice.amount || 0) - Number(currentInvoice.amountPaid || 0),
        date: new Date().toISOString().slice(0, 10),
        method: 'Other',
        type: 'Final Payment',
        notes: 'Marked as paid.',
      }
      try {
        const paymentResponse = await dataProvider.payments.create({ ...paymentEntry, clientId: lead?.clientId || null, invoiceId: currentInvoice.id, leadId: lead?.id, projectId: currentInvoice.projectId }, { contractorId })
        if (paymentResponse?.error) {
          throw new Error(paymentResponse.error.message || t('paymentSaveFailed'))
        }

        const nextPaymentHistory = [paymentEntry, ...(currentInvoice.paymentHistory || [])]
        const invoiceResponse = await dataProvider.invoices.update(currentInvoice.id, { amountPaid: Number(currentInvoice.amount || 0), paymentHistory: nextPaymentHistory, status: 'Paid' }, { contractorId: invoicesContractorId })

        if (invoiceResponse?.error) {
          throw new Error(invoiceResponse.error.message || t('invoiceSaveFailed'))
        }

        if (invoiceResponse?.data?.id) {
          onUpdateInvoice?.(invoiceResponse.data.id, invoiceResponse.data)
        }

        onMarkInvoicePaid?.(currentInvoice.id, paymentResponse?.data || paymentEntry)
        setSuccessMessage(t('invoiceMarkedPaid'))
        window.setTimeout(() => setSuccessMessage(''), 2500)
      } catch (err) {
        console.warn('Mark paid failed', err)
        showToast(err?.message || t('invoiceSaveFailed'), 'error')
      }
    })
  }

  async function runConfirmAction() {
    const actionMode = confirmAction?.mode || ''

    await runSingleFlightInvoiceAction(actionMode || 'confirm', async () => {
      try {
        if (actionMode === 'archive') {
          const response = await dataProvider.invoices.archive(currentInvoice.id, { contractorId: invoicesContractorId })
          if (response?.error) {
            throw new Error(response.error.message || t('archiveFailed'))
          }
          onArchiveInvoice?.(currentInvoice.id)
        }
        if (actionMode === 'delete') {
          const response = await dataProvider.invoices.deletePermanently(currentInvoice.id, { contractorId: invoicesContractorId })
          if (response?.error) {
            throw new Error(response.error.message || t('deleteFailed'))
          }
          onDeleteInvoice?.(currentInvoice.id)
          navigate('/invoices')
        }
        if (actionMode === 'markPaid') {
          const paymentEntry = { id: `payment-${Date.now()}`, amount: Math.max(Number(currentInvoice.amount || 0) - Number(currentInvoice.amountPaid || 0), 0), date: new Date().toISOString().slice(0, 10), method: 'Other', type: 'Final Payment', notes: 'Marked as paid.' }
          const paymentResponse = await dataProvider.payments.create({ ...paymentEntry, clientId: lead?.clientId || null, invoiceId: currentInvoice.id, leadId: lead?.id, projectId: currentInvoice.projectId }, { contractorId })
          if (paymentResponse?.error) {
            throw new Error(paymentResponse.error.message || t('paymentSaveFailed'))
          }

          const nextPaymentHistory = [paymentEntry, ...(currentInvoice.paymentHistory || [])]
          const invoiceResponse = await dataProvider.invoices.update(currentInvoice.id, { amountPaid: Number(currentInvoice.amount || 0), paymentHistory: nextPaymentHistory, status: 'Paid' }, { contractorId: invoicesContractorId })
          if (invoiceResponse?.error) {
            throw new Error(invoiceResponse.error.message || t('invoiceSaveFailed'))
          }

          if (invoiceResponse?.data?.id) {
            onUpdateInvoice?.(invoiceResponse.data.id, invoiceResponse.data)
          }

          onMarkInvoicePaid?.(currentInvoice.id, paymentResponse?.data || paymentEntry)
          setSuccessMessage(t('invoiceMarkedPaid'))
          window.setTimeout(() => setSuccessMessage(''), 2500)
        }
      } catch (err) {
        console.warn('Confirm invoice action failed', err)
        showToast(err?.message || t(actionMode === 'delete' ? 'deleteFailed' : actionMode === 'archive' ? 'archiveFailed' : 'invoiceSaveFailed'), 'error')
      } finally {
        setConfirmAction(null)
      }
    })
  }

  async function restoreInvoice() {
    await runSingleFlightInvoiceAction('restore', async () => {
      try {
        const response = await dataProvider.invoices.restore(currentInvoice.id, { contractorId: invoicesContractorId })
        if (response?.error) {
          throw new Error(response.error.message || t('restoreFailed'))
        }
        onRestoreInvoice?.(currentInvoice.id)
      } catch (error) {
        console.warn('Restore invoice failed', error)
        showToast(error?.message || t('restoreFailed'), 'error')
      }
    })
  }

  async function downloadInvoiceDocument() {
    if (invoicePdfGuardRef.current) return

    invoicePdfGuardRef.current = true
    setIsGeneratingInvoicePdf(true)

    try {
      const { downloadInvoicePdf } = await import('../utils/invoicePdf')
      await downloadInvoicePdf({
        element: invoiceDocumentRef.current,
        invoiceNumber,
        clientName: invoiceClient,
      })
      showToast(t('invoicePdfDownloaded'))
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Invoice PDF generation failed.', error)
      }
      showToast(t('invoicePdfGenerationError'), 'error')
    } finally {
      invoicePdfGuardRef.current = false
      setIsGeneratingInvoicePdf(false)
    }
  }

  async function printInvoiceDocument() {
    if (invoicePrintGuardRef.current) return

    invoicePrintGuardRef.current = true
    setIsPreparingInvoicePrint(true)

    try {
      await printDocumentElement(invoiceDocumentRef.current, {
        documentTitle: `${invoiceNumber} - ${invoiceClient || t('invoice')}`.trim(),
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Invoice print preparation failed.', error)
      }
      showToast(t('invoicePrintPreparationError'), 'error')
    } finally {
      invoicePrintGuardRef.current = false
      setIsPreparingInvoicePrint(false)
    }
  }

  const actionDefinitions = {
    save: {
      id: 'save-invoice',
      label: isSavingInvoice ? t('saving') : t('saveInvoice'),
      icon: Save,
      disabled: isInvoiceActionPending,
      onClick: saveInvoice,
    },
    send: {
      id: 'send-invoice',
      label: activeInvoiceAction === 'send' ? t('saving') : t('sendToCustomer'),
      icon: Send,
      disabled: isInvoiceActionPending,
      onClick: () => setShowSendModal(true),
    },
    preview: {
      id: 'preview-invoice',
      label: t('previewPdf'),
      icon: Eye,
      disabled: false,
      onClick: () => setShowPreview(true),
    },
    recordPayment: {
      id: 'record-invoice-payment',
      label: t('recordPayment'),
      icon: CreditCard,
      disabled: isInvoiceActionPending,
      onClick: () => setShowPaymentModal(true),
    },
    markPaid: {
      id: 'mark-invoice-paid',
      label: activeInvoiceAction === 'markPaid' ? t('saving') : t('markAsPaid'),
      icon: CheckCircle2,
      disabled: isInvoiceActionPending,
      onClick: confirmMarkPaid,
    },
    archive: {
      id: 'archive-invoice',
      label: t('archive'),
      icon: Archive,
      disabled: isInvoiceActionPending,
      onClick: () => setConfirmAction({ mode: 'archive' }),
      className: archiveMenuItemClasses,
    },
    restore: {
      id: 'restore-invoice',
      label: t('restore'),
      icon: RotateCcw,
      disabled: isInvoiceActionPending,
      onClick: restoreInvoice,
    },
    delete: {
      id: 'delete-invoice',
      label: t('deletePermanently'),
      icon: Trash2,
      disabled: isInvoiceActionPending,
      onClick: () => setConfirmAction({ mode: 'delete' }),
      className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
    },
  }
  const actionHierarchy = getInvoiceActionHierarchy(presentationStatus, isArchived)
  const primaryAction = actionDefinitions[actionHierarchy.primary]
  const PrimaryActionIcon = primaryAction.icon
  const secondaryActions = actionHierarchy.secondary.map((actionId) => actionDefinitions[actionId]).filter(Boolean)
  const moreMenuItems = actionHierarchy.overflow.map((actionId) => {
    const action = actionDefinitions[actionId]
    const ActionIcon = action.icon

    return {
      ...action,
      icon: <ActionIcon className="mr-2 h-4 w-4" aria-hidden="true" />,
    }
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <nav aria-label={t('invoices')} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <RecordBackButton label={t('invoices')} onClick={() => navigate(appRoutes.invoices)} />
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
          <span className="min-w-0 truncate text-slate-950" aria-current="page">{invoiceNumber}</span>
        </nav>
        <ActionMenu
          label={t('more')}
          ariaLabel={t('more')}
          showChevron
          containerClassName="shrink-0"
          buttonClassName="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          menuClassName="max-w-[calc(100vw-2.5rem)]"
          items={moreMenuItems}
          buttonDisabled={isInvoiceActionPending}
        />
      </div>

      {successMessage && <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{successMessage}</div>}

      <section className="relative rounded-3xl bg-[linear-gradient(135deg,#020617_0%,#0f172a_58%,#172554_100%)] p-5 text-white shadow-xl shadow-slate-950/15 sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-300/5 blur-3xl" />
        </div>

        <div className="relative grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:items-end lg:gap-10">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200 sm:text-sm">{t('invoicePreview')}</p>
            <h1 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{invoiceNumber}</h1>
            {invoiceTitle ? <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{invoiceTitle}</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <InvoiceHeroStatusBadge status={presentationStatus} t={t} />
              {localizedIssueDate ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-100 sm:text-sm">
                  <CalendarDays className="h-4 w-4 text-blue-200" aria-hidden="true" />
                  <span>{t('issueDate')}: {localizedIssueDate}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm sm:p-5">
            <div className={`grid gap-4 ${invoiceClient ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
              {invoiceClient ? (
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{t('client')}</p>
                  <p className="mt-2 break-words text-sm font-bold text-white sm:truncate sm:text-base">{invoiceClient}</p>
                </div>
              ) : null}
              <div className={invoiceClient ? 'border-t border-white/10 pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0' : ''}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{t('totalAmount')}</p>
                <p className="mt-2 break-words text-xl font-bold tracking-tight text-white sm:text-2xl">{currency.format(invoiceTotal)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-7 flex flex-col gap-2 border-t border-white/10 pt-5 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <PrimaryActionIcon className="h-4 w-4" aria-hidden="true" />
            {primaryAction.label}
          </button>

          {secondaryActions.map((action) => {
            const SecondaryActionIcon = action.icon

            return (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled}
                onClick={action.onClick}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <SecondaryActionIcon className="h-4 w-4" aria-hidden="true" />
                {action.label}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-label={t('paymentSummary')} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <InvoiceSummaryMetric
            icon={FileText}
            label={t('invoiceTotal')}
            value={currency.format(invoiceTotal)}
          />
          <InvoiceSummaryMetric
            icon={DollarSign}
            label={t('paymentsReceived')}
            value={currency.format(currentInvoice.amountPaid)}
            className="border-l border-slate-200"
          />
          <InvoiceSummaryMetric
            icon={hasOutstandingBalance ? Wallet : CheckCircle2}
            label={t('remainingBalance')}
            value={currency.format(balance)}
            supportingText={hasOutstandingBalance ? '' : t('paidInFull')}
            tone={hasOutstandingBalance ? 'default' : 'success'}
            className="border-t border-slate-200 lg:border-l lg:border-t-0"
          />
          <InvoiceSummaryMetric
            icon={CalendarDays}
            label={t('dueDate')}
            value={localizedSummaryDueDate}
            supportingText={isInvoiceOverdue ? t('overdue') : ''}
            tone={isInvoiceOverdue ? 'danger' : 'default'}
            compactValue
            className="border-l border-t border-slate-200 lg:border-t-0"
          />
        </div>
      </section>

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-busy={isSavingInvoice}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">{t('invoiceDetails')}</h2>
              </div>
              {isEditingInvoice ? (
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={isSavingInvoice}
                    onClick={cancelInvoiceEdit}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={isInvoiceActionPending}
                    onClick={saveInvoice}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {isSavingInvoice ? t('saving') : t('save')}
                  </button>
                </div>
              ) : (
                <button
                  ref={editInvoiceButtonRef}
                  type="button"
                  disabled={isInvoiceActionPending}
                  onClick={beginInvoiceEdit}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  {t('editInvoice')}
                </button>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InvoiceMetadataItem label={t('invoiceNumber')} value={invoiceNumber} />
              <InvoiceMetadataItem label={t('issueDate')} value={localizedIssueDate || t('notAvailable')} />
              {isEditingInvoice ? (
                <label htmlFor="invoice-edit-due-date" className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm font-bold text-slate-700">
                  {t('dueDate')}
                  <input
                    ref={firstInvoiceEditFieldRef}
                    id="invoice-edit-due-date"
                    value={currentInvoice.dueDate || ''}
                    onChange={(event) => updateDraft('dueDate', event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              ) : (
                <InvoiceMetadataItem label={t('dueDate')} value={localizedSummaryDueDate} />
              )}
              {isEditingInvoice ? (
                <label htmlFor="invoice-edit-status" className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm font-bold text-slate-700">
                  {t('status')}
                  <select
                    id="invoice-edit-status"
                    value={currentInvoice.status}
                    onChange={(event) => updateDraft('status', event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="Draft">{t('draft')}</option>
                    <option value="Sent">{t('sent')}</option>
                    <option value="Partially Paid">{t('partiallyPaid')}</option>
                    <option value="Paid">{t('paid')}</option>
                    <option value="Overdue">{t('overdue')}</option>
                    <option value="Canceled">{t('canceled')}</option>
                  </select>
                </label>
              ) : (
                <InvoiceMetadataItem label={t('status')}>
                  <StatusBadge status={presentationStatus} t={t} />
                </InvoiceMetadataItem>
              )}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <InvoiceContactPanel
                  icon={Building2}
                  eyebrow={t('from')}
                  title={t('contractorCompany')}
                  fields={contractorContactFields}
                />
                <InvoiceContactPanel
                  icon={UserRound}
                  eyebrow={t('billTo')}
                  title={t('client')}
                  fields={clientContactFields}
                />
              </div>
            </div>

            {isEditingInvoice ? (
              <div className="mt-6 border-t border-slate-200 pt-6">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="hidden grid-cols-[1fr_140px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid">
                    <span>{t('description')}</span>
                    <span className="text-right">{t('amount')}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {lineItems.map((item, index) => (
                      <div key={item.id || `invoice-line-${index}`} className="grid gap-2 px-4 py-4 text-sm sm:grid-cols-[1fr_140px]">
                        <input
                          value={item.description}
                          onChange={(event) => updateLineItem(index, 'description', event.target.value)}
                          aria-label={`${t('description')} ${index + 1}`}
                          className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        />
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(event) => updateLineItem(index, 'amount', event.target.value)}
                          aria-label={`${t('amount')} ${index + 1}`}
                          className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:text-right"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={addLineItem} className="mt-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{t('addItem')}</button>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {isKnownPaymentTermValue(currentInvoice.paymentTerms) ? (
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <label htmlFor="invoice-edit-payment-terms" className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('paymentTerms')}</label>
                      <select id="invoice-edit-payment-terms" value={currentInvoice.paymentTerms} onChange={(event) => updateDraft('paymentTerms', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                        {getPaymentTermOptions(invoiceT, currentInvoice.paymentTerms).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  ) : <EditableInfoBlock id="invoice-edit-payment-terms" title={t('paymentTerms')} value={currentInvoice.paymentTerms} onChange={(value) => updateDraft('paymentTerms', value)} />}
                  <EditableInfoBlock
                    id="invoice-edit-customer-note"
                    title={t('customerNote')}
                    helperText={t('customerNoteHelp')}
                    value={resolveInvoiceCustomerNote(currentInvoice)}
                    onChange={(value) => updateDraft('customerNotes', value)}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between sm:px-6">
              <h2 className="text-lg font-bold text-slate-950">{t('invoicePreview')}</h2>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap" aria-busy={isGeneratingInvoicePdf || isPreparingInvoicePrint}>
                <button
                  type="button"
                  disabled={isGeneratingInvoicePdf || isPreparingInvoicePrint}
                  onClick={() => setShowPreview(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  {t('previewFullScreen')}
                </button>
                <button
                  type="button"
                  disabled={isGeneratingInvoicePdf || isPreparingInvoicePrint}
                  onClick={printInvoiceDocument}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPreparingInvoicePrint ? <AymeroLoader variant="inline" accessibleLabel={t('preparingPrint')} /> : <Printer className="h-4 w-4" aria-hidden="true" />}
                  <span>
                    {isPreparingInvoicePrint ? t('preparingPrint') : t('printInvoice')}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isGeneratingInvoicePdf || isPreparingInvoicePrint}
                  onClick={downloadInvoiceDocument}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
                >
                  {isGeneratingInvoicePdf ? <AymeroLoader variant="inline" accessibleLabel={t('generatingPdf')} tone="dark" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                  <span>
                    {isGeneratingInvoicePdf ? t('generatingPdf') : t('downloadPdf')}
                  </span>
                </button>
              </div>
            </div>
            <div className="min-w-0 overflow-hidden bg-slate-100 p-2 sm:p-3">
              <InvoiceDocumentPreview
                documentRef={invoiceDocumentRef}
                invoice={currentInvoice}
                company={displayCompany}
                client={invoicePreviewClient}
                project={invoicePreviewProject}
                t={invoiceT}
                uiT={t}
                language={invoiceOutputLanguage}
              />
            </div>
          </section>
        </div>

        <aside className="min-w-0">
          <PaymentsTimelineCard
            amountPaid={Number(currentInvoice.amountPaid || 0)}
            balance={balance}
            canRecordPayment={canRecordInvoicePayment}
            completionDate={paidCompletionDate}
            events={invoiceTimelineEvents}
            isActionPending={isInvoiceActionPending}
            isOverdue={isInvoiceOverdue}
            isPaidInFull={isPaidInFull}
            isPartiallyPaid={isPartiallyPaid}
            onRecordPayment={() => setShowPaymentModal(true)}
            payments={timelinePayments}
            t={t}
          />
        </aside>
      </section>

      <ConfirmRecordModal isOpen={Boolean(confirmAction)} mode={confirmAction?.mode === 'delete' ? 'delete' : 'archive'} title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : confirmAction?.mode === 'markPaid' ? t('confirmMarkAsPaid') : t('confirmArchive')} message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : confirmAction?.mode === 'markPaid' ? t('markAsPaidHelp') : t('archiveHelp')} confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : confirmAction?.mode === 'markPaid' ? t('markAsPaid') : t('archive')} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmAction} t={t} />
      <InvoicePreviewModal isOpen={showPreview} invoice={currentInvoice} client={invoicePreviewClient} company={displayCompany} project={invoicePreviewProject} onClose={() => setShowPreview(false)} t={t} contentT={invoiceT} language={invoiceOutputLanguage} />
      <RecordPaymentModal isOpen={showPaymentModal} remainingBalance={balance} onClose={() => setShowPaymentModal(false)} onSave={savePayment} t={t} />
      <SendToCustomerModal
        isOpen={showSendModal}
        documentType="invoice"
        customer={{ name: currentInvoice.client, phone: lead?.phone, email: lead?.email }}
        projectTitle={currentInvoice.projectTitle}
        amountLabel={t('amountDue')}
        amountValue={currency.format(balance)}
        dueDate={localizedDueDate}
        onClose={() => setShowSendModal(false)}
        onSent={async () => {
          return runSingleFlightInvoiceAction('send', async () => {
            try {
              const response = await dataProvider.invoices.update(currentInvoice.id, { status: 'Sent' }, { contractorId: invoicesContractorId })
              if (response?.error) {
                throw new Error(response.error.message || t('invoiceSaveFailed'))
              }
              if (response?.data?.id) {
                onUpdateInvoice?.(response.data.id, response.data)
              }
              onInvoiceSent?.(currentInvoice.id)
            } catch (err) {
              console.warn('Mark invoice sent failed', err)
              showToast(err?.message || t('invoiceSaveFailed'), 'error')
              return false
            }
            return true
          })
        }}
        t={t}
        contentT={invoiceT}
      />
    </div>
  )
}

function InvoiceHeroStatusBadge({ status, t }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold sm:text-sm ${getInvoiceStatusClasses(status)}`}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {translateInvoiceStatus(status, t)}
    </span>
  )
}

function InvoiceSummaryMetric({ icon: Icon, label, value, supportingText = '', tone = 'default', compactValue = false, className = '' }) {
  const isSuccess = tone === 'success'
  const isDanger = tone === 'danger'
  const iconClasses = isSuccess
    ? 'bg-emerald-50 text-emerald-700'
    : isDanger
      ? 'bg-rose-50 text-rose-700'
      : 'bg-slate-100 text-slate-600'
  const valueClasses = isSuccess
    ? 'text-emerald-700'
    : isDanger
      ? 'text-rose-700'
      : 'text-slate-950'
  const supportingClasses = isSuccess
    ? 'text-emerald-700'
    : isDanger
      ? 'text-rose-700'
      : 'text-slate-500'

  return (
    <div className={`min-w-0 p-3 sm:p-5 lg:p-6 ${className}`.trim()}>
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${iconClasses}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold leading-5 text-slate-500 sm:text-sm">{label}</p>
          <p className={`mt-1 break-words font-bold tracking-tight ${compactValue ? 'text-base sm:text-lg lg:text-xl' : 'text-lg sm:text-xl lg:text-2xl'} ${valueClasses}`}>
            {value}
          </p>
          {supportingText ? <p className={`mt-1 text-xs font-bold ${supportingClasses}`}>{supportingText}</p> : null}
        </div>
      </div>
    </div>
  )
}

function InvoiceMetadataItem({ label, value, children }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="mt-2 break-words text-sm font-bold text-slate-950 [overflow-wrap:anywhere]">
        {children || value}
      </div>
    </div>
  )
}

function InvoiceContactPanel({ icon: Icon, eyebrow, title, fields = [] }) {
  const availableFields = fields.filter(({ value }) => String(value ?? '').trim())

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm ring-1 ring-slate-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">{eyebrow}</p>
          <h3 className="mt-0.5 text-sm font-bold text-slate-950">{title}</h3>
        </div>
      </div>
      {availableFields.length ? (
        <dl className="mt-4 space-y-3">
          {availableFields.map(({ label, value }) => (
            <div key={label} className="grid min-w-0 gap-0.5 sm:grid-cols-[80px_minmax(0,1fr)] sm:gap-3">
              <dt className="text-xs font-semibold text-slate-500">{label}</dt>
              <dd className="min-w-0 whitespace-pre-line break-words text-sm font-semibold text-slate-800 [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}

function EditableInfoBlock({ id, title, helperText = '', value, onChange }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</label>
      {helperText ? <p id={`${id}-help`} className="mt-1 text-xs font-medium normal-case leading-5 tracking-normal text-slate-500">{helperText}</p> : null}
      <textarea id={id} value={value || ''} onChange={(event) => onChange(event.target.value)} rows={4} aria-describedby={helperText ? `${id}-help` : undefined} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
    </div>
  )
}

function InvoiceTimelineEvent({ event, isLast }) {
  const eventPresentation = {
    created: {
      icon: FileText,
      iconClasses: 'bg-slate-100 text-slate-600 ring-slate-200',
    },
    sent: {
      icon: Send,
      iconClasses: 'bg-blue-50 text-blue-700 ring-blue-100',
    },
    payment: {
      icon: DollarSign,
      iconClasses: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    },
    paid: {
      icon: CheckCircle2,
      iconClasses: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    },
  }
  const presentation = eventPresentation[event.type] || eventPresentation.created
  const EventIcon = presentation.icon

  return (
    <li className="relative flex min-w-0 gap-3 pb-5 last:pb-0">
      {!isLast ? <span className="absolute bottom-0 left-[17px] top-9 w-px bg-slate-200" aria-hidden="true" /> : null}
      <span className={`relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${presentation.iconClasses}`}>
        <EventIcon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3 lg:flex-col lg:gap-1 xl:flex-row">
          <div className="min-w-0">
            <p className="break-words text-sm font-bold text-slate-900">{event.label}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{event.date}</p>
          </div>
          {event.amount ? <p className="shrink-0 text-base font-bold text-slate-950">{event.amount}</p> : null}
        </div>
        {event.metadata?.length ? (
          <p className="mt-2 break-words text-xs font-semibold text-slate-600">{event.metadata.join(' · ')}</p>
        ) : null}
        {event.note ? (
          <p className="mt-1 break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">{event.note}</p>
        ) : null}
      </div>
    </li>
  )
}

function PaymentsTimelineCard({
  amountPaid,
  balance,
  canRecordPayment,
  completionDate,
  events,
  isActionPending,
  isOverdue,
  isPaidInFull,
  isPartiallyPaid,
  onRecordPayment,
  payments,
  t,
}) {
  const summary = isPaidInFull
    ? {
        icon: CheckCircle2,
        label: t('paidInFull'),
        valueLabel: t('paymentsReceived'),
        value: currency.format(amountPaid),
        supportingText: completionDate ? `${t('date')}: ${completionDate}` : '',
        classes: 'border-emerald-200 bg-emerald-50/80',
        iconClasses: 'bg-white text-emerald-700 ring-emerald-200',
        labelClasses: 'text-emerald-800',
        valueClasses: 'text-emerald-700',
      }
    : isOverdue
      ? {
          icon: CalendarDays,
          label: t('overdue'),
          valueLabel: t('remainingBalance'),
          value: currency.format(balance),
          supportingText: `${t('paymentsReceived')}: ${currency.format(amountPaid)}`,
          classes: 'border-rose-200 bg-rose-50/80',
          iconClasses: 'bg-white text-rose-700 ring-rose-200',
          labelClasses: 'text-rose-800',
          valueClasses: 'text-rose-700',
        }
      : isPartiallyPaid
        ? {
            icon: Wallet,
            label: t('partiallyPaid'),
            valueLabel: t('remainingBalance'),
            value: currency.format(balance),
            supportingText: `${t('paymentsReceived')}: ${currency.format(amountPaid)}`,
            classes: 'border-blue-200 bg-blue-50/80',
            iconClasses: 'bg-white text-blue-700 ring-blue-200',
            labelClasses: 'text-blue-800',
            valueClasses: 'text-blue-950',
          }
        : {
            icon: Wallet,
            label: t('unpaid'),
            valueLabel: t('remainingBalance'),
            value: currency.format(balance),
            supportingText: '',
            classes: 'border-slate-200 bg-slate-50',
            iconClasses: 'bg-white text-slate-700 ring-slate-200',
            labelClasses: 'text-slate-700',
            valueClasses: 'text-slate-950',
          }
  const SummaryIcon = summary.icon

  return (
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold text-slate-950">{t('paymentsTimeline')}</h2>

      <div className={`mt-5 rounded-2xl border p-4 ${summary.classes}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${summary.iconClasses}`}>
            <SummaryIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-bold ${summary.labelClasses}`}>{summary.label}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{summary.valueLabel}</p>
            <p className={`mt-1 break-words text-2xl font-bold tracking-tight ${summary.valueClasses}`}>{summary.value}</p>
            {summary.supportingText ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{summary.supportingText}</p> : null}
          </div>
        </div>

        {canRecordPayment ? (
          <button
            type="button"
            disabled={isActionPending}
            onClick={onRecordPayment}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            {t('recordPayment')}
          </button>
        ) : null}
      </div>

      {!payments.length ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center">
          <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-bold text-slate-900">{t('noPayments')}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{t('recordedPaymentsWillAppear')}</p>
        </div>
      ) : null}

      {events.length ? (
        <ol className="mt-6 border-t border-slate-200 pt-6">
          {events.map((event, index) => (
            <InvoiceTimelineEvent
              key={event.id}
              event={event}
              isLast={index === events.length - 1}
            />
          ))}
        </ol>
      ) : null}
    </section>
  )
}

function InvoicePreviewModal({ isOpen, invoice, client, company, project, onClose, t, contentT, language = 'en' }) {
  if (!isOpen) return null

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={onClose} panelClassName="p-3 sm:max-w-[64rem] sm:p-4">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-wide text-blue-600">{t('invoicePreview')}</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{invoice.number}</h2></div>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{t('close')}</button>
      </div>
      <div className="min-w-0 overflow-hidden rounded-2xl bg-slate-100 p-1 sm:p-2">
        <InvoiceDocumentPreview
          invoice={invoice}
          company={company}
          client={client}
          project={project}
          t={contentT}
          uiT={t}
          language={language}
        />
      </div>
    </ModalShell>
  )
}

function RecordPaymentModal({ isOpen, remainingBalance, onClose, onSave, t }) {
  const [payment, setPayment] = useState({ amount: remainingBalance || 0, date: new Date().toISOString().slice(0, 10), method: 'Cash', type: 'Progress Payment', notes: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitGuardRef = useRef(false)
  useEffect(() => {
    if (!isOpen) return
    setPayment({ amount: remainingBalance || 0, date: new Date().toISOString().slice(0, 10), method: 'Cash', type: 'Progress Payment', notes: '' })
    setIsSubmitting(false)
    submitGuardRef.current = false
  }, [isOpen, remainingBalance])
  if (!isOpen) return null
  return (
    <ModalShell isOpen={isOpen} onBackdropClick={isSubmitting ? undefined : onClose} panelClassName="sm:max-w-lg">
      <h2 className="text-xl font-bold text-slate-950">{t('recordPayment')}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">{t('amount')}<input type="number" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500" /></label>
        <label className="text-sm font-bold text-slate-700">{t('paymentDate')}<input type="date" value={payment.date} onChange={(event) => setPayment({ ...payment, date: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500" /></label>
        <label className="text-sm font-bold text-slate-700">{t('paymentMethod')}<select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500">{paymentMethods.map((method) => <option key={method} value={method}>{t(method)}</option>)}</select></label>
        <label className="text-sm font-bold text-slate-700">{t('paymentType')}<select value={payment.type} onChange={(event) => setPayment({ ...payment, type: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500">{paymentTypes.map((type) => <option key={type} value={type}>{t(type)}</option>)}</select></label>
      </div>
      <label className="mt-4 block text-sm font-bold text-slate-700">{t('notes')}<textarea value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500" /></label>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button disabled={isSubmitting} onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('cancel')}</button><button disabled={isSubmitting} onClick={async () => {
        if (submitGuardRef.current) {
          return
        }

        submitGuardRef.current = true
        setIsSubmitting(true)

        try {
          await onSave?.(payment)
        } finally {
          submitGuardRef.current = false
          setIsSubmitting(false)
        }
      }} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400">{isSubmitting ? t('saving') : t('savePayment')}</button></div>
    </ModalShell>
  )
}

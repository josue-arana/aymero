import { useMemo, useRef, useState } from 'react'
import { Archive, CheckCircle2, Clock, DollarSign, FileText, MoreVertical, Plus, Send, Trash2, Undo2, XCircle } from 'lucide-react'
import { MetricCard } from '../components/ui/MetricCard'
import { SelectField } from '../components/ui/SelectField'
import { StatusBadge } from '../components/ui/StatusBadge'
import { FilterChip } from '../components/ui/FilterChip'
import { currency } from '../utils/formatters'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { createTranslator, tStatus } from '../translations'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { SendToCustomerModal } from '../components/common/SendToCustomerModal'
import ActionMenu from '../components/common/ActionMenu'
import { useToast } from '../components/common/ToastProvider'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import { useAuth } from '../contexts/AuthContext'
import dataProvider from '../services/dataProvider'
import { getInvoicesContractorId } from '../services/system/invoicesRuntimeService'
import { calculateOutstandingInvoiceBalance, findRelatedLeadForInvoice, getInvoiceRemainingBalance } from '../utils/invoiceRecords'
import invoicesHeroBackground from '../assets/page-heroes/invoices-bg.png'
import { buildHeroBackgroundStyle } from '../utils/heroBackground'
import { findRelatedClient } from '../utils/clients'
import { getLanguageLocale, resolveClientFacingLanguage } from '../utils/language'
import { isRecordArchived } from '../utils/archiveLifecycle'

const invoiceFilters = ['All', 'Archived', 'Draft', 'Sent', 'Paid', 'Overdue', 'Canceled']

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

export function InvoicesPage({ leads, clients = [], invoices: invoiceRecords = [], archivedIds = [], deletedIds = [], onCreateInvoice, onViewInvoice, onRecordPayment, onArchiveInvoice, onRestoreInvoice, onDeleteInvoice, onInvoiceSent, t, appLanguage = 'en' }) {
  const [selectedFilter, setSelectedFilter] = useState('All')
  const [confirmAction, setConfirmAction] = useState(null)
  const [sendInvoice, setSendInvoice] = useState(null)
  const [activeInvoiceActionId, setActiveInvoiceActionId] = useState('')
  const invoiceActionGuardRef = useRef(false)
  const { showToast } = useToast()
  const { isAnalyticsMode } = useAnalyticsMode()
  const { contractor, company, session } = useAuth()
  const contractorId = getInvoicesContractorId({ contractor, company, session })

  const invoices = useMemo(() => invoiceRecords.filter((invoice) => !deletedIds.includes(invoice.id)).map((invoice) => {
    const lead = findRelatedLeadForInvoice(leads, invoice)
    return {
      ...invoice,
      client: invoice.client || lead?.client || t('unknownClient'),
      projectTitle: invoice.projectTitle || lead?.projectTitle || lead?.projectType || t('project'),
      remainingBalance: getInvoiceRemainingBalance(invoice),
      isArchived: isRecordArchived(invoice, archivedIds),
    }
  }), [archivedIds, invoiceRecords, leads, t, deletedIds])
  const sendInvoiceLead = useMemo(
    () => (sendInvoice ? findRelatedLeadForInvoice(leads, sendInvoice) : null),
    [leads, sendInvoice]
  )
  const sendInvoiceClient = useMemo(
    () => (sendInvoice ? findRelatedClient(clients, sendInvoiceLead || sendInvoice) : null),
    [clients, sendInvoice, sendInvoiceLead]
  )
  const sendInvoiceLanguage = useMemo(() => resolveClientFacingLanguage({
    documentLanguage: sendInvoice?.invoiceLanguage,
    client: sendInvoiceClient,
    lead: sendInvoiceLead,
    appLanguage,
  }), [appLanguage, sendInvoice?.invoiceLanguage, sendInvoiceClient, sendInvoiceLead])
  const sendInvoiceT = useMemo(() => createTranslator(sendInvoiceLanguage), [sendInvoiceLanguage])
  const sendInvoiceDueDate = useMemo(
    () => formatLocalizedInvoiceDate(sendInvoice?.dueDate, sendInvoiceLanguage),
    [sendInvoice?.dueDate, sendInvoiceLanguage]
  )

  const activeInvoices = invoices.filter((invoice) => !invoice.isArchived)
  const filteredInvoices = selectedFilter === 'All'
    ? activeInvoices
    : selectedFilter === 'Archived'
      ? invoices.filter((invoice) => invoice.isArchived)
      : activeInvoices.filter((invoice) => invoice.status === selectedFilter)

  const summaryCards = [
    { label: t('draftInvoices'), value: activeInvoices.filter((invoice) => invoice.status === 'Draft').length, helper: t('draftInvoicesHelper'), icon: FileText },
    { label: t('sentInvoices'), value: activeInvoices.filter((invoice) => invoice.status === 'Sent').length, helper: t('sentInvoicesHelper'), icon: Send },
    { label: t('paidInvoices'), value: activeInvoices.filter((invoice) => invoice.status === 'Paid').length, helper: t('paidInvoicesHelper'), icon: CheckCircle2 },
    { label: t('overdueInvoices'), value: activeInvoices.filter((invoice) => invoice.status === 'Overdue').length, helper: t('overdueInvoicesHelper'), icon: Clock },
    { label: t('outstandingBalance'), value: currency.format(calculateOutstandingInvoiceBalance(activeInvoices)), helper: t('invoiceOutstandingHelper'), icon: DollarSign },
  ]


  function confirmArchive(invoice) {
    setConfirmAction({ mode: 'archive', invoice })
  }

  function confirmDelete(invoice) {
    setConfirmAction({ mode: 'delete', invoice })
  }

  async function runConfirmAction() {
    if (!confirmAction) return
    await runSingleFlightInvoiceAction(confirmAction.invoice.id, async () => {
      try {
        if (confirmAction.mode === 'archive') {
          const response = await dataProvider.invoices.archive(confirmAction.invoice.id, { contractorId })
          if (response?.error) {
            throw new Error(response.error.message || t('archiveFailed'))
          }
          onArchiveInvoice(confirmAction.invoice.id)
        }
        if (confirmAction.mode === 'delete') {
          const response = await dataProvider.invoices.deletePermanently(confirmAction.invoice.id, { contractorId })
          if (response?.error) {
            throw new Error(response.error.message || t('deleteFailed'))
          }
          onDeleteInvoice(confirmAction.invoice.id)
        }
      } catch (err) {
        console.warn('Invoice action failed', err)
        showToast(err?.message || t(confirmAction?.mode === 'delete' ? 'deleteFailed' : 'archiveFailed'), 'error')
      } finally {
        setConfirmAction(null)
      }
    })
  }

  async function runSingleFlightInvoiceAction(invoiceId, task) {
    if (invoiceActionGuardRef.current) {
      return false
    }

    invoiceActionGuardRef.current = true
    setActiveInvoiceActionId(invoiceId)

    try {
      const result = await task()
      return result ?? true
    } finally {
      invoiceActionGuardRef.current = false
      setActiveInvoiceActionId('')
    }
  }

  function renderInvoiceActions(invoice, compact = false) {
    const isArchived = invoice.isArchived
    const isInvoiceActionPending = activeInvoiceActionId === invoice.id
    const moreMenuItems = isArchived
      ? [
          {
            id: 'restore-invoice',
            label: t('restore'),
            icon: <Undo2 className="mr-2 h-4 w-4" />,
            disabled: isInvoiceActionPending,
            onClick: async (event) => {
              event.stopPropagation()
              await runSingleFlightInvoiceAction(invoice.id, async () => {
                try {
                  const response = await dataProvider.invoices.restore(invoice.id, { contractorId })
                  if (response?.error) {
                    throw new Error(response.error.message || t('restoreFailed'))
                  }
                  onRestoreInvoice(invoice.id)
                } catch (error) {
                  console.warn('Restore invoice failed', error)
                  showToast(error?.message || t('restoreFailed'), 'error')
                }
              })
            },
          },
          {
            id: 'delete-invoice',
            label: t('deletePermanently'),
            icon: <Trash2 className="mr-2 h-4 w-4" />,
            disabled: isInvoiceActionPending,
            onClick: () => confirmDelete(invoice),
            className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
          },
        ]
      : [
          {
            id: 'archive-invoice',
            label: t('archive'),
            icon: <Archive className="mr-2 h-4 w-4" />,
            disabled: isInvoiceActionPending,
            onClick: () => confirmArchive(invoice),
            className: archiveMenuItemClasses,
          },
        ]
    const actionLayoutClasses = compact
      ? `grid ${isArchived ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'} items-center gap-2`
      : `ml-auto grid ${isArchived ? 'grid-cols-[8.75rem_5.25rem]' : 'grid-cols-[8.75rem_8.75rem_8.75rem_5.25rem]'} items-center justify-end gap-2`
    const moreButtonClasses = compact
      ? 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'
      : 'inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'

    if (isArchived) {
      return (
        <div className={actionLayoutClasses}>
          <button disabled={isInvoiceActionPending} onClick={(event) => { event.stopPropagation(); onViewInvoice(invoice.id) }} className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600">{t('viewInvoice')}</button>
          <ActionMenu
            label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
            ariaLabel={t('more')}
            showChevron={!compact}
            buttonClassName={moreButtonClasses}
            items={moreMenuItems}
            buttonDisabled={isInvoiceActionPending}
          />
        </div>
      )
    }
    return (
      <div className={actionLayoutClasses}>
        <button disabled={isInvoiceActionPending} onClick={(event) => { event.stopPropagation(); onViewInvoice(invoice.id) }} className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600">{t('viewInvoice')}</button>
        <button disabled={isInvoiceActionPending} onClick={(event) => { event.stopPropagation(); onRecordPayment(invoice.id) }} className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('recordPayment')}</button>
        <button disabled={isInvoiceActionPending} onClick={(event) => { event.stopPropagation(); setSendInvoice(invoice) }} className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{t('sendToCustomer')}</button>
        <ActionMenu
          label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
          ariaLabel={t('more')}
          showChevron={!compact}
          buttonClassName={moreButtonClasses}
          items={moreMenuItems}
          buttonDisabled={isInvoiceActionPending}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl" style={buildHeroBackgroundStyle(invoicesHeroBackground)}>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/55 via-slate-950/20 to-transparent" />
        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('invoices')}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('invoicesManagement')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{t('invoicesManagementHelp')}</p>
          </div>
          <button type="button" onClick={onCreateInvoice} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('newInvoice')}
          </button>
        </div>
      </section>

      {isAnalyticsMode && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => <MetricCard key={card.label} {...card} />)}
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{t('invoiceList')}</h2>
            <p className="text-sm text-slate-500">{t('invoiceListHelp')}</p>
          </div>
          <SelectField value={selectedFilter} onChange={(event) => setSelectedFilter(event.target.value)} containerClassName="w-full lg:w-72" className="bg-slate-50" aria-label={t('filterInvoicesByStatus')}>
            {invoiceFilters.map((filter) => <option key={filter} value={filter}>{filter === 'All' ? t('all') : filter === 'Archived' ? t('archived') : tStatus(t, filter)}</option>)}
          </SelectField>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {invoiceFilters.map((filter) => (
            <FilterChip key={filter} selected={selectedFilter === filter} onClick={() => setSelectedFilter(filter)}>
              {filter === 'All' ? t('all') : filter === 'Archived' ? t('archived') : tStatus(t, filter)}
            </FilterChip>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 lg:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('invoiceNumber')}</th>
                <th className="px-4 py-3">{t('customerProject')}</th>
                <th className="px-4 py-3 text-right">{t('invoiceAmount')}</th>
                <th className="px-4 py-3 text-right">{t('paid')}</th>
                <th className="px-4 py-3 text-right">{t('remaining')}</th>
                <th className="px-4 py-3">{t('dueDate')}</th>
                <th className="px-4 py-3">{t('status')}</th>
                <th className="px-4 py-3 text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} onClick={() => onViewInvoice(invoice.id)} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); onViewInvoice(invoice.id) }} tabIndex={0} role="button" aria-label={t('viewInvoice')} className="cursor-pointer bg-white transition hover:bg-blue-50/40 focus-visible:bg-blue-50/60 focus-visible:outline-none">
                  <td className="px-4 py-4 font-bold text-slate-950">{invoice.number}</td>
                  <td className="px-4 py-4"><p className="font-bold text-slate-950">{invoice.client}</p><p className="text-sm text-slate-500">{invoice.projectTitle}</p></td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">{currency.format(invoice.amount)}</td>
                  <td className="px-4 py-4 text-right font-medium text-slate-700">{currency.format(invoice.amountPaid)}</td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">{currency.format(invoice.remainingBalance)}</td>
                  <td className="px-4 py-4 font-medium text-slate-700">{invoice.dueDate}</td>
                  <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><StatusBadge status={invoice.status} t={t} />{invoice.isArchived ? <StatusBadge status="Archived" t={t} /> : null}</div></td>
                  <td className="px-4 py-4 text-right">{renderInvoiceActions(invoice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {filteredInvoices.map((invoice) => (
            <article key={invoice.id} onClick={() => onViewInvoice(invoice.id)} onKeyDown={(event) => { if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); onViewInvoice(invoice.id) }} tabIndex={0} role="button" aria-label={t('viewInvoice')} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-xs font-bold uppercase tracking-wide text-slate-400 [overflow-wrap:anywhere]">{invoice.number}</p>
                  <h3 className="mt-1 break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{invoice.client}</h3>
                  <p className="break-words text-sm text-slate-500 [overflow-wrap:anywhere]">{invoice.projectTitle}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2"><StatusBadge status={invoice.status} t={t} />{invoice.isArchived ? <StatusBadge status="Archived" t={t} /> : null}</div>
              </div>
              <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('invoiceAmount')}</p><p className="font-bold text-slate-950">{currency.format(invoice.amount)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('paid')}</p><p className="font-bold text-slate-950">{currency.format(invoice.amountPaid)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('remaining')}</p><p className="font-bold text-slate-950">{currency.format(invoice.remainingBalance)}</p></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">{t('dueDate')}: <span className="font-semibold text-slate-700">{invoice.dueDate}</span></p>
              <div className="mt-3">{renderInvoiceActions(invoice, true)}</div>
            </article>
          ))}
        </div>
      </section>
      <ConfirmRecordModal isOpen={Boolean(confirmAction)} mode={confirmAction?.mode} title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : t('confirmArchive')} message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveHelp')} confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmAction} t={t} />
      <SendToCustomerModal
        isOpen={Boolean(sendInvoice)}
        documentType="invoice"
        customer={{
          name: sendInvoice?.client,
          phone: sendInvoiceLead?.phone,
          email: sendInvoiceLead?.email,
        }}
        projectTitle={sendInvoice?.projectTitle || ''}
        amountLabel={t('amountDue')}
        amountValue={currency.format(sendInvoice?.remainingBalance ?? 0)}
        dueDate={sendInvoiceDueDate}
        onClose={() => setSendInvoice(null)}
        onSent={async () => {
          return runSingleFlightInvoiceAction(sendInvoice.id, async () => {
            try {
              const response = await dataProvider.invoices.update(sendInvoice.id, { status: 'Sent' }, { contractorId })
              if (response?.error) {
                throw new Error(response.error.message || t('invoiceSaveFailed'))
              }
              onInvoiceSent?.(sendInvoice?.id)
            } catch (err) {
              console.warn('Mark invoice sent failed', err)
              showToast(err?.message || t('invoiceSaveFailed'), 'error')
              return false
            }
            return true
          })
        }}
        t={t}
        contentT={sendInvoiceT}
      />
    </div>
  )
}

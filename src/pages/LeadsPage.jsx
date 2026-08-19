import { useMemo, useRef, useState } from 'react'
import { Archive, ClipboardList, MoreVertical, Plus, Search, Trash2, Undo2, UserPlus, Users, WalletCards } from 'lucide-react'
import { MetricCard } from '../components/ui/MetricCard'
import { SelectField } from '../components/ui/SelectField'
import { StatusBadge } from '../components/ui/StatusBadge'
import { FilterChip } from '../components/ui/FilterChip'
import { LeadFormModal } from '../components/leads/LeadFormModal'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import ActionMenu from '../components/common/ActionMenu'
import { useToast } from '../components/common/ToastProvider'
import { useAuth } from '../contexts/AuthContext'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import { currency } from '../utils/formatters'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { tStatus } from '../translations'
import dataProvider from '../services/dataProvider'
import { getLeadsContractorId } from '../services/system/leadsRuntimeService'
import { getLeadDisplayValue, getLeadNextStepLabel, getLeadPipelineStage, getLeadPipelineStageCounts, getPriorityLabel } from '../utils/leadPipeline'
import { getEstimatedValueForLead } from '../utils/estimateLinks'
import leadsHeroBackground from '../assets/page-heroes/leads-bg.png'
import { buildHeroBackgroundStyle } from '../utils/heroBackground'

const leadFilters = ['All', 'New Lead', 'Contacted', 'Estimate Sent', 'Won', 'Archived']

function isLeadArchived(lead, archivedIds = []) {
  return Boolean(
    lead?.isArchived
      || lead?.archivedAt
      || lead?.archived_at
      || archivedIds.includes(lead?.id)
  )
}

export function LeadsPage({ leads, clients = [], archivedIds = [], onViewLead, onCreateLead, onArchiveLead, onRestoreLead, onDeleteLead, language = 'en', t }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('New Lead')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [activeLeadActionId, setActiveLeadActionId] = useState('')
  const leadActionGuardRef = useRef(false)
  const { showToast } = useToast()
  const { contractor, company, session } = useAuth()
  const { isAnalyticsMode } = useAnalyticsMode()
  const contractorId = getLeadsContractorId({ contractor, company, session })

  const leadsWithEstimatedValues = useMemo(() => leads.map((lead) => {
    const estimatedValue = getEstimatedValueForLead(lead)

    return {
      ...lead,
      leadEstimatedValue: estimatedValue,
      leadEstimatedValueDisplay: estimatedValue === null ? t('notEstimated') : currency.format(estimatedValue),
    }
  }), [leads, t])

  const activeLeads = useMemo(() => leadsWithEstimatedValues.filter((lead) => !isLeadArchived(lead, archivedIds)), [leadsWithEstimatedValues, archivedIds])

  const filteredLeads = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return leadsWithEstimatedValues.filter((lead) => {
      const isArchived = isLeadArchived(lead, archivedIds)
      const matchesStatus = selectedFilter === 'All'
        ? !isArchived
        : selectedFilter === 'Archived'
          ? isArchived
          : !isArchived && lead.status === selectedFilter
      const matchesSearch = !term || [lead.client, lead.phone, lead.email, lead.address, lead.location, lead.projectTitle, lead.projectType, lead.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
      return matchesStatus && matchesSearch
    })
  }, [leadsWithEstimatedValues, archivedIds, searchTerm, selectedFilter])

  const pipelineCounts = useMemo(() => getLeadPipelineStageCounts(activeLeads), [activeLeads])
  const newLeadCount = pipelineCounts.newLeads
  const contactedCount = pipelineCounts.estimatesToSend
  const estimateSentCount = pipelineCounts.followUpsDue
  const totalValue = activeLeads.reduce((sum, lead) => sum + (lead.leadEstimatedValue || 0), 0)

  const summaryCards = [
    { label: t('newLeads'), value: newLeadCount, helper: t('newLeadsHelper'), icon: UserPlus },
    { label: t('estimatesToSend'), value: contactedCount, helper: t('estimatesToSendHelper'), icon: Users },
    { label: t('followUpsDue'), value: estimateSentCount, helper: t('followUpsDueHelper'), icon: ClipboardList },
    { label: t('leadPipelineValue'), value: currency.format(totalValue), helper: t('leadPipelineValueHelper'), icon: WalletCards },
  ]

  async function handleCreateLead(lead) {
    try {
      const savedLead = await onCreateLead?.(lead)
      if (!savedLead) {
        return
      }

      setIsCreateOpen(false)
      onViewLead?.(savedLead.id)
    } catch (err) {
      showToast(err?.message || t('leadSaveFailed'), 'error')
    }
  }

  function confirmArchive(lead) {
    setConfirmAction({ mode: 'archive', lead })
  }

  function confirmDelete(lead) {
    setConfirmAction({ mode: 'delete', lead })
  }

  async function runSingleFlightLeadAction(leadId, task) {
    if (leadActionGuardRef.current) {
      return false
    }

    leadActionGuardRef.current = true
    setActiveLeadActionId(leadId)

    try {
      const result = await task()
      return result ?? true
    } finally {
      leadActionGuardRef.current = false
      setActiveLeadActionId('')
    }
  }

  async function runConfirmAction() {
    if (!confirmAction) return
    await runSingleFlightLeadAction(confirmAction.lead.id, async () => {
      try {
        if (confirmAction.mode === 'archive') {
          const response = await dataProvider?.leads?.archive?.(confirmAction.lead.id, { contractorId })
          if (response?.error) {
            showToast(response.error.message || t('archiveFailed'), 'error')
            return false
          }
          onArchiveLead(confirmAction.lead.id)
        }
        if (confirmAction.mode === 'delete') {
          const response = await dataProvider?.leads?.deletePermanently?.(confirmAction.lead.id, { contractorId })
          if (response?.error) {
            showToast(response.error.message || t('deleteFailed'), 'error')
            return false
          }
          onDeleteLead(confirmAction.lead.id)
        }
      } catch (err) {
        showToast(err?.message || (confirmAction?.mode === 'delete' ? t('deleteFailed') : t('archiveFailed')), 'error')
        return false
      } finally {
        setConfirmAction(null)
      }
      return true
    })
  }

  async function handleRestoreLead(event, leadId) {
    event.stopPropagation()
    await runSingleFlightLeadAction(leadId, async () => {
      try {
        const response = await dataProvider?.leads?.restore?.(leadId, { contractorId })
        if (response?.error) {
          showToast(response.error.message || t('restoreFailed'), 'error')
          return false
        }
        onRestoreLead(leadId)
      } catch (err) {
        showToast(err?.message || t('restoreFailed'), 'error')
        return false
      }
      return true
    })
  }

  function openLeadItem(leadId) {
    onViewLead(leadId)
  }

  function handleLeadItemKeyDown(event, leadId) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    openLeadItem(leadId)
  }

  function renderLeadActions(lead, compact = false) {
    const isArchived = isLeadArchived(lead, archivedIds)
    const isLeadActionPending = activeLeadActionId === lead.id
    const moreMenuItems = isArchived
      ? [
          {
            id: 'restore-lead',
            label: t('restore'),
            icon: <Undo2 className="mr-2 h-4 w-4" />,
            disabled: isLeadActionPending,
            onClick: (event) => handleRestoreLead(event, lead.id),
          },
          {
            id: 'delete-lead',
            label: t('deletePermanently'),
            icon: <Trash2 className="mr-2 h-4 w-4" />,
            disabled: isLeadActionPending,
            onClick: () => confirmDelete(lead),
            className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
          },
        ]
      : [
          {
            id: 'archive-lead',
            label: t('archive'),
            icon: <Archive className="mr-2 h-4 w-4" />,
            disabled: isLeadActionPending,
            onClick: () => confirmArchive(lead),
            className: archiveMenuItemClasses,
          },
        ]
    const actionLayoutClasses = compact ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2' : 'flex items-center justify-end gap-2'
    const moreButtonClasses = compact
      ? 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'
      : 'inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'

    if (isArchived) {
      return (
        <div className={actionLayoutClasses}>
          <button disabled={isLeadActionPending} onClick={(event) => { event.stopPropagation(); onViewLead(lead.id) }} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600">{t('viewLead')}</button>
          <ActionMenu
            label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
            ariaLabel={t('more')}
            showChevron={!compact}
            buttonClassName={moreButtonClasses}
            items={moreMenuItems}
            buttonDisabled={isLeadActionPending}
          />
        </div>
      )
    }

    return (
      <div className={actionLayoutClasses}>
        <button disabled={isLeadActionPending} onClick={(event) => { event.stopPropagation(); onViewLead(lead.id) }} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600">{t('viewLead')}</button>
        <ActionMenu
          label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
          ariaLabel={t('more')}
          showChevron={!compact}
          buttonClassName={moreButtonClasses}
          items={moreMenuItems}
          buttonDisabled={isLeadActionPending}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl" style={buildHeroBackgroundStyle(leadsHeroBackground, 'rgba(2, 6, 23, 0.82)', 'rgba(15, 23, 42, 0.35)', '72% center')}>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/55 via-slate-950/20 to-transparent" />
        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('leads')}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('leadsPageTitle')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{t('leadsPageHelp')}</p>
          </div>
          <button onClick={() => setIsCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-blue-50">
            <Plus className="h-4 w-4" /> {t('createLead')}
          </button>
        </div>
      </section>

      {isAnalyticsMode && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => <MetricCard key={card.label} {...card} />)}
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{selectedFilter === 'Archived' ? t('archivedLeads') : t('leadList')}</h2>
            <p className="text-sm text-slate-500">{selectedFilter === 'Archived' ? t('archivedViewHelp') : t('leadListHelp')}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
            <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:w-80">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder={t('searchLeadsPlaceholder')} />
            </div>
            <SelectField value={selectedFilter} onChange={(event) => setSelectedFilter(event.target.value)} containerClassName="w-full sm:w-56" className="bg-slate-50" aria-label={t('filterLeadsByStatus')}>
              {leadFilters.map((filter) => <option key={filter} value={filter}>{filter === 'All' ? t('all') : filter === 'Archived' ? t('archived') : tStatus(t, filter)}</option>)}
            </SelectField>
          </div>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {leadFilters.map((filter) => (
            <FilterChip key={filter} selected={selectedFilter === filter} onClick={() => setSelectedFilter(filter)}>
              {filter === 'All' ? t('all') : filter === 'Archived' ? t('archived') : tStatus(t, filter)}
            </FilterChip>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('customerProject')}</th>
                <th className="px-4 py-3">{t('phone')}</th>
                {isAnalyticsMode && <th className="px-4 py-3 text-right">{t('estimatedValue')}</th>}
                <th className="px-4 py-3">{t('status')}</th>
                {isAnalyticsMode && <th className="px-4 py-3">{t('priority')}</th>}
                {isAnalyticsMode && <th className="px-4 py-3">{t('source')}</th>}
                <th className="px-4 py-3 text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => openLeadItem(lead.id)}
                  onKeyDown={(event) => handleLeadItemKeyDown(event, lead.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={t('viewLead')}
                  title={t('viewLead')}
                  className="cursor-pointer bg-white transition hover:bg-blue-50/40 focus:outline-none focus-visible:bg-blue-50/60"
                >
                  <td className="px-4 py-4"><p className="font-bold text-slate-950">{lead.client}</p><p className="text-sm text-slate-500">{lead.projectTitle || lead.projectType}</p></td>
                  <td className="px-4 py-4 font-medium text-slate-700">{lead.phone || t('notAdded')}</td>
                  {isAnalyticsMode && <td className="px-4 py-4 text-right font-bold text-slate-900">{lead.leadEstimatedValueDisplay}</td>}
                  <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><StatusBadge status={lead.status} t={t} />{isLeadArchived(lead, archivedIds) ? <StatusBadge status="Archived" t={t} /> : null}</div></td>
                  {isAnalyticsMode && <td className="px-4 py-4"><StatusBadge status={getPriorityLabel(lead.priority, t)} t={t} /></td>}
                  {isAnalyticsMode && <td className="px-4 py-4 text-slate-600">{getLeadDisplayValue(lead.source, t) || t('notAdded')}</td>}
                  <td className="px-4 py-4 text-right">{renderLeadActions(lead)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredLeads.map((lead) => (
            <article
              key={lead.id}
              onClick={() => openLeadItem(lead.id)}
              onKeyDown={(event) => handleLeadItemKeyDown(event, lead.id)}
              tabIndex={0}
              role="button"
              aria-label={t('viewLead')}
              title={t('viewLead')}
              className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 focus:outline-none focus-visible:border-blue-300 focus-visible:bg-blue-50/40"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{lead.client}</h3><p className="break-words text-sm text-slate-500 [overflow-wrap:anywhere]">{getLeadDisplayValue(lead.projectTitle || lead.projectType, t)}</p></div>
                <div className="flex flex-wrap justify-end gap-2"><StatusBadge status={lead.status} t={t} />{isLeadArchived(lead, archivedIds) ? <StatusBadge status="Archived" t={t} /> : null}</div>
              </div>
              {!isAnalyticsMode ? (
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('phone')}</p>
                    <p className="font-medium text-slate-700">{lead.phone || t('notAdded')}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('email')}</p>
                    <p className="break-words font-medium text-slate-700 [overflow-wrap:anywhere]">{lead.email || t('notAdded')}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('estimatedValue')}</p><p className="font-bold text-slate-950">{lead.leadEstimatedValueDisplay}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('priority')}</p><p className="font-bold text-slate-950">{getPriorityLabel(lead.priority, t)}</p></div>
                  <div className="col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('nextStep')}</p><p className="font-medium text-slate-700">{getLeadNextStepLabel(lead.nextStep, t, lead)}</p></div>
                </div>
              )}
              <div className="mt-3">{renderLeadActions(lead, true)}</div>
            </article>
          ))}
        </div>

        {filteredLeads.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><p className="font-bold text-slate-900">{t('noLeadsFound')}</p><p className="mt-2 text-sm text-slate-500">{t('noLeadsFoundHelp')}</p></div>}
      </section>

      <LeadFormModal isOpen={isCreateOpen} mode="create" clients={clients} defaultClientLanguage={language} onClose={() => setIsCreateOpen(false)} onSave={handleCreateLead} t={t} />
      <ConfirmRecordModal
        isOpen={Boolean(confirmAction)}
        mode={confirmAction?.mode}
        title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : t('confirmArchive')}
        message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveLeadHelp')}
        confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
        t={t}
      />
    </div>
  )
}

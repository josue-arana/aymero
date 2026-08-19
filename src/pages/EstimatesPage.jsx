import { useMemo, useState } from 'react'
import { Archive, CheckCircle2, ClipboardList, DollarSign, FileText, MoreVertical, Trash2, Undo2 } from 'lucide-react'
import { MetricCard } from '../components/ui/MetricCard'
import { SelectField } from '../components/ui/SelectField'
import { StatusBadge } from '../components/ui/StatusBadge'
import { FilterChip } from '../components/ui/FilterChip'
import { currency, formatDisplayDate } from '../utils/formatters'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { tStatus } from '../translations'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import ActionMenu from '../components/common/ActionMenu'
import { USE_SUPABASE, USE_SUPABASE_ESTIMATES } from '../config/backendConfig'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import { getEstimateDisplayNumber } from '../utils/estimateNumber'
import { dedupeById, findLeadByProjectLookup, resolveLinkedProjectId } from '../utils/projectIdentity'
import estimatesHeroBackground from '../assets/page-heroes/estimates-bg.png'
import { buildHeroBackgroundStyle } from '../utils/heroBackground'
import { resolveEstimateArchiveState } from '../utils/archiveLifecycle'

const estimateFilters = ['All', 'Archived', 'Draft', 'Sent', 'Approved', 'Rejected', 'Converted to Contract']

function getEstimateStatus(lead) {
  if (lead.portal?.contract?.status === 'Signed') return 'Converted to Contract'
  if (lead.portal?.contract?.id || lead.portal?.contract?.number || lead.portal?.contract?.contractNumber) return 'Converted to Contract'
  if (lead.portal?.estimate?.status === 'Converted to Contract') return 'Converted to Contract'
  if (lead.status === 'Estimate Sent') return 'Sent'
  if (lead.status === 'Won') return 'Approved'
  if (lead.status === 'Contacted') return 'Draft'
  return 'Draft'
}

export function EstimatesPage({ leads, estimates = [], contracts = [], archivedIds = [], onOpenEstimate, onConvertEstimate, onArchiveEstimate, onRestoreEstimate, onDeleteEstimate, t }) {
  const [selectedFilter, setSelectedFilter] = useState('Draft')
  const [confirmAction, setConfirmAction] = useState(null)
  const { isAnalyticsMode } = useAnalyticsMode()

  const leadBackedEstimates = useMemo(() => leads.map((lead) => {
    const estimate = lead.portal?.estimate || {}
    const contract = lead.portal?.contract || null
    const archiveState = resolveEstimateArchiveState({ estimate, lead, contract, archivedLeadIds: archivedIds })

    return {
      id: lead.id,
      sourceLeadId: lead.id,
      routeId: lead.projectId || lead.project_id || lead.id,
      estimateNumber: getEstimateDisplayNumber(estimate, lead),
      client: lead.client,
      projectTitle: lead.projectTitle || lead.projectType,
      amount: estimate.total || lead.value,
      status: getEstimateStatus(lead),
      dateCreated: estimate.dateCreated || estimate.createdAt || contract?.signedDate || 'June 2026',
      hasLinkedContract: Boolean(contract?.id || contract?.number || contract?.contractNumber),
      nextAction: (contract?.id || contract?.number || contract?.contractNumber) ? t('viewContract') : t('convertToContract'),
      isArchived: archiveState.isArchived,
      archiveSource: archiveState.source,
      routeUsesEstimateId: false,
      canUseProjectActions: true,
      publicShareToken: estimate.publicShareToken || estimate.public_share_token || '',
      public_share_token: estimate.public_share_token || estimate.publicShareToken || '',
    }
  }), [archivedIds, leads, t])

  const persistedEstimates = useMemo(() => dedupeById(estimates, ['projectId', 'project_id', 'leadId', 'lead_id', 'number', 'estimateNumber']).map((estimate) => {
    const linkedLead = findLeadByProjectLookup(leads, estimate?.projectId, estimate?.project_id, estimate?.leadId, estimate?.lead_id)
      || leads.find((lead) => estimate?.id && lead?.estimateId === estimate.id)
      || null
    const linkedContract = contracts.find((contract) => (
      (estimate?.id && contract?.estimateId === estimate.id)
      || ((estimate?.projectId || estimate?.project_id) && (contract?.projectId === (estimate.projectId || estimate.project_id) || contract?.project_id === (estimate.projectId || estimate.project_id)))
      || ((estimate?.leadId || estimate?.lead_id) && (contract?.leadId === (estimate.leadId || estimate.lead_id) || contract?.lead_id === (estimate.leadId || estimate.lead_id)))
    )) || linkedLead?.portal?.contract || null
    const archiveState = resolveEstimateArchiveState({
      estimate,
      lead: linkedLead,
      contract: linkedContract,
      archivedLeadIds: archivedIds,
    })
    const routeId = estimate.id

    return {
      ...estimate,
      id: estimate.id,
      sourceLeadId: linkedLead?.id || estimate.leadId || estimate.projectId || estimate.id,
      routeId,
      estimateNumber: getEstimateDisplayNumber(estimate, linkedLead || estimate),
      client: linkedLead?.client || estimate.client || t('customer'),
      projectTitle: linkedLead?.projectTitle || linkedLead?.projectType || estimate.projectTitle || estimate.title || t('estimate'),
      amount: Number(estimate.total || estimate.totalAmount || estimate.amount || 0),
      status: estimate.status || 'Draft',
      dateCreated: estimate.dateCreated || estimate.createdAt || estimate.created_at || 'June 2026',
      hasLinkedContract: Boolean(linkedContract?.id || linkedContract?.number || linkedContract?.contractNumber),
      nextAction: (linkedContract?.id || linkedContract?.number || linkedContract?.contractNumber) ? t('viewContract') : t('convertToContract'),
      isArchived: archiveState.isArchived,
      archiveSource: archiveState.source,
      routeUsesEstimateId: true,
      canUseProjectActions: Boolean(linkedLead),
    }
  }), [archivedIds, contracts, estimates, leads, t])

  const usesSupabaseEstimates = USE_SUPABASE || USE_SUPABASE_ESTIMATES
  const estimateRows = usesSupabaseEstimates && persistedEstimates.length > 0 ? persistedEstimates : leadBackedEstimates

  const activeEstimates = estimateRows.filter((estimate) => !estimate.isArchived)
  const filteredEstimates = selectedFilter === 'All'
    ? activeEstimates
    : selectedFilter === 'Archived'
      ? estimateRows.filter((estimate) => estimate.isArchived)
      : activeEstimates.filter((estimate) => estimate.status === selectedFilter)

  const draftCount = activeEstimates.filter((estimate) => estimate.status === 'Draft').length
  const sentCount = activeEstimates.filter((estimate) => estimate.status === 'Sent').length
  const approvedCount = activeEstimates.filter((estimate) => estimate.status === 'Approved' || estimate.status === 'Converted to Contract').length
  const totalValue = activeEstimates.reduce((sum, estimate) => sum + estimate.amount, 0)

  const summaryCards = [
    { label: t('draftEstimates'), value: draftCount, helper: t('draftEstimatesHelper'), icon: FileText },
    { label: t('sentEstimates'), value: sentCount, helper: t('sentEstimatesHelper'), icon: ClipboardList },
    { label: t('approvedEstimates'), value: approvedCount, helper: t('approvedEstimatesHelper'), icon: CheckCircle2 },
    { label: t('totalEstimatedValue'), value: currency.format(totalValue), helper: t('totalEstimatedValueHelper'), icon: DollarSign },
  ]


  function confirmArchive(estimate) {
    setConfirmAction({ mode: 'archive', estimate })
  }

  function confirmDelete(estimate) {
    setConfirmAction({ mode: 'delete', estimate })
  }

  async function runConfirmAction() {
    if (!confirmAction) return
    try {
      if (confirmAction.mode === 'archive') {
        await onArchiveEstimate?.(confirmAction.estimate.sourceLeadId, confirmAction.estimate)
      }
      if (confirmAction.mode === 'delete') {
        await onDeleteEstimate?.(confirmAction.estimate.sourceLeadId, confirmAction.estimate)
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Estimate list action failed.', err)
      }
    } finally {
      setConfirmAction(null)
    }
  }

  function renderEstimateActions(estimate, compact = false) {
    const isArchived = estimate.isArchived
    const showProjectAction = !isArchived && estimate.canUseProjectActions !== false
    const moreMenuItems = isArchived
      ? [
          {
            id: 'restore-estimate',
            label: t(estimate.archiveSource === 'lead' ? 'restoreLeadAndEstimate' : 'restore'),
            icon: <Undo2 className="mr-2 h-4 w-4" />,
            onClick: () => onRestoreEstimate(estimate.sourceLeadId, estimate, { archiveSource: estimate.archiveSource }),
          },
          {
            id: 'delete-estimate',
            label: t('deletePermanently'),
            icon: <Trash2 className="mr-2 h-4 w-4" />,
            onClick: () => confirmDelete(estimate),
            className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
          },
        ]
      : [
          {
            id: 'archive-estimate',
            label: t('archive'),
            icon: <Archive className="mr-2 h-4 w-4" />,
            onClick: () => confirmArchive(estimate),
            className: archiveMenuItemClasses,
          },
        ]

    const actionLayoutClasses = compact
      ? `grid ${isArchived || !showProjectAction ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'} items-center gap-2`
      : `ml-auto grid ${isArchived || !showProjectAction ? 'grid-cols-[8.75rem_5.25rem]' : 'grid-cols-[8.75rem_10.5rem_5.25rem]'} items-center justify-end gap-2`

    const moreButtonClasses = compact
      ? 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'
      : 'inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'

    if (isArchived) {
      return (
        <div className={actionLayoutClasses}>
          <button onClick={(event) => { event.stopPropagation(); onOpenEstimate(estimate.routeId, estimate) }} className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">{t('viewEstimate')}</button>
          <ActionMenu
            label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
            ariaLabel={t('more')}
            showChevron={!compact}
            buttonClassName={moreButtonClasses}
            items={moreMenuItems}
          />
        </div>
      )
    }
    return (
      <div className={actionLayoutClasses}>
        <button onClick={(event) => { event.stopPropagation(); onOpenEstimate(estimate.routeId, estimate) }} className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">{t('viewEstimate')}</button>
        {showProjectAction ? <button onClick={(event) => { event.stopPropagation(); onConvertEstimate(estimate.sourceLeadId, estimate) }} className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">{estimate.hasLinkedContract ? t('viewContract') : t('convertToContract')}</button> : null}
        <ActionMenu
          label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
          ariaLabel={t('more')}
          showChevron={!compact}
          buttonClassName={moreButtonClasses}
          items={moreMenuItems}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl" style={buildHeroBackgroundStyle(estimatesHeroBackground)}>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/55 via-slate-950/20 to-transparent" />
        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('estimates')}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('estimatesManagement')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{t('estimatesManagementHelp')}</p>
          </div>
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
            <h2 className="text-xl font-bold text-slate-950">{t('estimateList')}</h2>
            <p className="text-sm text-slate-500">{t('estimateListHelp')}</p>
          </div>
          <SelectField value={selectedFilter} onChange={(event) => setSelectedFilter(event.target.value)} containerClassName="w-full lg:w-72" className="bg-slate-50" aria-label={t('filterEstimatesByStatus')}>
            {estimateFilters.map((filter) => <option key={filter} value={filter}>{filter === 'All' ? t('all') : filter === 'Archived' ? t('archived') : tStatus(t, filter)}</option>)}
          </SelectField>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {estimateFilters.map((filter) => (
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
                <th className="px-4 py-3">{t('estimate')}</th>
                <th className="px-4 py-3">{t('status')}</th>
                <th className="px-4 py-3">{t('date')}</th>
                <th className="px-4 py-3 text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEstimates.length ? filteredEstimates.map((estimate) => (
                <tr key={estimate.id} onClick={() => onOpenEstimate(estimate.routeId, estimate)} className="cursor-pointer bg-white transition hover:bg-blue-50/40">
                  <td className="px-4 py-4 align-top">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-950">{estimate.client}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{estimate.projectTitle}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">{estimate.estimateNumber}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{currency.format(estimate.amount)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={estimate.status} t={t} />
                      {estimate.isArchived ? <StatusBadge status="Archived" t={t} /> : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top font-medium text-slate-700">{formatDisplayDate(estimate.dateCreated, estimate.dateCreated)}</td>
                  <td className="px-4 py-4 text-right align-top">{renderEstimateActions(estimate)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{t('noEstimates')}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredEstimates.length ? filteredEstimates.map((estimate) => (
            <article key={estimate.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{estimate.client}</h3>
                  <p className="mt-1 break-words text-sm text-slate-500 [overflow-wrap:anywhere]">{estimate.projectTitle}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <StatusBadge status={estimate.status} t={t} />
                  {estimate.isArchived ? <StatusBadge status="Archived" t={t} /> : null}
                </div>
              </div>
              <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('estimate')}</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{estimate.estimateNumber}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('date')}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{formatDisplayDate(estimate.dateCreated, estimate.dateCreated)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('estimateAmount')}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{currency.format(estimate.amount)}</p>
                </div>
              </div>
              <div className="mt-3">{renderEstimateActions(estimate, true)}</div>
            </article>
          )) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noEstimates')}</div>
          )}
        </div>
      </section>
      <ConfirmRecordModal isOpen={Boolean(confirmAction)} mode={confirmAction?.mode} title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : t('confirmArchive')} message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveHelp')} confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmAction} t={t} />
    </div>
  )
}

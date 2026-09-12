import { useMemo, useState } from 'react'
import { AlertTriangle, BriefcaseBusiness, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronRight, CreditCard, Sparkles, UserRoundPlus, X } from 'lucide-react'
import { StatusBadge } from '../components/ui/StatusBadge'
import { PipelineBoard } from '../components/pipeline/PipelineBoard'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import { tStatus } from '../translations'
import { currency, formatDisplayDate } from '../utils/formatters'
import { getLeadNextStepKey, getLeadPipelineStage, leadPipelineStageOrder, leadPipelineStages } from '../utils/leadPipeline'
import { calculateOutstandingInvoiceBalance, getInvoiceRemainingBalance, isCollectibleInvoice } from '../utils/invoiceRecords'
import { isRecordArchived } from '../utils/archiveLifecycle'
import { findRelatedClient } from '../utils/clients'
import {
  deriveDashboardProjectStatus,
  findDashboardLinkedLead,
  getDashboardProjectFinancialSummary,
  isDashboardPendingEstimate,
  selectDashboardContractAttentionRecords,
  selectDashboardPaymentActivityRecords,
  selectDashboardActiveProjects,
  selectDashboardPendingEstimates,
  selectDashboardProjectRecords,
  selectDashboardTodayEvents,
  selectDashboardUpcomingEvents,
} from '../utils/dashboardConsistency'

function toTimestamp(value) {
  if (!value) return 0
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function resolveEventTime(event = {}) {
  return event.time || event.startTime || event.start_time || ''
}

function resolveDisplayTitle(lead, fallback = '') {
  return lead?.projectTitle || lead?.title || lead?.projectType || fallback
}

function resolveClientName(lead, fallback = '') {
  return lead?.client || lead?.clientName || lead?.customerName || fallback
}

function DashboardSection({ title, icon: Icon, emptyText, items = [], totalCount = items.length, renderItem, onToggleMore, showAll = false, t, emphasis = false }) {
  return (
    <section className={`min-w-0 rounded-[1.75rem] border bg-white p-4 shadow-sm sm:p-5 ${emphasis ? 'border-amber-200 shadow-[0_10px_28px_rgba(245,158,11,0.12)]' : 'border-slate-200'}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <Icon className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold text-slate-950 sm:text-xl">{title}</h2>
        </div>
        <span className="inline-flex min-w-10 items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">
          {totalCount}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(renderItem)}
        </div>
      )}
      {onToggleMore && totalCount > items.length ? (
        <button type="button" onClick={onToggleMore} aria-expanded={showAll} className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          {showAll ? t('showLess') : t('showMore')}
        </button>
      ) : null}
    </section>
  )
}

function DashboardActionItem({ item }) {
  const Wrapper = item.onClick ? 'button' : 'div'

  return (
    <Wrapper
      {...(item.onClick ? { onClick: item.onClick, type: 'button' } : {})}
      className={`w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition ${item.onClick ? 'hover:border-cyan-200 hover:bg-cyan-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {item.eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{item.eyebrow}</p>}
          <h3 className="mt-1 text-sm font-bold text-slate-950 sm:text-base">{item.title}</h3>
          {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
          {item.meta && <p className="mt-2 text-sm text-slate-500">{item.meta}</p>}
        </div>
        {item.onClick && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </Wrapper>
  )
}

function QuickAction({ icon: Icon, label, meta = '', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block break-words text-sm font-bold text-slate-900">{label}</span>
        {meta ? <span className="mt-1 block break-words text-xs text-slate-500">{meta}</span> : null}
      </span>
    </button>
  )
}

function ScheduleOverviewCard({ todayItems, upcomingItems, t }) {
  const renderItems = (items, emptyText) => items.length ? (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
      {items.map((item) => (
        <article key={item.id} className="grid min-w-0 gap-3 bg-white p-4 sm:grid-cols-[90px_minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{t('time')}</p><p className="mt-1 break-words text-sm font-bold text-slate-950">{item.time || t('notAdded')}</p></div>
          <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{t('event')}</p><p className="mt-1 break-words text-sm font-bold text-slate-950">{item.title}</p>{item.customer ? <p className="mt-1 break-words text-xs text-slate-500">{item.customer}</p> : null}</div>
          <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{t('location')}</p><p className="mt-1 break-words text-sm text-slate-700">{item.location || t('notAdded')}</p></div>
          {item.onClick ? <button type="button" onClick={item.onClick} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{item.actionLabel}</button> : null}
        </article>
      ))}
    </div>
  ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-500">{emptyText}</div>

  return <section className="min-w-0 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="dashboard-schedule-title">
    <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span><h2 id="dashboard-schedule-title" className="text-lg font-bold text-slate-950 sm:text-xl">{t('todaysAgenda')}</h2></div>
    {todayItems.length === 0 && upcomingItems.length === 0 ? (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">{t('noTodayOrUpcomingEvents')}</div>
    ) : (
      <div className="mt-5 space-y-5">
        <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">{t('today')}</h3><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{todayItems.length}</span></div>{renderItems(todayItems, t('noEventsScheduledForToday'))}</div>
        <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">{t('upcoming')}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{upcomingItems.length}</span></div>{renderItems(upcomingItems, t('noUpcomingEvents'))}</div>
      </div>
    )}
  </section>
}

function FinancialSnapshotCard({ metrics, t }) {
  return <section className="min-w-0 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="financial-snapshot-title">
    <div><h2 id="financial-snapshot-title" className="text-lg font-bold text-slate-950 sm:text-xl">{t('financialSnapshot')}</h2></div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-3">{metrics.map((metric) => <div key={metric.label} className="min-w-0 rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{metric.label}</dt><dd className="mt-2 break-words text-xl font-bold text-slate-950">{currency.format(metric.value)}</dd></div>)}</dl>
  </section>
}

function ActiveProjectsCard({ projects, totalCount, onOpenProject, onViewAll, showFinancials = false, t }) {
  return (
    <section className="min-w-0 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="active-projects-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="active-projects-title" className="text-lg font-bold text-slate-950 sm:text-xl">{t('openProjects')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('openProjectsHelp')}</p>
        </div>
        <span className="inline-flex min-w-10 items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">{totalCount}</span>
      </div>

      {projects.length ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <article key={project.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-bold text-slate-950">{project.title}</h3>
                  <p className="mt-1 break-words text-sm text-slate-500">{project.client}</p>
                </div>
                <StatusBadge status={project.status} t={t} />
              </div>
              {showFinancials ? <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
                <div className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{t('total')}</dt>
                  <dd className="mt-1 break-words text-sm font-bold text-slate-900">{currency.format(project.total)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{t('balance')}</dt>
                  <dd className="mt-1 break-words text-sm font-bold text-slate-900">{currency.format(project.balance)}</dd>
                </div>
              </dl> : null}
              <button type="button" onClick={() => onOpenProject?.(project.id)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                {t('viewProject')}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
          <BriefcaseBusiness className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-500">{t('noOpenProjects')}</p>
        </div>
      )}
      {totalCount > projects.length && onViewAll ? <button type="button" onClick={onViewAll} className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">{t('viewAllProjects')}</button> : null}
    </section>
  )
}

const sampleGuideItems = [
  { key: 'lead', labelKey: 'sampleGuideReviewLead' },
  { key: 'estimate', labelKey: 'sampleGuideOpenEstimate' },
  { key: 'job', labelKey: 'sampleGuideSeeJob' },
  { key: 'event', labelKey: 'sampleGuideReviewVisit' },
  { key: 'client', labelKey: 'sampleGuideOpenClient' },
  { key: 'financial', labelKey: 'sampleGuideReviewFinancials' },
]

function SampleWorkspaceGuide({ guide, onOpenItem, onDismiss, onCreateLead, t }) {
  if (!guide || guide.dismissed) return null

  const completedItems = Array.isArray(guide.completedItems) ? guide.completedItems : []
  const completedCount = sampleGuideItems.filter((item) => completedItems.includes(item.key)).length
  const isComplete = completedCount === sampleGuideItems.length
  const progress = Math.round((completedCount / sampleGuideItems.length) * 100)

  return (
    <section className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50/70 to-blue-50 p-5 shadow-sm sm:p-6" aria-labelledby="sample-workspace-guide-title">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-600 text-white"><Sparkles className="h-5 w-5" /></span>
          <div>
            <h2 id="sample-workspace-guide-title" className="text-lg font-bold text-slate-950">{t('sampleGuideTitle')}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t(isComplete ? 'sampleGuideCompleteBody' : 'sampleGuideBody')}</p>
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label={t('sampleGuideDismiss')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-100"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-5" aria-label={t('sampleGuideProgress', { current: completedCount, total: sampleGuideItems.length })}>
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
          <span>{t('sampleGuideProgress', { current: completedCount, total: sampleGuideItems.length })}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {isComplete ? (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="text-sm font-bold">{t('sampleGuideCompleteTitle')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onCreateLead} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">{t('sampleGuideCreateLead')}</button>
            <button type="button" onClick={onDismiss} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-100">{t('sampleGuideDismiss')}</button>
          </div>
        </div>
      ) : (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2" aria-label={t('sampleGuideChecklistLabel')}>
          {sampleGuideItems.map((item) => {
            const isChecked = completedItems.includes(item.key)
            return (
              <li key={item.key}>
                <button type="button" onClick={() => onOpenItem?.(item.key)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-100">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${isChecked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-slate-50 text-transparent'}`}>
                    <Check className="h-4 w-4" />
                  </span>
                  <span className={isChecked ? 'text-slate-500 line-through' : ''}>{t(item.labelKey)}</span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function DashboardPage({
  leads,
  clients = [],
  metrics,
  scheduleEvents = [],
  invoices = [],
  estimates = [],
  contracts = [],
  projects = [],
  payments = [],
  archivedLeadIds = [],
  archivedProjectIds = [],
  draggedLeadId,
  setDraggedLeadId,
  selectedMobileStage,
  setSelectedMobileStage,
  moveLead,
  onLeadClick,
  onOpenProject,
  onViewAllProjects,
  onOpenEstimate,
  onOpenContract,
  onOpenInvoice,
  onCreateLeadClick,
  onCreateJob,
  onRecordPayment,
  onScheduleVisit,
  successMessage,
  showOnboardingReminder = false,
  onResumeOnboarding,
  sampleGuide,
  onOpenSampleGuideItem,
  onDismissSampleGuide,
  t,
  userProfile,
}) {
  const { isAnalyticsMode } = useAnalyticsMode()
  const [isReminderDismissed, setIsReminderDismissed] = useState(false)
  const [showAllAttention, setShowAllAttention] = useState(false)
  const firstName = (userProfile?.name || '').trim().split(/\s+/)[0] || t('userName')

  const leadsById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])

  const todaysScheduleItems = useMemo(() => (
    selectDashboardTodayEvents(scheduleEvents, new Date())
      .map((event) => {
        const linkedLead = leadsById.get(event.leadId || event.lead_id)
          || findDashboardLinkedLead(leads, event)
        const eventProjectId = event.projectId || event.project_id || linkedLead?.projectId || linkedLead?.project_id || ''
        const hasProject = Boolean(eventProjectId)
        return {
          id: event.id || `${event.leadId}-${event.date}-${event.title}`,
          title: event.title || event.type || t('calendar'),
          time: resolveEventTime(event),
          customer: resolveClientName(linkedLead, event.clientName || ''),
          location: event.location || linkedLead?.address || linkedLead?.location || '',
          actionLabel: hasProject ? t('viewProject') : t('viewLead'),
          onClick: hasProject
            ? () => onOpenProject?.(eventProjectId)
            : linkedLead
              ? () => onLeadClick?.(linkedLead.id)
              : null,
        }
      })
  ), [leads, leadsById, onLeadClick, onOpenProject, scheduleEvents, t])

  const upcomingScheduleItems = useMemo(() => (
    selectDashboardUpcomingEvents(scheduleEvents, new Date(), 3).map((event) => {
      const linkedLead = leadsById.get(event.leadId || event.lead_id) || findDashboardLinkedLead(leads, event)
      const eventProjectId = event.projectId || event.project_id || linkedLead?.projectId || linkedLead?.project_id || ''
      return {
        id: event.id || `${event.leadId}-${event.date}-${event.title}`,
        title: event.title || event.type || t('calendar'), time: resolveEventTime(event),
        customer: resolveClientName(linkedLead, event.clientName || ''), location: event.location || linkedLead?.address || linkedLead?.location || '',
        actionLabel: eventProjectId ? t('viewProject') : t('viewLead'),
        onClick: eventProjectId ? () => onOpenProject?.(eventProjectId) : linkedLead ? () => onLeadClick?.(linkedLead.id) : null,
      }
    })
  ), [leads, leadsById, onLeadClick, onOpenProject, scheduleEvents, t])

  const needsAttentionItems = useMemo(() => {
    const items = []
    const handledEstimateIds = new Set()
    const handledContractIds = new Set()

    leads.forEach((lead) => {
      const stage = getLeadPipelineStage(lead)
      const projectTitle = resolveDisplayTitle(lead, t('project'))
      const clientName = resolveClientName(lead, t('client'))
      const hasProject = Boolean(lead?.projectId || lead?.project_id)
      const goToLeadOrProject = () => (hasProject ? onOpenProject?.(lead.id) : onLeadClick?.(lead.id))

      const estimate = lead?.portal?.estimate || null
      if (estimate?.id) handledEstimateIds.add(String(estimate.id))
      const estimateStatus = String(estimate?.status || '').trim().toLowerCase()
      const contract = lead?.portal?.contract
      if (contract?.id) handledContractIds.add(String(contract.id))
      const contractStatus = String(contract?.status || '').trim().toLowerCase()
      const hasContract = Boolean(
        contract?.id
        || contract?.number
        || contract?.contractNumber
        || contract?.createdAt
        || contract?.created_at
        || contract?.status
      )
      if (isDashboardPendingEstimate({
        estimate,
        lead,
        contract: lead?.portal?.contract || null,
        archivedLeadIds,
      })) {
        const requiresFollowUp = estimateStatus === 'sent'
          || stage === leadPipelineStages.ESTIMATE_SENT
          || stage === leadPipelineStages.FOLLOW_UP
        items.push({
          id: `estimate-${requiresFollowUp ? 'followup' : 'draft'}-${lead.id}`,
          eyebrow: t('estimate'),
          title: projectTitle,
          description: clientName,
          meta: requiresFollowUp ? t('dashboardEstimateWaitingForClient') : t(getLeadNextStepKey(leadPipelineStages.ESTIMATE_CREATED)),
          priority: requiresFollowUp ? 25 : 30,
          timestamp: toTimestamp(estimate?.updatedAt || estimate?.updated_at || estimate?.dateCreated || estimate?.createdAt || estimate?.created_at || lead?.createdAt || lead?.created_at),
          onClick: onOpenEstimate ? () => onOpenEstimate(lead.id, estimate) : goToLeadOrProject,
          groupKey: `estimate:${lead.projectId || lead.project_id || lead.id}`,
        })
      } else if (estimate && !isRecordArchived(estimate) && estimateStatus === 'approved' && !hasContract) {
        items.push({
          id: `estimate-approved-${lead.id}`,
          eyebrow: t('estimateApprovedByClient'),
          title: projectTitle,
          description: clientName,
          meta: t('dashboardEstimateReadyForContract'),
          priority: 12,
          timestamp: toTimestamp(estimate?.approvedAt || estimate?.approved_at || estimate?.updatedAt || estimate?.updated_at),
          onClick: onOpenEstimate ? () => onOpenEstimate(lead.id, estimate) : goToLeadOrProject,
        })
      } else if (estimate && !isRecordArchived(estimate) && estimateStatus === 'rejected') {
        items.push({
          id: `estimate-rejected-${lead.id}`,
          eyebrow: t('estimateDeclinedByClient'),
          title: projectTitle,
          description: clientName,
          meta: t('dashboardEstimateNeedsReview'),
          priority: 18,
          timestamp: toTimestamp(estimate?.rejectedAt || estimate?.rejected_at || estimate?.updatedAt || estimate?.updated_at),
          onClick: onOpenEstimate ? () => onOpenEstimate(lead.id, estimate) : goToLeadOrProject,
        })
      }

      if (hasContract && !isRecordArchived(contract) && ['draft', 'sent', 'pending', 'pending_signature', 'viewed'].includes(contractStatus || 'draft')) {
        items.push({
          id: `contract-unsigned-${lead.id}`,
          eyebrow: t('contract'),
          title: projectTitle,
          description: clientName,
          meta: contractStatus === 'sent' ? t('contractNeedsSignature') : t('sendContract'),
          priority: 20,
          timestamp: toTimestamp(contract?.updatedAt || contract?.updated_at || contract?.createdAt || contract?.created_at),
          onClick: onOpenContract ? () => onOpenContract(lead.id) : goToLeadOrProject,
        })
      }
    })

    selectDashboardContractAttentionRecords({
      contracts,
      projects,
      leads,
      archivedProjectIds,
    }).forEach(({ contract, linkedProject, linkedLead, projectId }) => {
      if (contract?.id && handledContractIds.has(String(contract.id))) return

      const projectTitle = resolveDisplayTitle(linkedProject || linkedLead || contract, t('project'))
      const clientName = resolveClientName(linkedLead || linkedProject || contract, t('client'))
      const routeId = linkedLead?.id || projectId || contract?.projectId || contract?.project_id || contract?.id
      items.push({
        id: `contract-unsigned-${contract.id}`,
        eyebrow: t('contract'),
        title: projectTitle,
        description: clientName,
        meta: normalizeStatus(contract?.status) === 'sent' ? t('contractNeedsSignature') : t('sendContract'),
        priority: 20,
        timestamp: toTimestamp(contract?.updatedAt || contract?.updated_at || contract?.createdAt || contract?.created_at),
        onClick: onOpenContract ? () => onOpenContract(routeId, { projectId }) : null,
      })
    })

    estimates.forEach((estimate) => {
      if (!estimate?.id || handledEstimateIds.has(String(estimate.id)) || isRecordArchived(estimate)) return

      const estimateStatus = String(estimate.status || '').trim().toLowerCase()
      if (!['sent', 'approved', 'rejected'].includes(estimateStatus)) return

      const linkedLead = findDashboardLinkedLead(leads, estimate)
      const estimateProjectId = estimate.projectId || estimate.project_id || linkedLead?.projectId || linkedLead?.project_id || ''
      const linkedProject = projects.find((project) => project.id === estimateProjectId) || null
      if (linkedLead && archivedLeadIds.some((id) => String(id) === String(linkedLead.id))) return
      if (linkedProject && archivedProjectIds.some((id) => String(id) === String(linkedProject.id))) return
      const linkedContract = contracts.find((contract) => (
        (contract.estimateId || contract.estimate_id) === estimate.id
        || (estimateProjectId && (contract.projectId || contract.project_id) === estimateProjectId)
      )) || null
      if (estimateStatus === 'approved' && linkedContract && !isRecordArchived(linkedContract)) return

      const statusPresentation = estimateStatus === 'approved'
        ? { eyebrow: t('estimateApprovedByClient'), meta: t('dashboardEstimateReadyForContract'), priority: 12, timestamp: estimate.approvedAt || estimate.approved_at }
        : estimateStatus === 'rejected'
          ? { eyebrow: t('estimateDeclinedByClient'), meta: t('dashboardEstimateNeedsReview'), priority: 18, timestamp: estimate.rejectedAt || estimate.rejected_at }
          : { eyebrow: t('estimate'), meta: t('dashboardEstimateWaitingForClient'), priority: 25, timestamp: estimate.sentAt || estimate.sent_at }
      const routeEstimate = { ...estimate, routeUsesEstimateId: true }

      items.push({
        id: `persisted-estimate-${estimateStatus}-${estimate.id}`,
        eyebrow: statusPresentation.eyebrow,
        title: linkedProject?.projectTitle || linkedProject?.title || estimate.projectTitle || estimate.title || t('estimate'),
        description: resolveClientName(linkedLead || estimate, t('client')),
        meta: statusPresentation.meta,
        priority: statusPresentation.priority,
        timestamp: toTimestamp(statusPresentation.timestamp || estimate.updatedAt || estimate.updated_at || estimate.createdAt || estimate.created_at),
        onClick: onOpenEstimate ? () => onOpenEstimate(estimate.leadId || estimate.lead_id || estimateProjectId || estimate.id, routeEstimate) : null,
        groupKey: estimateStatus === 'sent' ? `estimate:${estimateProjectId || linkedLead?.id || estimate.leadId || estimate.lead_id || estimate.id}` : null,
      })
    })

    invoices.forEach((invoice) => {
      const remaining = getInvoiceRemainingBalance(invoice)
      if (remaining <= 0 || !isCollectibleInvoice(invoice)) return

      const isOverdue = invoice.status === 'Overdue'
      const isOutstanding = ['Sent', 'Partially Paid'].includes(invoice.status)
      if (!isOverdue && !isOutstanding) return

      items.push({
        id: `invoice-attention-${invoice.id}`,
        eyebrow: t('invoice'),
        title: invoice.number || invoice.projectTitle || t('invoice'),
        description: [invoice.client || '', invoice.projectTitle || ''].filter(Boolean).join(' · '),
        meta: `${t('dueDate')}: ${invoice.dueDate || t('notAdded')} · ${currency.format(remaining)}`,
        priority: isOverdue ? 10 : 35,
        timestamp: toTimestamp(invoice.dueDate),
        onClick: onOpenInvoice ? () => onOpenInvoice(invoice.id) : null,
      })
    })

    return items
      .reduce((grouped, item) => {
        if (!item.groupKey || !item.eyebrow || item.eyebrow !== t('estimate')) return [...grouped, item]
        const existing = grouped.find((candidate) => candidate.groupKey === item.groupKey)
        if (!existing) return [...grouped, item]
        existing.estimateCount = (existing.estimateCount || 1) + 1
        existing.meta = t('estimatesNeedReview', { count: existing.estimateCount })
        return grouped
      }, [])
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority
        if (!left.timestamp && !right.timestamp) return left.title.localeCompare(right.title)
        if (!left.timestamp) return 1
        if (!right.timestamp) return -1
        return left.timestamp - right.timestamp
      })
  }, [archivedLeadIds, archivedProjectIds, contracts, estimates, invoices, leads, leadsById, onLeadClick, onOpenContract, onOpenEstimate, onOpenInvoice, onOpenProject, projects, t])

  const visibleNeedsAttentionItems = showAllAttention ? needsAttentionItems : needsAttentionItems.slice(0, 6)

  const recentActivityItems = useMemo(() => {
    const items = []

    leads.forEach((lead) => {
      const projectTitle = resolveDisplayTitle(lead, t('project'))
      const clientName = resolveClientName(lead, t('client'))
      const hasProject = Boolean(lead?.projectId || lead?.project_id)
      const openLinkedRecord = () => (hasProject ? onOpenProject?.(lead.id) : onLeadClick?.(lead.id))
      const estimate = lead?.portal?.estimate
      const contract = lead?.portal?.contract

      const estimateTimestamp = toTimestamp(estimate?.dateCreated || estimate?.createdAt || estimate?.created_at)
      if (estimateTimestamp && !isRecordArchived(estimate)) {
        items.push({
          id: `activity-estimate-${lead.id}`,
          eyebrow: t('estimate'),
          title: t('estimateCreated'),
          description: `${clientName} · ${projectTitle}`,
          meta: formatDisplayDate(estimate?.dateCreated || estimate?.createdAt || estimate?.created_at),
          timestamp: estimateTimestamp,
          onClick: openLinkedRecord,
        })
      }

      const signedTimestamp = toTimestamp(contract?.signedDate || contract?.signed_at)
      if (signedTimestamp && !isRecordArchived(contract)) {
        items.push({
          id: `activity-contract-${lead.id}`,
          eyebrow: t('contract'),
          title: t('contractSigned'),
          description: `${clientName} · ${projectTitle}`,
          meta: formatDisplayDate(contract?.signedDate || contract?.signed_at),
          timestamp: signedTimestamp,
          onClick: openLinkedRecord,
        })
      }
    })

    const invoiceById = new Map(invoices.map((invoice) => [String(invoice?.id || ''), invoice]))
    const projectById = new Map(projects.map((project) => [String(project?.id || project?.projectId || project?.project_id || ''), project]))
    selectDashboardPaymentActivityRecords({ payments, invoices }).forEach((payment) => {
      const paymentTimestamp = toTimestamp(payment.paymentDate || payment.date || payment.createdAt)
      if (!paymentTimestamp) return

      const invoice = invoiceById.get(String(payment.invoiceId || ''))
      const project = projectById.get(String(payment.projectId || invoice?.projectId || invoice?.project_id || ''))
      const linkedLead = findDashboardLinkedLead(leads, payment)
        || (project ? findDashboardLinkedLead(leads, project) : null)
      const projectTitle = resolveDisplayTitle(project || linkedLead, invoice?.projectTitle || invoice?.number || t('project'))
      const clientName = resolveClientName(linkedLead || project || invoice || payment, t('client'))
      const projectId = payment.projectId || invoice?.projectId || invoice?.project_id || project?.id || project?.projectId || project?.project_id || ''

      items.push({
        id: `activity-payment-${payment.id || `${payment.invoiceId || projectId}-${paymentTimestamp}-${payment.amount}`}`,
        eyebrow: t('payments'),
        title: t('paymentRecordedTimelineTitle'),
        description: `${clientName} · ${projectTitle}`,
        meta: `${currency.format(Number(payment.amount) || 0)} · ${formatDisplayDate(payment.paymentDate || payment.date || payment.createdAt)}`,
        timestamp: paymentTimestamp,
        onClick: projectId && onOpenProject
          ? () => onOpenProject(projectId)
          : invoice?.id && onOpenInvoice
            ? () => onOpenInvoice(invoice.id)
            : null,
      })
    })

    scheduleEvents.forEach((event) => {
      const createdTimestamp = toTimestamp(event.createdAt || event.created_at)
      if (!createdTimestamp) return

      const linkedLead = leadsById.get(event.leadId || event.lead_id) || findDashboardLinkedLead(leads, event)
      const eventProjectId = event.projectId || event.project_id || linkedLead?.projectId || linkedLead?.project_id || ''
      const hasProject = Boolean(eventProjectId)

      items.push({
        id: `activity-event-${event.id || [event.leadId || event.lead_id, event.date, event.title, event.createdAt || event.created_at].filter(Boolean).join('-')}`,
        eyebrow: t('calendar'),
        title: t('eventScheduledActivity'),
        description: [event.title || tStatus(t, event.type || t('scheduled')), resolveClientName(linkedLead, event.clientName || '')].filter(Boolean).join(' · '),
        meta: formatDisplayDate(event.createdAt || event.created_at),
        timestamp: createdTimestamp,
        onClick: hasProject
          ? () => onOpenProject?.(eventProjectId)
          : linkedLead
            ? () => onLeadClick?.(linkedLead.id)
            : null,
      })
    })

    const seenActivityIds = new Set()

    return items
      .filter((item) => {
        if (seenActivityIds.has(item.id)) return false
        seenActivityIds.add(item.id)
        return true
      })
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 6)
  }, [invoices, leads, leadsById, onLeadClick, onOpenInvoice, onOpenProject, payments, projects, scheduleEvents, t])

  const dashboardSummary = useMemo(() => {
    const outstandingBalance = calculateOutstandingInvoiceBalance(invoices)
    const activeJobs = selectDashboardActiveProjects({
      projects,
      leads,
      contracts,
      payments,
      events: scheduleEvents,
      archivedProjectIds,
    }).length
    const pendingEstimates = selectDashboardPendingEstimates({
      estimates,
      leads,
      contracts,
      archivedLeadIds,
    }).length

    return {
      newLeads: metrics.find((metric) => metric.label === t('metricNewLeads'))?.value ?? 0,
      activeJobs,
      pendingEstimates,
      outstandingBalance,
      visitsToday: todaysScheduleItems.length,
    }
  }, [archivedLeadIds, archivedProjectIds, contracts, estimates, invoices, leads, metrics, payments, projects, scheduleEvents, t, todaysScheduleItems.length])

  const dashboardProjectRecords = useMemo(() => selectDashboardProjectRecords({
    projects,
    leads,
    archivedProjectIds,
  })
    .map((project) => {
      const paymentSummary = getDashboardProjectFinancialSummary(project, {
        estimates,
        contracts,
        invoices,
        payments,
      })
      const relatedClient = findRelatedClient(clients, project)

      return {
        id: project.dashboardProjectId,
        title: resolveDisplayTitle(project, t('project')),
        client: relatedClient?.displayName
          || relatedClient?.name
          || resolveClientName(project, t('client')),
        status: deriveDashboardProjectStatus(project, {
          contracts,
          payments,
          events: scheduleEvents,
        }),
        total: paymentSummary.agreedValue,
        balance: paymentSummary.projectBalance ?? 0,
        timestamp: toTimestamp(project.updatedAt || project.updated_at || project.createdAt || project.created_at),
        source: project,
      }
    })
    .sort((left, right) => right.timestamp - left.timestamp), [archivedProjectIds, clients, contracts, estimates, invoices, leads, payments, projects, scheduleEvents, t])

  const activeProjectIds = useMemo(() => new Set(selectDashboardActiveProjects({ projects, leads, contracts, payments, events: scheduleEvents, archivedProjectIds }).map((project) => project.dashboardProjectId)), [archivedProjectIds, contracts, leads, payments, projects, scheduleEvents])
  const activeProjects = dashboardProjectRecords.filter((project) => activeProjectIds.has(project.id)).slice(0, 4)
  const financialSnapshotMetrics = useMemo(() => {
    const summaries = dashboardProjectRecords.map((project) => getDashboardProjectFinancialSummary(project.source || project, { estimates, contracts, invoices, payments }))
    return [
      { label: t('paymentsReceived'), value: summaries.reduce((sum, summary) => sum + (summary.totalProjectPaid || 0), 0) },
      { label: t('projectBalance'), value: summaries.reduce((sum, summary) => sum + (summary.projectBalance || 0), 0) },
      { label: t('invoiceOutstanding'), value: calculateOutstandingInvoiceBalance(invoices) },
    ]
  }, [contracts, dashboardProjectRecords, estimates, invoices, payments, t])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 overflow-x-hidden">
      <section className="rounded-[1.75rem] border border-slate-800 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">{t('dashboard')}</p>
        <h1 className="mt-2 break-words text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{t('welcomeBack', { name: firstName })}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{t('dashboardWorkspaceHelp')}</p>
      </section>

      <section aria-labelledby="dashboard-quick-actions-title">
        <h2 id="dashboard-quick-actions-title" className="text-lg font-bold text-slate-950 sm:text-xl">{t('quickActions')}</h2>
        <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-4">
          <QuickAction icon={UserRoundPlus} label={t('createLead')} meta={`${t('metricNewLeads')}: ${dashboardSummary.newLeads}`} onClick={onCreateLeadClick} />
          <QuickAction icon={BriefcaseBusiness} label={t('createJob')} onClick={onCreateJob} />
          <QuickAction icon={CreditCard} label={t('recordPayment')} onClick={onRecordPayment} />
          <QuickAction icon={CalendarPlus} label={t('scheduleEvent')} onClick={onScheduleVisit} />
        </div>
      </section>

      <DashboardSection title={t('needsAttention')} icon={AlertTriangle} emphasis emptyText={t('nothingNeedsAttentionRightNow')} items={visibleNeedsAttentionItems} totalCount={needsAttentionItems.length} onToggleMore={() => setShowAllAttention((value) => !value)} showAll={showAllAttention} renderItem={(item) => <DashboardActionItem key={item.id} item={item} />} t={t} />

      <ScheduleOverviewCard todayItems={todaysScheduleItems} upcomingItems={upcomingScheduleItems} t={t} />

      <FinancialSnapshotCard metrics={financialSnapshotMetrics} t={t} />

      <ActiveProjectsCard projects={activeProjects} totalCount={activeProjectIds.size} onOpenProject={onOpenProject} onViewAll={onViewAllProjects} showFinancials={isAnalyticsMode} t={t} />

      <PipelineBoard
        leads={leads}
        statuses={leadPipelineStageOrder}
        draggedLeadId={draggedLeadId}
        setDraggedLeadId={setDraggedLeadId}
        moveLead={moveLead}
        selectedMobileStage={selectedMobileStage}
        setSelectedMobileStage={setSelectedMobileStage}
        onLeadClick={onLeadClick}
        pipelineValue={metrics.find((metric) => metric.label === t('metricRevenuePipeline'))?.value ?? 0}
        t={t}
      />

      <DashboardSection title={t('recentActivity')} icon={Sparkles} emptyText={t('noRecentActivity')} items={recentActivityItems} renderItem={(item) => <DashboardActionItem key={item.id} item={item} />} t={t} />

      {showOnboardingReminder && !isReminderDismissed ? (
        <section className="flex flex-col gap-4 rounded-3xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-label={t('onboardingReminderTitle')}>
          <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white"><Sparkles className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-950">{t('onboardingReminderTitle')}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{t('onboardingReminderBody')}</p></div></div>
          <div className="flex items-center gap-2 pl-13 sm:pl-0"><button type="button" onClick={onResumeOnboarding} className="min-h-11 flex-1 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 sm:flex-none">{t('onboardingResumeSetup')}</button><button type="button" onClick={() => setIsReminderDismissed(true)} aria-label={t('onboardingDismissReminder')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"><X className="h-4 w-4" /></button></div>
        </section>
      ) : null}
      <SampleWorkspaceGuide guide={sampleGuide} onOpenItem={onOpenSampleGuideItem} onDismiss={onDismissSampleGuide} onCreateLead={onCreateLeadClick} t={t} />
      {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{successMessage}</div> : null}
    </div>
  )
}

import { Inbox } from 'lucide-react'
import { useAnalyticsMode } from '../../contexts/SimpleModeContext'
import { SelectField } from '../ui/SelectField'
import { currency } from '../../utils/formatters'
import { getLeadDisplayValue, getLeadNextStepLabel, getLeadPipelineStage, getLeadPipelineStageLabelKey, getLeadStageLabel, getPriorityLabel } from '../../utils/leadPipeline'

const stageAccentClasses = {
  NEW_LEAD: 'border-t-blue-500',
  ESTIMATE_CREATED: 'border-t-emerald-500',
  ESTIMATE_SENT: 'border-t-violet-500',
  FOLLOW_UP: 'border-t-fuchsia-500',
  ESTIMATE_APPROVED: 'border-t-cyan-500',
  READY_FOR_JOB: 'border-t-amber-500',
  CONVERTED_TO_JOB: 'border-t-orange-500',
  LOST: 'border-t-rose-500',
  ARCHIVED: 'border-t-slate-400',
}

export function PipelineBoard({
  leads,
  statuses,
  draggedLeadId,
  setDraggedLeadId,
  moveLead,
  onLeadClick,
  selectedMobileStage,
  setSelectedMobileStage,
  t = (key) => key,
}) {
  const { isAnalyticsMode } = useAnalyticsMode()
  const selectedStageLeads = leads.filter((lead) => getLeadPipelineStage(lead) === selectedMobileStage)

  return (
    <section className="rounded-[2rem] border border-slate-200/90 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.06)] lg:p-6">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{t('leadPipeline')}</h2>
          <p className="hidden text-sm text-slate-500 lg:block">{t('dragCardsHelp')}</p>
          <p className="text-sm text-slate-500 lg:hidden">{t('chooseStageHelp')}</p>
        </div>
        <p className="text-sm font-medium text-slate-500">
          {leads.length} {isAnalyticsMode ? t('activeOpportunities') : t('leads').toLowerCase()}
        </p>
      </div>

      <div className="lg:hidden">
        <MobilePipeline
          leads={selectedStageLeads}
          statuses={statuses}
          selectedStage={selectedMobileStage}
          setSelectedStage={setSelectedMobileStage}
          moveLead={moveLead}
          onLeadClick={onLeadClick}
          t={t}
        />
      </div>

      <div className="hidden gap-4 overflow-x-auto pb-2 lg:flex">
        {statuses.map((status) => (
          <PipelineColumn
            key={status}
            status={status}
            leads={leads.filter((lead) => getLeadPipelineStage(lead) === status)}
            draggedLeadId={draggedLeadId}
            setDraggedLeadId={setDraggedLeadId}
            moveLead={moveLead}
            onLeadClick={onLeadClick}
            t={t}
          />
        ))}
      </div>
    </section>
  )
}

function MobilePipeline({ leads, statuses, selectedStage, setSelectedStage, moveLead, onLeadClick, t }) {
  const { isAnalyticsMode } = useAnalyticsMode()
  const selectedTotal = leads.reduce((sum, lead) => sum + lead.value, 0)

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <label htmlFor="mobile-stage" className="mb-2 block text-sm font-semibold text-slate-700">
        {t('pipelineStage')}
      </label>
      <SelectField
        id="mobile-stage"
        value={selectedStage}
        onChange={(event) => setSelectedStage(event.target.value)}
        className="bg-slate-50"
        containerClassName="mb-4"
      >
        {statuses.map((status) => (
          <option key={status} value={status}>
            {t(getLeadPipelineStageLabelKey(status))}
          </option>
        ))}
      </SelectField>

      <div className="mb-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
        <div>
          <h3 className="font-bold text-slate-900">{t(getLeadPipelineStageLabelKey(selectedStage))}</h3>
          <p className="text-xs text-slate-500">
            {leads.length} {t('leads').toLowerCase()}
            {isAnalyticsMode ? ` · ${currency.format(selectedTotal)}` : ''}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">{leads.length}</span>
      </div>

      <div className="space-y-3">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            statuses={statuses}
            moveLead={moveLead}
            mobile
            t={t}
            onClick={() => onLeadClick(lead.id)}
          />
        ))}

        {leads.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            {t('noLeadsInStage')}
          </div>
        )}
      </div>
    </div>
  )
}

function PipelineColumn({ status, leads, draggedLeadId, setDraggedLeadId, moveLead, onLeadClick, t }) {
  const { isAnalyticsMode } = useAnalyticsMode()
  const total = leads.reduce((sum, lead) => sum + lead.value, 0)

  return (
    <div
      className={`min-h-[440px] min-w-[290px] rounded-[1.75rem] border border-slate-200 bg-slate-50/90 p-4 shadow-sm border-t-4 ${stageAccentClasses[status] || 'border-t-slate-300'}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => {
        if (draggedLeadId) moveLead(draggedLeadId, status)
        setDraggedLeadId(null)
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900">{t(getLeadPipelineStageLabelKey(status))}</h3>
          <p className="text-xs text-slate-500">
            {leads.length} {t('leads').toLowerCase()}
            {isAnalyticsMode ? ` · ${currency.format(total)}` : ''}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">{leads.length}</span>
      </div>

      <div className="space-y-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onDragStart={() => setDraggedLeadId(lead.id)} onClick={() => onLeadClick(lead.id)} t={t} />
        ))}
        {leads.length === 0 && (
          <div className="rounded-[1.35rem] border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-400">
            <Inbox className="mx-auto mb-3 h-5 w-5 text-slate-300" />
            {t('dropLeadHere')}
          </div>
        )}
      </div>
    </div>
  )
}

function LeadCard({ lead, onDragStart, statuses = [], moveLead, mobile = false, onClick, t = (key) => key }) {
  const { isAnalyticsMode } = useAnalyticsMode()
  const priorityClasses = {
    high: 'bg-red-50 text-red-700 ring-red-100',
    medium: 'bg-amber-50 text-amber-700 ring-amber-100',
    low: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  }
  const normalizedPriority = String(lead.priority || '').trim().toLowerCase()
  const priorityClassName = priorityClasses[normalizedPriority] || 'bg-slate-100 text-slate-700 ring-slate-200'
  const leadStage = getLeadPipelineStage(lead)

  return (
    <article
      draggable={!mobile}
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onClick?.()
      }}
      role="button"
      tabIndex={0}
      aria-label={`${t('viewLead')}: ${lead.client || t('client')}`}
      className={`${mobile ? '' : 'cursor-grab active:cursor-grabbing'} rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-slate-950">{lead.client}</h4>
          <p className="text-sm text-slate-500">{getLeadDisplayValue(lead.projectType, t)}</p>
        </div>
        {isAnalyticsMode && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${priorityClassName}`}>
            {getPriorityLabel(lead.priority, t)}
          </span>
        )}
      </div>

      {isAnalyticsMode ? (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">{t('value')}</span>
            <span className="font-bold text-slate-900">{currency.format(lead.value)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">{t('location')}</span>
            <span className="font-medium text-slate-700">{getLeadDisplayValue(lead.location, t)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">{t('source')}</span>
            <span className="font-medium text-slate-700">{getLeadDisplayValue(lead.source, t)}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">{t('location')}</span>
            <span className="font-medium text-slate-700">{getLeadDisplayValue(lead.location, t)}</span>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('nextStep')}</p>
        <p className="mt-1 text-sm font-medium text-slate-700">{getLeadNextStepLabel(lead.nextStep, t, lead)}</p>
      </div>

      {mobile && (
        <div className="mt-4" onClick={(event) => event.stopPropagation()}>
          <label htmlFor={`status-${lead.id}`} className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('changeStatus')}
          </label>
          <SelectField
            id={`status-${lead.id}`}
            value={leadStage}
            onChange={(event) => moveLead(lead.id, event.target.value)}
            className="bg-white"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {getLeadStageLabel(status, t)}
              </option>
            ))}
          </SelectField>
        </div>
      )}
    </article>
  )
}

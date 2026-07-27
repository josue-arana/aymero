import { Check } from 'lucide-react'
import { leadPipelineStages } from '../../utils/leadPipeline'

const leadProgressSteps = [
  { id: 'inquiry', labelKey: 'leadProgressInquiry' },
  { id: 'estimate-sent', labelKey: 'leadProgressEstimateSent' },
  { id: 'follow-up', labelKey: 'leadProgressFollowUp' },
  { id: 'approved', labelKey: 'leadProgressApproved' },
  { id: 'converted-to-job', labelKey: 'leadProgressConvertedToJob' },
]

const progressIndexByStage = {
  [leadPipelineStages.NEW_LEAD]: 0,
  [leadPipelineStages.ESTIMATE_CREATED]: 0,
  [leadPipelineStages.ESTIMATE_SENT]: 1,
  [leadPipelineStages.FOLLOW_UP]: 2,
  [leadPipelineStages.ESTIMATE_APPROVED]: 3,
  [leadPipelineStages.READY_FOR_JOB]: 3,
  [leadPipelineStages.CONVERTED_TO_JOB]: 4,
}

export function getLeadProgressIndex(stage) {
  return progressIndexByStage[stage] ?? -1
}

export function getLeadProgressStageLabelKey(stage) {
  const index = getLeadProgressIndex(stage)
  return index >= 0 ? leadProgressSteps[index].labelKey : null
}

export function LeadProgress({ currentStage, t }) {
  const currentIndex = getLeadProgressIndex(currentStage)

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="lead-progress-title">
      <div className="mb-4 sm:mb-5">
        <h2 id="lead-progress-title" className="text-lg font-bold text-slate-950 sm:text-xl">{t('leadProgress')}</h2>
        <p className="mt-1.5 text-sm leading-5 text-slate-500">{t('leadProgressHelp')}</p>
      </div>

      <ol className="grid grid-cols-5" aria-label={t('leadProgress')}>
        {leadProgressSteps.map((step, index) => {
          const state = currentIndex < 0
            ? 'upcoming'
            : index < currentIndex
              ? 'completed'
              : index === currentIndex
                ? 'current'
                : 'upcoming'
          const isCompleted = state === 'completed'
          const isCurrent = state === 'current'
          const stateLabel = t(
            isCompleted
              ? 'leadProgressCompleted'
              : isCurrent
                ? 'leadProgressCurrent'
                : 'leadProgressUpcoming'
          )

          return (
            <li key={step.id} className="min-w-0 text-center" aria-current={isCurrent ? 'step' : undefined}>
              <div className="relative flex h-9 items-center justify-center sm:h-10">
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2 transition-colors duration-500 ${index <= currentIndex ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  />
                )}
                {index < leadProgressSteps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2 transition-colors duration-500 ${index < currentIndex ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold shadow-sm transition-all duration-500 sm:h-9 sm:w-9 sm:text-xs ${
                    isCompleted
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isCurrent
                        ? 'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={3} /> : index + 1}
                </span>
              </div>
              <span className={`mx-auto mt-2.5 flex min-h-8 max-w-28 items-start justify-center break-words px-0.5 text-[11px] font-bold leading-tight sm:min-h-9 sm:text-xs ${
                isCompleted
                  ? 'text-emerald-700'
                  : isCurrent
                    ? 'text-blue-700'
                    : 'text-slate-400'
              }`}>
                {t(step.labelKey)}
              </span>
              <span className="sr-only"> — {stateLabel}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default LeadProgress

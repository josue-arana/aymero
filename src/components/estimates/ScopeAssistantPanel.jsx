import { CheckCircle2, FilePenLine, Languages, RotateCcw } from 'lucide-react'
import { EstimateFormattedText } from './EstimateFormattedText'
import { LightweightFormattedTextarea } from './LightweightFormattedTextarea'
import {
  SCOPE_ASSISTANT_SEND_REASON,
  SCOPE_ASSISTANT_STATUS,
} from '../../utils/scopeAssistantState'
import { hasMeaningfulEstimateFormattedText } from '../../utils/estimateDocument'

const primaryButtonClasses = 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto'
const secondaryButtonClasses = 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto'

function languageName(language, t) {
  return t(language === 'es' ? 'spanish' : 'english')
}

function VersionLabel({ title, language, status, t }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-bold text-slate-900">{title}</p>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        {languageName(language, t)} · {status}
      </p>
    </div>
  )
}

export function ScopeAssistantPanel({
  t,
  isEditing,
  isEnabled,
  state,
  canonicalScope,
  readiness,
  readinessMessage = '',
  errorMessage = '',
  isImproving = false,
  isRegenerating = false,
  isApproving = false,
  isTranslating = false,
  isAccepting = false,
  onManualScopeChange,
  onRawSourceChange,
  onImprove,
  onCandidateChange,
  onRegenerate,
  onApprove,
  onTranslate,
  onClientScopeChange,
  onUseClientVersion,
}) {
  const isManual = !state?.version
  const hasCandidate = Boolean(state?.contractorDraft)
  const approvalCurrent = state?.approvalStatus === SCOPE_ASSISTANT_STATUS.APPROVED
    && ![
      SCOPE_ASSISTANT_SEND_REASON.APPROVAL_REQUIRED,
      SCOPE_ASSISTANT_SEND_REASON.APPROVAL_STALE,
    ].includes(readiness?.reason)
  const approvalStale = state?.approvalStatus === SCOPE_ASSISTANT_STATUS.STALE
  const translationRequired = Boolean(
    state?.contractorLanguage
    && state?.clientLanguage
    && state.contractorLanguage !== state.clientLanguage
  )
  const translationCurrent = state?.translationStatus === SCOPE_ASSISTANT_STATUS.CURRENT
    && ![
      SCOPE_ASSISTANT_SEND_REASON.APPROVAL_REQUIRED,
      SCOPE_ASSISTANT_SEND_REASON.APPROVAL_STALE,
      SCOPE_ASSISTANT_SEND_REASON.TRANSLATION_REQUIRED,
      SCOPE_ASSISTANT_SEND_REASON.TRANSLATION_STALE,
    ].includes(readiness?.reason)
  const actionPending = isImproving || isRegenerating || isApproving || isTranslating || isAccepting

  if (isManual) {
    return (
      <div className="space-y-3">
        {isEditing ? (
          <LightweightFormattedTextarea
            value={canonicalScope}
            onChange={onManualScopeChange}
            rows={8}
            minHeight={192}
            maxHeight={560}
            ariaLabel={t('scopeOfWork')}
            t={t}
            className="p-4 text-sm leading-6"
          />
        ) : hasMeaningfulEstimateFormattedText(canonicalScope) ? (
          <EstimateFormattedText value={canonicalScope} className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700" />
        ) : null}
        {isEditing && isEnabled ? (
          <div className="flex justify-end">
            <button type="button" disabled={actionPending || !canonicalScope.trim()} onClick={onImprove} className={primaryButtonClasses}>
              <FilePenLine aria-hidden="true" className="h-4 w-4" />
              {isImproving ? t('scopeAssistantImproving') : t('scopeAssistantImprove')}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      {readiness && !readiness.ready && readinessMessage ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-900">
          {readinessMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {t('scopeAssistantViewOriginal')}
        </summary>
        <div className="mt-3 border-t border-slate-200 pt-3">
          {!hasCandidate && isEditing ? (
            <LightweightFormattedTextarea
              value={state.rawContractorInput}
              onChange={onRawSourceChange}
              rows={5}
              minHeight={144}
              maxHeight={420}
              ariaLabel={t('scopeAssistantOriginalNotes')}
              t={t}
              className="p-4 text-sm leading-6"
            />
          ) : (
            <EstimateFormattedText value={state.rawContractorInput} className="text-sm leading-6 text-slate-700" />
          )}
        </div>
      </details>

      {hasCandidate ? (
        <section aria-labelledby="scope-assistant-candidate-title" className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
          <VersionLabel
            title={<span id="scope-assistant-candidate-title">{t('scopeAssistantSuggestedScope')}</span>}
            language={state.contractorLanguage}
            status={approvalCurrent ? t('scopeAssistantApproved') : approvalStale ? t('scopeAssistantNeedsApproval') : t('scopeAssistantReviewRequired')}
            t={t}
          />
          {isEditing ? (
            <LightweightFormattedTextarea
              value={state.contractorDraft}
              onChange={onCandidateChange}
              rows={8}
              minHeight={192}
              maxHeight={560}
              ariaLabel={t('scopeAssistantSuggestedScope')}
              t={t}
              className="p-4 text-sm leading-6"
            />
          ) : (
            <EstimateFormattedText value={state.contractorDraft} className="rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700" />
          )}
          {state.reviewWarnings?.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p className="font-bold">{t('scopeAssistantReviewWarnings')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {state.reviewWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
          {approvalStale && state.approvedContractorScope ? (
            <details className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                {t('scopeAssistantViewLastApproved')}
              </summary>
              <EstimateFormattedText value={state.approvedContractorScope} className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-700" />
            </details>
          ) : null}
          {isEditing && isEnabled ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" disabled={actionPending} onClick={onRegenerate} className={secondaryButtonClasses}>
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                {isRegenerating ? t('scopeAssistantImproving') : t('scopeAssistantRegenerate')}
              </button>
              {!approvalCurrent ? (
                <button type="button" disabled={actionPending || !state.contractorDraft.trim()} onClick={onApprove} className={primaryButtonClasses}>
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  {isApproving ? t('scopeAssistantApproving') : t('scopeAssistantApprove')}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : isEditing && isEnabled ? (
        <button type="button" disabled={actionPending || !state.rawContractorInput.trim()} onClick={onImprove} className={primaryButtonClasses}>
          <FilePenLine aria-hidden="true" className="h-4 w-4" />
          {isImproving ? t('scopeAssistantImproving') : t('scopeAssistantRetryImprove')}
        </button>
      ) : null}

      {approvalCurrent && translationRequired ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <section className="min-w-0 space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <VersionLabel title={t('scopeAssistantContractorVersion')} language={state.contractorLanguage} status={t('scopeAssistantApproved')} t={t} />
            <EstimateFormattedText value={state.approvedContractorScope} className="rounded-xl bg-white p-3 text-sm leading-6 text-slate-700" />
          </section>
          <section className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <VersionLabel
              title={t('scopeAssistantClientVersion')}
              language={state.clientLanguage}
              status={translationCurrent
                ? t(state.clientScopeManuallyEdited ? 'scopeAssistantManuallyEdited' : 'scopeAssistantTranslated')
                : t('scopeAssistantNotTranslated')}
              t={t}
            />
            {translationCurrent && state.clientScope ? (
              isEditing ? (
                <LightweightFormattedTextarea
                  value={state.clientScope}
                  onChange={onClientScopeChange}
                  rows={8}
                  minHeight={192}
                  maxHeight={560}
                  ariaLabel={t('scopeAssistantClientVersion')}
                  t={t}
                  className="p-4 text-sm leading-6"
                />
              ) : (
                <EstimateFormattedText value={state.clientScope} className="rounded-xl bg-white p-3 text-sm leading-6 text-slate-700" />
              )
            ) : (
              <p className="rounded-xl bg-white px-3 py-4 text-sm leading-6 text-slate-500">{t('scopeAssistantTranslationNeeded')}</p>
            )}
            {isEditing && isEnabled ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button type="button" disabled={actionPending} onClick={onTranslate} className={secondaryButtonClasses}>
                  <Languages aria-hidden="true" className="h-4 w-4" />
                  {isTranslating ? t('scopeAssistantTranslating') : t(translationCurrent ? 'scopeAssistantRetranslate' : 'scopeAssistantTranslate')}
                </button>
                {translationCurrent ? (
                  <button type="button" disabled={actionPending || !state.clientScope.trim()} onClick={onUseClientVersion} className={primaryButtonClasses}>
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                    {isAccepting ? t('scopeAssistantUsingClientVersion') : t('scopeAssistantUseClientVersion')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {approvalCurrent && !translationRequired && readiness?.ready ? (
        <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {t('scopeAssistantSameLanguageReady')}
        </div>
      ) : null}
    </div>
  )
}

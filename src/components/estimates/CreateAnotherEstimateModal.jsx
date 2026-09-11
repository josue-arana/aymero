import { useEffect, useState } from 'react'
import { ModalShell } from '../common/ModalShell'

function normalizeOptionalName(value) {
  const normalized = String(value || '').trim()
  return normalized || ''
}

export function CreateAnotherEstimateModal({
  isOpen,
  existingEstimateCount = 1,
  currentEstimateName = '',
  isSubmitting = false,
  onClose,
  onSubmit,
  t,
}) {
  const [currentName, setCurrentName] = useState('')
  const [newName, setNewName] = useState('')
  const hasSingleExistingEstimate = existingEstimateCount === 1

  useEffect(() => {
    if (!isOpen) return
    setCurrentName(normalizeOptionalName(currentEstimateName))
    setNewName('')
  }, [currentEstimateName, isOpen])

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit?.({
      currentEstimateName: hasSingleExistingEstimate ? normalizeOptionalName(currentName) : '',
      newEstimateName: normalizeOptionalName(newName),
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onBackdropClick={isSubmitting ? undefined : onClose}
      ariaLabelledBy="create-another-estimate-title"
      ariaDescribedBy="create-another-estimate-help"
      panelClassName="sm:max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <h2 id="create-another-estimate-title" className="text-xl font-bold text-slate-950">{t('createAnotherEstimate')}</h2>
          <p id="create-another-estimate-help" className="mt-2 text-sm leading-6 text-slate-600">{t('createAnotherEstimateHelp')}</p>
        </div>

        <div className="space-y-4">
          {hasSingleExistingEstimate ? (
            <label className="block space-y-2">
              <span className="block text-sm font-bold text-slate-800">{t('currentEstimateName')}</span>
              <input
                value={currentName}
                onChange={(event) => setCurrentName(event.target.value)}
                disabled={isSubmitting}
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                autoComplete="off"
              />
            </label>
          ) : null}
          <label className="block space-y-2">
            <span className="block text-sm font-bold text-slate-800">{t('newEstimateName')}</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              disabled={isSubmitting}
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
              autoComplete="off"
              autoFocus={!hasSingleExistingEstimate}
            />
          </label>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            {t('cancel')}
          </button>
          <button type="submit" disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? t('saving') : t('createEstimate')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

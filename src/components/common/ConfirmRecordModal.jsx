import { useEffect, useRef, useState } from 'react'
import { ModalShell } from './ModalShell'
import { LoadingButton } from './LoadingButton'

export function ConfirmRecordModal({ isOpen, mode = 'archive', title, message, confirmLabel, submittingLabel, cancelLabel, onCancel, onConfirm, t }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitGuardRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false)
      submitGuardRef.current = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const isDelete = mode === 'delete'

  async function handleConfirm() {
    if (submitGuardRef.current) {
      return
    }

    submitGuardRef.current = true
    setIsSubmitting(true)

    try {
      await onConfirm?.()
    } finally {
      submitGuardRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={isSubmitting ? undefined : onCancel} panelClassName="max-w-md">
      <div className={`mb-4 rounded-2xl p-4 ${isDelete ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm leading-6">{message}</p>
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" disabled={isSubmitting} onClick={onCancel} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
          {cancelLabel || t('cancel')}
        </button>
        <LoadingButton
          loading={isSubmitting}
          loadingLabel={submittingLabel || t('saving')}
          onClick={handleConfirm}
          className={`rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${isDelete ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400' : 'bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400'}`}
        >
          {confirmLabel}
        </LoadingButton>
      </div>
    </ModalShell>
  )
}

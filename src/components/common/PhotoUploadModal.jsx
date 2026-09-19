import { useEffect, useState } from 'react'
import { ImagePlus, Upload, X } from 'lucide-react'
import { ModalShell } from './ModalShell'
import { LoadingButton } from './LoadingButton'

const ACCEPTED_PROJECT_PHOTO_TYPES = '.jpg,.jpeg,.png,.webp'

export function PhotoUploadModal({ isOpen, isSaving = false, onClose, onSave, t }) {
  const [files, setFiles] = useState([])
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setFiles([])
      setDescription('')
    }
  }, [isOpen])

  if (!isOpen) return null

  function updateFiles(nextFiles) {
    setFiles(Array.from(nextFiles || []))
  }

  async function submit(event) {
    event.preventDefault()

    if (!files.length || isSaving) {
      return
    }

    const didSave = await onSave?.({
      files,
      description,
    })

    if (didSave !== false) {
      onClose()
    }
  }

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={isSaving ? undefined : onClose} panelClassName="sm:max-w-2xl">
      <form onSubmit={submit}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">{t('uploadPhotos')}</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{t('uploadProjectPhotos')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('uploadProjectPhotosHelp')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-blue-300 hover:bg-blue-50/40">
          <input
            type="file"
            accept={ACCEPTED_PROJECT_PHOTO_TYPES}
            multiple
            onChange={(event) => updateFiles(event.target.files)}
            className="sr-only"
            disabled={isSaving}
          />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
            <Upload className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-900">{t('choosePhotos')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('choosePhotosHelp')}</p>
        </label>

        <label className="mt-4 block text-sm font-bold text-slate-700">
          {t('photoNotes')}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder={t('photoNotesPlaceholder')}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500"
            disabled={isSaving}
          />
        </label>

        <div className="mt-4 space-y-3">
          {files.length > 0 ? files.map((file) => (
            <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB</p>
              </div>
              <ImagePlus className="h-5 w-5 shrink-0 text-slate-400" />
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              {t('noPhotosSelected')}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('cancel')}
          </button>
          <LoadingButton
            loading={isSaving}
            loadingLabel={t('saving')}
            type="submit"
            disabled={!files.length}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t('savePhotos')}
          </LoadingButton>
        </div>
      </form>
    </ModalShell>
  )
}

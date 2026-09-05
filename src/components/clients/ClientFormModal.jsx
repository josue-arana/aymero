import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { buildLanguageOptions, normalizeSupportedLanguage, resolvePreferredClientLanguage } from '../../utils/language'
import { readClientNotesForForm } from '../../utils/clients'
import { isValidOptionalEmail, normalizeOptionalEmail } from '../../utils/email'

const emptyClient = {
  name: '',
  phone: '',
  email: '',
  address: '',
  preferredLanguage: '',
  notes: '',
}

export function ClientFormModal({ isOpen, mode = 'create', client, defaultPreferredLanguage = 'en', onClose, onSave, t }) {
  const [form, setForm] = useState(emptyClient)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState('')
  const submitGuardRef = useRef(false)
  const languageOptions = buildLanguageOptions(t)

  useEffect(() => {
    if (!isOpen) return
    setIsSubmitting(false)
    setValidationError('')
    submitGuardRef.current = false
    setForm(client
      ? {
          ...emptyClient,
          ...client,
          email: normalizeOptionalEmail(client.email),
          notes: readClientNotesForForm(client.notes),
          preferredLanguage: resolvePreferredClientLanguage({
            client,
            userLanguage: defaultPreferredLanguage,
          }),
        }
      : {
          ...emptyClient,
          preferredLanguage: normalizeSupportedLanguage(defaultPreferredLanguage, 'en'),
        })
  }, [client, defaultPreferredLanguage, isOpen])

  if (!isOpen) return null

  function updateField(field, value) {
    setValidationError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (submitGuardRef.current) {
      return
    }

    const normalizedEmail = normalizeOptionalEmail(form.email)
    if (!isValidOptionalEmail(normalizedEmail)) {
      setValidationError(t('invalidEmail'))
      return
    }

    submitGuardRef.current = true
    setIsSubmitting(true)

    try {
      await onSave?.({
        ...form,
        email: normalizedEmail,
        name: form.name.trim() || t('newClientFallback'),
        preferredLanguage: normalizeSupportedLanguage(form.preferredLanguage, defaultPreferredLanguage),
      })
    } finally {
      submitGuardRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={isSubmitting ? undefined : onClose} panelClassName="max-w-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600">{t('clients')}</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{mode === 'edit' ? t('editClient') : t('createClient')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('clientFormHelp')}</p>
          </div>
          <button disabled={isSubmitting} onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" aria-label={t('close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          <section className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('customerName')} value={form.name} onChange={(value) => updateField('name', value)} required />
            <TextField label={t('phone')} value={form.phone} onChange={(value) => updateField('phone', value)} />
            <TextField label={t('email')} value={form.email} onChange={(value) => updateField('email', value)} type="email" />
            <TextField label={t('address')} value={form.address} onChange={(value) => updateField('address', value)} />
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-bold text-slate-700">{t('clientLanguage')}</span>
              <p className="mb-3 text-xs text-slate-500">{t('clientLanguageHelp')}</p>
              <select
                value={normalizeSupportedLanguage(form.preferredLanguage, defaultPreferredLanguage)}
                onChange={(event) => updateField('preferredLanguage', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </section>
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">{t('notes')}</label>
            <textarea
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder={t('clientNotesPlaceholder')}
            />
          </div>
          {validationError ? <p className="text-sm font-medium text-red-600" role="alert">{validationError}</p> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('cancel')}</button>
            <button type="submit" disabled={isSubmitting} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400">{isSubmitting ? t('saving') : mode === 'edit' ? t('saveChanges') : t('saveClient')}</button>
          </div>
        </form>
    </ModalShell>
  )
}

function TextField({ label, value, onChange, type = 'text', required = false }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  )
}

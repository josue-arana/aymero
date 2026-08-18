import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { SelectField } from '../ui/SelectField'
import { tStatus } from '../../translations'

const emptyJob = {
  client: '',
  address: '',
  location: '',
  projectTitle: '',
  projectType: '',
  customProjectType: '',
  projectStatus: 'Scheduled',
  startDate: '',
  value: '',
  notes: '',
}

const projectTypes = [
  'Kitchen Remodeling',
  'Bathroom Remodeling',
  'Basement Full Renovation',
  'Deck Renovation',
  'Roof Replacement',
  'Interior Painting',
  'Exterior Painting',
  'Other',
]

const jobStatuses = [
  'Signed',
  'Scheduled',
  'In Progress',
  'Waiting on Client',
  'Waiting on Materials',
  'Ready for Final Walkthrough',
  'Completed',
  'Paid',
]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeValue(value) {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function JobFormModal({ isOpen, mode = 'create', project = null, clients = [], initialClientId = '', initialClient = null, onClose, onSave, t }) {
  const [form, setForm] = useState(emptyJob)
  const [clientMode, setClientMode] = useState('existing')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitGuardRef = useRef(false)

  const sortedClients = useMemo(() => [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [clients])

  useEffect(() => {
    if (!isOpen) return

    const editingProject = mode === 'edit' ? project : null
    const projectClientId = editingProject?.clientId || editingProject?.client_id || initialClientId
    const matchedClient = sortedClients.find((client) => client.id === projectClientId)
      || initialClient
      || null
    const hasMatchedExistingClient = matchedClient && sortedClients.some((client) => client.id === matchedClient.id)
    const nextClientMode = hasMatchedExistingClient
      ? 'existing'
      : matchedClient
        ? 'new'
        : sortedClients.length
        ? 'existing'
        : 'new'
    const nextSelectedClientId = hasMatchedExistingClient ? matchedClient.id : sortedClients[0]?.id || ''

    setClientMode(nextClientMode)
    setSelectedClientId(nextSelectedClientId)
    setIsSubmitting(false)
    submitGuardRef.current = false
    const editingProjectType = editingProject?.projectType || editingProject?.jobType || ''
    const hasCustomProjectType = Boolean(editingProjectType && !projectTypes.includes(editingProjectType))

    setForm(editingProject ? {
      ...emptyJob,
      client: editingProject.client || editingProject.clientName || matchedClient?.name || '',
      address: editingProject.address || editingProject.location || matchedClient?.address || '',
      location: editingProject.location || editingProject.address || matchedClient?.address || '',
      projectTitle: editingProject.projectTitle || editingProject.title || '',
      projectType: hasCustomProjectType ? 'Other' : editingProjectType,
      customProjectType: hasCustomProjectType ? editingProjectType : '',
      projectStatus: editingProject.projectStatus || editingProject.status || emptyJob.projectStatus,
      startDate: editingProject.startDate || editingProject.start_date || '',
      value: editingProject.value ?? editingProject.estimatedValue ?? editingProject.contractValue ?? '',
      notes: editingProject.notes || editingProject.nextStep || '',
    } : {
      ...emptyJob,
      client: matchedClient?.name || '',
      address: matchedClient?.address || '',
      location: matchedClient?.address || '',
      startDate: todayIso(),
    })
  }, [initialClient, initialClientId, isOpen, mode, project, sortedClients])

  useEffect(() => {
    if (!isOpen || clientMode !== 'existing' || !selectedClientId) return

    const selectedClient = sortedClients.find((client) => client.id === selectedClientId)
    if (!selectedClient) return

    setForm((current) => ({
      ...current,
      client: selectedClient.name || current.client,
      address: selectedClient.address || current.address,
      location: selectedClient.address || current.location,
    }))
  }, [clientMode, isOpen, selectedClientId, sortedClients])

  function clearClientFields() {
    setForm((current) => ({
      ...current,
      client: '',
      address: '',
      location: '',
    }))
  }

  function handleClientModeChange(nextMode) {
    if (nextMode === clientMode) return

    setClientMode(nextMode)
    setSelectedClientId('')

    if (nextMode === 'new') {
      clearClientFields()
      return
    }

    setForm((current) => ({
      ...current,
      client: '',
      address: '',
      location: '',
    }))
  }

  function handleSelectedClientChange(nextClientId) {
    setSelectedClientId(nextClientId)

    if (!nextClientId) {
      clearClientFields()
    }
  }

  if (!isOpen) return null

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (submitGuardRef.current) {
      return
    }

    const selectedClient = clientMode === 'existing'
      ? sortedClients.find((client) => client.id === selectedClientId)
      : null
    const trimmedClientName = form.client.trim() || selectedClient?.name || t('newClientFallback')
    const selectedProjectType = form.projectType.trim()
    const projectType = selectedProjectType === 'Other'
      ? form.customProjectType.trim() || form.projectTitle.trim() || t('projectJob')
      : selectedProjectType || form.projectTitle.trim() || t('projectJob')
    const projectTitle = form.projectTitle.trim() || projectType
    const address = form.address.trim() || form.location.trim() || selectedClient?.address || ''

    submitGuardRef.current = true
    setIsSubmitting(true)

    try {
      await onSave?.({
        client: trimmedClientName,
        clientId: selectedClient?.id || '',
        phone: selectedClient?.phone || '',
        email: selectedClient?.email || '',
        address,
        location: form.location.trim() || address,
        projectTitle,
        projectType,
        ...(mode === 'create' ? { projectStatus: form.projectStatus, status: 'Won' } : {}),
        startDate: form.startDate || todayIso(),
        value: normalizeValue(form.value),
        notes: form.notes.trim(),
        nextStep: form.notes.trim() || t('jobReadyToManage'),
        source: 'Direct Job',
      })
    } finally {
      submitGuardRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={isSubmitting ? undefined : onClose} panelClassName="sm:max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600">{t('projectJob')}</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">{t(mode === 'edit' ? 'editProject' : 'createJob')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t(mode === 'edit' ? 'editProjectHelp' : 'jobFormHelp')}</p>
        </div>
        <button disabled={isSubmitting} onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" aria-label={t('close')}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {sortedClients.length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <label className="mb-2 block text-sm font-bold text-slate-700">{t('client')}</label>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <SelectField value={clientMode} onChange={(event) => handleClientModeChange(event.target.value)} className="bg-white">
                <option value="existing">{t('existingClient')}</option>
                <option value="new">{t('newClient')}</option>
              </SelectField>
              {clientMode === 'existing' && (
                <SelectField value={selectedClientId} onChange={(event) => handleSelectedClientChange(event.target.value)} className="bg-white">
                  <option value="">{t('selectClient')}</option>
                  {sortedClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </SelectField>
              )}
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('client')} value={form.client} onChange={(value) => updateField('client', value)} required />
          <TextField label={t('jobTitle')} value={form.projectTitle} onChange={(value) => updateField('projectTitle', value)} required />
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">{t('jobType')}</label>
            <SelectField value={form.projectType} onChange={(event) => updateField('projectType', event.target.value)}>
              <option value="">{t('selectProjectType')}</option>
              {projectTypes.map((type) => <option key={type} value={type}>{t(type)}</option>)}
            </SelectField>
            {form.projectType === 'Other' ? (
              <div className="mt-3">
                <TextField
                  label={t('customJobType')}
                  value={form.customProjectType}
                  onChange={(value) => updateField('customProjectType', value)}
                  placeholder={t('customJobTypePlaceholder')}
                  required
                />
              </div>
            ) : null}
          </div>
          {mode === 'create' ? <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">{t('status')}</label>
            <SelectField value={form.projectStatus} onChange={(event) => updateField('projectStatus', event.target.value)}>
              {jobStatuses.map((status) => <option key={status} value={status}>{tStatus(t, status)}</option>)}
            </SelectField>
          </div> : null}
          <TextField label={t('startDate')} value={form.startDate} onChange={(value) => updateField('startDate', value)} type="date" />
          <TextField label={t('estimatedValue')} value={form.value} onChange={(value) => updateField('value', value)} type="number" />
          <TextField label={t('locationAddress')} value={form.address} onChange={(value) => updateField('address', value)} />
          <TextField label={t('location')} value={form.location} onChange={(value) => updateField('location', value)} />
        </section>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">{t('notes')}</label>
          <textarea
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            placeholder={t('jobNotesPlaceholder')}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('cancel')}</button>
          <button type="submit" disabled={isSubmitting} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400">{isSubmitting ? t('saving') : t(mode === 'edit' ? 'saveChanges' : 'createJob')}</button>
        </div>
      </form>
    </ModalShell>
  )
}

function TextField({ label, value, onChange, type = 'text', placeholder = '', required = false }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  )
}

export default JobFormModal

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { SelectField } from '../ui/SelectField'
import { ModalShell } from '../common/ModalShell'
import { tStatus } from '../../translations'

const eventTypes = [
  'Site Visit',
  'Project Start',
  'Payment Due',
  'Material Delivery',
  'Inspection',
  'Final Walkthrough',
  'Other',
]

const reminderOptions = [
  { value: 'none', labelKey: 'reminderNone' },
  { value: '15', labelKey: 'reminder15Minutes' },
  { value: '60', labelKey: 'reminder1Hour' },
  { value: '1440', labelKey: 'reminder1Day' },
]

const emptyAutoState = {
  generatedTitle: '',
  titleManuallyEdited: false,
  generatedLocation: '',
  locationManuallyEdited: false,
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function matchesLeadRecord(lead, value) {
  return lead.id === value || lead.projectId === value || lead.project_id === value
}

function parseTimeToMinutes(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null

  const [hours, minutes] = value.split(':').map(Number)
  return (hours * 60) + minutes
}

function addHourToTime(value) {
  const totalMinutes = parseTimeToMinutes(value)

  if (totalMinutes === null) return '10:00'

  const normalizedMinutes = (totalMinutes + 60) % (24 * 60)
  const hours = String(Math.floor(normalizedMinutes / 60)).padStart(2, '0')
  const minutes = String(normalizedMinutes % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

function getLeadDisplayName(lead, t) {
  return lead?.client || lead?.clientName || t('unknownClient')
}

function getLeadProjectTitle(lead, t) {
  return lead?.projectTitle || lead?.projectType || t('unknownProject')
}

function getLeadLocation(lead) {
  return lead?.address || lead?.location || ''
}

function buildEventTitle({ eventType, client, project, t }) {
  const eventTypeLabel = tStatus(t, eventType || 'Other')
  if (project) return `${project} ${eventTypeLabel}`.trim()
  if (client) return `${client} ${eventTypeLabel}`.trim()
  return eventTypeLabel
}

export function ScheduleEventModal({ isOpen, leads = [], projects = [], clients = [], initialLeadId = '', initialProjectId = '', context = 'event', editingEvent = null, onClose, onSave, t }) {
  const dateRef = useRef(null)
  const isSubmittingRef = useRef(false)
  const [autoState, setAutoState] = useState(emptyAutoState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const scheduleRecords = useMemo(() => {
    const projectRecords = projects.map((project) => {
      const clientId = project?.clientId || project?.client_id || ''
      const client = clients.find((candidate) => candidate.id === clientId)

      return {
        ...project,
        id: project.id || project.projectId || project.project_id,
        projectId: project.id || project.projectId || project.project_id,
        leadId: project.leadId || project.lead_id || null,
        client: project.client || project.clientName || client?.displayName || client?.name || '',
        clientName: project.clientName || project.client || client?.displayName || client?.name || '',
        __relationshipType: 'project',
      }
    })
    const projectIds = new Set(projectRecords.flatMap((project) => [project.id, project.projectId, project.project_id]).filter(Boolean))
    const leadRecords = leads
      .filter((lead) => !projectIds.has(lead.projectId || lead.project_id))
      .map((lead) => ({ ...lead, leadId: lead.id, __relationshipType: 'lead' }))

    return [...projectRecords, ...leadRecords]
  }, [clients, leads, projects])
  const initialRelationshipId = initialProjectId || initialLeadId
  const defaultLead = useMemo(() => scheduleRecords.find((lead) => matchesLeadRecord(lead, initialRelationshipId)) || scheduleRecords[0], [initialRelationshipId, scheduleRecords])
  const buildDefaultForm = () => {
    const baseLead = editingEvent
      ? scheduleRecords.find((lead) => matchesLeadRecord(lead, editingEvent.projectId || editingEvent.leadId))
      : defaultLead
    const clientName = getLeadDisplayName(baseLead, t)
    const projectTitle = getLeadProjectTitle(baseLead, t)
    const generatedTitle = buildEventTitle({
      eventType: editingEvent?.type || 'Site Visit',
      client: clientName,
      project: projectTitle,
      t,
    })
    const generatedLocation = editingEvent?.location || getLeadLocation(baseLead)

    if (editingEvent) {
      return {
        title: editingEvent.title || generatedTitle,
        type: editingEvent.type || 'Site Visit',
        leadId: editingEvent.projectId || editingEvent.project_id || editingEvent.leadId || editingEvent.lead_id || baseLead?.id || defaultLead?.id || '',
        date: editingEvent.date || todayIso(),
        startTime: editingEvent.startTime || '09:00',
        endTime: editingEvent.endTime || '10:00',
        location: generatedLocation || '',
        notes: editingEvent.notes || '',
        reminder: editingEvent.reminder || 'none',
      }
    }

    return {
      title: generatedTitle,
      type: 'Site Visit',
      leadId: baseLead?.id || defaultLead?.id || '',
      date: todayIso(),
      startTime: '09:00',
      endTime: '10:00',
      location: generatedLocation || '',
      notes: '',
      reminder: 'none',
    }
  }

  const [form, setForm] = useState(buildDefaultForm)

  useEffect(() => {
    if (!isOpen) return

    const nextForm = buildDefaultForm()
    const matchedLead = scheduleRecords.find((lead) => matchesLeadRecord(lead, nextForm.leadId))
    const generatedTitle = buildEventTitle({
      eventType: nextForm.type,
      client: matchedLead ? getLeadDisplayName(matchedLead, t) : '',
      project: matchedLead ? getLeadProjectTitle(matchedLead, t) : '',
      t,
    })
    const generatedLocation = getLeadLocation(matchedLead) || nextForm.location || ''

    setForm(nextForm)
    setAutoState({
      generatedTitle,
      titleManuallyEdited: Boolean(editingEvent?.title && editingEvent.title !== generatedTitle),
      generatedLocation,
      locationManuallyEdited: Boolean(editingEvent?.location && editingEvent.location !== generatedLocation),
    })
  }, [editingEvent, initialRelationshipId, isOpen, scheduleRecords, t])

  useEffect(() => {
    if (isOpen) return

    isSubmittingRef.current = false
    setIsSubmitting(false)
  }, [isOpen])

  const selectedLead = scheduleRecords.find((lead) => matchesLeadRecord(lead, form.leadId))
  const filteredLeads = (() => {
    if (!selectedLead?.client) return scheduleRecords
    return scheduleRecords.filter((lead) => getLeadDisplayName(lead, t) === getLeadDisplayName(selectedLead, t))
  })()

  if (!isOpen) return null

  function updateField(field, value) {
    if (field === 'startTime') {
      setForm((current) => {
        const previousStartTime = current.startTime
        const shouldAutoAdjustEndTime = !current.endTime
          || current.endTime <= previousStartTime
          || current.endTime <= value

        return {
          ...current,
          startTime: value,
          endTime: shouldAutoAdjustEndTime ? addHourToTime(value) : current.endTime,
        }
      })
      return
    }

    if (field === 'endTime') {
      setForm((current) => ({
        ...current,
        endTime: !value || value <= current.startTime ? addHourToTime(current.startTime) : value,
      }))
      return
    }

    if (field === 'title') {
      setForm((current) => ({
        ...current,
        title: value,
      }))
      setAutoState((current) => ({
        ...current,
        titleManuallyEdited: value !== current.generatedTitle,
      }))
      return
    }

    if (field === 'location') {
      setForm((current) => ({
        ...current,
        location: value,
      }))
      setAutoState((current) => ({
        ...current,
        locationManuallyEdited: value !== current.generatedLocation,
      }))
      return
    }

    if (field === 'leadId') {
      const nextLead = scheduleRecords.find((lead) => matchesLeadRecord(lead, value))
      const generatedTitle = buildEventTitle({
        eventType: form.type,
        client: nextLead ? getLeadDisplayName(nextLead, t) : '',
        project: nextLead ? getLeadProjectTitle(nextLead, t) : '',
        t,
      })
      const generatedLocation = getLeadLocation(nextLead)

      setForm((current) => ({
        ...current,
        leadId: value,
        title: !current.title || !autoState.titleManuallyEdited || current.title === autoState.generatedTitle ? generatedTitle : current.title,
        location: !current.location || !autoState.locationManuallyEdited || current.location === autoState.generatedLocation ? (generatedLocation || current.location) : current.location,
      }))
      setAutoState((current) => ({
        ...current,
        generatedTitle,
        generatedLocation,
      }))
      return
    }

    if (field === 'type') {
      const generatedTitle = buildEventTitle({
        eventType: value,
        client: selectedLead ? getLeadDisplayName(selectedLead, t) : '',
        project: selectedLead ? getLeadProjectTitle(selectedLead, t) : '',
        t,
      })

      setForm((current) => ({
        ...current,
        type: value,
        title: !current.title || !autoState.titleManuallyEdited || current.title === autoState.generatedTitle ? generatedTitle : current.title,
      }))
      setAutoState((current) => ({
        ...current,
        generatedTitle,
      }))
      return
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function openDatePicker() {
    const input = dateRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') input.showPicker()
    else input.focus()
  }

  async function submitForm(event) {
    event.preventDefault()
    if (isSubmittingRef.current) return

    const lead = scheduleRecords.find((item) => matchesLeadRecord(item, form.leadId))
    isSubmittingRef.current = true
    setIsSubmitting(true)

    try {
      await onSave({
      ...(editingEvent ? { id: editingEvent.id } : {}),
      ...form,
      title: form.title.trim() || tStatus(t, form.type),
      leadId: lead?.leadId || lead?.lead_id || (lead?.__relationshipType === 'lead' ? lead.id : null),
      clientId: lead?.clientId || lead?.client_id || editingEvent?.clientId || null,
      projectId: editingEvent?.projectId || editingEvent?.project_id || lead?.projectId || lead?.project_id || (lead?.__relationshipType === 'project' ? lead.id : null),
      clientName: lead?.client || t('unknownClient'),
      projectTitle: lead?.projectTitle || lead?.projectType || t('unknownProject'),
      eventType: form.type,
      time: form.startTime ? (form.endTime ? `${form.startTime} - ${form.endTime}` : form.startTime) : '',
      displayDate: '',
      location: form.location || lead?.address || lead?.location || '',
      status: 'Scheduled',
      })
    } finally {
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={isSubmitting ? undefined : onClose} panelClassName="sm:max-w-3xl">
      <form onSubmit={submitForm}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">{t('schedule')}</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{t(context === 'job' ? 'scheduleJob' : 'scheduleEvent')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t(context === 'job' ? 'scheduleJobHelp' : 'scheduleEventHelp')}</p>
          </div>
          <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('eventType')}</span>
            <SelectField disabled={isSubmitting} value={form.type} onChange={(event) => updateField('type', event.target.value)} className="bg-white">
              {eventTypes.map((type) => <option key={type} value={type}>{tStatus(t, type)}</option>)}
            </SelectField>
          </label>

          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('client')}</span>
            <SelectField disabled={isSubmitting} value={form.leadId} onChange={(event) => updateField('leadId', event.target.value)} className="bg-white">
              {scheduleRecords.map((lead) => <option key={lead.id} value={lead.id}>{lead.client}</option>)}
            </SelectField>
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('projectJob')}</span>
            <SelectField disabled={isSubmitting} value={form.leadId} onChange={(event) => updateField('leadId', event.target.value)} className="bg-white">
              {filteredLeads.map((lead) => <option key={lead.id} value={lead.id}>{lead.projectTitle || lead.projectType}</option>)}
            </SelectField>
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('eventTitle')}</span>
            <input disabled={isSubmitting} value={form.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60" placeholder={t('eventTitlePlaceholder')} />
          </label>

          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('date')}</span>
            <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
              <input disabled={isSubmitting} ref={dateRef} type="date" value={form.date} onChange={(event) => updateField('date', event.target.value)} className="min-w-0 flex-1 px-4 py-3 text-sm font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60" />
              <button type="button" disabled={isSubmitting} onClick={openDatePicker} className="border-l border-slate-200 px-3 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" aria-label={t('openDatePicker')}>
                <CalendarDays className="h-5 w-5" />
              </button>
            </div>
          </label>

          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('reminder')}</span>
            <SelectField disabled={isSubmitting} value={form.reminder} onChange={(event) => updateField('reminder', event.target.value)} className="bg-white">
              {reminderOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
            </SelectField>
          </label>

          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('startTime')}</span>
            <input disabled={isSubmitting} type="time" value={form.startTime} onChange={(event) => updateField('startTime', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60" />
          </label>

          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('endTime')}</span>
            <input disabled={isSubmitting} type="time" value={form.endTime} onChange={(event) => updateField('endTime', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60" />
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('locationAddress')}</span>
            <input disabled={isSubmitting} value={form.location} onChange={(event) => updateField('location', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60" placeholder={selectedLead?.address || t('address')} />
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-bold text-slate-700">{t('notes')}</span>
            <textarea disabled={isSubmitting} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60" placeholder={t('scheduleNotesPlaceholder')} />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{t('cancel')}</button>
          <button type="submit" disabled={isSubmitting} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400">{isSubmitting ? t('saving') : editingEvent ? t('saveChanges') : t(context === 'job' ? 'scheduleJob' : 'saveEvent')}</button>
        </div>
      </form>
    </ModalShell>
  )
}

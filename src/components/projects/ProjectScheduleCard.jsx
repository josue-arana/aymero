import { Archive, CalendarDays, Download, Edit3, MapPin, MoreVertical, Trash2, Undo2, Clock } from 'lucide-react'
import { ActionMenu } from '../common/ActionMenu'
import { StatusBadge } from '../ui/StatusBadge'
import { archiveMenuItemClasses } from '../../utils/buttonStyles'
import { tStatus } from '../../translations'

function EventDetails({ event, fallbackLocation }) {
  const time = event.time || `${event.startTime || event.start_time || ''}${event.endTime || event.end_time ? ` - ${event.endTime || event.end_time}` : ''}`

  return (
    <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
      <p className="inline-flex min-w-0 items-start gap-1.5"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><span className="break-words">{event.displayDate || event.date}</span></p>
      {time ? <p className="inline-flex min-w-0 items-start gap-1.5"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><span className="break-words">{time}</span></p> : null}
      {(event.location || fallbackLocation) ? <p className="inline-flex min-w-0 items-start gap-1.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><span className="break-words [overflow-wrap:anywhere]">{event.location || fallbackLocation}</span></p> : null}
    </div>
  )
}

function ActiveEventCard({ event, isUpcoming, fallbackLocation, onExportEvent, onEditEvent, onArchiveEvent, t }) {
  return (
    <article className={`rounded-2xl border p-4 ${isUpcoming ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{t(event.title)}</h4>
            {event.type ? <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">{tStatus(t, event.type)}</span> : null}
            <StatusBadge status={event.status || (isUpcoming ? 'Upcoming' : 'Completed')} t={t} />
          </div>
          <EventDetails event={event} fallbackLocation={fallbackLocation} />
          {event.notes ? <p className="mt-2 break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{event.notes}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <button type="button" onClick={() => onExportEvent?.(event)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <Download className="h-4 w-4" aria-hidden="true" /> {t('exportToCalendar')}
          </button>
          <ActionMenu
            label={<MoreVertical className="h-4 w-4" aria-hidden="true" />}
            ariaLabel={t('eventActions')}
            showChevron={false}
            buttonClassName="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            items={[
              { id: `edit-event-${event.id}`, label: t('edit'), icon: <Edit3 className="h-4 w-4" aria-hidden="true" />, onClick: () => onEditEvent?.(event) },
              { id: `archive-event-${event.id}`, label: t('archive'), icon: <Archive className="h-4 w-4" aria-hidden="true" />, onClick: () => onArchiveEvent?.(event), className: archiveMenuItemClasses },
            ]}
          />
        </div>
      </div>
    </article>
  )
}

export function ProjectScheduleCard({
  upcomingEvents = [],
  historyEvents = [],
  archivedEvents = [],
  fallbackLocation = '',
  onScheduleEvent,
  onExportEvent,
  onEditEvent,
  onArchiveEvent,
  onRestoreEvent,
  onDeleteEvent,
  t,
}) {
  return (
    <section id="project-schedule" className="min-w-0 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{t('projectSchedule')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('projectScheduleHelp')}</p>
        </div>
        {onScheduleEvent ? (
          <button type="button" onClick={onScheduleEvent} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> {t('scheduleJob')}
          </button>
        ) : null}
      </div>

      {upcomingEvents.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{t('upcoming')}</h3>
          <div className="mt-3 space-y-3">
            {upcomingEvents.map((event) => <ActiveEventCard key={event.id} event={event} isUpcoming fallbackLocation={fallbackLocation} onExportEvent={onExportEvent} onEditEvent={onEditEvent} onArchiveEvent={onArchiveEvent} t={t} />)}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="font-bold text-slate-900">{t('noProjectSchedule')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('noProjectScheduleHelp')}</p>
        </div>
      )}

      {historyEvents.length > 0 ? (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{t('projectScheduleHistory')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('projectScheduleHistoryHelp')}</p>
          <div className="mt-3 space-y-3">
            {historyEvents.map((event) => <ActiveEventCard key={event.id} event={event} fallbackLocation={fallbackLocation} onExportEvent={onExportEvent} onEditEvent={onEditEvent} onArchiveEvent={onArchiveEvent} t={t} />)}
          </div>
        </div>
      ) : null}

      {archivedEvents.length > 0 ? (
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t('archivedScheduleEvents')}</h3>
            <p className="text-sm text-slate-500">{t('archivedViewHelp')}</p>
          </div>
          {archivedEvents.map((event) => (
            <article key={event.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{t(event.title)}</h4>
                    {event.status && String(event.status).toLowerCase() !== 'archived' ? <StatusBadge status={event.status} t={t} /> : null}
                    <StatusBadge status="Archived" t={t} />
                  </div>
                  <p className="mt-1 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{event.displayDate || event.date}{event.location || fallbackLocation ? ` · ${event.location || fallbackLocation}` : ''}</p>
                </div>
                <ActionMenu
                  label={<MoreVertical className="h-4 w-4" aria-hidden="true" />}
                  ariaLabel={t('eventActions')}
                  showChevron={false}
                  buttonClassName="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  items={[
                    { id: `restore-event-${event.id}`, label: t('restore'), icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, onClick: () => onRestoreEvent?.(event), className: 'text-emerald-700 hover:bg-emerald-50 focus-visible:bg-emerald-50' },
                    { id: `delete-event-${event.id}`, label: t('deletePermanently'), icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, tone: 'destructive', onClick: () => onDeleteEvent?.(event), className: 'text-red-700 hover:bg-red-50 focus-visible:bg-red-50' },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

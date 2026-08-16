function normalizeScheduleEventStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function toLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getScheduleEventDate(event = {}) {
  return String(event?.date || event?.eventDate || event?.event_date || '').slice(0, 10)
}

export function getScheduleEventStartTime(event = {}) {
  return String(event?.startTime || event?.start_time || '').slice(0, 5)
}

export function sortScheduleEvents(events = []) {
  return [...events].sort((left, right) => {
    const leftStamp = `${getScheduleEventDate(left)}T${getScheduleEventStartTime(left) || '00:00'}`
    const rightStamp = `${getScheduleEventDate(right)}T${getScheduleEventStartTime(right) || '00:00'}`
    return leftStamp.localeCompare(rightStamp)
  })
}

export function isUpcomingClientScheduleEvent(event = {}, now = new Date()) {
  if (event?.archivedAt || event?.archived_at || event?.isArchived) return false

  const status = normalizeScheduleEventStatus(event?.status)
  if (['cancelled', 'canceled', 'complete', 'completed', 'no_show'].includes(status)) return false

  const eventDate = getScheduleEventDate(event)
  const today = toLocalDateKey(now)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !today) return false

  return eventDate >= today
}

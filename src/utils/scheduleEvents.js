function normalizeScheduleEventStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function toLocalScheduleDateKey(value) {
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

export function isClientVisibleScheduleEvent(event = {}) {
  if (event?.archivedAt || event?.archived_at || event?.isArchived) return false

  const status = normalizeScheduleEventStatus(event?.status)
  if (['cancelled', 'canceled', 'complete', 'completed', 'no_show'].includes(status)) return false

  const eventDate = getScheduleEventDate(event)
  return /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
}

export function isUpcomingClientScheduleEvent(event = {}, now = new Date()) {
  if (!isClientVisibleScheduleEvent(event)) return false

  const eventDate = getScheduleEventDate(event)
  const today = toLocalScheduleDateKey(now)
  if (!today) return false

  return eventDate >= today
}

function getScheduleEventEndTime(event = {}) {
  return String(
    event?.endTime
    || event?.end_time
    || event?.startTime
    || event?.start_time
    || ''
  ).slice(0, 5)
}

export function isActionableScheduleEventToday(event = {}, now = new Date()) {
  if (!isClientVisibleScheduleEvent(event)) return false

  const today = toLocalScheduleDateKey(now)
  const eventDate = getScheduleEventDate(event)
  if (!today || eventDate !== today) return false

  const timestampValue = event?.endsAt || event?.ends_at || event?.startsAt || event?.starts_at
  if (timestampValue) {
    const timestamp = new Date(timestampValue)
    if (!Number.isNaN(timestamp.getTime())) return timestamp.getTime() >= now.getTime()
  }

  const eventEndTime = getScheduleEventEndTime(event)
  if (!eventEndTime) return true

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return eventEndTime >= currentTime
}

export function selectActionableScheduleEventsToday(events = [], now = new Date()) {
  return sortScheduleEvents(events.filter((event) => isActionableScheduleEventToday(event, now)))
}

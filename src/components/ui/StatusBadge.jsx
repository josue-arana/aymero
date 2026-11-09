import { tStatus } from '../../translations'

export function getDocumentStatusTone(status) {
  const normalized = String(status || '').trim().toLowerCase().replaceAll('_', ' ')
  if (['draft', 'saved', 'contract draft', 'archived', 'canceled', 'cancelled', 'voided'].includes(normalized)) return 'neutral'
  if (['sent', 'estimate sent', 'contract sent', 'invoice sent', 'awaiting response', 'pending'].includes(normalized)) return 'info'
  if (['partially paid', 'partial', 'pending payment'].includes(normalized)) return 'warning'
  if (['approved', 'signed', 'paid', 'paid in full', 'completed', 'complete'].includes(normalized)) return 'success'
  if (['overdue', 'rejected'].includes(normalized)) return 'danger'
  return 'neutral'
}

const documentStatusStyles = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-100',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  danger: 'bg-rose-50 text-rose-700 ring-rose-100',
}

export function StatusBadge({ status, t = (key) => key }) {
  const styles = {
    Scheduled: 'bg-sky-50 text-sky-700 ring-sky-100',
    'In Progress': 'bg-blue-50 text-blue-700 ring-blue-100',
    'Waiting on Client': 'bg-amber-50 text-amber-700 ring-amber-100',
    'Waiting on Materials': 'bg-orange-50 text-orange-700 ring-orange-100',
    'Ready for Final Walkthrough': 'bg-purple-50 text-purple-700 ring-purple-100',
    Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    Complete: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    'Converted to Contract': 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  }

  const style = styles[status] || documentStatusStyles[getDocumentStatusTone(status)]
  return (
    <span className={`inline-flex min-h-6 w-fit max-w-full items-center break-words rounded-full px-2.5 py-1 text-xs font-bold leading-none ring-1 ${style}`}>
      {tStatus(t, status)}
    </span>
  )
}

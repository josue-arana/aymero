import { tStatus } from '../../translations'

export function StatusBadge({ status, t = (key) => key }) {
  const styles = {
    Scheduled: 'bg-sky-50 text-sky-700 ring-sky-100',
    'In Progress': 'bg-blue-50 text-blue-700 ring-blue-100',
    'Waiting on Client': 'bg-amber-50 text-amber-700 ring-amber-100',
    'Waiting on Materials': 'bg-orange-50 text-orange-700 ring-orange-100',
    'Ready for Final Walkthrough': 'bg-purple-50 text-purple-700 ring-purple-100',
    Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    Complete: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    Paid: 'bg-slate-100 text-slate-700 ring-slate-200',
    Signed: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    'Contract Draft': 'bg-slate-100 text-slate-700 ring-slate-200',
    Archived: 'bg-amber-50 text-amber-800 ring-amber-200',
    Draft: 'bg-slate-100 text-slate-700 ring-slate-200',
    Saved: 'bg-slate-100 text-slate-700 ring-slate-200',
    Sent: 'bg-blue-50 text-blue-700 ring-blue-100',
    'Estimate Sent': 'bg-blue-50 text-blue-700 ring-blue-100',
    'Contract Sent': 'bg-blue-50 text-blue-700 ring-blue-100',
    'Invoice Sent': 'bg-blue-50 text-blue-700 ring-blue-100',
    Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    Rejected: 'bg-rose-50 text-rose-700 ring-rose-100',
    'Converted to Contract': 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  }

  return (
    <span className={`inline-flex min-h-6 w-fit max-w-full items-center break-words rounded-full px-2.5 py-1 text-xs font-bold leading-none ring-1 ${styles[status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
      {tStatus(t, status)}
    </span>
  )
}
